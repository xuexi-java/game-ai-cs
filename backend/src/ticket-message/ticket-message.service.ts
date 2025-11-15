import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TicketMessageService {
  constructor(private prisma: PrismaService) {}

  // 创建工单消息（异步工单回复）
  async create(ticketId: string, senderId: string, content: string) {
    // 验证工单存在
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
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
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}

