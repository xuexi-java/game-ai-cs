/**
 * 公共类型定义
 */

export interface MessageMetadata {
  uploadStatus?: 'UPLOADING' | 'FAILED';
  pendingUploadId?: string;
  isLocalPreview?: boolean;
  suggestedOptions?: string[];
  translation?: {
    translatedContent?: string;
    sourceLanguage?: string;
    targetLanguage?: string;
    provider?: string;
    translatedAt?: string;
  };
  [key: string]: unknown;
}

export interface Message {
  id: string;
  sessionId: string;
  senderType: 'PLAYER' | 'AGENT' | 'AI' | 'SYSTEM';
  messageType: 'TEXT' | 'IMAGE' | 'SYSTEM_NOTICE';
  content: string;
  metadata?: MessageMetadata;
  createdAt: string;
}

export interface GameServer {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Game {
  id: string;
  name: string;
  icon?: string;
  enabled: boolean;
  servers?: GameServer[];
}

export interface TicketAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  createdAt?: string;
}

export interface SessionTicket {
  id: string;
  ticketNo: string;
  status: TicketStatus;
  game?: {
    id: string;
    name: string;
  } | null;
  server?: {
    id: string;
    name: string;
  } | null;
  playerIdOrName: string;
  description: string;
  occurredAt?: string | null;
  createdAt: string;
  attachments?: TicketAttachment[];
  issueTypes?: Array<{
    id: string;
    name: string;
  }>;
}

export interface Session {
  id: string;
  ticketId: string;
  status: 'PENDING' | 'QUEUED' | 'IN_PROGRESS' | 'CLOSED';
  detectedIntent?: string;
  aiUrgency?: 'URGENT' | 'NON_URGENT';
  priorityScore?: number;
  queuedAt?: string;
  queuePosition?: number | null;
  estimatedWaitTime?: number | null;
  agentId?: string;
  agent?: {
    id: string;
    username: string;
    realName?: string;
  };
  difyStatus?: string | null;
  allowManualTransfer?: boolean;
  ticket: SessionTicket;
  messages?: Message[];
}

export type TicketStatus = 'IN_PROGRESS' | 'WAITING' | 'RESOLVED';

export interface TicketDetail {
  id: string;
  ticketNo: string;
  token: string;
  status: TicketStatus;
  description: string;
  playerIdOrName: string;
  createdAt: string;
  updatedAt?: string;
  game?: {
    id: string;
    name: string;
  };
  server?: {
    id: string;
    name: string;
  } | null;
  attachments?: Array<{
    id: string;
    fileUrl: string;
    fileName: string;
    fileType?: string;
  }>;
  sessions?: Array<{
    id: string;
    status: string;
    agentId?: string | null;
    metadata?: Record<string, unknown>;
    messages?: Array<{
      id: string;
      sessionId: string;
      senderType: string;
      messageType?: string;
      content: string;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }>;
  }>;
}
