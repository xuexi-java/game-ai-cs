/**
 * 消息服务
 */
import apiClient from './api';
import type { Message } from '../types';

export interface PlayerMessageResult {
  playerMessage: Message;
  aiMessage?: Message | null;
  difyStatus?: string | null;
}

/**
 * 发送玩家消息（触发 Dify 工作流）
 */
export const sendPlayerMessage = async (
  sessionId: string,
  content: string,
  messageType: 'TEXT' | 'IMAGE' = 'TEXT',
): Promise<PlayerMessageResult> => {
  return apiClient.post(`/sessions/${sessionId}/messages`, {
    content,
    messageType,
  });
};

/**
 * 获取会话消息列表
 */
export const getSessionMessages = async (
  sessionId: string
): Promise<Message[]> => {
  return apiClient.get(`/messages/session/${sessionId}`);
};

/**
 * 翻译消息
 */
export const translateMessage = async (messageId: string, targetLang?: string): Promise<Message> => {
  return apiClient.post(`/messages/${messageId}/translate`, { targetLang });
};