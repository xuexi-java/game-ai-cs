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
  status?: string
  isReadOnly?: boolean
  history?: { messages: HistoryMessageItem[]; hasMore: boolean }
}

// 工单创建成功事件数据
export interface WsTicketCreatedData {
  tid: string
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
