import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  // 获取核心指标
  async getMetrics(gameId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {};
    if (gameId) where.gameId = gameId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    // 总会话数
    const totalSessions = await this.prisma.session.count({
      where: {
        ...where,
        ticket: where.gameId ? { gameId } : undefined,
      },
    });

    // AI解决的会话数（状态为CLOSED且没有agentId）
    const aiResolvedSessions = await this.prisma.session.count({
      where: {
        status: 'CLOSED',
        agentId: null,
        ticket: where.gameId ? { gameId } : undefined,
        createdAt: where.createdAt,
      },
    });

    // 转人工的会话数
    const transferredSessions = await this.prisma.session.count({
      where: {
        status: { in: ['IN_PROGRESS', 'CLOSED'] },
        agentId: { not: null },
        ticket: where.gameId ? { gameId } : undefined,
        createdAt: where.createdAt,
      },
    });

    // 总工单数
    const totalTickets = await this.prisma.ticket.count({ where });

    // 已解决的工单
    const resolvedTickets = await this.prisma.ticket.count({
      where: {
        ...where,
        status: { in: ['RESOLVED', 'CLOSED'] },
      },
    });

    // 计算平均解决时长（小时）
    const resolvedTicketsWithTime = await this.prisma.ticket.findMany({
      where: {
        ...where,
        status: { in: ['RESOLVED', 'CLOSED'] },
        closedAt: { not: null },
      },
      select: {
        createdAt: true,
        closedAt: true,
      },
    });

    let avgResolutionTime = 0;
    if (resolvedTicketsWithTime.length > 0) {
      const totalHours = resolvedTicketsWithTime.reduce((sum, ticket) => {
        const hours =
          (ticket.closedAt!.getTime() - ticket.createdAt.getTime()) /
          (1000 * 60 * 60);
        return sum + hours;
      }, 0);
      avgResolutionTime = totalHours / resolvedTicketsWithTime.length;
    }

    // 平均满意度评分
    const ratings = await this.prisma.satisfactionRating.findMany({
      where: {
        ticket: where.gameId ? { gameId } : undefined,
        createdAt: where.createdAt,
      },
      select: { rating: true },
    });

    let avgSatisfactionRating = 0;
    if (ratings.length > 0) {
      const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
      avgSatisfactionRating = sum / ratings.length;
    }

    return {
      aiInterceptRate:
        totalSessions > 0
          ? Math.round((aiResolvedSessions / totalSessions) * 10000) / 100
          : 0,
      transferToAgentRate:
        totalSessions > 0
          ? Math.round((transferredSessions / totalSessions) * 10000) / 100
          : 0,
      avgTicketResolutionTime: Math.round(avgResolutionTime * 100) / 100,
      totalSessions,
      totalTickets,
      avgSatisfactionRating: Math.round(avgSatisfactionRating * 100) / 100,
    };
  }
}

