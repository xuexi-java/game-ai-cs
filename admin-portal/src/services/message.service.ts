import apiClient from './api';
import type { Message } from '../types';

export interface SendMessageRequest {
  sessionId: string;
  content: string;
  messageType?: 'TEXT' | 'IMAGE';
}

/**
 * 客服发送消息
 */
export const sendAgentMessage = async (data: SendMessageRequest): Promise<Message> => {
  return apiClient.post('/messages/agent', data);
};

/**
 * 获取会话消息列表
 */
export const getSessionMessages = async (sessionId: string, limit?: number): Promise<Message[]> => {
  const url = `/messages/session/${sessionId}${limit ? `?limit=${limit}` : ''}`;
  return apiClient.get(url);
};
