import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Socket } from 'socket.io';
import { AppLogger } from '../common/logger/app-logger.service';
import { rateLimitRejectedCounter } from '../metrics/queue.metrics';

interface RateLimiterState {
  tokens: number;
  lastRefill: number;
}

interface ClientInfo {
  userId?: string;
  role?: string;
  sessionId?: string;
}

/**
 * WebSocket 速率限制服务
 * 使用令牌桶算法实现消息限流
 */
@Injectable()
export class WebsocketRateLimitService {
  // 限流器状态存储
  private readonly rateLimiters = new Map<string, RateLimiterState>();
  private readonly rateLimitNoticeAt = new Map<string, number>();

  // 限流配置
  private readonly playerRateLimitPerMinute: number;
  private readonly agentRateLimitPerMinute: number;
  private readonly playerBurst: number;
  private readonly agentBurst: number;
  private readonly noticeCooldownMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    this.logger.setContext(WebsocketRateLimitService.name);

    // 从配置读取限流参数，支持环境变量配置
    this.playerRateLimitPerMinute = this.configService.get<number>(
      'WS_PLAYER_RATE_LIMIT',
      200,
    );
    this.agentRateLimitPerMinute = this.configService.get<number>(
      'WS_AGENT_RATE_LIMIT',
      600,
    );
    this.playerBurst = this.configService.get<number>('WS_PLAYER_BURST', 20);
    this.agentBurst = this.configService.get<number>('WS_AGENT_BURST', 60);
    this.noticeCooldownMs = this.configService.get<number>(
      'WS_RATE_LIMIT_NOTICE_COOLDOWN',
      1000,
    );

    this.logger.log(
      `限流配置: 玩家=${this.playerRateLimitPerMinute}/min(burst=${this.playerBurst}), ` +
        `客服=${this.agentRateLimitPerMinute}/min(burst=${this.agentBurst})`,
    );
  }

  /**
   * 获取限流配置
   */
  private getRateLimitConfig(clientType: 'player' | 'agent'): {
    ratePerMinute: number;
    burst: number;
  } {
    if (clientType === 'agent') {
      return {
        ratePerMinute: this.agentRateLimitPerMinute,
        burst: this.agentBurst,
      };
    }
    return {
      ratePerMinute: this.playerRateLimitPerMinute,
      burst: this.playerBurst,
    };
  }

  /**
   * 检查是否允许发送消息（令牌桶算法）
   */
  allowMessage(clientId: string, clientType: 'player' | 'agent'): boolean {
    const now = Date.now();
    const { ratePerMinute, burst } = this.getRateLimitConfig(clientType);
    const ratePerMs = ratePerMinute / 60000;

    const limiter = this.rateLimiters.get(clientId) ?? {
      tokens: burst,
      lastRefill: now,
    };

    // 补充令牌
    const elapsed = now - limiter.lastRefill;
    if (elapsed > 0) {
      limiter.tokens = Math.min(burst, limiter.tokens + elapsed * ratePerMs);
      limiter.lastRefill = now;
    }

    // 消耗令牌
    if (limiter.tokens >= 1) {
      limiter.tokens -= 1;
      this.rateLimiters.set(clientId, limiter);
      return true;
    }

    this.rateLimiters.set(clientId, limiter);
    return false;
  }

  /**
   * 处理限流拒绝
   */
  handleRateLimit(
    client: Socket,
    event: string,
    clientType: 'player' | 'agent',
    clientInfo?: ClientInfo,
  ): void {
    const now = Date.now();
    const lastNotice = this.rateLimitNoticeAt.get(client.id) ?? 0;
    const shouldNotify = now - lastNotice >= this.noticeCooldownMs;

    const role = this.getRoleLabel(clientInfo?.role, clientType);

    // 记录限流指标
    rateLimitRejectedCounter.inc({
      type: 'ws',
      endpoint: event,
      user_role: role,
    });

    if (!shouldNotify) {
      return;
    }

    // 发送限流通知
    try {
      client.emit('error', { code: 429001, msg: '发送频率过快', event });
    } catch (error) {
      this.logger.warn(
        `发送限流提示失败: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.rateLimitNoticeAt.set(client.id, now);
    this.logger.warn('RateLimit', {
      event,
      clientId: client.id,
      uid: clientInfo?.userId,
      role,
      sessionId: clientInfo?.sessionId,
    });
  }

  /**
   * 获取角色标签
   */
  private getRoleLabel(
    rawRole: unknown,
    clientType: 'player' | 'agent',
  ): string {
    if (typeof rawRole === 'string' && rawRole.trim()) {
      return rawRole.trim().toLowerCase();
    }
    return clientType === 'agent' ? 'agent' : 'player';
  }

  /**
   * 清理客户端的限流状态
   */
  clearClient(clientId: string): void {
    this.rateLimiters.delete(clientId);
    this.rateLimitNoticeAt.delete(clientId);
  }

  /**
   * 获取当前限流器数量
   */
  getRateLimiterCount(): number {
    return this.rateLimiters.size;
  }

  /**
   * 清理过期的限流器（可定期调用，防止内存泄漏）
   */
  cleanupStaleEntries(maxIdleMs: number = 600000): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [clientId, limiter] of this.rateLimiters) {
      if (now - limiter.lastRefill > maxIdleMs) {
        this.rateLimiters.delete(clientId);
        this.rateLimitNoticeAt.delete(clientId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`清理了 ${cleanedCount} 个过期的限流器`);
    }

    return cleanedCount;
  }
}
