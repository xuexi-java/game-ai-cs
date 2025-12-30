import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto, TransferToAgentDto } from './dto/create-session.dto';
import { SessionStatus } from '@prisma/client';
import { MessageType as MessageDtoType } from '../message/dto/create-message.dto';
import { MessageService } from '../message/message.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { Inject, forwardRef } from '@nestjs/common';
import { TicketService } from '../ticket/ticket.service';
import { QueueService } from '../queue/queue.service';
import {
  SessionQueueService,
  SessionAIService,
  SessionAssignmentService,
  SessionTransferService,
} from './services';

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
export class SessionService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    private messageService: MessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    private queueService: QueueService,
    // 注入子服务
    private sessionAIService: SessionAIService,
    private sessionQueueService: SessionQueueService,
    private sessionAssignmentService: SessionAssignmentService,
    private sessionTransferService: SessionTransferService,
  ) {
    this.logger.setContext('SessionService');
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

  private enrichSessions(sessions: any[]) {
    return sessions.map((session) => this.enrichSession(session));
  }

  // 创建会话（步骤1：AI引导）
  async create(createSessionDto: CreateSessionDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: createSessionDto.ticketId },
      include: { game: true },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    // 检查是否已有会话
    const existingSession = await this.prisma.session.findFirst({
      where: {
        ticketId: createSessionDto.ticketId,
        status: { not: 'CLOSED' },
      },
    });

    if (existingSession) {
      return existingSession;
    }

    // 创建新会话
    const session = await this.prisma.session.create({
      data: {
        ticketId: createSessionDto.ticketId,
        status: 'PENDING',
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

    // Trigger AI response asynchronously (non-blocking) - 委托给 SessionAIService
    this.sessionAIService.triggerAIResponseAsync(session.id, ticket);

    // Return session immediately without waiting for AI
    const finalSession = this.enrichSession(session);

    // Business log: session created
    this.logger.logBusiness({
      action: 'session_created',
      sessionId: session.id,
      ticketId: createSessionDto.ticketId,
      status: session.status,
    });

    return finalSession;
  }

  // 玩家发送消息，自动与 Dify 交互
  async handlePlayerMessage(
    sessionId: string,
    content: string,
    messageType: MessageDtoType = MessageDtoType.TEXT,
  ) {
    if (!content || !content.trim()) {
      throw new BadRequestException('消息内容不能为空');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        ticket: {
          include: {
            game: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    // 检查会话状态，如果已关闭则不允许发送消息
    if (session.status === 'CLOSED') {
      throw new BadRequestException('会话已结束，无法发送消息');
    }

    // 检查工单状态，如果工单已解决则不允许发送消息
    if (session.ticket?.status === 'RESOLVED') {
      throw new BadRequestException('工单已解决，无法发送消息');
    }

    const playerMessage = await this.messageService.create(
      {
        sessionId,
        content,
        messageType,
      },
      'PLAYER',
    );
    this.websocketGateway.notifyMessage(sessionId, playerMessage);

    // 如果会话已被客服接入，不触发AI回复，只保存玩家消息
    if (session.status === 'IN_PROGRESS' && session.agentId) {
      return {
        playerMessage,
        aiMessage: null,
        difyStatus: null,
      };
    }

    if (messageType === MessageDtoType.TEXT) {
      // QUEUED 状态不触发 AI
      if (session.status === 'QUEUED') {
        return {
          playerMessage,
          aiMessage: null,
          difyStatus: session.difyStatus || null,
        };
      }

      // Fire-and-forget AI processing - 委托给 SessionAIService
      this.sessionAIService.processAiReply(sessionId, content).catch((error) => {
        this.logger.error(
          `AI reply failed for session ${sessionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    }

    return {
      playerMessage,
      aiMessage: null,
      difyStatus: session.difyStatus || null,
    };
  }

  async findOne(id: string, currentUser?: { id: string; role: string }) {
    const session = await this.prisma.session.findUnique({
      where: { id },
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

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    // 如果是客服角色，只能查看分配给自己的会话
    if (currentUser && currentUser.role === 'AGENT') {
      if (session.agentId !== currentUser.id) {
        throw new NotFoundException('会话不存在或无权访问');
      }
    }

    return this.enrichSession(session);
  }

  // 获取待接入会话列表（管理端）
  async findQueuedSessions(currentUser?: { id: string; role: string }) {
    // 1. 获取 QUEUED 状态的会话
    const queuedWhere: any = {
      status: 'QUEUED',
    };

    // 如果是客服角色，只返回分配给该客服的会话（包括 agentId 为 null 的未分配会话）
    // 如果是管理员角色，返回所有待接入会话
    if (currentUser && currentUser.role === 'AGENT') {
      queuedWhere.OR = [{ agentId: currentUser.id }, { agentId: null }];
    } else if (currentUser && currentUser.role === 'ADMIN') {
      // 管理员可以看到所有待接入会话，不需要过滤
    } else {
      queuedWhere.agentId = null;
    }

    const queuedSessions = await this.prisma.session.findMany({
      where: queuedWhere,
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
      },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    // 2. 获取 WAITING 状态的工单（没有活跃会话的）
    const waitingTicketsWhere: any = {
      status: 'WAITING',
      deletedAt: null,
      sessions: {
        none: {
          status: {
            in: ['PENDING', 'QUEUED', 'IN_PROGRESS'],
          },
        },
      },
    };

    const waitingTickets = await this.prisma.ticket.findMany({
      where: waitingTicketsWhere,
      include: {
        ...TICKET_RELATION_INCLUDE,
        sessions: {
          where: {
            status: 'CLOSED',
          },
          orderBy: {
            closedAt: 'desc',
          },
          take: 1,
          include: {
            agent: {
              select: {
                id: true,
                username: true,
                realName: true,
              },
            },
          },
        },
      },
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
    });

    // 3. 将 WAITING 状态的工单转换为"虚拟会话"对象
    const virtualSessions = waitingTickets.map((ticket) => {
      const latestSession = ticket.sessions?.[0];
      return {
        id: `ticket-${ticket.id}`,
        ticketId: ticket.id,
        realSessionId: latestSession?.id || null,
        status: 'QUEUED' as SessionStatus,
        detectedIntent: latestSession?.detectedIntent || null,
        aiUrgency: latestSession?.aiUrgency || null,
        playerUrgency: latestSession?.playerUrgency || null,
        priorityScore: ticket.priorityScore || 0,
        queuePosition: null,
        queuedAt: latestSession?.closedAt || ticket.createdAt,
        transferAt: latestSession?.transferAt || null,
        startedAt: null,
        closedAt: latestSession?.closedAt || null,
        difyConversationId: latestSession?.difyConversationId || null,
        difyStatus: latestSession?.difyStatus || null,
        allowManualTransfer: false,
        transferReason: latestSession?.transferReason || null,
        transferIssueTypeId: latestSession?.transferIssueTypeId || null,
        manuallyAssigned: false,
        agentId: null,
        agent: null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        ticket: {
          ...ticket,
          sessions: undefined,
        },
        messages: [],
        isVirtual: true,
      };
    });

    // 4. 合并并排序
    const allSessions = [
      ...this.enrichSessions(queuedSessions),
      ...virtualSessions,
    ];

    allSessions.sort((a, b) => {
      const scoreDiff = (b.priorityScore || 0) - (a.priorityScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const aTime = a.queuedAt ? new Date(a.queuedAt).getTime() : 0;
      const bTime = b.queuedAt ? new Date(b.queuedAt).getTime() : 0;
      return aTime - bTime;
    });

    return allSessions;
  }

  // 会话列表（管理端/客服端）
  async findAll(
    query: {
      status?: SessionStatus;
      agentId?: string;
      gameId?: string;
      search?: string;
      transferredToAgent?: boolean;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    currentUser: { id: string; role: string },
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    const agentConditions: any[] = [];

    if (query.transferredToAgent !== undefined) {
      agentConditions.push(
        query.transferredToAgent === true
          ? { agentId: { not: null } }
          : { agentId: null },
      );
    }

    if (currentUser?.role === 'AGENT') {
      agentConditions.push({ agentId: currentUser.id });
    } else if (query.agentId) {
      agentConditions.push({ agentId: query.agentId });
    }

    if (agentConditions.length === 1) {
      Object.assign(where, agentConditions[0]);
    } else if (agentConditions.length > 1) {
      where.AND = [...(where.AND || []), ...agentConditions];
    }

    const ticketFilter: any = {};

    if (query.gameId) {
      ticketFilter.gameId = query.gameId;
    }

    if (query.search) {
      ticketFilter.OR = [
        {
          ticketNo: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          playerIdOrName: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (Object.keys(ticketFilter).length > 0) {
      where.ticket = ticketFilter;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.session.findMany({
        where,
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
            take: 20,
          },
        },
        orderBy: {
          [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
        },
        skip,
        take: pageSize,
      }),
      this.prisma.session.count({ where }),
    ]);

    const normalizedItems = this.enrichSessions(items);

    return {
      items: normalizedItems,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // 客服接入会话 - 委托给 SessionAssignmentService
  async joinSession(sessionId: string, agentId: string) {
    const session = await this.findOne(sessionId);
    return this.sessionAssignmentService.joinSession(sessionId, agentId, session);
  }

  // 管理员手动分配会话 - 委托给 SessionAssignmentService
  async assignSession(sessionId: string, agentId: string) {
    const session = await this.findOne(sessionId);
    return this.sessionAssignmentService.assignSession(sessionId, agentId, session);
  }

  // 自动分配会话 - 委托给 SessionAssignmentService
  async autoAssignSession(sessionId: string) {
    const session = await this.findOne(sessionId);
    return this.sessionAssignmentService.autoAssignSession(sessionId, session);
  }

  // 自动分配客服（只分配，不改变状态） - 委托给 SessionAssignmentService
  async autoAssignAgentOnly(sessionId: string) {
    const session = await this.findOne(sessionId);
    return this.sessionAssignmentService.autoAssignAgentOnly(sessionId, session);
  }

  // 转人工 - 委托给 SessionTransferService
  async transferToAgent(sessionId: string, transferDto: TransferToAgentDto) {
    return this.sessionTransferService.transferToAgent(sessionId, transferDto);
  }

  // 重新排序队列 - 委托给 SessionQueueService
  async reorderQueue() {
    return this.sessionQueueService.reorderQueue();
  }

  /**
   * 内部关闭会话的公共逻辑
   */
  private async performCloseSession(
    sessionId: string,
    closedBy: 'agent' | 'player',
    systemMessage: string,
  ) {
    // 获取会话信息
    const existingSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { ticketId: true, status: true, agentId: true },
    });

    if (!existingSession) {
      throw new NotFoundException('会话不存在');
    }

    // 如果会话已经关闭，直接返回
    if (existingSession.status === 'CLOSED') {
      return await this.findOne(sessionId);
    }

    // 更新会话状态
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        queuePosition: null,
        queuedAt: null,
      },
      include: {
        ticket: { include: { ...TICKET_RELATION_INCLUDE } },
        agent: { select: { id: true, username: true, realName: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    // 创建系统消息
    try {
      const msg = await this.messageService.createSystemMessage(sessionId, systemMessage);
      this.websocketGateway.notifyMessage(sessionId, msg);
    } catch (error) {
      this.logger.warn('创建系统消息失败:', error);
    }

    // 从 Redis 队列移除会话
    await this.queueService.removeFromQueueWithRetry(sessionId, existingSession.agentId);

    // 重新排序队列
    await this.sessionQueueService.reorderQueue();

    // 关键业务日志
    this.logger.logBusiness({
      action: 'session_closed',
      sessionId,
      ticketId: existingSession.ticketId,
      agentId: updatedSession.agentId,
      closedBy,
    });

    // 通过 WebSocket 通知
    const normalizedSession = this.enrichSession(updatedSession);
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    // 检查并更新关联工单的状态
    if (existingSession.ticketId) {
      await this.ticketService.checkAndUpdateTicketStatus(existingSession.ticketId);
    }

    return normalizedSession;
  }

  // 结束会话（客服端）
  async closeSession(sessionId: string) {
    return this.performCloseSession(sessionId, 'agent', '客服已结束会话');
  }

  // 结束会话（玩家端）
  async closeByPlayer(sessionId: string) {
    return this.performCloseSession(sessionId, 'player', '玩家已离开会话');
  }

  // 通过工单ID查找活跃会话
  async findActiveSessionByTicket(ticketId: string) {
    const session = await this.prisma.session.findFirst({
      where: {
        ticketId,
        status: {
          in: ['PENDING', 'QUEUED', 'IN_PROGRESS'],
        },
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!session) {
      return null;
    }

    return this.enrichSession(session);
  }

  // 通过工单ID接入会话（如果会话不存在则创建，如果已关闭则重新激活）
  async joinSessionByTicketId(ticketId: string, agentId: string) {
    // 1. 检查工单是否存在
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true, status: true },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    // 2. 检查工单状态
    if (ticket.status === 'RESOLVED') {
      throw new BadRequestException('该工单已解决，无法接入');
    }

    // 3. 查找最新的会话（包括已关闭的）
    const latestSession = await this.prisma.session.findFirst({
      where: {
        ticketId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // 4. 如果有已关闭的会话，重新激活它
    if (latestSession && latestSession.status === 'CLOSED') {
      return await this.joinSession(latestSession.id, agentId);
    }

    // 5. 如果有活跃会话，直接接入
    if (
      latestSession &&
      ['PENDING', 'QUEUED', 'IN_PROGRESS'].includes(latestSession.status)
    ) {
      return await this.joinSession(latestSession.id, agentId);
    }

    // 6. 如果没有会话，创建新会话
    const ticketFull = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        game: true,
        server: true,
      },
    });

    if (!ticketFull) {
      throw new NotFoundException('工单不存在');
    }

    // 创建新会话
    const newSession = await this.prisma.session.create({
      data: {
        ticketId,
        agentId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
        priorityScore: ticketFull.priorityScore || 0,
        manuallyAssigned: true,
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

    // 更新工单状态为处理中
    await this.ticketService.updateStatus(ticketId, 'IN_PROGRESS');

    // 更新用户在线状态
    await this.prisma.user.update({
      where: { id: agentId },
      data: { isOnline: true },
    });

    const normalizedSession = this.enrichSession(newSession);

    // 通知 WebSocket 客户端
    this.websocketGateway.notifySessionUpdate(
      normalizedSession.id,
      normalizedSession,
    );

    return normalizedSession;
  }

  /**
   * 通过工单ID获取所有历史消息
   * 用于玩家端查看完整的对话历史，包括跨会话的消息
   */
  async getTicketMessages(ticketId: string) {
    // 验证工单存在
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    // 获取工单的所有会话
    const sessions = await this.prisma.session.findMany({
      where: { ticketId },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const sessionIds = sessions.map((s) => s.id);

    if (sessionIds.length === 0) {
      return [];
    }

    // 获取所有会话的消息，按时间排序
    const messages = await this.prisma.message.findMany({
      where: {
        sessionId: { in: sessionIds },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        agent: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });

    this.logger.log(
      `[getTicketMessages] 工单=${ticketId}，会话数=${sessions.length}，消息数=${messages.length}`,
    );

    return messages;
  }
}
