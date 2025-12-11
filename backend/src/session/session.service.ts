import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto, TransferToAgentDto } from './dto/create-session.dto';
import {
  MessageType as PrismaMessageType,
  SessionStatus,
  Urgency,
  Prisma,
} from '@prisma/client';
import { MessageType as MessageDtoType } from '../message/dto/create-message.dto';
import { DifyService, DifyMessageResult } from '../dify/dify.service';
import { MessageService } from '../message/message.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { Inject, forwardRef } from '@nestjs/common';
import { TicketService } from '../ticket/ticket.service';
import { QueueService } from '../queue/queue.service';

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
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private prisma: PrismaService,
    private difyService: DifyService,
    private messageService: MessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    private queueService: QueueService,
  ) { }

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

  // 鍒涘缓浼氳瘽锛堟楠?锛欰I寮曞锛?
  @Throttle({
    default: { limit: 10000, ttl: 60000 }, // 全局限制：10000次/分钟
    'dify-api': { limit: 3000, ttl: 60000 } // Dify API 限制：3000次/分钟
  })
  async create(createSessionDto: CreateSessionDto) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: createSessionDto.ticketId },
      include: { game: true },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    // 妫€鏌ユ槸鍚﹀凡鏈変細璇?
    const existingSession = await this.prisma.session.findFirst({
      where: {
        ticketId: createSessionDto.ticketId,
        status: { not: 'CLOSED' },
      },
    });

    if (existingSession) {
      return existingSession;
    }

    // 鍒涘缓鏂颁細璇?
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

    // 璋冪敤Dify AI鑾峰彇鍒濆鍥炲
    try {
      const difyResponse = await this.difyService.triage(
        ticket.description,
        ticket.game.difyApiKey,
        ticket.game.difyBaseUrl,
      );

      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          detectedIntent: difyResponse.detectedIntent,
          aiUrgency:
            difyResponse.urgency === 'urgent' ? 'URGENT' : 'NON_URGENT',
          difyStatus: difyResponse.status ? String(difyResponse.status) : null,
        },
      });

      const aiMessage = await this.messageService.createAIMessage(
        session.id,
        difyResponse.text || '鎮ㄥソ锛屾垜姝ｅ湪涓烘偍鍒嗘瀽闂...',
        { suggestedOptions: difyResponse.suggestedOptions },
      );
      this.websocketGateway.notifyMessage(session.id, aiMessage);
    } catch (error) {
      console.error('Dify AI璋冪敤澶辫触:', error);
      // 鍒涘缓榛樿鍥炲
      const fallback = await this.messageService.createAIMessage(
        session.id,
        '鎮ㄥソ锛屾劅璋㈡偍鐨勫弽棣堛€傛垜浠鍦ㄤ负鎮ㄥ鐞嗭紝璇风◢鍊?..',
      );
      this.websocketGateway.notifyMessage(session.id, fallback);
    }

    return this.findOne(session.id);
  }

  // 鐜╁鍙戦€佹秷鎭紝鑷姩涓?Dify 浜や簰
  @Throttle({
    default: { limit: 10000, ttl: 60000 }, // 全局限制：10000次/分钟
    'dify-api': { limit: 3000, ttl: 60000 } // Dify API 限制：3000次/分钟
  })
  async handlePlayerMessage(
    sessionId: string,
    content: string,
    messageType: MessageDtoType = MessageDtoType.TEXT,
  ) {
    if (!content || !content.trim()) {
      throw new BadRequestException('娑堟伅鍐呭涓嶈兘涓虹┖');
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

    let difyResult: DifyMessageResult | null = null;
    let aiMessage: Awaited<
      ReturnType<MessageService['createAIMessage']>
    > | null = null;

    if (messageType === MessageDtoType.TEXT) {
      // 如果会话状态是 QUEUED，不再调用 AI
      if (session.status === 'QUEUED') {
        return {
          playerMessage,
          aiMessage: null,
          difyStatus: session.difyStatus || null,
        };
      }

      try {
        difyResult = await this.difyService.sendChatMessage(
          content,
          session.ticket.game.difyApiKey,
          session.ticket.game.difyBaseUrl,
          session.difyConversationId || undefined,
          session.ticket.playerIdOrName || 'player',
        );

        const updateData: Record<string, any> = {};
        if (
          difyResult.conversationId &&
          difyResult.conversationId !== session.difyConversationId
        ) {
          updateData.difyConversationId = difyResult.conversationId;
        }
        if (difyResult.status) {
          updateData.difyStatus = String(difyResult.status);
        }
        if (Object.keys(updateData).length > 0) {
          await this.prisma.session.update({
            where: { id: sessionId },
            data: updateData,
          });
        }

        if (difyResult.text) {
          // 简单的关键词检测，如果包含"转人工"等词，强制添加"转人工"选项
          const transferKeywords = [
            '转人工',
            '人工',
            '客服',
            '人工客服',
            'Human',
            'Agent',
          ];
          const shouldSuggestTransfer = transferKeywords.some((k) =>
            content.toLowerCase().includes(k.toLowerCase()),
          );

          let finalOptions = difyResult.suggestedOptions || [];
          if (shouldSuggestTransfer && !finalOptions.includes('转人工')) {
            finalOptions = [...finalOptions, '转人工'];
          }

          aiMessage = await this.messageService.createAIMessage(
            sessionId,
            difyResult.text,
            {
              suggestedOptions: finalOptions,
              difyStatus: difyResult.status,
            },
          );
          this.websocketGateway.notifyMessage(sessionId, aiMessage);
        }

        // 移除自动转人工逻辑，完全由玩家在前端控制
        /*
        if (
          difyResult.status &&
          ['5', 5, 'TRANSFER', 'HANDOFF', 'AGENT'].includes(
            String(difyResult.status).toUpperCase(),
          )
        ) {
          await this.transferToAgent(sessionId, { urgency: 'URGENT' });
        }
        */
      } catch (error: any) {
        console.error('Dify 瀵硅瘽澶辫触:', error.message || error);
      }
    }

    return {
      playerMessage,
      aiMessage,
      difyStatus: difyResult?.status || session.difyStatus || null,
    };
  }

  // 获取会话详情
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

  // 鑾峰彇寰呮帴鍏ヤ細璇濆垪琛紙绠＄悊绔級
  async findQueuedSessions(currentUser?: { id: string; role: string }) {
    // 1. 获取 QUEUED 状态的会话
    const queuedWhere: any = {
      status: 'QUEUED',
    };

    // 如果是客服角色，只返回分配给该客服的会话（包括 agentId 为 null 的未分配会话）
    // 如果是管理员角色，返回所有待接入会话
    if (currentUser && currentUser.role === 'AGENT') {
      // ✅ 客服可以看到：分配给自己的会话 OR 未分配的会话（agentId 为 null）
      queuedWhere.OR = [
        { agentId: currentUser.id },
        { agentId: null },
      ];
      // 添加日志
      this.logger.log(
        `客服 ${currentUser.id} (${currentUser.role}) 查询待接入队列，过滤条件: ${JSON.stringify(queuedWhere)}`,
      );
    } else if (currentUser && currentUser.role === 'ADMIN') {
      // ✅ 管理员可以看到所有待接入会话，不需要过滤
      this.logger.log('管理员查询待接入队列，返回所有会话');
    } else {
      // ✅ 未认证或未知角色：只返回未分配的会话（agentId 为 null）
      queuedWhere.agentId = null;
      this.logger.warn(
        `未认证用户或未知角色查询待接入队列，只返回未分配会话: ${JSON.stringify(currentUser)}`,
      );
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

    // 添加日志记录查询结果
    this.logger.log(
      `查询到 ${queuedSessions.length} 个待接入会话，其中分配给客服的: ${queuedSessions.filter(s => s.agentId === currentUser?.id).length} 个，未分配的: ${queuedSessions.filter(s => !s.agentId).length} 个`,
    );

    // 2. 获取 WAITING 状态的工单（没有活跃会话的）
    // 活跃会话：状态为 PENDING、QUEUED 或 IN_PROGRESS
    const waitingTicketsWhere: any = {
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
    };

    // 如果是客服角色，可以查看所有 WAITING 状态的工单（让客服可以选择处理）
    // 管理员可以看到所有待处理工单

    const waitingTickets = await this.prisma.ticket.findMany({
      where: waitingTicketsWhere,
      include: {
        ...TICKET_RELATION_INCLUDE,
        // 获取最新的已关闭会话（用于显示优先级等信息）
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
        id: `ticket-${ticket.id}`, // 虚拟会话ID，使用 ticket- 前缀
        ticketId: ticket.id,
        // ✅ 修复：如果存在已关闭的会话，保存真实会话ID，方便前端接入
        realSessionId: latestSession?.id || null,
        status: 'QUEUED' as SessionStatus, // 标记为 QUEUED，让前端可以统一处理
        detectedIntent: latestSession?.detectedIntent || null,
        aiUrgency: latestSession?.aiUrgency || null,
        playerUrgency: latestSession?.playerUrgency || null,
        priorityScore: ticket.priorityScore || 0,
        queuePosition: null,
        queuedAt: latestSession?.closedAt || ticket.createdAt, // 使用关闭时间或创建时间
        transferAt: latestSession?.transferAt || null,
        startedAt: null,
        closedAt: latestSession?.closedAt || null,
        difyConversationId: latestSession?.difyConversationId || null,
        difyStatus: latestSession?.difyStatus || null,
        allowManualTransfer: false,
        transferReason: latestSession?.transferReason || null,
        transferIssueTypeId: latestSession?.transferIssueTypeId || null,
        manuallyAssigned: false,
        agentId: null, // 还没有分配客服
        agent: null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        ticket: {
          ...ticket,
          sessions: undefined, // 移除 sessions，避免循环引用
        },
        messages: [], // 虚拟会话没有消息（消息在工单中）
        isVirtual: true, // 标记为虚拟会话
      };
    });

    // 4. 合并并排序
    const allSessions = [
      ...this.enrichSessions(queuedSessions),
      ...virtualSessions,
    ];

    // 按优先级分数和排队时间排序
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
            // 列表查询时限制消息数量，避免数据过大
            // 详情查询时会重新获取完整消息列表
            take: 20, // 列表只显示最近20条消息
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

  // 客服接入会话
  async joinSession(sessionId: string, agentId: string) {
    const session = await this.findOne(sessionId);

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
      this.logger.warn(
        `从 Redis 队列移除会话失败，将在下次一致性检查时修复`,
      );
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
      } catch (error) {
        console.error('更新工单状态失败:', error);
        // 不抛出错误，避免影响会话接入流程
      }
    }

    // 重新排序队列（移除已接入的会话）
    await this.reorderQueue();

    // 通知 WebSocket 客户端
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    return normalizedSession;
  }

  // 管理员手动分配会话给指定客服（包括管理员自己）
  // 支持二次分配：除了已结束的工单和会话，其他都可以重新分配
  async assignSession(sessionId: string, agentId: string) {
    const startTime = Date.now();

    try {
      this.logger.log(
        `开始手动分配会话 ${sessionId} 给 ${agentId}`,
        { sessionId, agentId, timestamp: new Date().toISOString() },
      );

      const session = await this.findOne(sessionId);

      // 检查会话状态：已结束的会话不能分配
      if (session.status === 'CLOSED') {
        this.logger.warn(
          `会话 ${sessionId} 已结束，无法分配`,
          { sessionId, sessionStatus: session.status },
        );
        throw new BadRequestException('该会话已结束，无法分配');
      }

      // 检查工单状态：已解决的工单不能分配
      if (session.ticket?.status === 'RESOLVED') {
        this.logger.warn(
          `工单 ${session.ticket?.id} 已解决，无法分配会话 ${sessionId}`,
          { sessionId, ticketId: session.ticket?.id, ticketStatus: session.ticket?.status },
        );
        throw new BadRequestException('该工单已解决，无法分配客服');
      }

      // 检查用户是否存在（可以是客服或管理员）
      const agent = await this.prisma.user.findUnique({
        where: { id: agentId, deletedAt: null },
      });

      if (!agent) {
        this.logger.error(
          `分配失败：用户 ${agentId} 不存在`,
          undefined,
          'SessionService',
          { sessionId, agentId },
        );
        throw new NotFoundException('用户不存在');
      }

      // 只允许分配给客服或管理员
      if (agent.role !== 'AGENT' && agent.role !== 'ADMIN') {
        this.logger.warn(
          `分配失败：用户 ${agentId} 不是客服或管理员`,
          { sessionId, agentId, agentRole: agent.role },
        );
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

      const isReassignment = oldSession?.agentId && oldSession.agentId !== agentId;
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
          queuePosition: session.status === 'QUEUED' ? null : session.queuePosition, // 清除排队位置
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

      // 记录分配日志
      const duration = Date.now() - startTime;
      this.logger.log(
        `${isReassignment ? '重新' : ''}分配会话 ${sessionId} 成功: ${previousAgentId ? `从 ${previousAgentId} ` : ''}分配给 ${agent.role} ${agent.username} (${agentId})`,
        {
          sessionId,
          ticketId: session.ticketId,
          previousAgentId,
          newAgentId: agentId,
          newAgentRole: agent.role,
          newAgentUsername: agent.username,
          isReassignment,
          sessionStatus: updatedSession.status,
          duration,
          timestamp: new Date().toISOString(),
        },
      );

      // 通知 WebSocket 客户端
      this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

      return normalizedSession;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `手动分配会话 ${sessionId} 失败: ${errorMessage}`,
        errorStack,
        'SessionService',
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

  // 自动分配会话（根据客服当前接待数量）
  async autoAssignSession(sessionId: string) {
    const session = await this.findOne(sessionId);

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
      this.logger.warn(
        `从 Redis 队列移除会话失败，将在下次一致性检查时修复`,
      );
    }

    const normalizedSession = this.enrichSession(updatedSession);

    // 重新排序队列（移除已接入的会话）
    await this.reorderQueue();

    // 通知 WebSocket 客户端会话状态更新
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);
    return normalizedSession;
  }

  // 自动分配客服（只分配客服，不改变状态，保持 QUEUED）
  async autoAssignAgentOnly(sessionId: string) {
    const session = await this.findOne(sessionId);

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
      this.logger.warn(
        `会话 ${sessionId} 没有可分配的在线客服或管理员`,
        { sessionId, onlineAgentsCount: onlineAgents.length, onlineAdminsCount: onlineAdmins.length },
      );
      return session;
    }

    // 计算负载：管理员增加权重（+3），优先分配给客服
    const ADMIN_WEIGHT_PENALTY = 3; // 管理员负载权重惩罚
    const agentsWithLoad = candidatePool.map((agent) => ({
      agent,
      load: agent.sessions.length + (agent.role === 'ADMIN' ? ADMIN_WEIGHT_PENALTY : 0),
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

    // 记录分配日志
    this.logger.log(
      `会话 ${sessionId} 自动分配: 选择 ${selectedAgent.role} ${selectedAgent.username} (负载: ${selectedAgent.sessions.length}, 加权负载: ${agentsWithLoad[0].load})`,
      {
        sessionId,
        selectedAgentId: selectedAgent.id,
        selectedAgentRole: selectedAgent.role,
        selectedAgentUsername: selectedAgent.username,
        actualLoad: selectedAgent.sessions.length,
        weightedLoad: agentsWithLoad[0].load,
        candidateCount: candidatePool.length,
        agentCount: onlineAgents.length,
        adminCount: onlineAdmins.length,
      },
    );

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
        this.logger.warn(
          `移动会话到客服队列失败，将在下次一致性检查时修复`,
        );
      }
    }

    // 重新排序队列（更新排队位置）
    await this.reorderQueue();

    // 通知 WebSocket 客户端会话更新（分配了客服）
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);
    return normalizedSession;
  }

  // 转人工（步骤5：智能分流）- 默认自动分配
  async transferToAgent(sessionId: string, transferDto: TransferToAgentDto) {
    // 只有当玩家明确选择转人工时才执行
    // 检查是否有在线客服或管理员
    const onlineAgents = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });
    const onlineAdmins = await this.prisma.user.count({
      where: {
        role: 'ADMIN',
        isOnline: true,
        deletedAt: null,
      },
    });

    const priorityScore = await this.calculatePriorityScore(sessionId);

    const noAgentsOnline = onlineAgents === 0 && onlineAdmins === 0;

    // 获取会话和工单信息
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { ticket: true },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    if (noAgentsOnline) {
      // 没有在线客服：关闭会话，转为加急工单
      // 1. 更新工单为加急状态
      await this.ticketService.updateStatus(session.ticketId, 'WAITING');
      await this.prisma.ticket.update({
        where: { id: session.ticketId },
        data: {
          priority: 'URGENT',
          priorityScore: Math.max(priorityScore, 80), // 至少80分，确保优先级
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
        message:
          '当前暂无客服在线，您的问题已转为【加急工单】，我们将优先处理。',
        ticketNo: ticket.ticketNo,
        convertedToTicket: true, // 标记已转为工单
      };
    }

    // 有在线客服：正常进入排队流程
    // 但需要再次确认在线客服或管理员数量（可能在这期间客服下线了）
    const currentOnlineAgents = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });
    const currentOnlineAdmins = await this.prisma.user.count({
      where: {
        role: 'ADMIN',
        isOnline: true,
        deletedAt: null,
      },
    });

    // 如果此时没有在线客服或管理员了，转为工单
    if (currentOnlineAgents === 0 && currentOnlineAdmins === 0) {
      // 更新工单为加急状态
      await this.ticketService.updateStatus(session.ticketId, 'WAITING');
      await this.prisma.ticket.update({
        where: { id: session.ticketId },
        data: {
          priority: 'URGENT',
          priorityScore: Math.max(priorityScore, 80),
        },
      });

      // 关闭会话
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

      // 创建系统消息
      const ticket = await this.ticketService.findOne(session.ticketId);
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
        message:
          '当前暂无客服在线，您的问题已转为【加急工单】，我们将优先处理。',
        ticketNo: ticket.ticketNo,
        convertedToTicket: true,
      };
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
      this.logger.warn(
        `添加到 Redis 队列失败，将在下次一致性检查时修复`,
      );
    }

    // 重新排序队列
    await this.reorderQueue();

    // ✅ 自动分配客服（只分配，不改变状态，保持 QUEUED）
    let assignmentSucceeded = false;
    try {
      const assignedSession = await this.autoAssignAgentOnly(sessionId);
      // ⚠️ 关键：检查是否真的分配了客服
      if (assignedSession.agentId) {
        assignmentSucceeded = true;
        this.logger.log(`会话 ${sessionId} 已自动分配给客服`);
      } else {
        this.logger.warn(`会话 ${sessionId} 未能分配客服（可能没有可分配的客服）`);
      }
    } catch (error) {
      // 自动分配失败可能是因为所有客服都忙，这是正常的，保持排队状态
      this.logger.warn(`自动分配失败，会话 ${sessionId} 保持在排队状态: ${error.message}`);
    }

    // ⚠️ 关键修复：如果自动分配失败，检查是否还有在线客服
    if (!assignmentSucceeded) {
      const stillHasOnlineAgents = await this.prisma.user.count({
        where: {
          role: 'AGENT',
          isOnline: true,
          deletedAt: null,
        },
      });
      const stillHasOnlineAdmins = await this.prisma.user.count({
        where: {
          role: 'ADMIN',
          isOnline: true,
          deletedAt: null,
        },
      });

      // 如果现在没有在线客服了，关闭会话并转为工单，告知玩家
      if (stillHasOnlineAgents === 0 && stillHasOnlineAdmins === 0) {
        this.logger.warn(`自动分配失败且无在线客服，关闭会话 ${sessionId} 并转为工单`);

        // 更新工单为加急状态
        await this.ticketService.updateStatus(session.ticketId, 'WAITING');
        await this.prisma.ticket.update({
          where: { id: session.ticketId },
          data: {
            priority: 'URGENT',
            priorityScore: Math.max(priorityScore, 80),
          },
        });

        // 关闭会话
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

        // 创建系统消息告知玩家
        const ticket = await this.ticketService.findOne(session.ticketId);
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
    }

    const finalSession = await this.findOne(sessionId);

    // ✅ 确保发送排队更新通知到玩家端
    if (finalSession.queuePosition !== null && finalSession.queuePosition !== undefined) {
      this.websocketGateway.notifyQueueUpdate(
        sessionId,
        finalSession.queuePosition,
        finalSession.estimatedWaitTime,
      );
    }

    // ✅ 确保发送会话更新通知
    this.websocketGateway.notifySessionUpdate(sessionId, finalSession);

    // 获取在线客服数量
    const onlineAgentsCount = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });

    const queuePosition =
      finalSession.status === 'QUEUED'
        ? (finalSession.queuePosition ??
          (await this.getQueuePosition(sessionId)))
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
          onlineAgentsCount > 0
            ? Math.ceil(
              (queuePosition / onlineAgentsCount) * averageProcessingTime,
            )
            : null;
      }
    }

    return {
      queued: true,  // ✅ 确保返回 queued: true，表示已进入排队
      queuePosition: finalSession.status === 'QUEUED' ? (finalSession.queuePosition ?? queuePosition ?? null) : null,
      estimatedWaitTime: finalSession.status === 'QUEUED' ? (finalSession.estimatedWaitTime ?? estimatedWaitTime) : null,
      onlineAgents: currentOnlineAgents,
      autoAssigned: false,  // ✅ 未自动分配，等待客服主动接入
      message: undefined,
      convertedToTicket: false,
    };
  }

  // 璁＄畻浼樺厛绾у垎鏁?
  private async calculatePriorityScore(sessionId: string): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        ticket: true,
      },
    });

    if (!session) return 0;

    // 鑾峰彇鎵€鏈夊惎鐢ㄧ殑瑙勫垯
    const rules = await this.prisma.urgencyRule.findMany({
      where: {
        enabled: true,
        deletedAt: null,
      },
    });

    let totalScore = 0;

    for (const rule of rules) {
      if (this.matchRule(rule.conditions, session.ticket, session)) {
        totalScore += rule.priorityWeight;
      }
    }

    return totalScore;
  }

  // 鍖归厤瑙勫垯
  private matchRule(conditions: any, ticket: any, session: any): boolean {
    // 鍏抽敭璇嶅尮閰?
    if (conditions.keywords && Array.isArray(conditions.keywords)) {
      const matches = conditions.keywords.some((keyword: string) =>
        ticket.description.includes(keyword),
      );
      if (!matches) return false;
    }

    // 鎰忓浘鍖归厤
    if (conditions.intent && session.detectedIntent !== conditions.intent) {
      return false;
    }

    // 韬唤鐘舵€佸尮閰?
    if (
      conditions.identityStatus &&
      ticket.identityStatus !== conditions.identityStatus
    ) {
      return false;
    }

    // 娓告垙鍖归厤
    if (conditions.gameId && ticket.gameId !== conditions.gameId) {
      return false;
    }

    // 浼樺厛绾у尮閰?
    if (conditions.priority && ticket.priority !== conditions.priority) {
      return false;
    }

    return true;
  }

  // 重新排序队列（公开方法，供其他服务调用）
  // 使用 Redis Zset 优化性能
  async reorderQueue() {
    // 检查 Redis 是否可用
    const isRedisAvailable = await this.queueService.isRedisAvailable();

    if (!isRedisAvailable) {
      // Redis 不可用，回退到数据库方案
      this.logger.warn('Redis 不可用，使用数据库方案重新排序队列');
      return this.reorderQueueFallback();
    }

    try {
      // 获取在线客服数量（包括管理员）
      const onlineAgentsCount = await this.prisma.user.count({
        where: {
          role: { in: ['AGENT', 'ADMIN'] },
          isOnline: true,
          deletedAt: null,
        },
      });

      // 计算平均处理时间（分钟），默认5分钟
      const averageProcessingTime = 5;

      // 1. 处理已分配客服的会话
      const assignedSessions = await this.prisma.session.findMany({
        where: {
          status: 'QUEUED',
          agentId: { not: null },
        },
        select: {
          id: true,
          agentId: true,
          priorityScore: true,
          queuedAt: true,
        },
      });

      // 按客服ID分组
      const sessionsByAgent = new Map<string, typeof assignedSessions>();
      for (const session of assignedSessions) {
        if (session.agentId && session.queuedAt) {
          if (!sessionsByAgent.has(session.agentId)) {
            sessionsByAgent.set(session.agentId, []);
          }
          sessionsByAgent.get(session.agentId)!.push(session);
        }
      }

      // 更新每个客服队列中的会话位置
      for (const [agentId, sessions] of sessionsByAgent.entries()) {
        for (const session of sessions) {
          if (session.queuedAt) {
            // 确保会话在 Redis 队列中（使用重试机制）
            await this.queueService.addToAgentQueueWithRetry(
              session.id,
              agentId,
              session.priorityScore || 0,
              session.queuedAt,
            );

            // 从 Redis 获取实时排队位置
            const queuePosition = await this.queueService.getQueuePosition(
              session.id,
              agentId,
            );

            if (queuePosition !== null) {
              // 更新数据库
              await this.prisma.session.update({
                where: { id: session.id },
                data: { queuePosition },
              });

              // 计算预计等待时间
              const estimatedWaitTime = Math.ceil(
                queuePosition * averageProcessingTime,
              );

              // 发送 WebSocket 通知
              this.websocketGateway.notifyQueueUpdate(
                session.id,
                queuePosition,
                estimatedWaitTime,
              );
            }
          }
        }
      }

      // 2. 处理未分配的会话
      const unassignedSessions = await this.prisma.session.findMany({
        where: {
          status: 'QUEUED',
          agentId: null,
        },
        select: {
          id: true,
          priorityScore: true,
          queuedAt: true,
        },
      });

      for (const session of unassignedSessions) {
        if (session.queuedAt) {
          // 确保会话在 Redis 队列中（使用重试机制）
          await this.queueService.addToUnassignedQueueWithRetry(
            session.id,
            session.priorityScore || 0,
            session.queuedAt,
          );

          // 从 Redis 获取实时排队位置
          const queuePosition = await this.queueService.getQueuePosition(
            session.id,
            null,
          );

          if (queuePosition !== null) {
            // 更新数据库
            await this.prisma.session.update({
              where: { id: session.id },
              data: { queuePosition },
            });

            // 计算预计等待时间
            const estimatedWaitTime =
              onlineAgentsCount > 0
                ? Math.ceil(
                  (queuePosition / onlineAgentsCount) * averageProcessingTime,
                )
                : null;

            // 发送 WebSocket 通知
            this.websocketGateway.notifyQueueUpdate(
              session.id,
              queuePosition,
              estimatedWaitTime,
            );
          }
        }
      }

      this.logger.debug(
        `队列重新排序完成：已分配 ${assignedSessions.length} 个，未分配 ${unassignedSessions.length} 个`,
      );
    } catch (error) {
      this.logger.error(`使用 Redis 重新排序队列失败: ${error.message}`, error.stack);
      // 回退到数据库方案
      this.logger.warn('回退到数据库方案重新排序队列');
      return this.reorderQueueFallback();
    }
  }

  // 数据库方案（降级方案）
  private async reorderQueueFallback() {
    // 按分配的客服分组处理排队位置
    // 1. 获取所有已分配客服的排队会话，按客服分组
    const assignedSessions = await this.prisma.session.findMany({
      where: {
        status: 'QUEUED',
        agentId: { not: null },
      },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    // 按客服ID分组
    const sessionsByAgent = new Map<string, typeof assignedSessions>();
    for (const session of assignedSessions) {
      if (session.agentId) {
        if (!sessionsByAgent.has(session.agentId)) {
          sessionsByAgent.set(session.agentId, []);
        }
        sessionsByAgent.get(session.agentId)!.push(session);
      }
    }

    // 2. 获取未分配的排队会话
    const unassignedSessions = await this.prisma.session.findMany({
      where: {
        status: 'QUEUED',
        agentId: null,
      },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    // 获取在线客服数量（包括管理员）
    const onlineAgentsCount = await this.prisma.user.count({
      where: {
        role: { in: ['AGENT', 'ADMIN'] },
        isOnline: true,
        deletedAt: null,
      },
    });

    // 计算平均处理时间（分钟），默认5分钟
    const averageProcessingTime = 5;

    // 3. 更新已分配会话的排队位置（按客服分组计算）
    for (const [agentId, sessions] of sessionsByAgent.entries()) {
      for (let i = 0; i < sessions.length; i++) {
        const queuePosition = i + 1; // 在该客服的队列中的位置
        await this.prisma.session.update({
          where: { id: sessions[i].id },
          data: { queuePosition },
        });

        // 计算预计等待时间（分钟）
        // 对于已分配的会话，预计等待时间 = 在该客服队列中的位置 * 平均处理时间
        const estimatedWaitTime = Math.ceil(
          queuePosition * averageProcessingTime,
        );

        // 发送 WebSocket 通知
        this.websocketGateway.notifyQueueUpdate(
          sessions[i].id,
          queuePosition,
          estimatedWaitTime,
        );
      }
    }

    // 4. 更新未分配会话的排队位置（全局排名）
    for (let i = 0; i < unassignedSessions.length; i++) {
      const queuePosition = i + 1;
      await this.prisma.session.update({
        where: { id: unassignedSessions[i].id },
        data: { queuePosition },
      });

      // 计算预计等待时间（分钟）
      // 公式：预计等待时间 = (前面排队人数 / 在线客服数量) * 平均处理时间
      // 如果没有在线客服，预计等待时间设为 null
      const estimatedWaitTime =
        onlineAgentsCount > 0
          ? Math.ceil(
            (queuePosition / onlineAgentsCount) * averageProcessingTime,
          )
          : null;

      // 发送 WebSocket 通知
      this.websocketGateway.notifyQueueUpdate(
        unassignedSessions[i].id,
        queuePosition,
        estimatedWaitTime,
      );
    }
  }

  // 获取排队位置（按分配的客服计算排名）
  // 优先从 Redis 获取，如果 Redis 不可用则回退到数据库查询
  private async getQueuePosition(sessionId: string): Promise<number> {
    // 优先从 Redis 获取
    const isRedisAvailable = await this.queueService.isRedisAvailable();
    if (isRedisAvailable) {
      const session = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { agentId: true },
      });

      if (session) {
        const queuePosition = await this.queueService.getQueuePosition(
          sessionId,
          session.agentId,
        );
        if (queuePosition !== null) {
          return queuePosition;
        }
      }
    }

    // Redis 不可用或未找到，回退到数据库查询
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || !session.queuedAt) return 0;

    // 如果已经分配了客服，只计算该客服的排队位置
    if (session.agentId) {
      const aheadCount = await this.prisma.session.count({
        where: {
          status: 'QUEUED',
          agentId: session.agentId, // 只计算分配给同一客服的会话
          OR: [
            { priorityScore: { gt: session.priorityScore } },
            {
              AND: [
                { priorityScore: session.priorityScore },
                { queuedAt: { lt: session.queuedAt } },
              ],
            },
          ],
        },
      });

      return aheadCount + 1;
    }

    // 如果还没有分配客服，计算全局排名
    const aheadCount = await this.prisma.session.count({
      where: {
        status: 'QUEUED',
        agentId: null, // 只计算未分配的会话
        OR: [
          { priorityScore: { gt: session.priorityScore } },
          {
            AND: [
              { priorityScore: session.priorityScore },
              { queuedAt: { lt: session.queuedAt } },
            ],
          },
        ],
      },
    });

    return aheadCount + 1;
  }

  // 结束会话（客服端）
  async closeSession(sessionId: string) {
    const session = await this.findOne(sessionId);

    // 如果会话已经关闭，直接返回
    if (session.status === 'CLOSED') {
      return session;
    }

    // 获取原会话信息（用于从队列移除）
    const oldSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { agentId: true },
    });

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        // 清除排队相关字段
        queuePosition: null,
        queuedAt: null,
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

    // 创建系统消息通知玩家会话已结束
    try {
      const systemMessage = await this.messageService.createSystemMessage(
        sessionId,
        '客服已结束会话',
      );
      // 通过 WebSocket 通知新消息
      this.websocketGateway.notifyMessage(sessionId, systemMessage);
    } catch (error) {
      console.warn('创建系统消息失败:', error);
    }

    // 重新排序队列（移除已关闭的会话）
    await this.reorderQueue();

    // 通过 WebSocket 通知所有客户端会话已关闭
    const normalizedSession = this.enrichSession(updatedSession);
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    // 检查并更新关联工单的状态
    if (session.ticketId) {
      await this.ticketService.checkAndUpdateTicketStatus(session.ticketId);
    }

    return normalizedSession;
  }

  // 结束会话（玩家端）
  async closeByPlayer(sessionId: string) {
    // 先获取会话信息，以便后续检查工单状态和是否已关闭
    const existingSession = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { ticketId: true, status: true },
    });

    if (!existingSession) {
      throw new NotFoundException('会话不存在');
    }

    // 如果会话已经关闭，直接返回
    if (existingSession.status === 'CLOSED') {
      return await this.findOne(sessionId);
    }

    // 获取原会话信息（用于从队列移除）
    const oldSessionInfo = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { agentId: true },
    });

    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        // 清除排队相关字段
        queuePosition: null,
        queuedAt: null,
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

    // 创建系统消息通知客服玩家已离开
    try {
      const systemMessage = await this.messageService.createSystemMessage(
        sessionId,
        '玩家已离开会话',
      );
      // 通过 WebSocket 通知新消息
      this.websocketGateway.notifyMessage(sessionId, systemMessage);
    } catch (error) {
      console.warn('创建系统消息失败:', error);
    }

    // 从 Redis 队列移除会话（使用重试机制）
    const removed = await this.queueService.removeFromQueueWithRetry(
      sessionId,
      oldSessionInfo?.agentId || null,
    );
    if (!removed) {
      this.logger.warn(
        `从 Redis 队列移除会话失败，将在下次一致性检查时修复`,
      );
    }

    // 重新排序队列（移除已关闭的会话）
    await this.reorderQueue();

    // 通过 WebSocket 通知所有客户端会话已关闭
    const normalizedSession = this.enrichSession(session);
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    // 检查并更新关联工单的状态
    if (existingSession.ticketId) {
      await this.ticketService.checkAndUpdateTicketStatus(
        existingSession.ticketId,
      );
    }

    return normalizedSession;
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

  // ✅ 新增：通过工单ID接入会话（如果会话不存在则创建，如果已关闭则重新激活）
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
      // 重新激活已关闭的会话
      return await this.joinSession(latestSession.id, agentId);
    }

    // 5. 如果有活跃会话，直接接入
    if (latestSession && ['PENDING', 'QUEUED', 'IN_PROGRESS'].includes(latestSession.status)) {
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
    this.websocketGateway.notifySessionUpdate(normalizedSession.id, normalizedSession);

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

    const sessionIds = sessions.map(s => s.id);

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

    this.logger.log(`[getTicketMessages] 工单=${ticketId}，会话数=${sessions.length}，消息数=${messages.length}`);

    return messages;
  }
}
