import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
    private prisma: PrismaService,
    private difyService: DifyService,
    private messageService: MessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
  ) {}

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
          const transferKeywords = ['转人工', '人工', '客服', '人工客服', 'Human', 'Agent'];
          const shouldSuggestTransfer = transferKeywords.some((k) =>
            content.toLowerCase().includes(k.toLowerCase())
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

  // 鑾峰彇浼氳瘽璇︽儏
  async findOne(id: string) {
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

    return this.enrichSession(session);
  }

  // 鑾峰彇寰呮帴鍏ヤ細璇濆垪琛紙绠＄悊绔級
  async findQueuedSessions(currentUser?: { id: string; role: string }) {
    // 1. 获取 QUEUED 状态的会话
    const queuedWhere: any = {
      status: 'QUEUED',
    };

    // 如果是客服角色，只返回分配给该客服的会话
    // 如果是管理员角色，返回所有待接入会话
    if (currentUser && currentUser.role === 'AGENT') {
      queuedWhere.agentId = currentUser.id;
    }
    // 管理员可以看到所有待接入会话，不需要过滤

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
      orderBy: [
        { priorityScore: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    // 3. 将 WAITING 状态的工单转换为"虚拟会话"对象
    const virtualSessions = waitingTickets.map((ticket) => {
      const latestSession = ticket.sessions?.[0];
      return {
        id: `ticket-${ticket.id}`, // 虚拟会话ID，使用 ticket- 前缀
        ticketId: ticket.id,
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

  // 会话列表（管理端/客服�?
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

  // 瀹㈡湇鎺ュ叆浼氳瘽
  async joinSession(sessionId: string, agentId: string) {
    const session = await this.findOne(sessionId);

    if (session.status !== 'QUEUED' && session.status !== 'PENDING') {
      throw new BadRequestException('浼氳瘽鐘舵€佷笉鍏佽鎺ュ叆');
    }

    // 鏇存柊浼氳瘽鐘舵€?
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId,
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      },
      include: {
        ticket: {
          include: {
            ...TICKET_RELATION_INCLUDE,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // 更新客服在线状态
    await this.prisma.user.update({
      where: { id: agentId },
      data: { isOnline: true },
    });

    const normalizedSession = this.enrichSession(updatedSession);

    // 通知 WebSocket 客户端
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    return normalizedSession;
  }

  // 管理员手动分配会话给指定客服（包括管理员自己）
  async assignSession(sessionId: string, agentId: string) {
    const session = await this.findOne(sessionId);
    
    // 如果所属工单已解决或关闭，禁止分配
    if (session.ticket?.status === 'RESOLVED' || session.ticket?.status === 'CLOSED') {
      throw new BadRequestException('该工单已解决，无法再次分配客服');
    }
    
    // 检查用户是否存在（可以是客服或管理员）
    const agent = await this.prisma.user.findUnique({
      where: { id: agentId, deletedAt: null },
    });

    if (!agent) {
      throw new NotFoundException('用户不存在');
    }

    // 只允许分配给客服或管理员
    if (agent.role !== 'AGENT' && agent.role !== 'ADMIN') {
      throw new BadRequestException('只能分配给客服或管理员');
    }

    // 更新会话，分配给指定客服，标记为手动分配
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId,
        status: 'IN_PROGRESS',
        startedAt: session.startedAt || new Date(),
        queuedAt: null, // 清除排队状态
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

    const normalizedSession = this.enrichSession(updatedSession);

    // 通知 WebSocket 客户端
    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);

    return normalizedSession;
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
    const candidateAgents = (onlineAgents.length > 0 ? onlineAgents : agents).filter(
      (agent) => agent.deletedAt === null,
    );

    const allAgentsBusy =
      candidateAgents.length > 0 && candidateAgents.every((agent) => agent.sessions.length > 0);

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
          candidatePool.length > 0 ? [...candidatePool, ...adminPool] : [...adminPool];
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

    const shouldRemainQueued = session.status === 'QUEUED';

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId: selectedAgent.id,
        status: shouldRemainQueued ? 'QUEUED' : 'IN_PROGRESS',
        startedAt: shouldRemainQueued ? session.startedAt : session.startedAt || new Date(),
        queuedAt: shouldRemainQueued ? session.queuedAt ?? new Date() : null,
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

    const normalizedSession = this.enrichSession(updatedSession);

    this.websocketGateway.notifySessionUpdate(sessionId, normalizedSession);
    return normalizedSession;
  }

  // 转人工（步骤5：智能分流）- 默认自动分配
  async transferToAgent(sessionId: string, transferDto: TransferToAgentDto) {
    // 只有当玩家明确选择转人工时才执行
    // 检查是否有在线客服
    const onlineAgents = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });

    const priorityScore = await this.calculatePriorityScore(sessionId);

    const noAgentsOnline = onlineAgents === 0;

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
        message: '当前暂无客服在线，您的问题已转为【加急工单】，我们将优先处理。',
        ticketNo: ticket.ticketNo,
        convertedToTicket: true, // 标记已转为工单
      };
    }

    // 有在线客服：正常进入排队流程
    // 但需要再次确认在线客服数量（可能在这期间客服下线了）
    const currentOnlineAgents = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });

    // 如果此时没有在线客服了，转为工单
    if (currentOnlineAgents === 0) {
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
        message: '当前暂无客服在线，您的问题已转为【加急工单】，我们将优先处理。',
        ticketNo: ticket.ticketNo,
        convertedToTicket: true,
      };
    }

    // 确认有在线客服：正常进入排队流程
    // 更新会话状态为排队
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'QUEUED',
        playerUrgency: transferDto.urgency,
        priorityScore,
        queuedAt: new Date(),
        allowManualTransfer: false,
        transferReason: transferDto.reason,
        transferIssueTypeId: transferDto.issueTypeId,
        transferAt: new Date(),
        manuallyAssigned: false, // 默认未手动分配
      },
    });

    // 重新排序队列
    await this.reorderQueue();

    // 尝试自动分配（如果未手动分配过）
    try {
      await this.autoAssignSession(sessionId);
    } catch (error) {
      console.error('自动分配失败，保持排队状态:', error);
      // 自动分配失败可能是因为所有客服都忙，这是正常的，保持排队状态
    }

    const finalSession = await this.findOne(sessionId);
    this.websocketGateway.notifySessionUpdate(sessionId, finalSession);

    const queuePosition =
      finalSession.status === 'QUEUED'
        ? finalSession.queuePosition ?? (await this.getQueuePosition(sessionId))
        : 0;

    const estimatedWaitTime =
      queuePosition && queuePosition > 0
        ? Math.max(queuePosition * 5, 3)
        : null;

    return {
      queued: finalSession.status === 'QUEUED',
      queuePosition: finalSession.status === 'QUEUED' ? queuePosition : null,
      estimatedWaitTime,
      onlineAgents: currentOnlineAgents,
      autoAssigned: finalSession.status === 'IN_PROGRESS' && finalSession.agentId !== null,
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

  // 閲嶆柊鎺掑簭闃熷垪
  private async reorderQueue() {
    const queuedSessions = await this.prisma.session.findMany({
      where: { status: 'QUEUED' },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    // 鏇存柊鎺掗槦浣嶇疆
    for (let i = 0; i < queuedSessions.length; i++) {
      await this.prisma.session.update({
        where: { id: queuedSessions[i].id },
        data: { queuePosition: i + 1 },
      });
    }
  }

  // 鑾峰彇鎺掗槦浣嶇疆
  private async getQueuePosition(sessionId: string): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session || !session.queuedAt) return 0;

    const aheadCount = await this.prisma.session.count({
      where: {
        status: 'QUEUED',
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

    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
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

    // 通过 WebSocket 通知所有客户端会话已关闭
    this.websocketGateway.notifySessionUpdate(sessionId, updatedSession);

    // 检查并更新关联工单的状态
    if (session.ticketId) {
      await this.ticketService.checkAndUpdateTicketStatus(session.ticketId);
    }

    return updatedSession;
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

    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
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

    // 通过 WebSocket 通知所有客户端会话已关闭
    this.websocketGateway.notifySessionUpdate(sessionId, session);

    // 检查并更新关联工单的状态
    if (existingSession.ticketId) {
      await this.ticketService.checkAndUpdateTicketStatus(existingSession.ticketId);
    }

    return session;
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
      select: {
        id: true,
        status: true,
        agentId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return session || null;
  }
}
