import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../common/logger/app-logger.service';

/**
 * WebSocket 状态持久化服务
 * 负责将 WebSocket 连接状态同步到 Redis，支持多实例部署
 */
@Injectable()
export class WebsocketStateService {
  // Redis Key 前缀
  private readonly REDIS_PREFIX = {
    CLIENT: 'ws:client:',
    PLAYER_SESSION: 'ws:player:',
    AGENT_ONLINE: 'ws:agent:online:',
  };

  // 过期时间（从配置读取，默认24小时）
  private readonly stateTtl: number;
  private readonly pingTimeout: number;

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext(WebsocketStateService.name);
    this.stateTtl = this.configService.get<number>('WS_STATE_TTL', 86400);
    this.pingTimeout = this.configService.get<number>('REDIS_PING_TIMEOUT', 2000);
  }

  /**
   * 检查 Redis 是否可用
   */
  async isRedisAvailable(): Promise<boolean> {
    try {
      const result = await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('Redis ping timeout')),
            this.pingTimeout,
          ),
        ),
      ]);
      return result === 'PONG';
    } catch (error) {
      this.logger.warn(
        `Redis 不可用: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * 从 Redis 恢复状态（应用启动时调用）
   */
  async restoreStateFromRedis(): Promise<void> {
    try {
      this.logger.debug('开始从 Redis 恢复 WebSocket 状态...');

      const isAvailable = await this.isRedisAvailable();
      if (!isAvailable) {
        this.logger.warn('Redis 不可用，跳过状态恢复');
        return;
      }

      // 等待 Redis 连接就绪
      const pingResult = await this.isRedisAvailable();
      if (!pingResult) {
        this.logger.warn(
          `Redis 连接未就绪 (状态: ${this.redis.status})，等待连接...`,
        );
        let retries = 0;
        while (retries < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const available = await this.isRedisAvailable();
          if (available) {
            break;
          }
          retries++;
        }
        const finalCheck = await this.isRedisAvailable();
        if (!finalCheck) {
          this.logger.warn('Redis 连接超时，跳过状态恢复');
          return;
        }
      }

      // 恢复在线客服状态
      const onlineAgentKeys = await this.redis.keys(
        `${this.REDIS_PREFIX.AGENT_ONLINE}*`,
      );
      for (const key of onlineAgentKeys) {
        const agentId = key.replace(this.REDIS_PREFIX.AGENT_ONLINE, '');
        const agentData = await this.redis.get(key);
        if (agentData) {
          try {
            const data = JSON.parse(agentData);
            await this.prisma.user.update({
              where: { id: agentId },
              data: { isOnline: true },
            });
            this.logger.debug(`恢复客服在线状态: ${agentId}`);
          } catch (error) {
            this.logger.warn(`恢复客服状态失败: ${agentId}`, error);
          }
        }
      }

      // 清理过期的连接数据（超过24小时）
      const allClientKeys = await this.redis.keys(
        `${this.REDIS_PREFIX.CLIENT}*`,
      );
      for (const key of allClientKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1) {
          await this.redis.expire(key, this.stateTtl);
        }
      }

      this.logger.log('WebSocket 状态恢复完成');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('enableOfflineQueue')
      ) {
        this.logger.warn(
          'Redis 连接未就绪，跳过状态恢复（这是正常的，应用将继续启动）',
        );
      } else {
        this.logger.error(
          `恢复状态失败: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  // ==================== 客户端信息管理 ====================

  /**
   * 保存客户端信息到 Redis
   */
  async saveClient(clientId: string, clientInfo: any): Promise<void> {
    const key = `${this.REDIS_PREFIX.CLIENT}${clientId}`;
    await this.redis.setex(key, this.stateTtl, JSON.stringify(clientInfo));
  }

  /**
   * 从 Redis 获取客户端信息
   */
  async getClient(clientId: string): Promise<any | null> {
    const key = `${this.REDIS_PREFIX.CLIENT}${clientId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * 删除 Redis 中的客户端信息
   */
  async deleteClient(clientId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX.CLIENT}${clientId}`;
    await this.redis.del(key);
  }

  // ==================== 玩家会话管理 ====================

  /**
   * 保存玩家会话绑定到 Redis
   */
  async savePlayerSession(clientId: string, sessionId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX.PLAYER_SESSION}${clientId}`;
    await this.redis.setex(key, this.stateTtl, sessionId);
  }

  /**
   * 从 Redis 获取玩家会话
   */
  async getPlayerSession(clientId: string): Promise<string | null> {
    const key = `${this.REDIS_PREFIX.PLAYER_SESSION}${clientId}`;
    return await this.redis.get(key);
  }

  /**
   * 删除 Redis 中的玩家会话
   */
  async deletePlayerSession(clientId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX.PLAYER_SESSION}${clientId}`;
    await this.redis.del(key);
  }

  // ==================== 客服在线状态管理 ====================

  /**
   * 保存客服在线状态到 Redis
   */
  async saveAgentOnline(agentId: string, agentInfo: any): Promise<void> {
    const key = `${this.REDIS_PREFIX.AGENT_ONLINE}${agentId}`;
    await this.redis.setex(key, this.stateTtl, JSON.stringify(agentInfo));
  }

  /**
   * 删除 Redis 中的客服在线状态
   */
  async deleteAgentOnline(agentId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX.AGENT_ONLINE}${agentId}`;
    await this.redis.del(key);
  }

  /**
   * 获取所有在线客服
   */
  async getAllOnlineAgents(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.REDIS_PREFIX.AGENT_ONLINE}*`);
    return keys.map((key) => key.replace(this.REDIS_PREFIX.AGENT_ONLINE, ''));
  }
}
