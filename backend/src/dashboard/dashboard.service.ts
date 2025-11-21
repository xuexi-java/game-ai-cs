import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  private normalizeDate(date: Date) {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  async getMetrics(gameId?: string, startDate?: Date, endDate?: Date) {
    const dateStart = this.normalizeDate(
      startDate ?? new Date(Date.now() - 6 * MS_PER_DAY),
    );
    const dateEnd = this.normalizeDate(endDate ?? new Date());

    const ticketWhere: any = {
      deletedAt: null,
    };
    if (gameId) ticketWhere.gameId = gameId;
    ticketWhere.createdAt = {
      gte: dateStart,
      lte: new Date(dateEnd.getTime() + MS_PER_DAY - 1),
    };

    const sessionWhere: any = {
      ticket: {
        deletedAt: null,
        ...(gameId ? { gameId } : {}),
      },
      createdAt: {
        gte: dateStart,
        lte: new Date(dateEnd.getTime() + MS_PER_DAY - 1),
      },
    };

    const [
      totalSessions,
      aiResolvedSessions,
      transferredSessions,
      totalTickets,
      openTickets,
      closedTickets,
      resolvedTicketsWithTime,
      satisfactionRatings,
      responseSamples,
      agentSessions,
      agentRatings,
      ticketsForDaily,
    ] = await Promise.all([
      this.prisma.session.count({ where: sessionWhere }),
      this.prisma.session.count({
        where: {
          ...sessionWhere,
          status: 'CLOSED',
          agentId: null,
        },
      }),
      this.prisma.session.count({
        where: {
          ...sessionWhere,
          status: { in: ['IN_PROGRESS', 'CLOSED'] },
          agentId: { not: null },
        },
      }),
      this.prisma.ticket.count({ where: ticketWhere }),
      this.prisma.ticket.count({
        where: {
          ...ticketWhere,
          status: { not: 'CLOSED' },
        },
      }),
      this.prisma.ticket.count({
        where: {
          ...ticketWhere,
          status: 'CLOSED',
        },
      }),
      this.prisma.ticket.findMany({
        where: {
          ...ticketWhere,
          status: { in: ['RESOLVED', 'CLOSED'] },
          closedAt: { not: null },
        },
        select: {
          createdAt: true,
          closedAt: true,
        },
      }),
      this.prisma.satisfactionRating.findMany({
        where: {
          createdAt: ticketWhere.createdAt,
          ticket: {
            ...(gameId ? { gameId } : {}),
          },
        },
        select: {
          rating: true,
          createdAt: true,
        },
      }),
      this.prisma.session.findMany({
        where: {
          ...sessionWhere,
          queuedAt: { not: null },
          startedAt: { not: null },
        },
        select: {
          queuedAt: true,
          startedAt: true,
        },
      }),
      this.prisma.session.findMany({
        where: {
          ...sessionWhere,
          agentId: { not: null },
        },
        select: {
          agentId: true,
          agent: {
            select: {
              username: true,
              realName: true,
              isOnline: true,
            },
          },
        },
      }),
      this.prisma.satisfactionRating.findMany({
        where: {
          agentId: { not: null },
          createdAt: ticketWhere.createdAt,
          ticket: gameId ? { gameId } : undefined,
        },
        select: {
          agentId: true,
          rating: true,
          agent: {
            select: {
              username: true,
              realName: true,
              isOnline: true,
            },
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: ticketWhere,
        select: {
          createdAt: true,
          status: true,
        },
      }),
    ]);

    const avgResolutionSeconds =
      resolvedTicketsWithTime.length > 0
        ? Math.round(
            resolvedTicketsWithTime.reduce((sum, ticket) => {
              const diff =
                (ticket.closedAt!.getTime() - ticket.createdAt.getTime()) /
                1000;
              return sum + diff;
            }, 0) / resolvedTicketsWithTime.length,
          )
        : 0;

    const avgResponseSeconds =
      responseSamples.length > 0
        ? Math.round(
            responseSamples.reduce((sum, sample) => {
              return (
                sum +
                (sample.startedAt!.getTime() - sample.queuedAt!.getTime()) /
                  1000
              );
            }, 0) / responseSamples.length,
          )
        : 0;

    const averageSatisfaction =
      satisfactionRatings.length > 0
        ? Math.round(
            (satisfactionRatings.reduce((sum, r) => sum + r.rating, 0) /
              satisfactionRatings.length) *
              100,
          ) / 100
        : 0;

    const dailyMap: Record<
      string,
      {
        tickets: number;
        resolved: number;
        ratingSum: number;
        ratingCount: number;
      }
    > = {};
    for (
      let ts = dateStart.getTime();
      ts <= dateEnd.getTime();
      ts += MS_PER_DAY
    ) {
      dailyMap[this.formatDate(new Date(ts))] = {
        tickets: 0,
        resolved: 0,
        ratingSum: 0,
        ratingCount: 0,
      };
    }

    ticketsForDaily.forEach((ticket) => {
      const key = this.formatDate(ticket.createdAt);
      if (!dailyMap[key]) {
        dailyMap[key] = {
          tickets: 0,
          resolved: 0,
          ratingSum: 0,
          ratingCount: 0,
        };
      }
      dailyMap[key].tickets += 1;
      if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
        dailyMap[key].resolved += 1;
      }
    });

    satisfactionRatings.forEach((rating) => {
      const key = this.formatDate(rating.createdAt);
      if (!dailyMap[key]) {
        dailyMap[key] = {
          tickets: 0,
          resolved: 0,
          ratingSum: 0,
          ratingCount: 0,
        };
      }
      dailyMap[key].ratingSum += rating.rating;
      dailyMap[key].ratingCount += 1;
    });

    const dailyStats = Object.keys(dailyMap)
      .sort()
      .map((date) => {
        const stat = dailyMap[date];
        return {
          date,
          tickets: stat.tickets,
          resolved: stat.resolved,
          avgSatisfaction:
            stat.ratingCount > 0
              ? Math.round((stat.ratingSum / stat.ratingCount) * 100) / 100
              : 0,
        };
      });

    const agentStatsMap = new Map<
      string,
      {
        agentId: string;
        agentName: string;
        isOnline: boolean;
        handledTickets: number;
        ratingSum: number;
        ratingCount: number;
        ratingDistribution: Record<string, number>;
      }
    >();

    const ensureAgentEntry = (
      agentId: string,
      name?: string,
      online?: boolean,
    ) => {
      if (!agentStatsMap.has(agentId)) {
        agentStatsMap.set(agentId, {
          agentId,
          agentName: name ?? '客服',
          isOnline: online ?? false,
          handledTickets: 0,
          ratingSum: 0,
          ratingCount: 0,
          ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
        });
      } else if (name || online !== undefined) {
        const entry = agentStatsMap.get(agentId)!;
        if (name) entry.agentName = name;
        if (online !== undefined) entry.isOnline = online;
      }
    };

    agentSessions.forEach((session) => {
      const agentId = session.agentId!;
      const name = session.agent?.realName || session.agent?.username || '客服';
      ensureAgentEntry(agentId, name, session.agent?.isOnline ?? false);
      agentStatsMap.get(agentId)!.handledTickets += 1;
    });

    agentRatings.forEach((rating) => {
      const agentId = rating.agentId!;
      const name = rating.agent?.realName || rating.agent?.username || '客服';
      ensureAgentEntry(agentId, name, rating.agent?.isOnline ?? false);
      const entry = agentStatsMap.get(agentId)!;
      entry.ratingSum += rating.rating;
      entry.ratingCount += 1;
      const key = rating.rating.toString();
      entry.ratingDistribution[key] = (entry.ratingDistribution[key] || 0) + 1;
    });

    const agentStats = Array.from(agentStatsMap.values()).map((entry) => ({
      agentId: entry.agentId,
      agentName: entry.agentName,
      handledTickets: entry.handledTickets,
      isOnline: entry.isOnline,
      totalRatings: entry.ratingCount,
      averageRating:
        entry.ratingCount > 0
          ? Math.round((entry.ratingSum / entry.ratingCount) * 100) / 100
          : 0,
      ratingDistribution: entry.ratingDistribution,
    }));

    // 计算AI拦截率 = (总会话数 - 转人工会话数) / 总会话数 * 100%
    const aiInterceptionRate =
      totalSessions > 0
        ? Math.round(
            ((totalSessions - transferredSessions) / totalSessions) * 10000,
          ) / 100
        : 0;

    return {
      totalTickets,
      openTickets,
      closedTickets,
      averageResponseTime: avgResponseSeconds,
      averageResolutionTime: avgResolutionSeconds,
      satisfactionRating: averageSatisfaction,
      aiInterceptionRate, // AI拦截率（百分比）
      agentStats,
      dailyStats,
    };
  }
}
