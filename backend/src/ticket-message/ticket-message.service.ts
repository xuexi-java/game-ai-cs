import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { throwTicketNotFound } from '../common/exceptions';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { TicketService } from '../ticket/ticket.service';
import { AppLogger } from '../common/logger/app-logger.service';

@Injectable()
export class TicketMessageService {
  private readonly logger: AppLogger;

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => WebsocketGateway))
    private websocketGateway: WebsocketGateway,
    @Inject(forwardRef(() => TicketService))
    private ticketService: TicketService,
    logger: AppLogger,
  ) {
    this.logger = logger;
    this.logger.setContext(TicketMessageService.name);
  }

  // 创建工单消息（异步工单回复）
  async create(ticketId: string, senderId: string, content: string) {
    // 验证工单存在
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throwTicketNotFound(ticketId);
    }

    // 创建消息
    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderId,
        content,
      },
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

    // 更新工单状态
    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status: 'WAITING',
      },
    });

    // 通过 WebSocket 通知工单消息（通知玩家端）
    this.websocketGateway.notifyTicketMessage(ticketId, message);

    // TODO: 触发游戏内邮件通知

    return message;
  }

  // 获取工单消息列表
  async findByTicket(ticketId: string) {
    return this.prisma.ticketMessage.findMany({
      where: { ticketId },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            realName: true,
          },
        },
        ticket: {
          include: {
            sessions: {
              where: {
                status: { in: ['PENDING', 'QUEUED', 'IN_PROGRESS'] },
              },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
