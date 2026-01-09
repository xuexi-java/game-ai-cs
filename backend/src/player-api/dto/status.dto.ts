import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, ValidateIf } from 'class-validator';

/**
 * 获取状态请求DTO
 * 支持三种认证方式（优先级从高到低）：
 * 1. 会话Token认证：sessionToken - 由后端生成，用于后续请求
 * 2. JWT Token认证：token - 由游戏服务器生成
 * 3. 签名认证：gameid/uid/areaid/ts/nonce/sign
 */
export class PlayerStatusDto {
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
 * 问题类型项
 */
export class QuestItem {
  @ApiProperty({ description: '问题类型ID' })
  id: string;

  @ApiProperty({ description: '问题类型名称' })
  name: string;

  @ApiPropertyOptional({ description: '图标' })
  icon?: string;

  @ApiProperty({ description: '路由模式: AI / HUMAN' })
  routeMode: string;
}

/**
 * 获取状态响应数据
 */
export class PlayerStatusData {
  @ApiPropertyOptional({ description: '最后一个未关闭工单号' })
  lasttid: string | null;

  @ApiPropertyOptional({ description: '最后工单状态' })
  lastStatus: string | null;

  @ApiPropertyOptional({ description: '最后工单描述' })
  lastDescription: string | null;

  @ApiPropertyOptional({ description: '最后工单创建时间' })
  lastCreatedAt: string | null;

  @ApiPropertyOptional({ description: '最后工单问题类型' })
  lastIssueType: string | null;

  @ApiProperty({ description: '是否已有客服接入' })
  isAgentConnected: boolean;

  @ApiProperty({ description: '问题类型列表', type: [QuestItem] })
  questList: QuestItem[];

  @ApiProperty({ description: '客服是否可用（工作时间内且有在线客服）' })
  agentAvailable: boolean;

  @ApiProperty({ description: '客服工作时间' })
  workingHours: string;

  @ApiPropertyOptional({ description: '离线原因：非工作时间 | 暂无在线客服' })
  offlineReason?: string;

  @ApiPropertyOptional({ description: '会话Token（用于后续API调用和WebSocket连接）' })
  sessionToken?: string;

  @ApiPropertyOptional({ description: '会话Token过期时间（Unix时间戳毫秒）' })
  sessionTokenExpireAt?: number;
}

/**
 * 获取状态响应
 */
export class PlayerStatusResponse {
  @ApiProperty({ description: '是否成功' })
  result: boolean;

  @ApiPropertyOptional({ description: '响应数据' })
  data?: PlayerStatusData;

  @ApiPropertyOptional({ description: '错误信息' })
  error?: string;

  @ApiPropertyOptional({ description: '错误码' })
  errorCode?: string;
}
