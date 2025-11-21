// 用户相关类型
export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'AGENT';
  realName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
  isOnline?: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
  deletedAt?: string | null;
}

export interface OnlineAgent {
  id: string;
  username: string;
  realName?: string;
  avatar?: string;
  isOnline: boolean;
  lastLoginAt?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
}

// 游戏相关类型
export interface Game {
  id: string;
  name: string;
  icon?: string;
  enabled: boolean;
  difyApiKey?: string;
  difyBaseUrl?: string;
  createdAt: string;
}

export interface Server {
  id: string;
  gameId: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdAt: string;
}

// 工单相关类型
export interface Ticket {
  id: string;
  ticketNo: string;
  status: 'NEW' | 'IN_PROGRESS' | 'WAITING' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  game: Game;
  server?: Server;
  serverName?: string | null;
  playerIdOrName: string;
  description: string;
  occurredAt?: string;
  paymentOrderNo?: string;
  createdAt: string;
  updatedAt: string;
  attachments?: TicketAttachment[];
  issueTypes?: Array<{ id: string; name: string }>;
  ticketIssueTypes?: Array<{
    issueType: {
      id: string;
      name: string;
    } | null;
  }>;
}

export interface TicketAttachment {
  id: string;
  ticketId: string;
  fileUrl: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  sortOrder?: number;
  createdAt?: string;
}

// 会话相关类型
export interface Session {
  id: string;
  ticketId: string;
  status: 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'CLOSED';
  detectedIntent?: string;
  aiUrgency?: 'URGENT' | 'NON_URGENT';
  playerUrgency?: 'URGENT' | 'NON_URGENT';
  priorityScore?: number;
  queuedAt?: string;
  queuePosition?: number;
  transferAt?: string;
  transferReason?: string;
  transferIssueTypeId?: string;
  difyConversationId?: string;
  difyStatus?: string | null;
  agentId?: string;
  agent?: {
    id: string;
    username: string;
    realName?: string;
  } | null;
  ticket: Ticket;
  messages?: Message[];
  createdAt: string;
  updatedAt?: string;
  startedAt?: string;
  closedAt?: string;
  allowManualTransfer?: boolean;
  manuallyAssigned?: boolean; // 是否手动分配过
}

// 消息相关类型
export interface Message {
  id: string;
  sessionId: string;
  senderType: 'PLAYER' | 'AGENT' | 'AI' | 'SYSTEM';
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM_NOTICE';
  content: string;
  metadata?: any;
  agentId?: string;
  createdAt: string;
}

// 满意度评价类型
export interface SatisfactionRating {
  id: string;
  sessionId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface AgentStats {
  agentId: string;
  agentName: string;
  totalRatings: number;
  averageRating: number;
  handledTickets: number;
  isOnline: boolean;
  ratingDistribution: Record<string, number>;
}

// 仪表盘统计类型
export interface DashboardMetrics {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  averageResponseTime: number;
  averageResolutionTime: number;
  satisfactionRating: number;
  aiInterceptionRate?: number; // AI拦截率（百分比）
  agentStats: AgentStats[];
  dailyStats: Array<{
    date: string;
    tickets: number;
    resolved: number;
    avgSatisfaction: number;
  }>;
}

export interface UrgencyRuleConditions {
  issueTypeIds?: string[]; // 新增：问题类型 IDs
  keywords?: string[];
  intent?: string;
  identityStatus?: string;
  gameId?: string;
  serverId?: string;
  priority?: string;
}

// 紧急规则类型
export interface UrgencyRule {
  id: string;
  name: string;
  enabled: boolean;
  priorityWeight: number;
  description?: string;
  conditions: UrgencyRuleConditions;
  createdAt: string;
  updatedAt: string;
}

// 分页相关类型
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 问题类型
export interface IssueType {
  id: string;
  name: string;
  description?: string;
  priorityWeight: number;
  enabled: boolean;
  sortOrder: number;
  icon?: string;
  createdAt: string;
  updatedAt: string;
}

// API响应类型
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}
