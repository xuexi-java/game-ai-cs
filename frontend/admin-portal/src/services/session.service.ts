import apiClient from './api';
import type { Session, PaginationParams, PaginationResponse } from '../types';

export interface SessionQueryParams extends PaginationParams {
  status?: string;
  agentId?: string;
  gameId?: string;
  search?: string;
  transferredToAgent?: boolean; // true: 已转人工, false: 未转人工, undefined: 全部
  startDate?: string;
  endDate?: string;
}

/**
 * 获取会话列表（管理端）
 */
export const getSessions = async (
  params: SessionQueryParams = {},
): Promise<PaginationResponse<Session>> => {
  return apiClient.get('/sessions', { params });
};

export const getActiveSessions = async (): Promise<Session[]> => {
  const result = await getSessions({
    status: 'IN_PROGRESS',
    page: 1,
    pageSize: 50,
    sortBy: 'updatedAt',
    sortOrder: 'desc',
  });
  return result?.items ?? [];
};

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
  // 使用管理端API，会自动进行权限检查
  return apiClient.get(`/sessions/workbench/${id}`);
};

/**
 * 客服接入会话
 */
export const joinSession = async (id: string): Promise<Session> => {
  return apiClient.post(`/sessions/${id}/join`);
};

/**
 * ✅ 新增：通过工单ID接入会话（如果会话不存在则创建，如果已关闭则重新激活）
 */
export const joinSessionByTicketId = async (ticketId: string): Promise<Session> => {
  return apiClient.post(`/sessions/by-ticket/${ticketId}/join`);
};

/**
 * 结束会话
 */
export const closeSession = async (id: string): Promise<Session> => {
  return apiClient.patch(`/sessions/${id}/close`);
};

/**
 * 管理员手动分配会话给指定客服
 */
export const assignSession = async (sessionId: string, agentId: string): Promise<Session> => {
  return apiClient.post(`/sessions/${sessionId}/assign`, { agentId });
};

/**
 * 自动分配会话（根据客服当前接待数量）
 */
export const autoAssignSession = async (sessionId: string): Promise<Session> => {
  return apiClient.post(`/sessions/${sessionId}/auto-assign`);
};
