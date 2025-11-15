import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto, TicketResponseDto } from './dto/create-ticket.dto';
import * as crypto from 'crypto';

@Injectable()
export class TicketService {
  constructor(private prisma: PrismaService) {}

  // 生成工单编号
  private generateTicketNo(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `T-${dateStr}-${random}`;
  }

  // 生成访问令牌
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex') + '-' + Date.now().toString(36);
  }

  // 检查玩家是否有未关闭的工单
  async checkOpenTicket(
    gameId: string,
    serverId: string | null,
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
    }

    const openTicket = await this.prisma.ticket.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasOpenTicket: !!openTicket,
      ticketNo: openTicket?.ticketNo,
      ticketId: openTicket?.id,
    };
  }

  // 创建工单
  async create(createTicketDto: CreateTicketDto): Promise<TicketResponseDto> {
    const ticketNo = this.generateTicketNo();
    const token = this.generateToken();

    const ticket = await this.prisma.ticket.create({
      data: {
        ...createTicketDto,
        ticketNo,
        token,
        status: 'NEW',
        identityStatus: 'NOT_VERIFIED',
        occurredAt: createTicketDto.occurredAt
          ? new Date(createTicketDto.occurredAt)
          : null,
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
      ticketId: ticket.id,
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

  // 获取工单列表（管理端）
  async findAll(query: {
    status?: string;
    priority?: string;
    gameId?: string;
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: any = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }
    if (query.priority) {
      where.priority = query.priority;
    }
    if (query.gameId) {
      where.gameId = query.gameId;
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
      data: tickets,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
