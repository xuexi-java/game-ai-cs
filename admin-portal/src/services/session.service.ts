import apiClient from './api';
import type { Session } from '../types';

/**
 * 获取待接入会话列表
 */
export const getQueuedSessions = async (): Promise<Session[]> => {
  return apiClient.get('/sessions/workbench/queued');
};

/**
 * 获取会话详情
 */
export const getSessionById = async (id: string): Promise<Session> => {
  return apiClient.get(`/sessions/${id}`);
};

/**
 * 客服接入会话
 */
export const joinSession = async (id: string): Promise<Session> => {
  return apiClient.post(`/sessions/${id}/join`);
};

/**
 * 结束会话
 */
export const closeSession = async (id: string): Promise<Session> => {
  return apiClient.patch(`/sessions/${id}/close`);
};
