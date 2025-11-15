import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionDto, TransferToAgentDto } from './dto/create-session.dto';
import { SessionStatus, Urgency } from '@prisma/client';
import { DifyService } from '../dify/dify.service';
import { MessageService } from '../message/message.service';

@Injectable()
export class SessionService {
  constructor(
    private prisma: PrismaService,
    private difyService: DifyService,
    private messageService: MessageService,
  ) {}

  // 创建会话（步骤4：AI引导）
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

    // 调用Dify AI获取初始回复
    try {
      const difyResponse = await this.difyService.triage(
        ticket.description,
        ticket.game.difyApiKey,
        ticket.game.difyBaseUrl,
      );

      // 更新会话的AI识别信息
      await this.prisma.session.update({
        where: { id: session.id },
        data: {
          detectedIntent: difyResponse.detected_intent,
          aiUrgency: difyResponse.urgency === 'urgent' ? 'URGENT' : 'NON_URGENT',
        },
      });

      // 创建AI初始回复消息
      await this.messageService.createAIMessage(
        session.id,
        difyResponse.initial_reply,
        { suggestedOptions: difyResponse.suggested_options },
      );
    } catch (error) {
      console.error('Dify AI调用失败:', error);
      // 创建默认回复
      await this.messageService.createAIMessage(
        session.id,
        '您好，感谢您的反馈。我们正在为您处理，请稍候...',
      );
    }

    return this.findOne(session.id);
  }

  // 获取会话详情
  async findOne(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        ticket: {
          include: {
            game: true,
            server: true,
            attachments: true,
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

    return session;
  }

  // 获取待接入会话列表（管理端）
  async findQueuedSessions() {
    return this.prisma.session.findMany({
      where: {
        status: 'QUEUED',
      },
      include: {
        ticket: {
          include: {
            game: true,
          },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { queuedAt: 'asc' },
      ],
    });
  }

  // 客服接入会话
  async joinSession(sessionId: string, agentId: string) {
    const session = await this.findOne(sessionId);

    if (session.status !== 'QUEUED' && session.status !== 'PENDING') {
      throw new BadRequestException('会话状态不允许接入');
    }

    // 更新会话状态
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
            game: true,
            server: true,
            attachments: true,
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

    return updatedSession;
  }

  // 转人工（步骤5：智能分流）
  async transferToAgent(sessionId: string, transferDto: TransferToAgentDto) {
    const session = await this.findOne(sessionId);

    // 检查是否有在线客服
    const onlineAgents = await this.prisma.user.count({
      where: {
        role: 'AGENT',
        isOnline: true,
        deletedAt: null,
      },
    });

    if (onlineAgents === 0) {
      // 没有在线客服，转为工单
      await this.prisma.ticket.update({
        where: { id: session.ticketId },
        data: {
          status: 'WAITING',
          priority: 'URGENT',
        },
      });

      await this.prisma.session.update({
        where: { id: sessionId },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
        },
      });

      return {
        queued: false,
        message: '当前非工作时间，您的问题已转为【加急工单】，我们将优先处理。',
        ticketNo: session.ticket.ticketNo,
      };
    }

    // 有在线客服，进入排队队列
    const priorityScore = await this.calculatePriorityScore(sessionId);
    
    const updatedSession = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: 'QUEUED',
        playerUrgency: transferDto.urgency,
        priorityScore,
        queuedAt: new Date(),
      },
    });

    // 重新排序队列
    await this.reorderQueue();

    // 计算排队位置
    const queuePosition = await this.getQueuePosition(sessionId);

    return {
      queued: true,
      queuePosition,
      estimatedWaitTime: queuePosition * 5, // 简单估算：每人5分钟
    };
  }

  // 计算优先级分数
  private async calculatePriorityScore(sessionId: string): Promise<number> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        ticket: true,
      },
    });

    if (!session) return 0;

    // 获取所有启用的规则
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

  // 匹配规则
  private matchRule(conditions: any, ticket: any, session: any): boolean {
    // 关键词匹配
    if (conditions.keywords && Array.isArray(conditions.keywords)) {
      const matches = conditions.keywords.some((keyword: string) =>
        ticket.description.includes(keyword),
      );
      if (!matches) return false;
    }

    // 意图匹配
    if (conditions.intent && session.detectedIntent !== conditions.intent) {
      return false;
    }

    // 身份状态匹配
    if (
      conditions.identityStatus &&
      ticket.identityStatus !== conditions.identityStatus
    ) {
      return false;
    }

    // 游戏匹配
    if (conditions.gameId && ticket.gameId !== conditions.gameId) {
      return false;
    }

    // 优先级匹配
    if (conditions.priority && ticket.priority !== conditions.priority) {
      return false;
    }

    return true;
  }

  // 重新排序队列
  private async reorderQueue() {
    const queuedSessions = await this.prisma.session.findMany({
      where: { status: 'QUEUED' },
      orderBy: [
        { priorityScore: 'desc' },
        { queuedAt: 'asc' },
      ],
    });

    // 更新排队位置
    for (let i = 0; i < queuedSessions.length; i++) {
      await this.prisma.session.update({
        where: { id: queuedSessions[i].id },
        data: { queuePosition: i + 1 },
      });
    }
  }

  // 获取排队位置
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

  // 结束会话
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
}

