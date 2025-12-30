import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppLogger } from '../../common/logger/app-logger.service';
import Redis from 'ioredis';

@Injectable()
export class SessionStatsService {
  // 缓存键
  private readonly CACHE_KEY = 'session:avg_processing_time';
  // 缓存时间：15分钟
  private readonly CACHE_TTL = 15 * 60;
  // 默认处理时间（分钟）
  private readonly DEFAULT_PROCESSING_TIME = 5;
  // 最小处理时间（分钟）
  private readonly MIN_PROCESSING_TIME = 1;
  // 最大处理时间（分钟）
  private readonly MAX_PROCESSING_TIME = 30;

  constructor(
    private readonly logger: AppLogger,
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {
    this.logger.setContext('SessionStatsService');
  }

  /**
   * 获取平均处理时间（分钟）
   * 优先从缓存获取，缓存不存在则计算并缓存
   */
  async getAverageProcessingTime(): Promise<number> {
    try {
      // 1. 尝试从缓存获取
      const cached = await this.redis.get(this.CACHE_KEY);
      if (cached !== null) {
        const cachedValue = parseFloat(cached);
        if (!isNaN(cachedValue)) {
          this.logger.debug(`从缓存获取平均处理时间: ${cachedValue}分钟`);
          return cachedValue;
        }
      }

      // 2. 缓存不存在，计算平均处理时间
      const avgTime = await this.calculateAverageProcessingTime();

      // 3. 存入缓存
      await this.redis.setex(this.CACHE_KEY, this.CACHE_TTL, avgTime.toString());
      this.logger.debug(`计算并缓存平均处理时间: ${avgTime}分钟`);

      return avgTime;
    } catch (error) {
      this.logger.error(
        `获取平均处理时间失败: ${error.message}`,
        error instanceof Error ? error.stack : undefined,
      );
      // 出错时返回默认值
      return this.DEFAULT_PROCESSING_TIME;
    }
  }

  /**
   * 计算平均处理时间
   * 使用中位数 + 异常值过滤，更准确反映真实处理时间
   */
  private async calculateAverageProcessingTime(): Promise<number> {
    // 获取最近7天已关闭的会话
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const closedSessions = await this.prisma.session.findMany({
      where: {
        status: 'CLOSED',
        startedAt: { not: null },
        closedAt: { not: null, gte: sevenDaysAgo },
      },
      select: {
        startedAt: true,
        closedAt: true,
      },
      orderBy: {
        closedAt: 'desc',
      },
      take: 500, // 限制最多500条记录
    });

    if (closedSessions.length === 0) {
      this.logger.debug('没有历史会话数据，使用默认处理时间');
      return this.DEFAULT_PROCESSING_TIME;
    }

    // 计算每个会话的处理时长（分钟）
    const durations = closedSessions
      .map((session) => {
        const start = new Date(session.startedAt!).getTime();
        const end = new Date(session.closedAt!).getTime();
        return (end - start) / (1000 * 60); // 转换为分钟
      })
      .filter((duration) => duration > 0 && duration < 120); // 过滤无效数据（0分钟或超过2小时）

    if (durations.length === 0) {
      this.logger.debug('没有有效的会话时长数据，使用默认处理时间');
      return this.DEFAULT_PROCESSING_TIME;
    }

    // 过滤异常值（去掉最低5%和最高5%）
    const filteredDurations = this.filterOutliers(durations, 0.05);

    if (filteredDurations.length === 0) {
      return this.DEFAULT_PROCESSING_TIME;
    }

    // 使用中位数而非平均值（更稳健）
    const median = this.calculateMedian(filteredDurations);

    // 限制在合理范围内
    const result = Math.max(
      this.MIN_PROCESSING_TIME,
      Math.min(this.MAX_PROCESSING_TIME, Math.round(median * 10) / 10),
    );

    this.logger.debug(
      `统计数据：总样本=${closedSessions.length}，有效样本=${durations.length}，过滤后=${filteredDurations.length}，中位数=${median.toFixed(2)}，最终值=${result}`,
    );

    return result;
  }

  /**
   * 过滤异常值（去掉最低和最高的指定百分比）
   */
  private filterOutliers(data: number[], percentile: number): number[] {
    if (data.length < 10) {
      // 样本太少，不过滤
      return data;
    }

    const sorted = [...data].sort((a, b) => a - b);
    const removeCount = Math.floor(data.length * percentile);

    if (removeCount === 0) {
      return sorted;
    }

    return sorted.slice(removeCount, sorted.length - removeCount);
  }

  /**
   * 计算中位数
   */
  private calculateMedian(data: number[]): number {
    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * 使缓存失效（当会话关闭时调用）
   */
  async invalidateCache(): Promise<void> {
    try {
      await this.redis.del(this.CACHE_KEY);
      this.logger.debug('平均处理时间缓存已失效');
    } catch (error) {
      this.logger.warn(`清除缓存失败: ${error.message}`);
    }
  }
}
