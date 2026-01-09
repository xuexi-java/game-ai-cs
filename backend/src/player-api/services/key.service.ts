import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Key数据结构
 */
export interface KeyData {
  gameid: string;
  uid: string;
  areaid: string;
  tid: string;
  createdAt: number;
}

/**
 * 连接Key服务
 * 用于生成和验证WebSocket连接凭证
 */
@Injectable()
export class KeyService {
  // Key TTL: 1小时
  private readonly KEY_TTL: number;
  // 幂等请求缓存TTL: 60秒
  private readonly REQUEST_CACHE_TTL = 60;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    this.KEY_TTL = this.configService.get('PLAYER_API_KEY_TTL', 3600);
  }

  /**
   * 生成连接Key
   * 格式: 前缀 + UUID
   */
  generateKey(): string {
    const prefix = crypto.randomBytes(4).toString('hex');
    const uuid = crypto.randomUUID().replace(/-/g, '');
    return `${prefix}-${uuid}`;
  }

  /**
   * 获取Key缓存键
   */
  private getKeyRedisKey(key: string): string {
    return `player:connect:key:${key}`;
  }

  /**
   * 存储Key
   */
  async storeKey(key: string, data: KeyData): Promise<void> {
    const redisKey = this.getKeyRedisKey(key);
    await this.cacheManager.set(redisKey, JSON.stringify(data), this.KEY_TTL * 1000);
  }

  /**
   * 获取Key数据
   */
  async getKeyData(key: string): Promise<KeyData | null> {
    const redisKey = this.getKeyRedisKey(key);
    const data = await this.cacheManager.get<string>(redisKey);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * 验证Key
   */
  async verifyKey(key: string, tid: string): Promise<{ valid: boolean; data?: KeyData }> {
    const data = await this.getKeyData(key);
    if (!data) {
      return { valid: false };
    }
    if (data.tid !== tid) {
      return { valid: false };
    }
    return { valid: true, data };
  }

  /**
   * 删除Key
   */
  async deleteKey(key: string): Promise<void> {
    const redisKey = this.getKeyRedisKey(key);
    await this.cacheManager.del(redisKey);
  }

  /**
   * 获取Key过期时间
   */
  getKeyExpireAt(): number {
    return Date.now() + this.KEY_TTL * 1000;
  }

  /**
   * 生成WebSocket URL (不含认证参数)
   * 认证通过 Socket.IO 的 auth 字段传递
   */
  generateWsUrl(): string {
    return this.configService.get('WS_URL', 'wss://cs.example.com');
  }

  // ========== 幂等请求缓存 ==========

  /**
   * 获取幂等请求缓存键
   */
  private getRequestCacheKey(
    gameid: string,
    uid: string,
    requestId: string,
  ): string {
    return `player:request:${gameid}:${uid}:${requestId}`;
  }

  /**
   * 获取幂等请求缓存
   */
  async getRequestCache(
    gameid: string,
    uid: string,
    requestId: string,
  ): Promise<{ tid: string; key: string; wsUrl: string; expireAt: number } | null> {
    const cacheKey = this.getRequestCacheKey(gameid, uid, requestId);
    const data = await this.cacheManager.get<string>(cacheKey);
    if (!data) {
      return null;
    }
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * 存储幂等请求缓存
   */
  async storeRequestCache(
    gameid: string,
    uid: string,
    requestId: string,
    data: { tid: string; key: string; wsUrl: string; expireAt: number },
  ): Promise<void> {
    const cacheKey = this.getRequestCacheKey(gameid, uid, requestId);
    await this.cacheManager.set(
      cacheKey,
      JSON.stringify(data),
      this.REQUEST_CACHE_TTL * 1000,
    );
  }

  // ========== 玩家连接状态 ==========

  /**
   * 获取玩家连接状态缓存键
   */
  private getPlayerSocketKey(gameid: string, uid: string): string {
    return `player:socket:${gameid}:${uid}`;
  }

  /**
   * 存储玩家Socket ID
   */
  async storePlayerSocket(
    gameid: string,
    uid: string,
    socketId: string,
  ): Promise<void> {
    const key = this.getPlayerSocketKey(gameid, uid);
    await this.cacheManager.set(key, socketId, 86400 * 1000); // 24小时
  }

  /**
   * 获取玩家当前Socket ID
   */
  async getPlayerSocket(
    gameid: string,
    uid: string,
  ): Promise<string | null> {
    const key = this.getPlayerSocketKey(gameid, uid);
    return await this.cacheManager.get<string>(key) || null;
  }

  /**
   * 删除玩家Socket ID
   */
  async deletePlayerSocket(gameid: string, uid: string): Promise<void> {
    const key = this.getPlayerSocketKey(gameid, uid);
    await this.cacheManager.del(key);
  }
}
