// 用户相关类型
export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'AGENT';
  isOnline: boolean;
  createdAt: string;
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
  status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  game: Game;
  server?: Server;
  playerIdOrName: string;
  description: string;
  occurredAt?: string;
  paymentOrderNo?: string;
  createdAt: string;
  updatedAt: string;
}

// 会话相关类型
export interface Session {
  id: string;
  ticketId: string;
  status: 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'CLOSED';
  detectedIntent?: string;
  aiUrgency?: 'URGENT' | 'NON_URGENT';
  priorityScore?: number;
  queuedAt?: string;
  agentId?: string;
  ticket: Ticket;
  messages?: Message[];
  createdAt: string;
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
  agentStats: AgentStats[];
  dailyStats: Array<{
    date: string;
    tickets: number;
    resolved: number;
    avgSatisfaction: number;
  }>;
}

// 紧急规则类型
export interface UrgencyRule {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: {
    keywords?: string[];
    gameIds?: string[];
    priority?: string;
  };
  actions: {
    urgencyLevel: 'URGENT' | 'NON_URGENT';
    priorityBoost: number;
    autoAssignAgent?: boolean;
  };
  createdAt: string;
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

// API响应类型
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}
