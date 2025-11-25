/**
 * 会话服务
 */
import apiClient from './api';
import type { Session, Message } from '../types';

export interface CreateSessionRequest {
  ticketId: string;
}

// 重新导出类型以保持向后兼容
export type { Session, Message };

/**
 * 创建会话
 */
export const createSession = async (
  data: CreateSessionRequest
): Promise<Session> => {
  return apiClient.post('/sessions', data);
};

/**
 * 获取会话详情
 */
export const getSession = async (sessionId: string): Promise<Session> => {
  return apiClient.get(`/sessions/${sessionId}`);
};

export interface TransferResult {
  queued: boolean;
  queuePosition?: number | null;
  estimatedWaitTime?: number | null;
  message?: string;
  ticketNo?: string;
  convertedToTicket?: boolean; // 是否已转为工单
  onlineAgents?: number; // 在线客服数量
}

/**
 * 转人工客服
 */
export interface TransferToAgentPayload {
  urgency: 'URGENT' | 'NON_URGENT';
  reason?: string;
  issueTypeId?: string;
}

export const transferToAgent = async (
  sessionId: string,
  payload: TransferToAgentPayload,
): Promise<TransferResult> => {
  return apiClient.post(`/sessions/${sessionId}/transfer-to-agent`, payload);
};

export const closeSession = async (sessionId: string): Promise<Session> => {
  return apiClient.patch(`/sessions/${sessionId}/close-player`, {});
};

export interface SubmitRatingRequest {
  sessionId: string;
  rating: number;
  tags: string[];
  comment?: string;
}

/**
 * 提交满意度评价
 */
export const submitRating = async (data: SubmitRatingRequest): Promise<any> => {
  return apiClient.post('/satisfaction', data);
};