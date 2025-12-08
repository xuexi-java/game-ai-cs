import { Injectable, Logger, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 排队服务 - 使用 Redis Zset 管理排队序列
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly QUEUE_PREFIX = 'queue:';
  private readonly UNASSIGNED_QUEUE_KEY = `${this.QUEUE_PREFIX}unassigned`;
  private readonly AGENT_QUEUE_KEY_PREFIX = `${this.QUEUE_PREFIX}agent:`;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 计算会话的排序分数
   * 分数 = priorityScore * 10^10 + (10^13 - timestamp)
   * 这样优先级高的排在前面，优先级相同时按时间排序（时间早的排在前面）
   */
  private calculateScore(priorityScore: number, queuedAt: Date): number {
    const timestamp = queuedAt.getTime();
    // 使用大数乘法确保优先级优先，时间戳作为次要排序
    // 假设 priorityScore 最大为 200，timestamp 最大约为 10^13（毫秒级时间戳）
    // 使用 10^10 作为倍数，确保优先级优先
    // 使用 10^13 - timestamp 是为了让时间早的排在前面（分数更高）
    const maxTimestamp = 9999999999999; // 约等于 2286年的毫秒时间戳
    
    // 确保 priorityScore 非负（负数会导致排序错误）
    const safePriorityScore = Math.max(0, priorityScore || 0);
    
    // 确保 timestamp 在合理范围内
    const safeTimestamp = Math.max(0, Math.min(timestamp, maxTimestamp));
    
    return safePriorityScore * 10000000000 + (maxTimestamp - safeTimestamp);
  }

  /**
   * 添加会话到未分配队列
   */
  async addToUnassignedQueue(
    sessionId: string,
    priorityScore: number,
    queuedAt: Date,
  ): Promise<void> {
    try {
      const score = this.calculateScore(priorityScore, queuedAt);
      await this.redis.zadd(this.UNASSIGNED_QUEUE_KEY, score, sessionId);
      this.logger.debug(
        `添加会话 ${sessionId} 到未分配队列，分数: ${score}`,
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`添加会话到未分配队列失败: ${errorMsg}`, errorStack);
      throw error;
    }
  }

  /**
   * 添加会话到指定客服的队列
   */
  async addToAgentQueue(
    sessionId: string,
    agentId: string,
    priorityScore: number,
    queuedAt: Date,
  ): Promise<void> {
    try {
      const score = this.calculateScore(priorityScore, queuedAt);
      const queueKey = `${this.AGENT_QUEUE_KEY_PREFIX}${agentId}`;
      await this.redis.zadd(queueKey, score, sessionId);
      this.logger.debug(
        `添加会话 ${sessionId} 到客服 ${agentId} 的队列，分数: ${score}`,
      );
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`添加会话到客服队列失败: ${errorMsg}`, errorStack);
      throw error;
    }
  }

  /**
   * 从队列中移除会话
   */
  async removeFromQueue(sessionId: string, agentId?: string | null): Promise<void> {
    try {
      // 从未分配队列移除
      await this.redis.zrem(this.UNASSIGNED_QUEUE_KEY, sessionId);

      // 如果指定了 agentId，也从该客服的队列移除
      if (agentId) {
        const queueKey = `${this.AGENT_QUEUE_KEY_PREFIX}${agentId}`;
        await this.redis.zrem(queueKey, sessionId);
      } else {
        // 如果没有指定 agentId，尝试从所有客服队列中移除
        // 使用 scan 替代 keys 命令，避免阻塞 Redis
        const keys: string[] = [];
        let cursor = '0';
        do {
          const result = await this.redis.scan(
            cursor,
            'MATCH',
            `${this.AGENT_QUEUE_KEY_PREFIX}*`,
            'COUNT',
            100,
          );
          cursor = result[0];
          keys.push(...result[1]);
        } while (cursor !== '0');

        if (keys.length > 0) {
          await Promise.all(keys.map((key) => this.redis.zrem(key, sessionId)));
        }
      }

      this.logger.debug(`从队列移除会话 ${sessionId}`);
    } catch (error) {
      this.logger.error(`从队列移除会话失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 将会话从未分配队列移动到指定客服的队列
   */
  async moveToAgentQueue(
    sessionId: string,
    agentId: string,
    priorityScore: number,
    queuedAt: Date,
  ): Promise<void> {
    try {
      // 从未分配队列移除（如果失败，继续尝试添加，因为可能本来就不在队列中）
      try {
        await this.redis.zrem(this.UNASSIGNED_QUEUE_KEY, sessionId);
      } catch (error) {
        // 忽略移除失败，继续执行
        this.logger.warn(`从未分配队列移除会话失败（可能本来就不在队列中）: ${error.message}`);
      }

      // 添加到客服队列
      await this.addToAgentQueue(sessionId, agentId, priorityScore, queuedAt);

      this.logger.debug(`将会话 ${sessionId} 从未分配队列移动到客服 ${agentId} 的队列`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`移动会话到客服队列失败: ${errorMsg}`, errorStack);
      throw error;
    }
  }

  /**
   * 获取会话在队列中的位置（排名，从1开始）
   * 位置1表示第一个被处理的会话（分数最高的）
   */
  async getQueuePosition(sessionId: string, agentId?: string | null): Promise<number | null> {
    try {
      let queueKey: string;
      if (agentId) {
        queueKey = `${this.AGENT_QUEUE_KEY_PREFIX}${agentId}`;
      } else {
        queueKey = this.UNASSIGNED_QUEUE_KEY;
      }

      const rank = await this.redis.zrevrank(queueKey, sessionId);
      // zrevrank 返回的是从高到低的排名（0 表示分数最高，即第1个被处理）
      // 我们需要返回从1开始的排队位置（1表示第一个被处理）
      if (rank === null) {
        return null;
      }

      // rank 从0开始，所以需要 +1 转换为从1开始的排队位置
      return rank + 1;
    } catch (error) {
      this.logger.error(`获取排队位置失败: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 获取队列中的所有会话ID（按优先级和时间排序）
   */
  async getQueueSessionIds(agentId?: string | null, limit?: number): Promise<string[]> {
    try {
      let queueKey: string;
      if (agentId) {
        queueKey = `${this.AGENT_QUEUE_KEY_PREFIX}${agentId}`;
      } else {
        queueKey = this.UNASSIGNED_QUEUE_KEY;
      }

      // 使用 zrevrange 获取从高到低排序的会话ID（分数高的在前）
      const sessionIds = await this.redis.zrevrange(
        queueKey,
        0,
        limit ? limit - 1 : -1,
      );

      return sessionIds;
    } catch (error) {
      this.logger.error(`获取队列会话ID失败: ${error.message}`, error.stack);
      return [];
    }
  }

  /**
   * 获取队列长度
   */
  async getQueueLength(agentId?: string | null): Promise<number> {
    try {
      let queueKey: string;
      if (agentId) {
        queueKey = `${this.AGENT_QUEUE_KEY_PREFIX}${agentId}`;
      } else {
        queueKey = this.UNASSIGNED_QUEUE_KEY;
      }

      return await this.redis.zcard(queueKey);
    } catch (error) {
      this.logger.error(`获取队列长度失败: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * 检查 Redis 是否可用
   */
  async isRedisAvailable(): Promise<boolean> {
    try {
      // 使用带超时的 ping，快速检测 Redis 是否可用
      const result = await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 2000),
        ),
      ]);
      return result === 'PONG';
    } catch (error) {
      this.logger.warn(`Redis 不可用: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * 从数据库恢复队列数据到 Redis
   */
  async recoverQueueFromDatabase(): Promise<void> {
    try {
      this.logger.log('开始从数据库恢复队列数据到 Redis...');

      // 检查 Redis 是否可用
      if (!(await this.isRedisAvailable())) {
        this.logger.warn('Redis 不可用，跳过队列数据恢复');
        return;
      }

      // 清空现有队列（可选，根据需求决定）
      // await this.redis.del(this.UNASSIGNED_QUEUE_KEY);
      // const agentKeys = await this.redis.keys(`${this.AGENT_QUEUE_KEY_PREFIX}*`);
      // if (agentKeys.length > 0) {
      //   await this.redis.del(...agentKeys);
      // }

      // 获取所有排队状态的会话
      const queuedSessions = await this.prisma.session.findMany({
        where: {
          status: 'QUEUED',
        },
        select: {
          id: true,
          agentId: true,
          priorityScore: true,
          queuedAt: true,
        },
      });

      if (queuedSessions.length === 0) {
        this.logger.log('没有排队状态的会话，跳过恢复');
        return;
      }

      // 恢复未分配的会话（使用重试机制）
      const unassignedSessions = queuedSessions.filter((s) => !s.agentId);
      for (const session of unassignedSessions) {
        if (session.queuedAt) {
          // 使用重试版本，失败时不抛出异常
          await this.addToUnassignedQueueWithRetry(
            session.id,
            session.priorityScore || 0,
            session.queuedAt,
          );
        }
      }

      // 恢复已分配的会话（按客服分组）
      const assignedSessions = queuedSessions.filter((s) => s.agentId);
      const sessionsByAgent = new Map<string, typeof assignedSessions>();
      for (const session of assignedSessions) {
        if (session.agentId) {
          if (!sessionsByAgent.has(session.agentId)) {
            sessionsByAgent.set(session.agentId, []);
          }
          sessionsByAgent.get(session.agentId)!.push(session);
        }
      }

      for (const [agentId, sessions] of sessionsByAgent.entries()) {
        for (const session of sessions) {
          if (session.queuedAt) {
            // 使用重试版本，失败时不抛出异常
            await this.addToAgentQueueWithRetry(
              session.id,
              agentId,
              session.priorityScore || 0,
              session.queuedAt,
            );
          }
        }
      }

      this.logger.log(
        `队列数据恢复完成：未分配 ${unassignedSessions.length} 个，已分配 ${assignedSessions.length} 个`,
      );
    } catch (error) {
      this.logger.error(`从数据库恢复队列数据失败: ${error.message}`, error.stack);
      // 不抛出错误，允许系统继续运行
    }
  }

  /**
   * 同步 Redis 队列数据到数据库（定期调用）
   */
  async syncQueueToDatabase(): Promise<void> {
    try {
      if (!(await this.isRedisAvailable())) {
        return;
      }

      // 获取所有排队状态的会话
      const queuedSessions = await this.prisma.session.findMany({
        where: {
          status: 'QUEUED',
        },
        select: {
          id: true,
          agentId: true,
        },
      });

      // 更新每个会话的排队位置
      for (const session of queuedSessions) {
        const queuePosition = await this.getQueuePosition(session.id, session.agentId);
        if (queuePosition !== null) {
          await this.prisma.session.update({
            where: { id: session.id },
            data: { queuePosition },
          });
        }
      }

      this.logger.debug(`同步队列数据到数据库完成，更新了 ${queuedSessions.length} 个会话`);
    } catch (error) {
      this.logger.error(`同步队列数据到数据库失败: ${error.message}`, error.stack);
    }
  }

  /**
   * 带重试的添加会话到未分配队列
   * @param sessionId 会话ID
   * @param priorityScore 优先级分数
   * @param queuedAt 排队时间
   * @param maxRetries 最大重试次数，默认3次
   * @returns 是否成功
   */
  async addToUnassignedQueueWithRetry(
    sessionId: string,
    priorityScore: number,
    queuedAt: Date,
    maxRetries = 3,
  ): Promise<boolean> {
    // 先快速检查 Redis 是否可用
    const isAvailable = await this.isRedisAvailable();
    if (!isAvailable) {
      this.logger.warn(
        `Redis 不可用，跳过添加到队列（会话 ${sessionId}），将在一致性检查时恢复`,
      );
      return false;
    }

    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.addToUnassignedQueue(sessionId, priorityScore, queuedAt);
        return true; // 成功
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是连接错误，快速失败，不重试
        const errorMsg = lastError.message.toLowerCase();
        if (
          errorMsg.includes('maxretriesperrequest') ||
          errorMsg.includes('connection') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('timeout')
        ) {
          this.logger.warn(
            `Redis 连接错误，快速失败（会话 ${sessionId}）: ${lastError.message}`,
          );
          return false; // 快速失败，不重试
        }

        if (i < maxRetries - 1) {
          // 指数退避：1s, 2s, 4s
          const delay = Math.min(1000 * Math.pow(2, i), 4000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.warn(
            `添加会话到队列失败，${delay}ms 后重试 (${i + 1}/${maxRetries}): ${lastError.message}`,
          );
        }
      }
    }

    // 所有重试都失败
    this.logger.error(
      `添加会话到队列失败（已重试${maxRetries}次）: ${lastError?.message}`,
      lastError?.stack,
    );
    return false; // 返回失败，但不抛出异常，允许系统继续运行
  }

  /**
   * 带重试的添加会话到指定客服的队列
   * @param sessionId 会话ID
   * @param agentId 客服ID
   * @param priorityScore 优先级分数
   * @param queuedAt 排队时间
   * @param maxRetries 最大重试次数，默认3次
   * @returns 是否成功
   */
  async addToAgentQueueWithRetry(
    sessionId: string,
    agentId: string,
    priorityScore: number,
    queuedAt: Date,
    maxRetries = 3,
  ): Promise<boolean> {
    // 先快速检查 Redis 是否可用
    const isAvailable = await this.isRedisAvailable();
    if (!isAvailable) {
      this.logger.warn(
        `Redis 不可用，跳过添加到队列（会话 ${sessionId}），将在一致性检查时恢复`,
      );
      return false;
    }

    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.addToAgentQueue(sessionId, agentId, priorityScore, queuedAt);
        return true; // 成功
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是连接错误，快速失败，不重试
        const errorMsg = lastError.message.toLowerCase();
        if (
          errorMsg.includes('maxretriesperrequest') ||
          errorMsg.includes('connection') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('timeout')
        ) {
          this.logger.warn(
            `Redis 连接错误，快速失败（会话 ${sessionId}）: ${lastError.message}`,
          );
          return false; // 快速失败，不重试
        }

        if (i < maxRetries - 1) {
          // 指数退避：1s, 2s, 4s
          const delay = Math.min(1000 * Math.pow(2, i), 4000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.warn(
            `添加会话到客服队列失败，${delay}ms 后重试 (${i + 1}/${maxRetries}): ${lastError.message}`,
          );
        }
      }
    }

    // 所有重试都失败
    this.logger.error(
      `添加会话到客服队列失败（已重试${maxRetries}次）: ${lastError?.message}`,
      lastError?.stack,
    );
    return false; // 返回失败，但不抛出异常，允许系统继续运行
  }

  /**
   * 带重试的从队列中移除会话
   * @param sessionId 会话ID
   * @param agentId 客服ID（可选）
   * @param maxRetries 最大重试次数，默认3次
   * @returns 是否成功
   */
  async removeFromQueueWithRetry(
    sessionId: string,
    agentId?: string | null,
    maxRetries = 3,
  ): Promise<boolean> {
    // 先快速检查 Redis 是否可用
    const isAvailable = await this.isRedisAvailable();
    if (!isAvailable) {
      // Redis 不可用时，移除操作可以忽略（因为本来就不在 Redis 中）
      this.logger.debug(`Redis 不可用，跳过从队列移除（会话 ${sessionId}）`);
      return true; // 返回成功，因为如果 Redis 不可用，会话本来就不在队列中
    }

    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.removeFromQueue(sessionId, agentId);
        return true; // 成功
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是连接错误，快速失败
        const errorMsg = lastError.message.toLowerCase();
        if (
          errorMsg.includes('maxretriesperrequest') ||
          errorMsg.includes('connection') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('timeout')
        ) {
          // 移除操作失败可以忽略
          this.logger.debug(
            `Redis 连接错误，跳过移除操作（会话 ${sessionId}）: ${lastError.message}`,
          );
          return true; // 返回成功，因为移除失败不影响系统运行
        }

        if (i < maxRetries - 1) {
          // 指数退避：1s, 2s, 4s
          const delay = Math.min(1000 * Math.pow(2, i), 4000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.warn(
            `从队列移除会话失败，${delay}ms 后重试 (${i + 1}/${maxRetries}): ${lastError.message}`,
          );
        }
      }
    }

    // 所有重试都失败，但移除操作失败可以忽略
    this.logger.warn(
      `从队列移除会话失败（已重试${maxRetries}次），但可以忽略: ${lastError?.message}`,
    );
    return true; // 返回成功，因为移除失败不影响系统运行
  }

  /**
   * 带重试的将会话从未分配队列移动到指定客服的队列
   * @param sessionId 会话ID
   * @param agentId 客服ID
   * @param priorityScore 优先级分数
   * @param queuedAt 排队时间
   * @param maxRetries 最大重试次数，默认3次
   * @returns 是否成功
   */
  async moveToAgentQueueWithRetry(
    sessionId: string,
    agentId: string,
    priorityScore: number,
    queuedAt: Date,
    maxRetries = 3,
  ): Promise<boolean> {
    // 先快速检查 Redis 是否可用
    const isAvailable = await this.isRedisAvailable();
    if (!isAvailable) {
      this.logger.warn(
        `Redis 不可用，跳过移动队列（会话 ${sessionId}），将在一致性检查时恢复`,
      );
      return false;
    }

    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.moveToAgentQueue(sessionId, agentId, priorityScore, queuedAt);
        return true; // 成功
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是连接错误，快速失败，不重试
        const errorMsg = lastError.message.toLowerCase();
        if (
          errorMsg.includes('maxretriesperrequest') ||
          errorMsg.includes('connection') ||
          errorMsg.includes('econnrefused') ||
          errorMsg.includes('timeout')
        ) {
          this.logger.warn(
            `Redis 连接错误，快速失败（会话 ${sessionId}）: ${lastError.message}`,
          );
          return false; // 快速失败，不重试
        }

        if (i < maxRetries - 1) {
          // 指数退避：1s, 2s, 4s
          const delay = Math.min(1000 * Math.pow(2, i), 4000);
          await new Promise((resolve) => setTimeout(resolve, delay));
          this.logger.warn(
            `移动会话到客服队列失败，${delay}ms 后重试 (${i + 1}/${maxRetries}): ${lastError.message}`,
          );
        }
      }
    }

    // 所有重试都失败
    this.logger.error(
      `移动会话到客服队列失败（已重试${maxRetries}次）: ${lastError?.message}`,
      lastError?.stack,
    );
    return false; // 返回失败，但不抛出异常，允许系统继续运行
  }
}

