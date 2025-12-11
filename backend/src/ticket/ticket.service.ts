import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, TicketResponseDto } from './dto/create-ticket.dto';
import { TicketPriorityService } from './ticket-priority.service';
import { TicketMessageService } from '../ticket-message/ticket-message.service';
import { MessageService } from '../message/message.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { SessionService } from '../session/session.service';
import { QueueService } from '../queue/queue.service';
import { IssueTypeService } from '../issue-type/issue-type.service';
import * as crypto from 'crypto';

@Injectable()
export class TicketService {
  private readonly logger = new Logger(TicketService.name);

  constructor(
    private prisma: PrismaService,
    private priorityService: TicketPriorityService,
    private ticketMessageService: TicketMessageService,
    private messageService: MessageService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => SessionService))
    private sessionService: SessionService,
    private issueTypeService: IssueTypeService,
    private queueService: QueueService,
  ) { }

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
        not: 'RESOLVED',
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

  // 查询玩家所有未完成工单（用于工单查询页面）
  async findOpenTicketsByPlayer(
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
        in: ['WAITING', 'IN_PROGRESS'], // 只查询未完成的工单
      },
    };

    // 区服匹配逻辑：优先使用 serverId，其次使用 serverName
    if (serverId) {
      where.serverId = serverId;
    } else if (serverName) {
      where.serverName = serverName;
    }
    // 如果都不提供，则查询所有区服的工单

    const tickets = await this.prisma.ticket.findMany({
      where,
      include: {
        game: {
          select: {
            id: true,
            name: true,
          },
        },
        server: {
          select: {
            id: true,
            name: true,
          },
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
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 50, // 最多返回50条
    });

    // 格式化返回数据
    return tickets.map((ticket) => ({
      id: ticket.id,
      ticketNo: ticket.ticketNo,
      token: ticket.token,
      status: ticket.status,
      description: ticket.description,
      createdAt: ticket.createdAt.toISOString(),
      updatedAt: ticket.updatedAt.toISOString(),
      game: {
        id: ticket.game.id,
        name: ticket.game.name,
      },
      server: ticket.server
        ? {
          id: ticket.server.id,
          name: ticket.server.name,
        }
        : null,
      serverName: ticket.serverName,
      issueTypes: ticket.ticketIssueTypes.map((tt) => ({
        id: tt.issueType.id,
        name: tt.issueType.name,
      })),
    }));
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
        not: 'RESOLVED',
      },
      ticketIssueTypes: {
        some: {
          issueTypeId,
        },
      },
    };

    // 支持 serverId 或 serverName 匹配
    if (serverIdOrName) {
      where.OR = [{ serverId: serverIdOrName }, { serverName: serverIdOrName }];
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
    try {
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

      // ✅ 验证必填字段
      if (!createTicketDto.gameId) {
        throw new Error('游戏ID不能为空');
      }
      if (!createTicketDto.playerIdOrName) {
        throw new Error('玩家ID或昵称不能为空');
      }
      if (!createTicketDto.description) {
        throw new Error('问题描述不能为空');
      }
      if (!issueTypeIds || issueTypeIds.length === 0) {
        throw new Error('问题类型不能为空');
      }

      // ✅ 验证游戏是否存在
      const game = await this.prisma.game.findUnique({
        where: { id: createTicketDto.gameId },
        select: { id: true, enabled: true, deletedAt: true },
      });
      if (!game || game.deletedAt) {
        throw new Error('游戏不存在或已被删除');
      }
      if (!game.enabled) {
        throw new Error('游戏已禁用');
      }

      // ✅ 验证问题类型是否存在且启用，并获取完整信息
      let issueTypes: Array<{ id: string; name: string; enabled: boolean; requireDirectTransfer: boolean }> = [];
      if (issueTypeIds && issueTypeIds.length > 0) {
        issueTypes = await this.prisma.issueType.findMany({
          where: {
            id: { in: issueTypeIds },
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            enabled: true,
            requireDirectTransfer: true,
          },
        });

        if (issueTypes.length !== issueTypeIds.length) {
          const foundIds = issueTypes.map((t) => t.id);
          const missingIds = issueTypeIds.filter((id) => !foundIds.includes(id));
          throw new Error(`问题类型不存在: ${missingIds.join(', ')}`);
        }

        const disabledTypes = issueTypes.filter((t) => !t.enabled);
        if (disabledTypes.length > 0) {
          throw new Error(`问题类型已禁用: ${disabledTypes.map((t) => t.id).join(', ')}`);
        }
      }

      if (serverId) {
        try {
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
        } catch (error) {
          console.error('检查服务器失败:', error);
          // 继续执行，使用 serverName
          serverName = serverName ?? rawServerId ?? null;
          serverId = null;
        }
      }

      // 检查是否需要直接转人工（使用已查询的问题类型）
      const directTransferType = issueTypes.find((type) => type.requireDirectTransfer);
      const requiresDirectTransfer = !!directTransferType;

      if (requiresDirectTransfer) {
        this.logger.log(`工单 ${ticketNo} 触发直接转人工，原因：问题类型 "${directTransferType.name}" (ID: ${directTransferType.id}) 要求直接转人工`);
      } else {
        this.logger.log(`工单 ${ticketNo} 进入 AI 处理流程，涉及问题类型: ${issueTypes.map(t => t.name).join(', ')}`);
      }

      // 如果需要直接转人工，状态设置为 WAITING（待人工处理）
      // 否则设置为 IN_PROGRESS（处理中，会进入AI流程）
      const initialStatus = requiresDirectTransfer ? 'WAITING' : 'IN_PROGRESS';

      // 先创建工单（不设置 priorityScore，稍后计算）
      let ticket;
      try {
        ticket = await this.prisma.ticket.create({
          data: {
            ...otherData,
            serverId,
            serverName,
            ticketNo,
            token,
            status: initialStatus,
            identityStatus: 'NOT_VERIFIED',
            priority: 'NORMAL', // 临时设置，稍后更新
            priorityScore: 50, // 临时设置，稍后更新
            occurredAt: occurredAt ? new Date(occurredAt) : null,
            ticketIssueTypes: {
              create:
                issueTypeIds?.map((issueTypeId) => ({
                  issueTypeId,
                })) || [],
            },
          },
        });
      } catch (error) {
        console.error('创建工单失败:', error);
        console.error('工单数据:', {
          gameId: createTicketDto.gameId,
          playerIdOrName: createTicketDto.playerIdOrName,
          description: createTicketDto.description?.substring(0, 50),
          issueTypeIds,
          serverId,
          serverName,
        });
        throw new Error(`创建工单失败: ${error.message || '未知错误'}`);
      }

      // 计算优先级（基于问题类型权重）
      try {
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
      } catch (error) {
        // ✅ 如果计算优先级失败，使用默认值，不影响工单创建
        console.error('计算优先级失败，使用默认值:', error);
        await this.prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            priority: 'NORMAL',
            priorityScore: 50,
          },
        });
      }

      // 如果需要直接转人工，检查是否有在线客服
      let hasOnlineAgents = false;
      let sessionCreated = false;
      let sessionId: string | null = null;
      if (requiresDirectTransfer) {
        // 检查是否有在线客服（包括管理员）
        const onlineAgentsCount = await this.prisma.user.count({
          where: {
            role: { in: ['AGENT', 'ADMIN'] },
            isOnline: true,
            deletedAt: null,
          },
        });
        hasOnlineAgents = onlineAgentsCount > 0;

        // 如果有在线客服，尝试自动分配并创建会话
        if (hasOnlineAgents) {
          try {
            const result = await this.autoAssignDirectTransferTicket(ticket.id);
            sessionCreated = result.sessionCreated;
            // 如果会话已创建，获取会话ID
            if (sessionCreated) {
              const activeSession = await this.prisma.session.findFirst({
                where: {
                  ticketId: ticket.id,
                  status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
                },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
              });
              sessionId = activeSession?.id || null;
            }
          } catch (error) {
            // ✅ 如果自动分配失败，记录错误但不影响工单创建
            console.error('自动分配直接转人工工单失败:', error);
            sessionCreated = false;
          }
        }
      }

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
        hasOnlineAgents: requiresDirectTransfer ? hasOnlineAgents : undefined,
        sessionCreated: requiresDirectTransfer ? sessionCreated : undefined,
        sessionId: requiresDirectTransfer && sessionCreated && sessionId ? sessionId : undefined,
      };
    } catch (error) {
      // ✅ 捕获所有未处理的错误
      console.error('创建工单过程中发生错误:', error);
      console.error('错误堆栈:', error.stack);
      throw error; // 重新抛出，让 NestJS 的异常过滤器处理
    }
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
        sessions: {
          // ✅ 修复：返回所有会话（包括 CLOSED），以便加载历史消息
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // 只返回最新的会话
          include: {
            // ✅ 修复：包含消息和元数据
            messages: {
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
            },
          },
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

  // 根据工单号获取工单（玩家端）
  async findByTicketNo(ticketNo: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: {
        ticketNo,
        deletedAt: null,
      },
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
      },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    return ticket;
  }

  // 根据工单号获取工单消息列表（玩家端）
  async getMessagesByTicketNo(ticketNo: string) {
    const ticket = await this.findByTicketNo(ticketNo);
    return this.ticketMessageService.findByTicket(ticket.id);
  }

  // 根据token获取工单消息列表（玩家端）
  async getMessagesByToken(token: string) {
    const ticket = await this.findByToken(token);
    return this.ticketMessageService.findByTicket(ticket.id);
  }

  // 根据工单ID发送工单消息（管理端）
  async sendMessageByTicketId(
    ticketId: string,
    senderId: string,
    content: string,
  ) {
    return this.ticketMessageService.create(ticketId, senderId, content);
  }

  // 根据工单ID获取工单消息列表（管理端）
  async getMessagesByTicketId(ticketId: string) {
    return this.ticketMessageService.findByTicket(ticketId);
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
      startDate?: Date;
      endDate?: Date;
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
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
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

    // 定义允许排序的字段（防止SQL注入）
    const allowedSortFields = ['createdAt', 'updatedAt', 'priorityScore'];
    const sortBy = query.sortBy && allowedSortFields.includes(query.sortBy)
      ? query.sortBy
      : null;
    const sortOrder = query.sortOrder === 'asc' || query.sortOrder === 'desc'
      ? query.sortOrder
      : 'desc';

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
        orderBy: sortBy
          ? {
            // 使用验证后的排序字段和顺序，确保排序基于整个数据集
            [sortBy]: sortOrder,
          }
          : [
            // 默认排序：先按问题类型权重分数降序，相同分数按创建时间升序
            { priorityScore: 'desc' },
            { createdAt: 'asc' },
          ],
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
      const updateTicketToResolved = async () => {
        await this.prisma.ticket.update({
          where: { id: ticketId },
          data: {
            status: 'RESOLVED',
            closedAt: new Date(),
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
          console.warn('WebSocket 通知失败:', error);
        }
      };

      // 如果有客服介入（有客服消息或会话被分配给客服），标记为已解决
      if (hasAgentMessages > 0 || hasAssignedAgent) {
        await updateTicketToResolved();
      } else if (hasAIMessages > 0) {
        // 如果有 AI 消息但没有客服介入，说明是 AI 解决的，也应该标记为 RESOLVED
        await updateTicketToResolved();
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
          console.warn('WebSocket 通知失败:', error);
        }
      }
    }
  }

  /**
   * 手动标记工单为已处理
   */
  async markAsResolved(ticketId: string): Promise<void> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    if (ticket.status === 'RESOLVED') {
      return;
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'RESOLVED',
        closedAt: new Date(),
      },
    });

    // 通知 WebSocket 客户端工单状态更新
    this.websocketGateway.notifyTicketUpdate(ticketId, {
      status: 'RESOLVED',
      closedAt: new Date(),
    });
  }

  /**
   * 定时任务：检查超过3天没有继续处理的工单
   * 如果工单3天玩家还是没有继续处理，就默认结束并修改状态为 RESOLVED
   * 否则一直显示在客服的聊天界面，状态显示为"待人工"（WAITING）
   */
  async checkStaleTickets(): Promise<void> {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    // 查找所有状态为 WAITING 或 IN_PROGRESS，且最后更新时间超过3天的工单
    const staleTickets = await this.prisma.ticket.findMany({
      where: {
        status: {
          in: ['WAITING', 'IN_PROGRESS'],
        },
        updatedAt: {
          lt: threeDaysAgo,
        },
      },
      include: {
        sessions: {
          select: {
            id: true,
            status: true,
            closedAt: true,
            updatedAt: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
        },
        messages: {
          select: {
            id: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // 只取最后一条消息
        },
      },
    });

    // 检查每个工单：如果3天没有玩家继续处理，则更新为 RESOLVED
    const ticketsToUpdate: any[] = [];

    for (const ticket of staleTickets) {
      // 获取最后一条消息的时间（如果有）
      const ticketMessages = (ticket as any).messages || [];
      const lastMessageTime = ticketMessages.length > 0
        ? ticketMessages[0].createdAt
        : null;

      // 获取最后活跃会话的更新时间
      const ticketSessions = (ticket as any).sessions || [];
      const lastActiveSession = ticketSessions.find(
        (s: any) => s.status !== 'CLOSED'
      );
      const lastSessionUpdateTime = lastActiveSession
        ? lastActiveSession.updatedAt
        : (ticketSessions.length > 0
          ? ticketSessions[0].updatedAt
          : null);

      // 确定最后活动时间：取消息时间、会话更新时间、工单更新时间的最大值
      const lastActivityTime = [
        lastMessageTime,
        lastSessionUpdateTime,
        ticket.updatedAt,
      ]
        .filter(Boolean)
        .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0];

      // 如果最后活动时间超过3天，且没有活跃会话，则更新为 RESOLVED
      if (
        lastActivityTime &&
        new Date(lastActivityTime) < threeDaysAgo &&
        !lastActiveSession
      ) {
        ticketsToUpdate.push(ticket);
      }
    }

    // 批量更新工单状态
    for (const ticket of ticketsToUpdate) {
      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: 'RESOLVED',
          closedAt: new Date(),
        },
      });

      // 通知 WebSocket 客户端工单状态更新
      try {
        this.websocketGateway.notifyTicketUpdate(ticket.id, {
          status: 'RESOLVED',
          closedAt: new Date(),
        });
      } catch (error) {
        // WebSocket 通知失败不影响状态更新
        console.warn('WebSocket 通知失败:', error);
      }
    }

    console.log(
      `定时任务：已更新 ${ticketsToUpdate.length} 个超过3天未处理的工单状态为 RESOLVED`,
    );
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
            load: agent.sessions.length + (agent.role === 'ADMIN' ? ADMIN_WEIGHT_PENALTY : 0),
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
            `工单 ${ticket.id} 自动分配: 选择 ${selectedAgent.role} ${selectedAgent.username} (负载: ${selectedAgent.sessions.length}, 加权负载: ${agentsWithLoad[0].load})`,
            {
              ticketId: ticket.id,
              selectedAgentId: selectedAgent.id,
              selectedAgentRole: selectedAgent.role,
              selectedAgentUsername: selectedAgent.username,
              actualLoad: selectedAgent.sessions.length,
              weightedLoad: agentsWithLoad[0].load,
            },
          );

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
              console.warn(
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

          this.logger.log(
            `工单 ${ticket.ticketNo} 已自动分配给 ${selectedAgent.role} ${selectedAgent.username}`,
            {
              ticketId: ticket.id,
              ticketNo: ticket.ticketNo,
              selectedAgentId: selectedAgent.id,
              selectedAgentRole: selectedAgent.role,
              selectedAgentUsername: selectedAgent.username,
            },
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;
          this.logger.error(
            `分配工单 ${ticket.ticketNo} 失败: ${errorMessage}`,
            errorStack,
            'TicketService',
            { ticketId: ticket.id, ticketNo: ticket.ticketNo },
          );
          // 继续处理下一个工单
        }
      }

      this.logger.log(`自动分配等待工单完成，处理了 ${waitingTickets.length} 个工单`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `自动分配等待工单失败: ${errorMessage}`,
        errorStack,
        'TicketService',
      );
    }
  }

  /**
   * 自动分配直接转人工的工单（创建工单时立即尝试分配）
   * 如果没有在线客服，不创建会话，工单保持 WAITING 状态
   */
  private async autoAssignDirectTransferTicket(
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

      const hasOnlineAgents = onlineAgents.length > 0 || onlineAdmins.length > 0;

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
        load: agent.sessions.length + (agent.role === 'ADMIN' ? ADMIN_WEIGHT_PENALTY : 0),
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
        `工单 ${ticketId} 自动分配: 选择 ${selectedAgent.role} ${selectedAgent.username} (负载: ${selectedAgent.sessions.length}, 加权负载: ${agentsWithLoad[0].load})`,
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
          agentId: null, // ✅ 先不分配，稍后通过 autoAssignAgentOnly 自动分配
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
          console.warn(
            `添加到 Redis 队列失败，将在下次一致性检查时修复`,
          );
        }
      }

      // 重新排序队列（计算排队位置和预计等待时间）
      try {
        await this.sessionService.reorderQueue();
      } catch (error) {
        console.warn(`重新排序队列失败: ${error.message}`);
      }

      // ✅ 自动分配客服（只分配，不改变状态，保持 QUEUED）
      let assignmentSucceeded = false;
      try {
        const assignedSession = await this.sessionService.autoAssignAgentOnly(session.id);
        // ⚠️ 关键：检查是否真的分配了客服
        if (assignedSession.agentId) {
          assignmentSucceeded = true;
          this.logger.log(`会话 ${session.id} 已自动分配给客服`, {
            sessionId: session.id,
            agentId: assignedSession.agentId,
          });
        } else {
          this.logger.warn(`会话 ${session.id} 未能分配客服（可能没有可分配的客服）`, {
            sessionId: session.id,
          });
        }
      } catch (error) {
        // 自动分配失败可能是因为所有客服都忙，这是正常的，保持未分配状态
        const errorMessage = error instanceof Error ? error.message : String(error);
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

      // ⚠️ 关键修复：如果自动分配失败，检查是否还有在线客服
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

        // ✅ 确保发送排队更新通知到玩家端
        if (enrichedSession.queuePosition !== null && enrichedSession.queuePosition !== undefined) {
          this.websocketGateway.notifyQueueUpdate(
            session.id,
            enrichedSession.queuePosition,
            enrichedSession.estimatedWaitTime,
          );
        }
      } catch (error) {
        console.warn(`通知新会话失败: ${error.message}`);
      }

      return { hasAgents: true, sessionCreated: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `自动分配直接转人工工单 ${ticketId} 失败: ${errorMessage}`,
        errorStack,
        'TicketService',
        { ticketId },
      );
      return { hasAgents: false, sessionCreated: false };
    }
  }

  // 通过 ticketService 调用 sessionService 的方法（用于解决循环依赖）
  async closeSessionByPlayer(sessionId: string) {
    return this.sessionService.closeByPlayer(sessionId);
  }
}
