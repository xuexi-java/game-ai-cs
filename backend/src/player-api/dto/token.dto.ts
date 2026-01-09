import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConnectAction } from './connect.dto';

/**
 * Token 认证请求 DTO
 * 用于简化游戏方接入，只需传递一个 JWT token
 */
export class TokenConnectDto {
  @ApiProperty({ description: 'JWT Token (由游戏服务器生成)' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ description: '操作类型: new 或 resume', enum: ConnectAction })
  @IsEnum(ConnectAction)
  @IsOptional()
  action?: ConnectAction;

  @ApiPropertyOptional({ description: '工单号(action=resume时使用)' })
  @IsString()
  @IsOptional()
  tid?: string;

  @ApiPropertyOptional({ description: '问题类型ID(action=new时使用)' })
  @IsString()
  @IsOptional()
  issueType?: string;

  @ApiPropertyOptional({ description: '问题描述' })
  @IsString()
  @IsOptional()
  question?: string;

  @ApiPropertyOptional({ description: '确认关闭旧工单' })
  @IsOptional()
  confirmClose?: boolean;

  @ApiPropertyOptional({ description: '幂等请求ID' })
  @IsString()
  @IsOptional()
  requestId?: string;
}

/**
 * Token Payload 结构
 * 游戏服务器生成 JWT 时需要包含的字段
 */
export interface TokenPayload {
  /** 游戏ID */
  gameid: string;
  /** 区服ID */
  areaid: string;
  /** 玩家UID */
  uid: string;
  /** 玩家昵称 */
  playerName?: string;
  /** 签发时间 */
  iat?: number;
  /** 过期时间 */
  exp?: number;
}

/**
 * Token 验证结果
 */
export interface TokenVerifyResult {
  valid: boolean;
  payload?: TokenPayload;
  game?: {
    id: string;
    name: string;
  };
  errorCode?: TokenErrorCode;
  errorMessage?: string;
}

/**
 * Token 错误码
 */
export enum TokenErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_DISABLED = 'GAME_DISABLED',
  API_DISABLED = 'API_DISABLED',
}

/**
 * Token 错误消息
 */
export const TokenErrorMessages: Record<TokenErrorCode, string> = {
  [TokenErrorCode.INVALID_TOKEN]: 'Token无效',
  [TokenErrorCode.EXPIRED_TOKEN]: 'Token已过期',
  [TokenErrorCode.GAME_NOT_FOUND]: '游戏不存在',
  [TokenErrorCode.GAME_DISABLED]: '游戏已禁用',
  [TokenErrorCode.API_DISABLED]: '玩家API已禁用',
};
