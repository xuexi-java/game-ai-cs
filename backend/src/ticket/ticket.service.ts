import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, TicketResponseDto } from './dto/create-ticket.dto';
import { TicketPriorityService } from './ticket-priority.service';
import { TicketMessageService } from '../ticket-message/ticket-message.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import * as crypto from 'crypto';

@Injectable()
export class TicketService {
  constructor(
    private prisma: PrismaService,
    private priorityService: TicketPriorityService,
    private ticketMessageService: TicketMessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
  ) {}

  // 生成工单编号
  private generateTicketNo(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `T-${dateStr}-${random}`;
  }

  // 生成访问令牌
  private generateToken(): string {
    return (
      crypto.randomBytes(32).toString('hex') + '-' + Date.now().toString(36)
    );
  }

  // 检查玩家是否有未关闭的工单
  async checkOpenTicket(
    gameId: string,
    serverId: string | null,
    serverName: string | null,
    playerIdOrName: string,
  ) {
    const where: any = {
      gameId,
      playerIdOrName,
      deletedAt: null,
      status: {
        not: 'CLOSED',
      },
    };

    if (serverId) {
      where.serverId = serverId;
    } else if (serverName) {
      where.serverName = serverName;
    }

    const openTicket = await this.prisma.ticket.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasOpenTicket: !!openTicket,
      ticket: openTicket
        ? {
            id: openTicket.id,
            ticketNo: openTicket.ticketNo,
            token: openTicket.token,
          }
        : null,
    };
  }

  // 检查玩家是否有相同问题类型的未完成工单
  async checkOpenTicketByIssueType(
    gameId: string,
    serverIdOrName: string | null,
    playerIdOrName: string,
    issueTypeId: string,
  ) {
    const where: any = {
      gameId,
      playerIdOrName,
      deletedAt: null,
      status: {
        not: 'CLOSED',
      },
      ticketIssueTypes: {
        some: {
          issueTypeId,
        },
      },
    };

    // 支持 serverId 或 serverName 匹配
    if (serverIdOrName) {
      where.OR = [
        { serverId: serverIdOrName },
        { serverName: serverIdOrName },
      ];
    }

    const openTicket = await this.prisma.ticket.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasOpenTicket: !!openTicket,
      ticket: openTicket
        ? {
            id: openTicket.id,
            ticketNo: openTicket.ticketNo,
            token: openTicket.token,
          }
        : null,
    };
  }

  // 创建工单
  async create(createTicketDto: CreateTicketDto): Promise<TicketResponseDto> {
    const ticketNo = this.generateTicketNo();
    const token = this.generateToken();
    const {
      occurredAt,
      serverId: rawServerId,
      serverName: rawServerName,
      issueTypeIds,
      ...otherData
    } = createTicketDto;
    let serverId = rawServerId ?? null;
    let serverName = rawServerName ?? null;

    if (serverId) {
      const serverExists = await this.prisma.server.findUnique({
        where: { id: serverId },
      });

      if (!serverExists) {
        console.warn(
          `服务器(${serverId})不存在，将以 serverName 形式保存玩家输入`,
        );
        serverName = serverName ?? serverId;
        serverId = null;
      }
    }

    // 先创建工单（不设置 priorityScore，稍后计算）
    const ticket = await this.prisma.ticket.create({
      data: {
        ...otherData,
        serverId,
        serverName,
        ticketNo,
        token,
        status: 'IN_PROGRESS',
        identityStatus: 'NOT_VERIFIED',
        priority: 'NORMAL', // 临时设置，稍后更新
        priorityScore: 50, // 临时设置，稍后更新
        occurredAt: occurredAt ? new Date(occurredAt) : null,
        ticketIssueTypes: {
          create: issueTypeIds?.map((issueTypeId) => ({
            issueTypeId,
          })) || [],
        },
      },
    });

    // 计算优先级（基于问题类型权重）
    const { priorityScore, priority } =
      await this.priorityService.calculatePriority(issueTypeIds || []);

    // 更新工单的优先级和分数
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        priority,
        priorityScore,
      },
    });

    // 异步验证身份（如果有订单号）
    if (createTicketDto.paymentOrderNo) {
      this.verifyPaymentIdentity(
        ticket.id,
        createTicketDto.playerIdOrName,
        createTicketDto.paymentOrderNo,
      ).catch((error) => {
        console.error('身份验证失败:', error);
      });
    }

    return {
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      token: ticket.token,
    };
  }

  // 验证支付身份
  private async verifyPaymentIdentity(
    ticketId: string,
    playerIdOrName: string,
    paymentOrderNo: string,
  ) {
    // TODO: 调用支付网关API验证
    // 这里先模拟验证逻辑
    const isValid = true; // 实际应该调用支付网关API

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        identityStatus: isValid ? 'VERIFIED_PAYMENT' : 'NOT_VERIFIED',
      },
    });
  }

  // 根据token获取工单
  async findByToken(token: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { token },
      include: {
        game: true,
        server: true,
        attachments: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!ticket || ticket.deletedAt) {
      throw new NotFoundException('工单不存在');
    }

    return ticket;
  }

  // 获取工单详情
  async findOne(id: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id, deletedAt: null },
      include: {
        game: true,
        server: true,
        attachments: {
          orderBy: { sortOrder: 'asc' },
        },
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
        sessions: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    return ticket;
  }

  // 更新工单状态
  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.ticket.update({
      where: { id },
      data: { status: status as any },
    });
  }

  // 更新工单优先级
  async updatePriority(id: string, priority: string) {
    await this.findOne(id);
    return this.prisma.ticket.update({
      where: { id },
      data: { priority: priority as any },
    });
  }

  // 根据token获取工单消息列表（玩家端）
  async getMessagesByToken(token: string) {
    const ticket = await this.findByToken(token);
    return this.ticketMessageService.findByTicket(ticket.id);
  }

  // 根据token发送工单消息（玩家端）
  async sendMessageByToken(token: string, content: string) {
    const ticket = await this.findByToken(token);
    
    // 玩家发送消息时，senderId 为 null（表示玩家）
    // 但 TicketMessage 的 senderId 是可选的，所以我们可以创建一个特殊的消息
    // 或者使用一个特殊的标识来表示玩家消息
    
    // 由于 TicketMessage 的 senderId 是可选但用于关联客服，玩家消息我们暂时不设置 senderId
    // 但需要修改 TicketMessage 模型以支持玩家消息，或者创建一个新的消息类型
    
    // 临时方案：创建一个没有 senderId 的消息（需要确保数据库允许）
    // 更好的方案：修改 TicketMessage 模型，添加 senderType 字段区分玩家和客服
    
    // 目前先使用 Prisma 直接创建，senderId 为 null
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId: ticket.id,
        senderId: null, // 玩家消息，没有 senderId
        content,
      },
    });

    // 更新工单状态为等待回复
    await this.prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'WAITING',
      },
    });

    // 获取完整消息信息（包含 sender）
    const messageWithSender = await this.prisma.ticketMessage.findUnique({
      where: { id: message.id },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
      },
    });

    // 通过 WebSocket 通知工单消息（通知玩家端）
    if (messageWithSender) {
      this.websocketGateway.notifyTicketMessage(ticket.id, messageWithSender);
    }

    // 如果工单关联了会话，同时创建会话消息并发送到会话房间（客服端可以接收）
    const session = await this.prisma.session.findFirst({
      where: {
        ticketId: ticket.id,
        status: { in: ['QUEUED', 'IN_PROGRESS'] },
      },
    });

    if (session) {
      try {
        // 创建会话消息（玩家消息）
        const sessionMessage = await this.prisma.message.create({
          data: {
            sessionId: session.id,
            senderType: 'PLAYER',
            senderId: null,
            content: messageWithSender?.content || message.content,
            messageType: 'TEXT',
          },
        });

        // 发送到会话房间（格式：{ sessionId, message }）
        this.websocketGateway.notifyMessage(session.id, sessionMessage);
      } catch (sessionError) {
        // 会话消息创建失败不影响工单消息
        console.warn(`创建会话消息失败: ${sessionError.message}`);
      }
    }

    return messageWithSender || message;
  }

  // 获取工单列表（管理端）
  async findAll(
    query: {
      status?: string;
      priority?: string;
      issueTypeId?: string;
      gameId?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    currentUser?: { id: string; role: string },
  ) {
    const where: any = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.issueTypeId) {
      where.ticketIssueTypes = {
        some: {
          issueTypeId: query.issueTypeId,
        },
      };
    }
    if (query.gameId) {
      where.gameId = query.gameId;
    }

    if (currentUser?.role === 'AGENT') {
      where.sessions = {
        some: {
          agentId: currentUser.id,
        },
      };
    }

    const page = query.page || 1;
    const pageSize = query.pageSize || 10;
    const skip = (page - 1) * pageSize;

    const [tickets, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          game: true,
          server: true,
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
          sessions: {
            include: {
              agent: {
                select: {
                  id: true,
                  username: true,
                  realName: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1, // 只取最新的会话
          },
        },
        orderBy: {
          [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
        },
        skip,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return {
      items: tickets,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
