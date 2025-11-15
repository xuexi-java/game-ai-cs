/**
 * 公共类型定义
 */

export interface Message {
  id: string;
  sessionId: string;
  senderType: 'PLAYER' | 'AGENT' | 'AI' | 'SYSTEM';
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM_NOTICE';
  content: string;
  metadata?: any;
  createdAt: string;
}

export interface Game {
  id: string;
  name: string;
  icon?: string;
  enabled: boolean;
}

export interface Session {
  id: string;
  ticketId: string;
  status: 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'CLOSED';
  detectedIntent?: string;
  aiUrgency?: 'URGENT' | 'NON_URGENT';
  priorityScore?: number;
  queuedAt?: string;
  agentId?: string;
  ticket: {
    id: string;
    ticketNo: string;
    game: {
      id: string;
      name: string;
    };
    server: {
      id: string;
      name: string;
    };
    playerIdOrName: string;
    description: string;
  };
  messages?: Message[];
}
