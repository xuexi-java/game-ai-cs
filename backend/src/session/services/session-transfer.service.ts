import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { QueueService } from '../../queue/queue.service';
import { WebsocketGateway } from '../../websocket/websocket.gateway';
import { TicketService } from '../../ticket/ticket.service';
import { MessageService } from '../../message/message.service';
import { SessionPriorityService } from './session-priority.service';
import { SessionQueueService } from './session-queue.service';
import { SessionAssignmentService } from './session-assignment.service';
import { TransferToAgentDto } from '../dto/create-session.dto';

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
export class SessionTransferService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    private queueService: QueueService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    private messageService: MessageService,
    private sessionPriorityService: SessionPriorityService,
    private sessionQueueService: SessionQueueService,
    private sessionAssignmentService: SessionAssignmentService,
  ) {
    this.logger.setContext('SessionTransferService');
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
   * P0 性能优化：将会话转为加急工单
   * 抽取重复代码，减少维护成本
   */
  private async convertToUrgentTicket(
    sessionId: string,
    session: { ticketId: string },
    transferDto: TransferToAgentDto,
    priorityScore: number,
  ): Promise<{
    queued: false;
    queuePosition: null;
    estimatedWaitTime: null;
    onlineAgents: 0;
    autoAssigned: false;
    message: string;
    ticketNo: string;
    convertedToTicket: true;
  }> {
    // 1. 更新工单为加急状态
    await this.ticketService.updateStatus(session.ticketId, 'WAITING');
    await this.prisma.ticket.update({
      where: { id: session.ticketId },
      data: {
        priority: 'URGENT',
        priorityScore: Math.max(priorityScore, 80),
      },
    });

    // 2. 关闭会话
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        playerUrgency: transferDto.urgency,
        priorityScore,
        allowManualTransfer: false,
        transferReason: transferDto.reason,
        transferIssueTypeId: transferDto.issueTypeId,
        transferAt: new Date(),
      },
    });

    // 3. 创建系统消息告知玩家
    const ticket = await this.ticketService.findOne(session.ticketId);
    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }
    await this.messageService.createSystemMessage(
      sessionId,
      `当前暂无客服在线，您的问题已转为【加急工单】(${ticket.ticketNo})，我们将优先处理。您可以通过工单号查看处理进度。`,
    );

    const updatedSession = await this.findOne(sessionId);
    this.websocketGateway.notifySessionUpdate(sessionId, updatedSession);

    return {
      queued: false,
      queuePosition: null,
      estimatedWaitTime: null,
      onlineAgents: 0,
      autoAssigned: false,
      message: '当前暂无客服在线，您的问题已转为【加急工单】，我们将优先处理。',
      ticketNo: ticket.ticketNo,
      convertedToTicket: true,
    };
  }

  private async findOne(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
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
    return this.enrichSession(session);
  }

  /**
   * 转人工（步骤5：智能分流）- 默认自动分配
   */
  async transferToAgent(sessionId: string, transferDto: TransferToAgentDto) {
    // P0 性能优化：使用 groupBy 将 4 次 count 查询合并为 1 次
    const onlineCount = await this.sessionPriorityService.getOnlineAgentCount();
    const priorityScore = await this.sessionPriorityService.calculatePriorityScore(sessionId);

    // 获取会话和工单信息
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { ticket: true },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    // 没有在线客服：关闭会话，转为加急工单
    if (onlineCount.total === 0) {
      return this.convertToUrgentTicket(
        sessionId,
        session,
        transferDto,
        priorityScore,
      );
    }

    // 确认有在线客服：正常进入排队流程
    // 更新会话状态为排队
    const queuedAt = new Date();
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'QUEUED',
        playerUrgency: transferDto.urgency,
        priorityScore,
        queuedAt,
        allowManualTransfer: false,
        transferReason: transferDto.reason,
        transferIssueTypeId: transferDto.issueTypeId,
        transferAt: new Date(),
        manuallyAssigned: false, // 默认未手动分配
      },
    });

    // 添加到 Redis 队列（未分配队列，使用重试机制）
    const added = await this.queueService.addToUnassignedQueueWithRetry(
      sessionId,
      priorityScore,
      queuedAt,
    );
    if (!added) {
      this.logger.warn(`添加到 Redis 队列失败，将在下次一致性检查时修复`);
    }

    // 重新排序队列
    await this.sessionQueueService.reorderQueue();

    // ✅ 自动分配客服（只分配，不改变状态，保持 QUEUED）
    let assignmentSucceeded = false;
    try {
      const sessionForAssign = await this.findOne(sessionId);
      const assignedSession = await this.sessionAssignmentService.autoAssignAgentOnly(sessionId, sessionForAssign);
      // ⚠️ 关键：检查是否真的分配了客服
      if (assignedSession.agentId) {
        assignmentSucceeded = true;
      }
    } catch (error) {
      // 自动分配失败可能是因为所有客服都忙，这是正常的，保持排队状态
    }

    // ⚠️ 关键修复：如果自动分配失败，检查是否还有在线客服
    if (!assignmentSucceeded) {
      // P0 性能优化：复用 getOnlineAgentCount 方法
      const stillOnline = await this.sessionPriorityService.getOnlineAgentCount();

      // 如果现在没有在线客服了，关闭会话并转为工单，告知玩家
      if (stillOnline.total === 0) {
        return this.convertToUrgentTicket(
          sessionId,
          session,
          transferDto,
          priorityScore,
        );
      }
    }

    const finalSession = await this.findOne(sessionId);

    // ✅ 确保发送排队更新通知到玩家端
    if (
      finalSession.queuePosition !== null &&
      finalSession.queuePosition !== undefined
    ) {
      this.websocketGateway.notifyQueueUpdate(
        sessionId,
        finalSession.queuePosition,
        finalSession.estimatedWaitTime,
      );
    }

    // ✅ 确保发送会话更新通知
    this.websocketGateway.notifySessionUpdate(sessionId, finalSession);

    // 关键业务日志：转人工
    this.logger.logBusiness({
      action: 'session_transferred',
      sessionId,
      ticketId: session.ticketId,
      urgency: transferDto.urgency,
      reason: transferDto.reason,
      agentId: finalSession.agentId,
      queuePosition: finalSession.queuePosition,
    });

    // P0 性能优化：复用开始时获取的 onlineCount，避免重复查询
    const queuePosition =
      finalSession.status === 'QUEUED'
        ? (finalSession.queuePosition ??
          (await this.sessionQueueService.getQueuePosition(sessionId)))
        : 0;

    // 计算预计等待时间（分钟）
    const averageProcessingTime = 5;
    let estimatedWaitTime: number | null = null;

    if (queuePosition && queuePosition > 0) {
      if (finalSession.agentId) {
        // 如果已分配客服，预计等待时间 = 在该客服队列中的位置 * 平均处理时间
        estimatedWaitTime = Math.ceil(queuePosition * averageProcessingTime);
      } else {
        // 如果未分配，预计等待时间 = (前面排队人数 / 在线客服数量) * 平均处理时间
        estimatedWaitTime =
          onlineCount.agents > 0
            ? Math.ceil(
                (queuePosition / onlineCount.agents) * averageProcessingTime,
              )
            : null;
      }
    }

    return {
      queued: true, // ✅ 确保返回 queued: true，表示已进入排队
      queuePosition:
        finalSession.status === 'QUEUED'
          ? (finalSession.queuePosition ?? queuePosition ?? null)
          : null,
      estimatedWaitTime:
        finalSession.status === 'QUEUED'
          ? (finalSession.estimatedWaitTime ?? estimatedWaitTime)
          : null,
      onlineAgents: onlineCount.agents,
      autoAssigned: false, // ✅ 未自动分配，等待客服主动接入
      message: undefined,
      convertedToTicket: false,
    };
  }
}
