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
} from '@prisma/client';
import { MessageType as MessageDtoType } from '../message/dto/create-message.dto';
import { DifyService, DifyMessageResult } from '../dify/dify.service';
import { MessageService } from '../message/message.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';

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
    private websocketGateway: WebsocketGateway,
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
    const where: any = {
      status: 'QUEUED',
    };

    // 如果是客服角色，只返回分配给该客服的会话
    // 如果是管理员角色，返回所有待接入会话
    if (currentUser && currentUser.role === 'AGENT') {
      where.agentId = currentUser.id;
    }
    // 管理员可以看到所有待接入会话，不需要过滤

    const sessions = await this.prisma.session.findMany({
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
      },
      orderBy: [{ priorityScore: 'desc' }, { queuedAt: 'asc' }],
    });

    return this.enrichSessions(sessions);
  }

  // 会话列表（管理端/客服�?
  async findAll(
    query: {
      status?: SessionStatus;
      agentId?: string;
      gameId?: string;
      search?: string;
      transferredToAgent?: boolean;
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

    // 获取所有在线客服和管理员及其当前接待的会话数量
    const onlineAgents = await this.prisma.user.findMany({
      where: {
        role: { in: ['AGENT', 'ADMIN'] },
        isOnline: true,
        deletedAt: null,
      },
      include: {
        sessions: {
          where: {
            status: 'IN_PROGRESS',
            agentId: { not: null },
          },
        },
      },
    });

    if (onlineAgents.length === 0) {
      throw new BadRequestException('当前没有在线客服');
    }

    // 按当前接待数量排序，选择接待数量最少的客服
    const agentsWithLoad = onlineAgents.map((agent) => ({
      agent,
      load: agent.sessions.length,
    }));

    // 按负载排序，选择负载最少的客服
    agentsWithLoad.sort((a, b) => a.load - b.load);
    const selectedAgent = agentsWithLoad[0].agent;

    // 分配给选中的客服（自动分配，不标记为手动分配）
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        agentId: selectedAgent.id,
        status: 'IN_PROGRESS',
        startedAt: session.startedAt || new Date(),
        queuedAt: null, // 清除排队状态
        manuallyAssigned: false, // 自动分配，保持 false
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

    // 如果没有在线客服，不进入队列，直接提示玩家
    if (onlineAgents === 0) {
      return {
        queued: false,
        message: '当前没有客服在线，请在客服上班时间（9:30-12:30，14:00-18:30）内咨询',
        onlineAgents: 0,
      };
    }

    const priorityScore = await this.calculatePriorityScore(sessionId);

    // 先更新会话状态为排队
    const session = await this.prisma.session.update({
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
      // 自动分配给负载最少的客服
      await this.autoAssignSession(sessionId);
    } catch (error) {
      // 如果自动分配失败（例如没有在线客服），保持排队状态
      console.error('自动分配失败，保持排队状态:', error);
    }

    // 重新获取会话状态（可能已经被自动分配）
    const updatedSession = await this.findOne(sessionId);
    this.websocketGateway.notifySessionUpdate(sessionId, updatedSession);

    // 计算排队位置（如果还在排队）
    const queuePosition = updatedSession.status === 'QUEUED' 
      ? await this.getQueuePosition(sessionId)
      : 0;

    return {
      queued: updatedSession.status === 'QUEUED',
      queuePosition,
      estimatedWaitTime: queuePosition * 5, // 简单估算：每人5分钟
      onlineAgents,
      autoAssigned: updatedSession.status === 'IN_PROGRESS' && updatedSession.agentId !== null,
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

    return aheadCount;
  }

  // 缁撴潫浼氳瘽
  async closeSession(sessionId: string) {
    const session = await this.findOne(sessionId);

    return this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
  }

  async closeByPlayer(sessionId: string) {
    const session = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });
    this.websocketGateway.notifySessionUpdate(sessionId, session);
    return session;
  }
}
