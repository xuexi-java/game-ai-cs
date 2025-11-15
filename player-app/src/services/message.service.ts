/**
 * 消息服务
 */
import apiClient from './api';
import type { Message } from '../types';

export interface CreateMessageRequest {
  sessionId: string;
  content: string;
  messageType?: 'TEXT' | 'IMAGE';
}

/**
 * 发送玩家消息
 */
export const sendPlayerMessage = async (
  data: CreateMessageRequest
): Promise<Message> => {
  return apiClient.post('/messages/player', data);
};

/**
 * 获取会话消息列表
 */
export const getSessionMessages = async (
  sessionId: string
): Promise<Message[]> => {
  return apiClient.get(`/messages/session/${sessionId}`);
};
