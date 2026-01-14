import {
  IsString,
  IsNumber,
  MinLength,
  MaxLength,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 签名验证基础DTO
 * 支持三种认证方式（优先级从高到低）：
 * 1. 会话Token认证：sessionToken - 由后端生成，用于后续请求
 * 2. JWT Token认证：token - 由游戏服务器生成
 * 3. 签名认证：gameid/uid/areaid/ts/nonce/sign
 */
export class SignBaseDto {
  // ========== 会话 Token 认证方式（最高优先级）==========
  @ApiPropertyOptional({ description: '会话Token (由后端生成，用于后续请求)' })
  @IsString()
  @IsOptional()
  sessionToken?: string;

  // ========== JWT Token 认证方式 ==========
  @ApiPropertyOptional({ description: 'JWT Token (由游戏服务器生成)' })
  @IsString()
  @IsOptional()
  token?: string;

  // ========== 签名认证方式 ==========
  @ApiPropertyOptional({ description: '游戏ID (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken && !o.token)
  @IsString()
  gameid?: string;

  @ApiPropertyOptional({ description: '玩家UID (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken && !o.token)
  @IsString()
  uid?: string;

  @ApiPropertyOptional({ description: '区服号 (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken && !o.token)
  @IsString()
  areaid?: string;

  @ApiPropertyOptional({ description: '时间戳(毫秒) (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken && !o.token)
  @IsNumber()
  ts?: number;

  @ApiPropertyOptional({ description: '随机串 (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken && !o.token)
  @IsString()
  nonce?: string;

  @ApiPropertyOptional({ description: '签名 (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken && !o.token)
  @IsString()
  sign?: string;
}

/**
 * 签名验证结果
 */
export interface SignVerifyResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  game?: {
    id: string;
    name: string;
    playerApiSecret: string;
    playerApiEnabled: boolean;
  };
}

/**
 * 签名错误码
 */
export enum SignErrorCode {
  INVALID_SIGN = 'INVALID_SIGN',
  SIGN_EXPIRED = 'SIGN_EXPIRED',
  EXPIRED_REQUEST = 'EXPIRED_REQUEST',
  DUPLICATE_NONCE = 'DUPLICATE_NONCE',
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_DISABLED = 'GAME_DISABLED',
  API_DISABLED = 'API_DISABLED',
}

/**
 * 签名错误消息
 */
export const SignErrorMessages: Record<SignErrorCode, string> = {
  [SignErrorCode.INVALID_SIGN]: '签名验证失败',
  [SignErrorCode.SIGN_EXPIRED]: '签名已过期，请重新进入',
  [SignErrorCode.EXPIRED_REQUEST]: '请求已过期',
  [SignErrorCode.DUPLICATE_NONCE]: '重复请求',
  [SignErrorCode.GAME_NOT_FOUND]: '游戏不存在',
  [SignErrorCode.GAME_DISABLED]: '游戏已禁用',
  [SignErrorCode.API_DISABLED]: '玩家API已禁用',
};
