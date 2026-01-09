import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Nonce去重服务
 * 用于防止重放攻击
 */
@Injectable()
export class NonceService {
  // Nonce TTL: 5分钟
  private readonly NONCE_TTL = 300;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  /**
   * 生成Nonce缓存键
   */
  private getNonceKey(
    gameid: string,
    areaid: string,
    uid: string,
    nonce: string,
  ): string {
    return `player:nonce:${gameid}:${areaid}:${uid}:${nonce}`;
  }

  /**
   * 检查Nonce是否已使用
   * @returns true 表示Nonce已使用（重复请求）
   */
  async isNonceUsed(
    gameid: string,
    areaid: string,
    uid: string,
    nonce: string,
  ): Promise<boolean> {
    const key = this.getNonceKey(gameid, areaid, uid, nonce);
    const exists = await this.cacheManager.get(key);
    return !!exists;
  }

  /**
   * 标记Nonce为已使用
   */
  async markNonceUsed(
    gameid: string,
    areaid: string,
    uid: string,
    nonce: string,
  ): Promise<void> {
    const key = this.getNonceKey(gameid, areaid, uid, nonce);
    await this.cacheManager.set(key, '1', this.NONCE_TTL * 1000);
  }

  /**
   * 检查并标记Nonce
   * @returns true 表示Nonce有效（首次使用）
   */
  async checkAndMarkNonce(
    gameid: string,
    areaid: string,
    uid: string,
    nonce: string,
  ): Promise<boolean> {
    const isUsed = await this.isNonceUsed(gameid, areaid, uid, nonce);
    if (isUsed) {
      return false;
    }
    await this.markNonceUsed(gameid, areaid, uid, nonce);
    return true;
  }
}
