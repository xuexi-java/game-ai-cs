import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { QueueService } from '../../queue/queue.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { TicketService } from '../../ticket/ticket.service';
import { SessionQueueService } from './session-queue.service';
import { SessionStatus, Prisma } from '@prisma/client';

const TICKET_RELATION_INCLUDE = {
  game: true,
  server: true,
  attachments: true,
  ticketIssueTypes: {
    include: {
      issueType: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
} as const;

@Injectable()
export class SessionAssignmentService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    private queueService: QueueService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    private sessionQueueService: SessionQueueService,
  ) {
    this.logger.setContext('SessionAssignmentService');
  }

  private enrichTicketWithIssueTypes<T extends { ticketIssueTypes?: any[] }>(
    ticket: T | null,
  ) {
    if (!ticket) return ticket;
    const issueTypes =
      ticket.ticketIssueTypes
        ?.map((item) => item.issueType)
        .filter((issueType) => Boolean(issueType)) ?? [];
    return {
      ...ticket,
      issueTypes,
    };
  }

  private enrichSession(session: any) {
    if (!session) return session;
    return {
      ...session,
      ticket: this.enrichTicketWithIssueTypes(session.ticket),
    };
  }

  /**
   * 客服接入会话
   */
  async joinSession(sessionId: string, agentId: string, session: any) {
    // 允许接入 QUEUED、PENDING 或 CLOSED（但工单状态为 WAITING）的会话
    if (session.status !== 'QUEUED' && session.status !== 'PENDING') {
      // 如果是 CLOSED 状态，检查工单状态
      if (session.status === 'CLOSED') {
        const ticket = await this.prisma.ticket.findUnique({
          where: { id: session.ticketId },
          select: { status: true },
        });
        // 只有工单状态为 WAITING 时，才允许接入
        if (ticket?.status !== 'WAITING') {
          throw new BadRequestException('会话状态不正确，无法接入');
        }
      } else {
        throw new BadRequestException('会话状态不正确，无法接入');
      }
    }

    // 检查当前用户角色
    const currentUser = await this.prisma.user.findUnique({
      where: { id: agentId },
      select: { role: true },
    });

    // 检查会话是否已经分配给其他客服
    if (session.agentId && session.agentId !== agentId) {
      // 只有管理员可以接入已分配给其他客服的会话
      if (currentUser?.role !== 'ADMIN') {
        throw new BadRequestException('该会话已分配给其他客服，您无法接入');
      }
    }

    // 获取原会话信息（用于从队列移除）
    const oldSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { agentId: true },
    });

    // 更新会话状态
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        queuedAt: null, // 清除排队状态
        queuePosition: null, // 清除排队位置
      },
      include: {
        ticket: {
          include: {
            ...TICKET_RELATION_INCLUDE,
          },
        },
        agent: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // 更新用户在线状态
    await this.prisma.user.update({
      where: { id: agentId },
      data: { isOnline: true },
    });

    // 从 Redis 队列移除会话（使用重试机制）
    const removed = await this.queueService.removeFromQueueWithRetry(
      sessionId,
      oldSession?.agentId || null,
    );
    if (!removed) {
      this.logger.warn(`从 Redis 队列移除会话失败，将在下次一致性检查时修复`);
    }

    const normalizedSession = this.enrichSession(updatedSession);

    // 更新关联工单的状态为"处理中"（如果会话状态为 IN_PROGRESS）
    if (
      normalizedSession.status === 'IN_PROGRESS' &&
      normalizedSession.ticketId
    ) {
      try {
        // 更新工单状态为处理中
        await this.ticketService.updateStatus(
          normalizedSession.ticketId,
          'IN_PROGRESS',
        );
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`更新工单状态失败: ${errorMsg}`, {
          ticketId: normalizedSession.ticketId,
          stack: error instanceof Error ? error.stack : undefined,
        });
        // 不抛出错误，避免影响会话接入流程
      }
    }

    // 重新排序队列（移除已接入的会话）
    await this.sessionQueueService.reorderQueue();

    // 关键业务日志：客服接入
    this.logger.logBusiness({
      action: 'session_joined',
      sessionId,
      agentId,
      ticketId: normalizedSession.ticketId,
      status: normalizedSession.status,
    });

    // 通知 WebSocket 客户端（管理端）
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    // 通知玩家端客服已接入
    const agentName = updatedSession.agent?.realName || updatedSession.agent?.username || '客服';
    this.websocketGateway.notifyAgentAssigned(sessionId, agentName, agentId);

    return normalizedSession;
  }

  /**
   * 管理员手动分配会话给指定客服（包括管理员自己）
   * 支持二次分配：除了已结束的工单和会话，其他都可以重新分配
   */
  async assignSession(sessionId: string, agentId: string, session: any) {
    const startTime = Date.now();

    try {
      this.logger.log(`开始手动分配会话 ${sessionId} 给 ${agentId}`, {
        sessionId,
        agentId,
        timestamp: new Date().toISOString(),
      });

      // 检查会话状态：已结束的会话不能分配
      if (session.status === 'CLOSED') {
        this.logger.warn(`会话 ${sessionId} 已结束，无法分配`, {
          sessionId,
          sessionStatus: session.status,
        });
        throw new BadRequestException('该会话已结束，无法分配');
      }

      // 检查工单状态：已解决的工单不能分配
      if (session.ticket?.status === 'RESOLVED') {
        this.logger.warn(
          `工单 ${session.ticket?.id} 已解决，无法分配会话 ${sessionId}`,
          {
            sessionId,
            ticketId: session.ticket?.id,
            ticketStatus: session.ticket?.status,
          },
        );
        throw new BadRequestException('该工单已解决，无法分配客服');
      }

      // 检查用户是否存在（可以是客服或管理员）
      const agent = await this.prisma.user.findUnique({
        where: { id: agentId, deletedAt: null },
      });

      if (!agent) {
        this.logger.error(`分配失败：用户 ${agentId} 不存在`, undefined, {
          sessionId,
          agentId,
        });
        throw new NotFoundException('用户不存在');
      }

      // 只允许分配给客服或管理员
      if (agent.role !== 'AGENT' && agent.role !== 'ADMIN') {
        this.logger.warn(`分配失败：用户 ${agentId} 不是客服或管理员`, {
          sessionId,
          agentId,
          agentRole: agent.role,
        });
        throw new BadRequestException('只能分配给客服或管理员');
      }

      // 获取原会话信息（用于从队列移除和日志记录）
      const oldSession = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: {
          agentId: true,
          status: true,
          manuallyAssigned: true,
        },
      });

      const isReassignment =
        oldSession?.agentId && oldSession.agentId !== agentId;
      const previousAgentId = oldSession?.agentId;

      // 更新会话，分配给指定客服，标记为手动分配
      // 支持二次分配：即使已经分配过，也可以重新分配
      const updatedSession = await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          agentId,
          // 如果会话是 QUEUED 状态，分配后变为 IN_PROGRESS
          // 如果已经是 IN_PROGRESS，保持 IN_PROGRESS
          status: session.status === 'QUEUED' ? 'IN_PROGRESS' : session.status,
          startedAt: session.startedAt || new Date(),
          queuedAt: session.status === 'QUEUED' ? null : session.queuedAt, // 如果从 QUEUED 变为 IN_PROGRESS，清除排队状态
          queuePosition:
            session.status === 'QUEUED' ? null : session.queuePosition, // 清除排队位置
          manuallyAssigned: true, // 标记为手动分配
        },
        include: {
          ticket: {
            include: {
              ...TICKET_RELATION_INCLUDE,
            },
          },
          agent: {
            select: {
              id: true,
              username: true,
              realName: true,
            },
          },
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      // 从 Redis 队列移除会话（如果之前有分配，需要从旧队列移除）
      if (previousAgentId || session.status === 'QUEUED') {
        const removed = await this.queueService.removeFromQueueWithRetry(
          sessionId,
          previousAgentId || null,
        );
        if (!removed) {
          this.logger.debug(
            `从 Redis 队列移除会话失败（Redis 可能不可用，可以忽略）`,
            { sessionId, previousAgentId },
          );
        }
      }

      const normalizedSession = this.enrichSession(updatedSession);

      // 关键业务日志：手动分配
      this.logger.logBusiness({
        action: 'session_assigned',
        sessionId,
        ticketId: session.ticketId,
        previousAgentId,
        newAgentId: agentId,
        newAgentRole: agent.role,
        isReassignment,
        sessionStatus: updatedSession.status,
      });

      // 通知 WebSocket 客户端
      this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

      // 通知被分配的客服有新会话（让客服工作台显示）
      this.websocketGateway.notifyAgentNewSession(agentId, normalizedSession);

      return normalizedSession;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `手动分配会话 ${sessionId} 失败: ${errorMessage}`,
        errorStack,
        {
          sessionId,
          agentId,
          duration,
          timestamp: new Date().toISOString(),
        },
      );

      // 重新抛出错误，让上层处理
      throw error;
    }
  }

  /**
   * 自动分配会话（根据客服当前接待数量）
   */
  async autoAssignSession(sessionId: string, session: any) {
    // 如果已经手动分配过，不再自动分配
    if (session.manuallyAssigned) {
      throw new BadRequestException('该会话已手动分配，无法自动分配');
    }

    // 如果已经分配了客服，直接返回
    if (session.agentId && session.status === 'IN_PROGRESS') {
      return session;
    }

    const baseAgentWhere = {
      role: 'AGENT' as const,
      deletedAt: null,
    };

    const agentInclude: Prisma.UserInclude = {
      sessions: {
        where: {
          status: SessionStatus.IN_PROGRESS,
          agentId: { not: null },
        },
      },
    };

    const agents = await this.prisma.user.findMany({
      where: baseAgentWhere,
      include: {
        ...agentInclude,
        // 确保包含登录时间字段
      },
    });

    const onlineAgents = agents.filter((agent) => agent.isOnline);
    const candidateAgents = (
      onlineAgents.length > 0 ? onlineAgents : agents
    ).filter((agent) => agent.deletedAt === null);

    const allAgentsBusy =
      candidateAgents.length > 0 &&
      candidateAgents.every((agent) => agent.sessions.length > 0);

    let candidatePool = [...candidateAgents];

    if (candidatePool.length === 0 || allAgentsBusy) {
      const admins = await this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          deletedAt: null,
        },
        include: agentInclude,
      });
      if (admins.length > 0) {
        const onlineAdmins = admins.filter((admin) => admin.isOnline);
        const adminPool = onlineAdmins.length > 0 ? onlineAdmins : admins;
        candidatePool =
          candidatePool.length > 0
            ? [...candidatePool, ...adminPool]
            : [...adminPool];
      }
    }

    if (candidatePool.length === 0) {
      throw new BadRequestException('当前没有可分配的客服，请稍后重试');
    }

    const agentsWithLoad = candidatePool.map((agent) => ({
      agent,
      load: agent.sessions.length,
      // 获取最早登录时间（lastLoginAt），如果为空则使用创建时间
      loginTime: agent.lastLoginAt || agent.createdAt,
    }));

    // 排序：先按负载（load）升序，负载相同时按登录时间（loginTime）升序（最早登录优先）
    agentsWithLoad.sort((a, b) => {
      if (a.load !== b.load) {
        return a.load - b.load; // 负载少的优先
      }
      // 负载相同时，最早登录的优先
      return new Date(a.loginTime).getTime() - new Date(b.loginTime).getTime();
    });
    const selectedAgent = agentsWithLoad[0].agent;

    // 获取原会话信息（用于从队列移除）
    const oldSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { agentId: true },
    });

    // 自动分配后，会话应该立即变为 IN_PROGRESS，清除排队状态
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId: selectedAgent.id,
        status: 'IN_PROGRESS',
        startedAt: session.startedAt || new Date(),
        queuedAt: null, // 清除排队状态
        queuePosition: null, // 清除排队位置
        manuallyAssigned: false,
      },
      include: {
        ticket: {
          include: {
            ...TICKET_RELATION_INCLUDE,
          },
        },
        agent: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!selectedAgent.isOnline) {
      await this.prisma.user.update({
        where: { id: selectedAgent.id },
        data: { isOnline: true },
      });
    }

    // 从 Redis 队列移除会话（使用重试机制）
    const removed = await this.queueService.removeFromQueueWithRetry(
      sessionId,
      oldSession?.agentId || null,
    );
    if (!removed) {
      this.logger.warn(`从 Redis 队列移除会话失败，将在下次一致性检查时修复`);
    }

    const normalizedSession = this.enrichSession(updatedSession);

    // 重新排序队列（移除已接入的会话）
    await this.sessionQueueService.reorderQueue();

    // 通知 WebSocket 客户端会话状态更新
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);
    return normalizedSession;
  }

  /**
   * 自动分配客服（只分配客服，不改变状态，保持 QUEUED）
   */
  async autoAssignAgentOnly(sessionId: string, session: any) {
    // 如果已经手动分配过，不再自动分配
    if (session.manuallyAssigned) {
      throw new BadRequestException('该会话已手动分配，无法自动分配');
    }

    // 如果已经分配了客服，直接返回
    if (session.agentId) {
      return session;
    }

    const baseAgentWhere = {
      role: 'AGENT' as const,
      deletedAt: null,
    };

    const agentInclude: Prisma.UserInclude = {
      sessions: {
        where: {
          status: SessionStatus.IN_PROGRESS,
          agentId: { not: null },
        },
      },
    };

    const agents = await this.prisma.user.findMany({
      where: baseAgentWhere,
      include: {
        ...agentInclude,
      },
    });

    // ⚠️ 关键修复：只从在线客服中选择，不选择离线客服
    const onlineAgents = agents.filter((agent) => agent.isOnline);

    // 获取所有在线管理员
    const admins = await this.prisma.user.findMany({
      where: {
        role: 'ADMIN',
        deletedAt: null,
      },
      include: agentInclude,
    });
    const onlineAdmins = admins.filter((admin) => admin.isOnline);

    // 合并候选池：客服 + 管理员（管理员权重更高，优先分配给客服）
    const candidatePool = [...onlineAgents, ...onlineAdmins];

    if (candidatePool.length === 0) {
      return session;
    }

    // 计算负载：管理员增加权重（+3），优先分配给客服
    const ADMIN_WEIGHT_PENALTY = 3; // 管理员负载权重惩罚
    const agentsWithLoad = candidatePool.map((agent) => ({
      agent,
      load:
        agent.sessions.length +
        (agent.role === 'ADMIN' ? ADMIN_WEIGHT_PENALTY : 0),
      loginTime: agent.lastLoginAt || agent.createdAt,
      role: agent.role,
    }));

    // 排序：先按负载升序，负载相同时按登录时间升序
    agentsWithLoad.sort((a, b) => {
      if (a.load !== b.load) {
        return a.load - b.load;
      }
      return new Date(a.loginTime).getTime() - new Date(b.loginTime).getTime();
    });
    const selectedAgent = agentsWithLoad[0].agent;

    // 获取会话信息（用于移动队列）
    const sessionInfo = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        priorityScore: true,
        queuedAt: true,
      },
    });

    // ✅ 只分配客服，不改变状态（保持 QUEUED）
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId: selectedAgent.id,
        // 不改变 status，保持 QUEUED
        // 不改变 queuedAt 和 queuePosition
        manuallyAssigned: false,
      },
      include: {
        ticket: {
          include: {
            ...TICKET_RELATION_INCLUDE,
          },
        },
        agent: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const normalizedSession = this.enrichSession(updatedSession);

    // ✅ 更新 Redis 队列：从未分配队列移动到客服队列（使用重试机制）
    if (sessionInfo?.queuedAt) {
      const moved = await this.queueService.moveToAgentQueueWithRetry(
        sessionId,
        selectedAgent.id,
        sessionInfo.priorityScore || 0,
        sessionInfo.queuedAt,
      );
      if (!moved) {
        this.logger.warn(`移动会话到客服队列失败，将在下次一致性检查时修复`);
      }
    }

    // 重新排序队列（更新排队位置）
    await this.sessionQueueService.reorderQueue();

    // 通知 WebSocket 客户端会话更新（分配了客服）
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);
    return normalizedSession;
  }
}
