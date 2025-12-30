import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { SessionService } from '../../session/session.service';
import { QueueService } from '../../queue/queue.service';
import { MessageService } from '../../message/message.service';

@Injectable()
export class TicketAssignmentService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => SessionService))
    private sessionService: SessionService,
    private queueService: QueueService,
    private messageService: MessageService,
  ) {
    this.logger.setContext('TicketAssignmentService');
  }

  /**
   * 自动分配工单给客服（当客服上线时调用）
   * 使用负载均衡和最早登录优先的分配策略
   */
  async autoAssignWaitingTickets(agentId: string): Promise<void> {
    try {
      // 查找 WAITING 状态的工单（没有活跃会话的）
      const waitingTickets = await this.prisma.ticket.findMany({
        where: {
          status: 'WAITING',
          deletedAt: null,
          // 没有活跃会话的工单
          sessions: {
            none: {
              status: {
                in: ['PENDING', 'QUEUED', 'IN_PROGRESS'],
              },
            },
          },
        },
        include: {
          sessions: {
            where: {
              status: 'CLOSED',
            },
            orderBy: {
              closedAt: 'desc',
            },
            take: 1,
          },
        },
        orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
        take: 10, // 每次最多处理10个工单
      });

      if (waitingTickets.length === 0) {
        return;
      }

      // 获取所有在线客服，用于负载均衡分配
      const onlineAgents = await this.prisma.user.findMany({
        where: {
          role: 'AGENT',
          isOnline: true,
          deletedAt: null,
        },
        include: {
          sessions: {
            where: {
              status: {
                in: ['QUEUED', 'IN_PROGRESS'],
              },
            },
          },
        },
      });

      // 获取所有在线管理员
      const onlineAdmins = await this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          isOnline: true,
          deletedAt: null,
        },
        include: {
          sessions: {
            where: {
              status: {
                in: ['QUEUED', 'IN_PROGRESS'],
              },
            },
          },
        },
      });

      // 合并候选池：客服 + 管理员（管理员权重更高，优先分配给客服）
      const candidatePool = [...onlineAgents, ...onlineAdmins];

      if (candidatePool.length === 0) {
        this.logger.warn('没有在线客服或管理员，无法分配工单');
        return; // 没有在线客服或管理员，不分配
      }

      // 为每个工单找到最合适的客服/管理员（负载均衡 + 最早登录优先）
      const ADMIN_WEIGHT_PENALTY = 3; // 管理员负载权重惩罚
      let successCount = 0;
      let failedCount = 0;

      for (const ticket of waitingTickets) {
        try {
          // 检查是否已经有活跃会话
          const hasActiveSession = await this.prisma.session.findFirst({
            where: {
              ticketId: ticket.id,
              status: {
                in: ['PENDING', 'QUEUED', 'IN_PROGRESS'],
              },
            },
          });

          if (hasActiveSession) {
            continue; // 已有活跃会话，跳过
          }

          // 计算每个客服/管理员的负载（管理员增加权重）
          const agentsWithLoad = candidatePool.map((agent) => ({
            agent,
            load:
              agent.sessions.length +
              (agent.role === 'ADMIN' ? ADMIN_WEIGHT_PENALTY : 0),
            loginTime: agent.lastLoginAt || agent.createdAt,
            role: agent.role,
          }));

          // 排序：先按负载升序，负载相同时按登录时间升序（最早登录优先）
          agentsWithLoad.sort((a, b) => {
            if (a.load !== b.load) {
              return a.load - b.load; // 负载少的优先
            }
            // 负载相同时，最早登录的优先
            return (
              new Date(a.loginTime).getTime() - new Date(b.loginTime).getTime()
            );
          });

          const selectedAgent = agentsWithLoad[0].agent;

          // 创建新会话并分配给选中的客服
          const session = await this.prisma.session.create({
            data: {
              ticketId: ticket.id,
              agentId: selectedAgent.id,
              status: 'QUEUED',
              priorityScore: ticket.priorityScore || 0,
              queuedAt: new Date(),
              manuallyAssigned: false,
            },
            include: {
              ticket: {
                include: {
                  game: true,
                  server: true,
                },
              },
            },
          });

          // 立即添加到 Redis 队列（已分配给客服，使用重试机制）
          if (session.queuedAt) {
            const added = await this.queueService.addToAgentQueueWithRetry(
              session.id,
              selectedAgent.id,
              ticket.priorityScore || 0,
              session.queuedAt,
            );
            if (!added) {
              this.logger.warn(
                `添加到 Redis 队列失败，将在下次一致性检查时修复`,
              );
            }
          }

          // 注意：会话应该保持 QUEUED 状态，让客服能看到并主动接入
          // 不调用 autoAssignSession，因为那会将状态改为 IN_PROGRESS
          // 会话状态保持为 QUEUED，等待客服主动接入

          // 通知管理端有新会话（无论是否分配成功）
          try {
            const enrichedSession = await this.sessionService.findOne(
              session.id,
            );
            this.websocketGateway.notifyNewSession(enrichedSession);
          } catch (error) {
            this.logger.warn(`通知新会话失败: ${error.message}`, {
              sessionId: session.id,
              error: error.message,
            });
          }

          // 更新工单状态
          await this.prisma.ticket.update({
            where: { id: ticket.id },
            data: {
              status: 'IN_PROGRESS',
            },
          });

          successCount++;
        } catch (error) {
          failedCount++;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `分配工单 ${ticket.ticketNo} 失败: ${errorMessage}`,
            errorStack,
            { ticketId: ticket.id, ticketNo: ticket.ticketNo },
          );
          // 继续处理下一个工单
        }
      }

      // 聚合日志：循环结束后输出一次总结
      this.logger.log(
        `自动分配完成：total=${waitingTickets.length}, success=${successCount}, failed=${failedCount}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`自动分配等待工单失败: ${errorMessage}`, errorStack);
    }
  }

  /**
   * 自动分配直接转人工的工单（创建工单时立即尝试分配）
   * 如果没有在线客服，不创建会话，工单保持 WAITING 状态
   */
  async autoAssignDirectTransferTicket(
    ticketId: string,
  ): Promise<{ hasAgents: boolean; sessionCreated: boolean }> {
    try {
      // 获取所有在线客服
      const onlineAgents = await this.prisma.user.findMany({
        where: {
          role: 'AGENT',
          isOnline: true,
          deletedAt: null,
        },
        include: {
          sessions: {
            where: {
              status: {
                in: ['QUEUED', 'IN_PROGRESS'],
              },
            },
          },
        },
      });

      // 获取在线管理员
      const onlineAdmins = await this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          isOnline: true,
          deletedAt: null,
        },
        include: {
          sessions: {
            where: {
              status: {
                in: ['QUEUED', 'IN_PROGRESS'],
              },
            },
          },
        },
      });

      const hasOnlineAgents =
        onlineAgents.length > 0 || onlineAdmins.length > 0;

      if (!hasOnlineAgents) {
        // 没有在线客服，不创建会话，工单保持 WAITING 状态
        return { hasAgents: false, sessionCreated: false };
      }

      // 检查是否已经有活跃会话
      const hasActiveSession = await this.prisma.session.findFirst({
        where: {
          ticketId,
          status: {
            in: ['PENDING', 'QUEUED', 'IN_PROGRESS'],
          },
        },
      });

      if (hasActiveSession) {
        return { hasAgents: true, sessionCreated: false }; // 已有活跃会话，跳过
      }

      // 合并客服和管理员作为候选池
      const candidatePool = [...onlineAgents, ...onlineAdmins];

      // 计算每个客服/管理员的负载（管理员增加权重）
      const ADMIN_WEIGHT_PENALTY = 3; // 管理员负载权重惩罚
      const agentsWithLoad = candidatePool.map((agent) => ({
        agent,
        load:
          agent.sessions.length +
          (agent.role === 'ADMIN' ? ADMIN_WEIGHT_PENALTY : 0),
        loginTime: agent.lastLoginAt || agent.createdAt,
        role: agent.role,
      }));

      // 排序：先按负载升序，负载相同时按登录时间升序（最早登录优先）
      agentsWithLoad.sort((a, b) => {
        if (a.load !== b.load) {
          return a.load - b.load; // 负载少的优先
        }
        // 负载相同时，最早登录的优先
        return (
          new Date(a.loginTime).getTime() - new Date(b.loginTime).getTime()
        );
      });

      const selectedAgent = agentsWithLoad[0].agent;

      // 记录分配日志
      this.logger.log(
        `工单 ${ticketId} 自动分配: 选择 ${selectedAgent.role} ${selectedAgent.username}`,
        {
          ticketId,
          selectedAgentId: selectedAgent.id,
          selectedAgentRole: selectedAgent.role,
          selectedAgentUsername: selectedAgent.username,
          actualLoad: selectedAgent.sessions.length,
          weightedLoad: agentsWithLoad[0].load,
        },
      );

      // 获取工单信息
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
      });

      if (!ticket) {
        return { hasAgents: false, sessionCreated: false };
      }

      // 创建新会话（先不分配客服，稍后自动分配）
      // 对于直接转人工的工单，应该进入排队状态，等待客服接入
      const session = await this.prisma.session.create({
        data: {
          ticketId,
          agentId: null, // 先不分配，稍后通过 autoAssignAgentOnly 自动分配
          status: 'QUEUED', // 进入排队状态，等待客服接入
          priorityScore: ticket.priorityScore || 0,
          queuedAt: new Date(), // 记录排队时间
          manuallyAssigned: false,
        },
        include: {
          ticket: {
            include: {
              game: true,
              server: true,
            },
          },
          agent: {
            select: {
              id: true,
              username: true,
              realName: true,
            },
          },
        },
      });

      // 立即添加到 Redis 队列（未分配队列，使用重试机制）
      if (session.queuedAt) {
        const added = await this.queueService.addToUnassignedQueueWithRetry(
          session.id,
          ticket.priorityScore || 0,
          session.queuedAt,
        );
        if (!added) {
          this.logger.warn(`添加到 Redis 队列失败，将在下次一致性检查时修复`);
        }
      }

      // 重新排序队列（计算排队位置和预计等待时间）
      try {
        await this.sessionService.reorderQueue();
      } catch (error) {
        this.logger.warn(`重新排序队列失败: ${error.message}`);
      }

      // 自动分配客服（只分配，不改变状态，保持 QUEUED）
      let assignmentSucceeded = false;
      try {
        const assignedSession = await this.sessionService.autoAssignAgentOnly(
          session.id,
        );
        // 关键：检查是否真的分配了客服
        if (assignedSession.agentId) {
          assignmentSucceeded = true;
          this.logger.log(`会话 ${session.id} 已自动分配给客服`, {
            sessionId: session.id,
            agentId: assignedSession.agentId,
          });
        } else {
          this.logger.warn(
            `会话 ${session.id} 未能分配客服（可能没有可分配的客服）`,
            {
              sessionId: session.id,
            },
          );
        }
      } catch (error) {
        // 自动分配失败可能是因为所有客服都忙，这是正常的，保持未分配状态
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        this.logger.warn(
          `自动分配失败，会话 ${session.id} 保持未分配状态: ${errorMessage}`,
          {
            sessionId: session.id,
            error: errorMessage,
            stack: errorStack,
          },
        );
      }

      // 关键修复：如果自动分配失败，检查是否还有在线客服
      if (!assignmentSucceeded) {
        const stillHasOnlineAgents = await this.prisma.user.count({
          where: {
            role: { in: ['AGENT', 'ADMIN'] },
            isOnline: true,
            deletedAt: null,
          },
        });

        // 如果现在没有在线客服了，关闭会话并转为工单，告知玩家
        if (stillHasOnlineAgents === 0) {
          this.logger.warn(
            `自动分配失败且无在线客服，关闭会话 ${session.id} 并转为工单`,
            {
              sessionId: session.id,
              ticketId: ticket.id,
            },
          );

          // 更新工单为加急状态
          await this.prisma.ticket.update({
            where: { id: ticketId },
            data: {
              status: 'WAITING',
              priority: 'URGENT',
              priorityScore: Math.max(ticket.priorityScore || 0, 80),
            },
          });

          // 关闭会话
          await this.prisma.session.update({
            where: { id: session.id },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
            },
          });

          // 创建系统消息告知玩家
          await this.messageService.createSystemMessage(
            session.id,
            `当前暂无客服在线，您的问题已转为【加急工单】(${ticket.ticketNo})，我们将优先处理。您可以通过工单号查看处理进度。`,
          );

          // 通知会话更新
          const updatedSession = await this.sessionService.findOne(session.id);
          this.websocketGateway.notifySessionUpdate(session.id, updatedSession);

          return { hasAgents: false, sessionCreated: false };
        }
      }

      // 通知管理端有新会话（让客服能看到待接入队列）
      try {
        // 重新排序队列后，获取完整的会话信息（包含排队位置和预计等待时间）
        const enrichedSession = await this.sessionService.findOne(session.id);
        // 通知新会话创建
        this.websocketGateway.notifyNewSession(enrichedSession);
        // 通知会话更新（确保客服端能刷新待接入队列，包含排队信息）
        this.websocketGateway.notifySessionUpdate(session.id, enrichedSession);

        // 确保发送排队更新通知到玩家端
        if (
          enrichedSession.queuePosition !== null &&
          enrichedSession.queuePosition !== undefined
        ) {
          this.websocketGateway.notifyQueueUpdate(
            session.id,
            enrichedSession.queuePosition,
            enrichedSession.estimatedWaitTime,
          );
        }
      } catch (error) {
        this.logger.warn(`通知新会话失败: ${error.message}`);
      }

      return { hasAgents: true, sessionCreated: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `自动分配直接转人工工单 ${ticketId} 失败: ${errorMessage}`,
        errorStack,
        { ticketId },
      );
      return { hasAgents: false, sessionCreated: false };
    }
  }
}
