import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  ValidateIf,
} from 'class-validator';

/**
 * Bootstrap 请求 DTO (原 connect + status 合并)
 * 支持签名认证：gameid/uid/areaid/nonce/sign
 * nonce 为游戏配置中的固定值
 */
export class PlayerConnectDto {
  // ========== 签名认证方式 ==========
  @ApiPropertyOptional({ description: '游戏ID (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken)
  @IsString()
  gameid?: string;

  @ApiPropertyOptional({ description: '玩家UID (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken)
  @IsString()
  uid?: string;

  @ApiPropertyOptional({ description: '区服号 (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken)
  @IsString()
  areaid?: string;

  @ApiPropertyOptional({ description: '固定Nonce (签名认证时必填，从游戏配置获取)' })
  @ValidateIf((o) => !o.sessionToken)
  @IsString()
  nonce?: string;

  @ApiPropertyOptional({ description: '签名 (签名认证时必填)' })
  @ValidateIf((o) => !o.sessionToken)
  @IsString()
  sign?: string;

  @ApiPropertyOptional({ description: '玩家昵称' })
  @IsString()
  @IsOptional()
  playerName?: string;

  @ApiPropertyOptional({ description: '语言代码 (如 zh-CN, en-US, ja-JP)' })
  @IsString()
  @IsOptional()
  language?: string;
}

/**
 * 问题分类项
 */
export class QuestItem {
  @ApiProperty({ description: '分类ID' })
  id: string;

  @ApiProperty({ description: '分类名称' })
  name: string;

  @ApiPropertyOptional({ description: '图标' })
  icon?: string;

  @ApiProperty({ description: '路由模式: AI / HUMAN' })
  routeMode: string;
}

/**
 * 历史消息项
 */
export class HistoryMessageItem {
  @ApiProperty({ description: '消息ID' })
  id: string;

  @ApiProperty({ description: '消息内容' })
  content: string;

  @ApiProperty({ description: '发送者类型: PLAYER/AI/AGENT/SYSTEM' })
  senderType: string;

  @ApiProperty({ description: '消息类型: TEXT/IMAGE' })
  messageType: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;
}

/**
 * 活跃工单信息
 */
export class ActiveTicketInfo {
  @ApiProperty({ description: '工单号' })
  tid: string;

  @ApiProperty({ description: '工单状态' })
  status: string;

  @ApiPropertyOptional({ description: '工单描述' })
  description?: string;

  @ApiProperty({ description: '创建时间' })
  createdAt: string;

  @ApiPropertyOptional({ description: '问题类型名称' })
  issueType?: string;

  @ApiProperty({ description: '是否有客服接入' })
  isAgentConnected: boolean;
}

/**
 * Bootstrap 响应数据 (新设计)
 */
export class PlayerConnectData {
  @ApiProperty({ description: 'WebSocket连接地址 (不含token)' })
  wsUrl: string;

  @ApiProperty({ description: 'WebSocket Token (用于 auth 字段)' })
  wsToken: string;

  @ApiProperty({ description: '上传Token (用于图片上传)' })
  uploadToken: string;

  @ApiProperty({ description: '问题分类列表', type: [QuestItem] })
  questList: QuestItem[];

  @ApiProperty({ description: '客服是否可用' })
  agentAvailable: boolean;

  @ApiPropertyOptional({ description: '客服不可用原因 (如非工作时间/暂无在线客服)' })
  offlineReason?: string;

  @ApiProperty({ description: '工作时间说明' })
  workingHours: string;

  @ApiPropertyOptional({ description: '活跃工单 (如有未完成工单)' })
  activeTicket: ActiveTicketInfo | null;

  @ApiProperty({ description: '历史消息 (如有活跃工单)', type: [HistoryMessageItem] })
  history: HistoryMessageItem[];

  @ApiProperty({ description: '首屏消息 (如无活跃工单)', type: [HistoryMessageItem] })
  bootstrapMessages: HistoryMessageItem[];

  @ApiPropertyOptional({ description: '确认的语言代码' })
  language?: string;
}

/**
 * Bootstrap 响应
 */
export class PlayerConnectResponse {
  @ApiProperty({ description: '是否成功' })
  result: boolean;

  @ApiPropertyOptional({ description: '响应数据' })
  data?: PlayerConnectData;

  @ApiPropertyOptional({ description: '错误信息' })
  error?: string;

  @ApiPropertyOptional({ description: '错误码' })
  errorCode?: string;
}

/**
 * 连接错误码
 */
export enum ConnectErrorCode {
  INVALID_SIGN = 'INVALID_SIGN',
  NONCE_NOT_CONFIGURED = 'NONCE_NOT_CONFIGURED',
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_DISABLED = 'GAME_DISABLED',
  API_DISABLED = 'API_DISABLED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * 连接错误消息
 */
export const ConnectErrorMessages: Record<ConnectErrorCode, string> = {
  [ConnectErrorCode.INVALID_SIGN]: '签名验证失败',
  [ConnectErrorCode.NONCE_NOT_CONFIGURED]: '游戏未配置Nonce',
  [ConnectErrorCode.GAME_NOT_FOUND]: '游戏不存在',
  [ConnectErrorCode.GAME_DISABLED]: '游戏已禁用',
  [ConnectErrorCode.API_DISABLED]: '玩家API已禁用',
  [ConnectErrorCode.INTERNAL_ERROR]: '服务器内部错误',
};

// ========== 旧版兼容 (将逐步废弃) ==========

/**
 * @deprecated 使用 PlayerConnectDto 代替
 */
export enum ConnectAction {
  NEW = 'new',
  RESUME = 'resume',
}

/**
 * WebSocket 事件相关错误码
 */
export enum WsErrorCode {
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  TICKET_CLOSED = 'TICKET_CLOSED',
  TICKET_NOT_YOURS = 'TICKET_NOT_YOURS',
  ISSUE_TYPE_REQUIRED = 'ISSUE_TYPE_REQUIRED',
  ISSUE_TYPE_NOT_FOUND = 'ISSUE_TYPE_NOT_FOUND',
  CONFIRM_CLOSE_REQUIRED = 'CONFIRM_CLOSE_REQUIRED',
  NO_TICKET_BOUND = 'NO_TICKET_BOUND',
  READ_ONLY_TICKET = 'READ_ONLY_TICKET',
  INVALID_TOKEN = 'INVALID_TOKEN',
}

export const WsErrorMessages: Record<WsErrorCode, string> = {
  [WsErrorCode.TICKET_NOT_FOUND]: '工单不存在',
  [WsErrorCode.TICKET_CLOSED]: '工单已关闭',
  [WsErrorCode.TICKET_NOT_YOURS]: '工单不属于当前用户',
  [WsErrorCode.ISSUE_TYPE_REQUIRED]: '问题类型必填',
  [WsErrorCode.ISSUE_TYPE_NOT_FOUND]: '问题类型不存在',
  [WsErrorCode.CONFIRM_CLOSE_REQUIRED]: '您有未完成的工单，请确认是否关闭旧工单',
  [WsErrorCode.NO_TICKET_BOUND]: '未绑定工单',
  [WsErrorCode.READ_ONLY_TICKET]: '只读工单，不可发消息',
  [WsErrorCode.INVALID_TOKEN]: 'Token无效',
};
