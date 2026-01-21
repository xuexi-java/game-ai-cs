import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NonceService } from '../services/nonce.service';
import { TokenService } from '../services/token.service';
import { EncryptionService } from '../../common/encryption/encryption.service';
import { SignErrorCode, SignErrorMessages } from '../dto/sign.dto';
import * as crypto from 'crypto';

/**
 * 签名验证守卫
 * 支持三种认证方式（优先级从高到低）：
 * 1. 会话Token认证：sessionToken - 由后端生成，用于后续请求
 * 2. JWT Token认证：token - 由游戏服务器生成
 * 3. 签名认证：gameid + uid + areaid + nonce + sign (nonce为游戏配置的固定值)
 */
@Injectable()
export class SignGuard implements CanActivate {
  private readonly logger = new Logger(SignGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly nonceService: NonceService,
    private readonly tokenService: TokenService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const body = request.body;

    // 判断使用哪种认证方式（优先级：sessionToken > token > sign）
    if (body.sessionToken) {
      // 会话 Token 认证方式（由我们后端生成）
      return this.validateSessionToken(request, body.sessionToken);
    } else if (body.token) {
      // JWT Token 认证方式（由游戏服务器生成）
      return this.validateToken(request, body.token);
    } else {
      // 签名认证方式
      return this.validateSign(request, body);
    }
  }

  /**
   * 会话 Token 认证方式
   */
  private async validateSessionToken(request: any, sessionToken: string): Promise<boolean> {
    const result = this.tokenService.verifySessionToken(sessionToken);

    if (!result.valid) {
      throw new UnauthorizedException({
        result: false,
        error: result.errorMessage,
        errorCode: result.errorCode,
      });
    }

    // 查询游戏信息
    const game = await this.prisma.game.findFirst({
      where: {
        name: result.payload!.gameid,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        enabled: true,
        playerApiEnabled: true,
      },
    });

    if (!game || !game.enabled || !game.playerApiEnabled) {
      throw new UnauthorizedException({
        result: false,
        error: '游戏未启用或API未开启',
        errorCode: 'GAME_DISABLED',
      });
    }

    // 将游戏信息和玩家信息挂载到请求对象
    request.game = game;
    request.playerInfo = {
      gameid: result.payload!.gameid,
      uid: result.payload!.uid,
      areaid: result.payload!.areaid,
      playerName: result.payload!.playerName,
    };

    return true;
  }

  /**
   * Token 认证方式
   */
  private async validateToken(request: any, token: string): Promise<boolean> {
    const result = await this.tokenService.verifyToken(token);

    if (!result.valid) {
      throw new UnauthorizedException({
        result: false,
        error: result.errorMessage,
        errorCode: result.errorCode,
      });
    }

    // 将游戏信息和玩家信息挂载到请求对象
    request.game = result.game;
    request.playerInfo = {
      gameid: result.payload!.gameid,
      uid: result.payload!.uid,
      areaid: result.payload!.areaid,
      playerName: result.payload!.playerName,
    };
    request.tokenPayload = result.payload;

    return true;
  }

  /**
   * 签名认证方式
   * 签名公式: sign = md5(gameid|uid|areaid|ts|nonce|secret).toLowerCase()
   * ts 为时间戳(毫秒)，用于签名时效性校验（2小时有效期）
   * nonce 为游戏配置中的固定值 (playerApiNonce)
   */
  private async validateSign(request: any, body: any): Promise<boolean> {
    // 签名有效期：2小时
    const SIGN_EXPIRY_MS = 2 * 60 * 60 * 1000;

    // 1. 验证必填参数
    const { gameid, uid, areaid, ts, nonce, sign } = body;
    if (!gameid || !uid || !areaid || !ts || !nonce || !sign) {
      throw new BadRequestException({
        result: false,
        error: '缺少必填参数 (gameid/uid/areaid/ts/nonce/sign) 或 token',
        errorCode: 'MISSING_PARAMS',
      });
    }

    // 2. 验证签名时效性（ts 必须在 2 小时内）
    const now = Date.now();
    if (Math.abs(now - ts) > SIGN_EXPIRY_MS) {
      this.logger.error(`签名已过期: ts=${ts}, now=${now}, diff=${Math.abs(now - ts)}ms`);
      throw new UnauthorizedException({
        result: false,
        error: '签名已过期，请重新进入',
        errorCode: 'SIGN_EXPIRED',
      });
    }

    // 3. 查询游戏配置
    const game = await this.prisma.game.findFirst({
      where: {
        gameCode: gameid,
        deletedAt: null,
      },
      select: {
        id: true,
        gameCode: true,
        name: true,
        enabled: true,
        playerApiSecret: true,
        playerApiNonce: true,
        playerApiEnabled: true,
      },
    });

    if (!game) {
      throw new UnauthorizedException({
        result: false,
        error: SignErrorMessages[SignErrorCode.GAME_NOT_FOUND],
        errorCode: SignErrorCode.GAME_NOT_FOUND,
      });
    }

    if (!game.enabled) {
      throw new UnauthorizedException({
        result: false,
        error: SignErrorMessages[SignErrorCode.GAME_DISABLED],
        errorCode: SignErrorCode.GAME_DISABLED,
      });
    }

    if (!game.playerApiEnabled) {
      throw new UnauthorizedException({
        result: false,
        error: SignErrorMessages[SignErrorCode.API_DISABLED],
        errorCode: SignErrorCode.API_DISABLED,
      });
    }

    // 4. 验证 nonce 是否与游戏配置一致
    if (!game.playerApiNonce) {
      throw new UnauthorizedException({
        result: false,
        error: '游戏未配置 Nonce',
        errorCode: 'NONCE_NOT_CONFIGURED',
      });
    }

    if (nonce !== game.playerApiNonce) {
      this.logger.error(`Nonce 不匹配: 收到="${nonce}", 期望="${game.playerApiNonce}"`);
      throw new UnauthorizedException({
        result: false,
        error: SignErrorMessages[SignErrorCode.INVALID_SIGN],
        errorCode: SignErrorCode.INVALID_SIGN,
      });
    }

    // 5. 验证签名 (解密 secret 后计算)
    const encryptedSecret = game.playerApiSecret || '';
    let secret: string;
    try {
      secret = this.encryptionService.decrypt(encryptedSecret);
    } catch (decryptError) {
      this.logger.error(`解密 playerApiSecret 失败: ${decryptError.message}`);
      throw new UnauthorizedException({
        result: false,
        error: SignErrorMessages[SignErrorCode.INVALID_SIGN],
        errorCode: SignErrorCode.INVALID_SIGN,
      });
    }

    const expectedSign = this.generateSign(gameid, uid, areaid, ts, nonce, secret);
    if (sign.toLowerCase() !== expectedSign.toLowerCase()) {
      this.logger.error(`签名不匹配: 收到="${sign}", 期望="${expectedSign}", ts=${ts}, secret="${secret.substring(0, 4)}..."`);
      throw new UnauthorizedException({
        result: false,
        error: SignErrorMessages[SignErrorCode.INVALID_SIGN],
        errorCode: SignErrorCode.INVALID_SIGN,
      });
    }

    // 6. 将游戏信息挂载到请求对象
    request.game = game;
    request.playerInfo = { gameid, uid, areaid, ts };

    return true;
  }

  /**
   * 生成签名
   * sign = md5(gameid|uid|areaid|ts|nonce|secret).toLowerCase()
   */
  private generateSign(
    gameid: string,
    uid: string,
    areaid: string,
    ts: number,
    nonce: string,
    secret: string,
  ): string {
    const raw = `${gameid}|${uid}|${areaid}|${ts}|${nonce}|${secret}`;
    return crypto.createHash('md5').update(raw).digest('hex').toLowerCase();
  }
}
