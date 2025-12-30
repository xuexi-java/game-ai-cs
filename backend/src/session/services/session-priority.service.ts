import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';

@Injectable()
export class SessionPriorityService {
  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
  ) {
    this.logger.setContext('SessionPriorityService');
  }

  /**
   * P0 性能优化：获取在线客服/管理员数量
   * 使用 groupBy 将 4 次 count 查询合并为 1 次
   */
  async getOnlineAgentCount(): Promise<{
    agents: number;
    admins: number;
    total: number;
  }> {
    const counts = await this.prisma.user.groupBy({
      by: ['role'],
      where: {
        isOnline: true,
        deletedAt: null,
        role: { in: ['AGENT', 'ADMIN'] },
      },
      _count: { id: true },
    });

    const agents = counts.find((c) => c.role === 'AGENT')?._count.id || 0;
    const admins = counts.find((c) => c.role === 'ADMIN')?._count.id || 0;
    return { agents, admins, total: agents + admins };
  }

  /**
   * 计算优先级分数
   */
  async calculatePriorityScore(sessionId: string): Promise<number> {
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

  /**
   * 匹配规则
   */
  matchRule(conditions: any, ticket: any, session: any): boolean {
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
}
