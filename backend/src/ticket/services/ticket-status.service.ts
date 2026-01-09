import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { throwTicketNotFound } from '../../common/exceptions';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { SessionService } from '../../session/session.service';

@Injectable()
export class TicketStatusService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => SessionService))
    private sessionService: SessionService,
  ) {
    this.logger.setContext('TicketStatusService');
  }

  // 更新工单状态
  async updateStatus(
    id: string,
    status: string,
    metadata?: {
      closureMethod?:
        | 'manual'
        | 'auto_timeout_waiting'
        | 'auto_timeout_replied';
      closedBy?: 'PLAYER' | 'AGENT' | 'SYSTEM' | string;
      closeReason?:
        | 'RESOLVED'
        | 'MANUAL_PLAYER'
        | 'MANUAL_AGENT'
        | 'AUTO_TIMEOUT'
        | 'AUTO_CLOSED_BY_NEW_TICKET'
        | 'DATA_CLEANUP';
    },
  ) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id, deletedAt: null },
    });

    if (!ticket) {
      throwTicketNotFound(id);
    }

    const oldStatus = ticket.status;

    const updateData: any = {
      status: status as any,
    };

    // 如果状态变更为 RESOLVED，记录关闭信息
    if (status === 'RESOLVED') {
      updateData.closedAt = new Date();

      // 设置 closeReason
      if (metadata?.closeReason) {
        updateData.closeReason = metadata.closeReason;
      } else if (metadata?.closureMethod) {
        // 根据 closureMethod 推断 closeReason (兼容旧逻辑)
        if (
          metadata.closureMethod === 'auto_timeout_waiting' ||
          metadata.closureMethod === 'auto_timeout_replied'
        ) {
          updateData.closeReason = 'AUTO_TIMEOUT';
        } else if (metadata.closureMethod === 'manual') {
          // 如果是手动关闭，根据 closedBy 判断
          if (metadata.closedBy === 'PLAYER') {
            updateData.closeReason = 'MANUAL_PLAYER';
          } else if (metadata.closedBy === 'AGENT' || metadata.closedBy === 'SYSTEM') {
            updateData.closeReason = 'MANUAL_AGENT';
          } else {
            updateData.closeReason = 'RESOLVED';
          }
        }
      }

      // 设置 closedBy
      if (metadata?.closedBy) {
        updateData.closedBy = metadata.closedBy;
      } else if (metadata?.closureMethod) {
        // 自动超时关闭由系统执行
        if (
          metadata.closureMethod === 'auto_timeout_waiting' ||
          metadata.closureMethod === 'auto_timeout_replied'
        ) {
          updateData.closedBy = 'SYSTEM';
        }
      }

      // 保留 closureMetadata 以兼容旧逻辑
      if (metadata?.closureMethod) {
        updateData.closureMetadata = {
          method: metadata.closureMethod,
          closedBy: metadata.closedBy,
          closedAt: new Date().toISOString(),
        };
      }
    }

    const updatedTicket = await this.prisma.ticket.update({
      where: { id },
      data: updateData,
    });

    // 关键业务日志：工单状态变更
    this.logger.logBusiness({
      action: 'ticket_status_changed',
      ticketId: id,
      ticketNo: ticket.ticketNo,
      oldStatus,
      newStatus: status,
      closureMethod: metadata?.closureMethod,
    });

    // WebSocket 通知
    try {
      this.websocketGateway.notifyTicketUpdate(id, {
        status: updatedTicket.status,
        closedAt: updatedTicket.closedAt,
        closeReason: updatedTicket.closeReason,
        closedBy: updatedTicket.closedBy,
        closureMetadata: (updatedTicket as any).closureMetadata,
      });
    } catch (error) {
      // WebSocket 通知失败不影响状态更新
      this.logger.warn('WebSocket 通知失败:', error);
    }

    return updatedTicket;
  }

  // 更新工单优先级
  async updatePriority(id: string, priority: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id, deletedAt: null },
    });

    if (!ticket) {
      throwTicketNotFound(id);
    }

    return this.prisma.ticket.update({
      where: { id },
      data: { priority: priority as any },
    });
  }

  /**
   * 检查并更新工单状态
   * 当工单的所有会话都已关闭时，将工单状态更新为 RESOLVED
   */
  async checkAndUpdateTicketStatus(ticketId: string): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        sessions: {
          select: {
            id: true,
            status: true,
            agentId: true, // 检查是否被分配给客服
          },
        },
      },
    });

    if (!ticket) {
      return;
    }

    // 如果工单已经是 RESOLVED，不需要更新
    if (ticket.status === 'RESOLVED') {
      return;
    }

    // 检查是否所有会话都已关闭
    const allSessionsClosed =
      ticket.sessions.length > 0 &&
      ticket.sessions.every((session) => session.status === 'CLOSED');

    if (allSessionsClosed) {
      // 检查是否有客服消息（说明客服曾经接入过）
      const hasAgentMessages = await this.prisma.ticketMessage.count({
        where: {
          ticketId,
          senderId: { not: null }, // 有客服发送的消息
        },
      });

      // 检查是否有会话曾经被分配给客服
      const hasAssignedAgent = ticket.sessions.some(
        (session) => session.agentId !== null,
      );

      // 检查是否有 AI 消息（说明 AI 曾经处理过）
      const hasAIMessages = await this.prisma.message.count({
        where: {
          sessionId: { in: ticket.sessions.map((s) => s.id) },
          senderType: 'AI',
        },
      });

      // 更新工单状态的辅助函数
      const updateTicketToResolved = async (
        closeReason: 'RESOLVED' | 'MANUAL_AGENT' = 'RESOLVED',
        closedBy: 'AGENT' | 'SYSTEM' = 'SYSTEM',
      ) => {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            status: 'RESOLVED',
            closedAt: new Date(),
            closeReason,
            closedBy,
          },
        });

        // 清除所有关联会话的排队状态
        await this.prisma.session.updateMany({
          where: {
            ticketId,
            status: 'QUEUED',
          },
          data: {
            queuePosition: null,
            queuedAt: null,
          },
        });

        // 重新排序队列（移除已关闭的会话）
        await this.sessionService.reorderQueue();

        // 通知 WebSocket 客户端工单状态更新
        try {
          this.websocketGateway.notifyTicketUpdate(ticketId, {
            status: 'RESOLVED',
            closedAt: new Date(),
          });
        } catch (error) {
          // WebSocket 通知失败不影响状态更新
          this.logger.warn('WebSocket 通知失败:', error);
        }
      };

      // 如果有客服介入（有客服消息或会话被分配给客服），标记为已解决
      if (hasAgentMessages > 0 || hasAssignedAgent) {
        await updateTicketToResolved('RESOLVED', 'AGENT');
      } else if (hasAIMessages > 0) {
        // 如果有 AI 消息但没有客服介入，说明是 AI 解决的，也应该标记为 RESOLVED
        await updateTicketToResolved('RESOLVED', 'SYSTEM');
      } else {
        // 如果没有客服消息、没有分配给客服、也没有 AI 消息，只是玩家退出，将工单状态改为 WAITING
        // 这样工单会继续等待客服处理
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            status: 'WAITING',
          },
        });

        // 清除所有关联会话的排队状态（因为工单未解决，需要重新排队）
        await this.prisma.session.updateMany({
          where: {
            ticketId,
            status: 'QUEUED',
          },
          data: {
            queuePosition: null,
            queuedAt: null,
          },
        });

        // 重新排序队列（移除已关闭的会话）
        await this.sessionService.reorderQueue();

        // 通知 WebSocket 客户端工单状态更新
        try {
          this.websocketGateway.notifyTicketUpdate(ticketId, {
            status: 'WAITING',
          });
        } catch (error) {
          this.logger.warn('WebSocket 通知失败:', error);
        }
      }
    }
  }

  /**
   * 手动标记工单为已处理
   * @param ticketId 工单ID
   * @param closedBy 关闭者: PLAYER/AGENT/SYSTEM
   */
  async markAsResolved(
    ticketId: string,
    closedBy: 'PLAYER' | 'AGENT' | 'SYSTEM' = 'AGENT',
  ): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throwTicketNotFound(ticketId);
    }

    if (ticket.status === 'RESOLVED') {
      return;
    }

    // 根据关闭者确定关闭原因
    let closeReason: string;
    if (closedBy === 'PLAYER') {
      closeReason = 'MANUAL_PLAYER';
    } else if (closedBy === 'AGENT') {
      closeReason = 'MANUAL_AGENT';
    } else {
      closeReason = 'RESOLVED';
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        closedAt: new Date(),
        closeReason,
        closedBy,
      },
    });

    // 通知 WebSocket 客户端工单状态更新
    this.websocketGateway.notifyTicketUpdate(ticketId, {
      status: 'RESOLVED',
      closedAt: new Date(),
      closeReason,
      closedBy,
    });
  }

  /**
   * 定时任务：检查超过3天没有继续处理的工单
   * 如果工单3天玩家还是没有继续处理，就默认结束并修改状态为 RESOLVED
   * 否则一直显示在客服的聊天界面，状态显示为"待人工"（WAITING）
   */
  async checkStaleTickets(): Promise<void> {
    const now = new Date();

    // 从环境变量读取超时配置（小时），如果未配置则使用默认值
    const waitingTimeoutHours = parseInt(
      process.env.WAITING_TIMEOUT_HOURS || '72',
      10,
    );
    const repliedTimeoutHours = parseInt(
      process.env.REPLIED_TIMEOUT_HOURS || '24',
      10,
    );

    // 策略 A: WAITING 状态工单 - 72 小时（默认）超时
    const waitingThreshold = new Date(
      now.getTime() - waitingTimeoutHours * 60 * 60 * 1000,
    );

    // 策略 B: IN_PROGRESS 状态工单（客服已回复）- 24 小时（默认）超时
    const repliedThreshold = new Date(
      now.getTime() - repliedTimeoutHours * 60 * 60 * 1000,
    );

    // 查询 WAITING 状态的过期工单
    const staleWaitingTickets = await this.prisma.ticket.findMany({
      where: {
        status: 'WAITING',
        updatedAt: { lt: waitingThreshold },
        deletedAt: null,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // 查询 IN_PROGRESS 状态的过期工单
    const staleInProgressTickets = await this.prisma.ticket.findMany({
      where: {
        status: 'IN_PROGRESS',
        updatedAt: { lt: repliedThreshold },
        deletedAt: null,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // 过滤：只关闭最后消息确实来自客服的 IN_PROGRESS 工单
    const staleRepliedTickets = staleInProgressTickets.filter((ticket) => {
      const lastMessage = ticket.messages[0];
      // senderId 不为空表示消息来自客服
      return lastMessage && lastMessage.senderId !== null;
    });

    // 组合需要关闭的工单
    const ticketsToClose = [
      ...staleWaitingTickets.map((t) => ({
        ticket: t,
        method: 'auto_timeout_waiting' as const,
        inactivityHours: Math.floor(
          (now.getTime() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60),
        ),
      })),
      ...staleRepliedTickets.map((t) => ({
        ticket: t,
        method: 'auto_timeout_replied' as const,
        inactivityHours: Math.floor(
          (now.getTime() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60),
        ),
      })),
    ];

    // 批量更新
    let closedCount = 0;
    let failedCount = 0;

    for (const { ticket, method, inactivityHours } of ticketsToClose) {
      try {
        await this.updateStatus(ticket.id, 'RESOLVED', {
          closureMethod: method,
        });

        // 记录详细的关闭日志
        this.logger.logBusiness({
          action: 'ticket_auto_closed',
          ticketId: ticket.id,
          ticketNo: ticket.ticketNo,
          closureMethod: method,
          inactivityHours,
          previousStatus: ticket.status,
        });

        closedCount++;
      } catch (error) {
        this.logger.error(
          `自动关闭工单 ${ticket.ticketNo} 失败:`,
          error.stack,
          {
            ticketId: ticket.id,
            status: ticket.status,
            lastUpdated: ticket.updatedAt,
            error: error.message,
          },
        );
        failedCount++;
      }
    }

    // 输出统计日志
    this.logger.log(
      `定时任务完成：检查 ${ticketsToClose.length} 个过期工单，成功关闭 ${closedCount} 个，失败 ${failedCount} 个`,
      {
        total: ticketsToClose.length,
        closed: closedCount,
        failed: failedCount,
        waitingTickets: staleWaitingTickets.length,
        repliedTickets: staleRepliedTickets.length,
      },
    );
  }
}
