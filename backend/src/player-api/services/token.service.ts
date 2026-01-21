import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TokenPayload,
  TokenVerifyResult,
  TokenErrorCode,
  TokenErrorMessages,
} from '../dto/token.dto';
import * as jwt from 'jsonwebtoken';

/**
 * Token 验证服务
 * 用于验证游戏服务器生成的 JWT Token
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 验证 Token
   * @param token JWT Token
   * @returns 验证结果
   */
  async verifyToken(token: string): Promise<TokenVerifyResult> {
    try {
      // 1. 先解码获取 gameid（不验证签名）
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded || !decoded.gameid) {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: TokenErrorMessages[TokenErrorCode.INVALID_TOKEN],
        };
      }

      // 2. 查询游戏配置获取密钥（使用 gameCode 匹配）
      const game = await this.prisma.game.findFirst({
        where: {
          gameCode: decoded.gameid,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          gameCode: true,
          enabled: true,
          playerApiEnabled: true,
          playerApiSecret: true,
        },
      });

      if (!game) {
        return {
          valid: false,
          errorCode: TokenErrorCode.GAME_NOT_FOUND,
          errorMessage: TokenErrorMessages[TokenErrorCode.GAME_NOT_FOUND],
        };
      }

      if (!game.enabled) {
        return {
          valid: false,
          errorCode: TokenErrorCode.GAME_DISABLED,
          errorMessage: TokenErrorMessages[TokenErrorCode.GAME_DISABLED],
        };
      }

      if (!game.playerApiEnabled) {
        return {
          valid: false,
          errorCode: TokenErrorCode.API_DISABLED,
          errorMessage: TokenErrorMessages[TokenErrorCode.API_DISABLED],
        };
      }

      // 3. 使用游戏密钥验证 Token
      const secret = game.playerApiSecret || '';
      try {
        const payload = jwt.verify(token, secret) as TokenPayload;

        // 4. 验证必要字段
        if (!payload.gameid || !payload.areaid || !payload.uid) {
          return {
            valid: false,
            errorCode: TokenErrorCode.INVALID_TOKEN,
            errorMessage: 'Token缺少必要字段(gameid/areaid/uid)',
          };
        }

        return {
          valid: true,
          payload,
          game: {
            id: game.id,
            name: game.name,
          },
        };
      } catch (jwtError: any) {
        if (jwtError.name === 'TokenExpiredError') {
          return {
            valid: false,
            errorCode: TokenErrorCode.EXPIRED_TOKEN,
            errorMessage: TokenErrorMessages[TokenErrorCode.EXPIRED_TOKEN],
          };
        }
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: TokenErrorMessages[TokenErrorCode.INVALID_TOKEN],
        };
      }
    } catch (error) {
      return {
        valid: false,
        errorCode: TokenErrorCode.INVALID_TOKEN,
        errorMessage: TokenErrorMessages[TokenErrorCode.INVALID_TOKEN],
      };
    }
  }

  /**
   * 生成测试 Token（仅用于开发测试）
   */
  generateTestToken(
    gameid: string,
    areaid: string,
    uid: string,
    playerName: string,
    secret: string,
    expiresIn: string = '5m',
  ): string {
    const payload: TokenPayload = {
      gameid,
      areaid,
      uid,
      playerName,
    };
    return jwt.sign(payload, secret, { expiresIn });
  }

  /**
   * 生成会话 Token
   * 用于签名认证后，后续请求可以使用此 token 代替重复签名
   * 有效期：3小时
   */
  generateSessionToken(
    gameid: string,
    areaid: string,
    uid: string,
    playerName?: string,
  ): { token: string; expireAt: number } {
    const sessionSecret = this.configService.get('SESSION_TOKEN_SECRET', 'game-ai-session-secret');
    const expiresInSeconds = 3 * 60 * 60; // 3小时
    const expireAt = Date.now() + expiresInSeconds * 1000;

    const payload = {
      gameid,
      areaid,
      uid,
      playerName,
      type: 'session', // 标记为会话token
    };

    const token = jwt.sign(payload, sessionSecret, { expiresIn: expiresInSeconds });
    return { token, expireAt };
  }

  /**
   * 生成 WebSocket Token
   * 用于 Socket.IO auth 字段验证
   * 有效期：1小时
   */
  generateWsToken(
    gameid: string,
    areaid: string,
    uid: string,
    playerName?: string,
  ): { token: string; expireAt: number } {
    const wsSecret = this.configService.get('WS_TOKEN_SECRET', 'game-ai-ws-secret');
    const expiresInSeconds = this.configService.get('PLAYER_API_WS_TOKEN_TTL', 3600); // 默认1小时
    const expireAt = Date.now() + expiresInSeconds * 1000;

    const payload = {
      gameid,
      areaid,
      uid,
      playerName,
      type: 'ws', // 标记为WebSocket token
    };

    const token = jwt.sign(payload, wsSecret, { expiresIn: expiresInSeconds });
    return { token, expireAt };
  }

  /**
   * 验证 WebSocket Token
   */
  verifyWsToken(token: string): TokenVerifyResult {
    // 检查 token 是否为空
    if (!token || token.trim() === '') {
      return {
        valid: false,
        errorCode: TokenErrorCode.INVALID_TOKEN,
        errorMessage: 'wsToken为空',
      };
    }

    try {
      const wsSecret = this.configService.get('WS_TOKEN_SECRET', 'game-ai-ws-secret');
      const payload = jwt.verify(token, wsSecret) as TokenPayload & { type?: string };

      // 验证是否为ws token
      if (payload.type !== 'ws') {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: `Token类型错误: 期望ws, 实际${payload.type || '无'}`,
        };
      }

      // 验证必要字段
      if (!payload.gameid || !payload.areaid || !payload.uid) {
        const missing: string[] = [];
        if (!payload.gameid) missing.push('gameid');
        if (!payload.areaid) missing.push('areaid');
        if (!payload.uid) missing.push('uid');
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: `Token缺少必要字段: ${missing.join(', ')}`,
        };
      }

      return {
        valid: true,
        payload: {
          gameid: payload.gameid,
          areaid: payload.areaid,
          uid: payload.uid,
          playerName: payload.playerName,
        },
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        // 解析过期时间
        const decoded = jwt.decode(token) as any;
        const expiredAt = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : '未知';
        return {
          valid: false,
          errorCode: TokenErrorCode.EXPIRED_TOKEN,
          errorMessage: `Token已过期(过期时间: ${expiredAt})`,
        };
      }
      if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: `JWT解析失败: ${error.message}`,
        };
      }
      if (error.name === 'NotBeforeError') {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: `Token尚未生效: ${error.message}`,
        };
      }
      return {
        valid: false,
        errorCode: TokenErrorCode.INVALID_TOKEN,
        errorMessage: `Token验证异常: ${error.message || '未知错误'}`,
      };
    }
  }

  /**
   * 生成上传 Token
   * 用于图片上传接口验证
   * 有效期：10分钟（比wsToken短，减少泄漏风险）
   */
  generateUploadToken(
    gameid: string,
    areaid: string,
    uid: string,
  ): { token: string; expireAt: number } {
    const uploadSecret = this.configService.get('UPLOAD_TOKEN_SECRET', 'game-ai-upload-secret');
    const expiresInSeconds = Number(this.configService.get('PLAYER_API_UPLOAD_TOKEN_TTL', 600)) || 600; // 默认10分钟
    const expireAt = Date.now() + expiresInSeconds * 1000;
    console.log('[TokenService] 生成uploadToken, TTL:', expiresInSeconds, '秒, 过期时间:', new Date(expireAt).toISOString());

    const payload = {
      gameid,
      areaid,
      uid,
      type: 'upload', // 标记为上传token
    };

    const token = jwt.sign(payload, uploadSecret, { expiresIn: expiresInSeconds });
    return { token, expireAt };
  }

  /**
   * 验证上传 Token
   */
  verifyUploadToken(token: string): TokenVerifyResult {
    try {
      const uploadSecret = this.configService.get('UPLOAD_TOKEN_SECRET', 'game-ai-upload-secret');
      const payload = jwt.verify(token, uploadSecret) as TokenPayload & { type?: string };

      // 验证是否为upload token
      if (payload.type !== 'upload') {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: '无效的上传Token类型',
        };
      }

      // 验证必要字段
      if (!payload.gameid || !payload.areaid || !payload.uid) {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: 'Token缺少必要字段',
        };
      }

      return {
        valid: true,
        payload: {
          gameid: payload.gameid,
          areaid: payload.areaid,
          uid: payload.uid,
        },
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          errorCode: TokenErrorCode.EXPIRED_TOKEN,
          errorMessage: TokenErrorMessages[TokenErrorCode.EXPIRED_TOKEN],
        };
      }
      return {
        valid: false,
        errorCode: TokenErrorCode.INVALID_TOKEN,
        errorMessage: TokenErrorMessages[TokenErrorCode.INVALID_TOKEN],
      };
    }
  }

  /**
   * 验证会话 Token
   */
  verifySessionToken(token: string): TokenVerifyResult {
    try {
      const sessionSecret = this.configService.get('SESSION_TOKEN_SECRET', 'game-ai-session-secret');
      const payload = jwt.verify(token, sessionSecret) as TokenPayload & { type?: string };

      // 验证是否为会话token
      if (payload.type !== 'session') {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: '无效的会话Token类型',
        };
      }

      // 验证必要字段
      if (!payload.gameid || !payload.areaid || !payload.uid) {
        return {
          valid: false,
          errorCode: TokenErrorCode.INVALID_TOKEN,
          errorMessage: 'Token缺少必要字段',
        };
      }

      return {
        valid: true,
        payload: {
          gameid: payload.gameid,
          areaid: payload.areaid,
          uid: payload.uid,
          playerName: payload.playerName,
        },
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          errorCode: TokenErrorCode.EXPIRED_TOKEN,
          errorMessage: TokenErrorMessages[TokenErrorCode.EXPIRED_TOKEN],
        };
      }
      return {
        valid: false,
        errorCode: TokenErrorCode.INVALID_TOKEN,
        errorMessage: TokenErrorMessages[TokenErrorCode.INVALID_TOKEN],
      };
    }
  }
}
