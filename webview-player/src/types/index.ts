// 玩家信息
export interface PlayerInfo {
  gameid: string
  uid: string
  areaid: string
  playerName: string
  language?: string  // 语言代码，如 zh-CN, en-US, ja-JP
  // 远程模式签名字段（由游戏服务器/APK计算后传入）- 必填
  ts: number        // 时间戳(毫秒)，签名时效性校验（2小时有效期）
  nonce: string     // 固定配置值（playerApiNonce）
  sign: string      // 签名 = md5(gameid|uid|areaid|ts|nonce|secret)
}

// API 响应 (新协议)
export interface ApiResponse<T = unknown> {
  result: boolean
  data?: T
  error?: string
  errorCode?: string
}

// 旧版兼容响应
export interface LegacyApiResponse<T = unknown> {
  code: number
  message: string
  data: T
}

// 问题分类项
export interface QuestItem {
  id: string
  name: string
  icon?: string
  routeMode: 'AI' | 'HUMAN'
}

// 历史消息项
export interface HistoryMessageItem {
  id: string
  content: string
  senderType: 'PLAYER' | 'AI' | 'AGENT' | 'SYSTEM'
  messageType: 'TEXT' | 'IMAGE'
  createdAt: string
}

// 活跃工单信息
export interface ActiveTicketInfo {
  tid: string
  status: 'IN_PROGRESS' | 'WAITING' | 'RESOLVED'
  description?: string
  createdAt: string
  issueType?: string
  isAgentConnected: boolean
}

// 兼容别名
export type TicketInfo = ActiveTicketInfo

// Bootstrap 响应数据 (新协议)
export interface PlayerConnectData {
  wsUrl: string
  wsToken: string
  uploadToken: string
  questList: QuestItem[]
  agentAvailable: boolean
  offlineReason?: string  // 客服不可用原因
  workingHours: string
  activeTicket: ActiveTicketInfo | null
  history: HistoryMessageItem[]
  bootstrapMessages: HistoryMessageItem[]
  language?: string  // 确认的语言代码
}

// 旧版玩家状态响应 (兼容)
export interface PlayerStatusData {
  lasttid: string | null
  lastStatus: string | null
  lastDescription: string | null
  lastCreatedAt: string | null
  lastIssueType: string | null
  isAgentConnected: boolean
  questList: QuestItem[]
  agentAvailable: boolean
  workingHours: string
  offlineReason?: string
  sessionToken?: string
  sessionTokenExpireAt?: number
}

// 消息发送者类型
export type MessageSender = 'SYSTEM' | 'AI' | 'AGENT' | 'PLAYER'

// 消息类型
export type MessageType = 'TEXT' | 'IMAGE' | 'MENU' | 'TYPING'

// 消息状态
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed'

// 菜单项
export interface MenuItem {
  id: string
  label: string
}

// 菜单内容
export interface MenuContent {
  title: string
  items: MenuItem[]
}

// 消息
export interface Message {
  clientMsgId: string
  sender: MessageSender
  type: MessageType
  content: string | MenuContent
  status?: MessageStatus
  timestamp?: number
}

// 输入模式
export type InputMode = 'LOCKED' | 'CHAT'

// Native Bridge 接口（远程模式 - 简化为 2 个方法）
export interface NativeBridge {
  getPlayerInfo(): PlayerInfo | Promise<PlayerInfo>
  close(): void
}

// WebSocket 收到的消息
export interface WsMessage {
  msgId: string
  sender: MessageSender
  type: MessageType
  content: string | MenuContent
  timestamp: number
}

// WebSocket 事件类型

// 连接就绪事件数据
export interface WsConnectionReadyData {
  gameid?: string
  areaid?: string
  uid?: string
  playerName?: string
  tid?: string
  sessionId?: string  // 会话ID（用于评价提交）
  status?: string
  isReadOnly?: boolean
  history?: { messages: HistoryMessageItem[]; hasMore: boolean }
}

// 工单创建成功事件数据
export interface WsTicketCreatedData {
  tid: string
  sessionId?: string  // 会话ID（用于评价提交）
  status: string
}

// 消息 ack 事件数据
export interface WsMessageAckData {
  clientMsgId: string
  id: string
  status: 'delivered'
  timestamp: string
}

// 消息接收事件数据
export interface WsMessageReceiveData {
  sessionId: string
  message: {
    id: string
    content: string
    senderType: MessageSender
    messageType: MessageType
    createdAt: string
  }
}

// 转人工结果事件数据
export interface WsTransferResultData {
  success: boolean
  queuePosition?: number
  waitTime?: number
  error?: string
  message?: string
  ticketNo?: string
  convertedToTicket?: boolean
}

// 排队更新事件数据
export interface WsQueueUpdateData {
  queuePosition: number
  waitTime?: number
}

// 客服接入事件数据
export interface WsAgentAssignedData {
  agentId: string
  agentName: string
}

// 工单状态更新事件数据
export interface WsTicketUpdateData {
  tid?: string
  sessionId?: string  // 会话ID（用于评价提交）
  status: string
  closeReason?: string
  closedBy?: 'PLAYER' | 'AGENT' | 'SYSTEM'
}

// 输入状态事件数据
export interface WsTypingStatusData {
  sessionId: string
  senderType: 'AGENT' | 'PLAYER'
  isTyping: boolean
}

// 被踢下线事件数据
export interface WsKickedData {
  reason: string
}

// 历史消息加载完成事件数据
export interface WsHistoryLoadedData {
  messages: HistoryMessageItem[]
  hasMore: boolean
}

// 错误事件数据
export interface WsErrorData {
  code: string
  message: string
  data?: unknown
}

// WebSocket 错误码（与后端保持一致）
export enum WsErrorCode {
  // Token 相关
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_MISSING = 'TOKEN_MISSING',
  TOKEN_MALFORMED = 'TOKEN_MALFORMED',

  // 游戏相关
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_DISABLED = 'GAME_DISABLED',
  API_DISABLED = 'API_DISABLED',

  // 工单相关
  TICKET_NOT_FOUND = 'TICKET_NOT_FOUND',
  TICKET_CLOSED = 'TICKET_CLOSED',
  TICKET_NOT_YOURS = 'TICKET_NOT_YOURS',
  NO_TICKET_BOUND = 'NO_TICKET_BOUND',
  READ_ONLY_TICKET = 'READ_ONLY_TICKET',
  CONFIRM_CLOSE_REQUIRED = 'CONFIRM_CLOSE_REQUIRED',

  // 问题类型相关
  ISSUE_TYPE_REQUIRED = 'ISSUE_TYPE_REQUIRED',
  ISSUE_TYPE_NOT_FOUND = 'ISSUE_TYPE_NOT_FOUND',

  // 连接相关
  CONNECT_FAILED = 'CONNECT_FAILED',
  RATE_LIMITED = 'RATE_LIMITED',

  // 服务器错误
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// 用户友好的错误消息（中文）
export const WsErrorMessages: Record<string, string> = {
  [WsErrorCode.INVALID_TOKEN]: '连接凭证无效，请刷新页面重试',
  [WsErrorCode.TOKEN_EXPIRED]: '连接已过期，请刷新页面',
  [WsErrorCode.TOKEN_MISSING]: '缺少连接凭证，请重新进入',
  [WsErrorCode.TOKEN_MALFORMED]: '连接凭证格式错误，请重新进入',
  [WsErrorCode.GAME_NOT_FOUND]: '游戏配置不存在',
  [WsErrorCode.GAME_DISABLED]: '该游戏的客服功能已暂停',
  [WsErrorCode.API_DISABLED]: '该游戏的玩家接口已关闭',
  [WsErrorCode.TICKET_NOT_FOUND]: '工单不存在',
  [WsErrorCode.TICKET_CLOSED]: '工单已关闭',
  [WsErrorCode.TICKET_NOT_YOURS]: '工单不属于当前用户',
  [WsErrorCode.NO_TICKET_BOUND]: '未绑定工单',
  [WsErrorCode.READ_ONLY_TICKET]: '只读工单，不可发消息',
  [WsErrorCode.CONFIRM_CLOSE_REQUIRED]: '您有未完成的工单，请确认是否关闭旧工单',
  [WsErrorCode.ISSUE_TYPE_REQUIRED]: '请选择问题类型',
  [WsErrorCode.ISSUE_TYPE_NOT_FOUND]: '问题类型不存在',
  [WsErrorCode.CONNECT_FAILED]: '连接失败，请检查网络后重试',
  [WsErrorCode.RATE_LIMITED]: '请求过于频繁，请稍后重试',
  [WsErrorCode.INTERNAL_ERROR]: '服务器内部错误，请稍后重试',
}

/**
 * 获取用户友好的错误消息
 * @param code 错误码
 * @param fallbackMessage 后备消息
 */
export function getErrorMessage(code?: string, fallbackMessage?: string): string {
  if (code && WsErrorMessages[code]) {
    return WsErrorMessages[code]
  }
  return fallbackMessage || '连接失败，请稍后重试'
}

/**
 * 判断是否是需要刷新 token 的错误
 */
export function isTokenError(code?: string): boolean {
  return code === WsErrorCode.TOKEN_EXPIRED ||
    code === WsErrorCode.INVALID_TOKEN ||
    code === WsErrorCode.TOKEN_MISSING ||
    code === WsErrorCode.TOKEN_MALFORMED
}

// 分类 (静态，仅作为后备)
export const CATEGORIES: MenuContent = {
  title: '您好，这里是客服中心。\n请选择您遇到的问题类型：',
  items: [
    { id: 'account', label: '账号与充值问题' },
    { id: 'server', label: '服务器与活动问题' },
    { id: 'item', label: '道具问题' },
    { id: 'bug', label: 'BUG与建议反馈' },
    { id: 'other', label: '其他问题' }
  ]
}
