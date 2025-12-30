import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import { throwTicketNotFound } from '../../common/exceptions';
import { TicketMessageService } from '../../ticket-message/ticket-message.service';

@Injectable()
export class TicketQueryService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    private ticketMessageService: TicketMessageService,
  ) {
    this.logger.setContext('TicketQueryService');
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
          orderBy: {
            createdAt: 'desc',
          },
          take: 1, // 只返回最新的会话
          include: {
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
      throwTicketNotFound();
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
      throwTicketNotFound(id);
    }

    return ticket;
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
      throwTicketNotFound();
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

  // 根据工单ID获取工单消息列表（管理端）
  async getMessagesByTicketId(ticketId: string) {
    return this.ticketMessageService.findByTicket(ticketId);
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
    const sortBy =
      query.sortBy && allowedSortFields.includes(query.sortBy)
        ? query.sortBy
        : null;
    const sortOrder =
      query.sortOrder === 'asc' || query.sortOrder === 'desc'
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
}
