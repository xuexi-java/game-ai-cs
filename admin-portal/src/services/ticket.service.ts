import apiClient from './api';
import type { Ticket, PaginationResponse, PaginationParams } from '../types';

export interface TicketQueryParams extends PaginationParams {
  status?: string;
  priority?: string;
  issueTypeId?: string;
  gameId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * 获取工单列表
 */
export const getTickets = async (params?: TicketQueryParams): Promise<PaginationResponse<Ticket>> => {
  const queryParams = new URLSearchParams();
  
  if (params?.status) queryParams.append('status', params.status);
  if (params?.priority) queryParams.append('priority', params.priority);
  if (params?.issueTypeId) queryParams.append('issueTypeId', params.issueTypeId);
  if (params?.gameId) queryParams.append('gameId', params.gameId);
  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  if (params?.page) queryParams.append('page', params.page.toString());
  if (params?.pageSize) queryParams.append('pageSize', params.pageSize.toString());
  if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
  if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
  
  const url = `/tickets${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  return apiClient.get(url);
};

/**
 * 获取工单详情
 */
export const getTicketById = async (id: string): Promise<Ticket> => {
  return apiClient.get(`/tickets/${id}`);
};

/**
 * 更新工单状态
 */
export const updateTicketStatus = async (id: string, status: string): Promise<Ticket> => {
  return apiClient.patch(`/tickets/${id}/status`, { status });
};

/**
 * 更新工单优先级
 */
export const updateTicketPriority = async (id: string, priority: string): Promise<Ticket> => {
  return apiClient.patch(`/tickets/${id}/priority`, { priority });
};

/**
 * 发送工单消息（客服回复工单）
 */
export const sendTicketMessage = async (ticketId: string, content: string) => {
  return apiClient.post(`/tickets/${ticketId}/messages`, { content });
};

/**
 * 获取工单消息列表
 */
export const getTicketMessages = async (ticketId: string) => {
  return apiClient.get(`/tickets/${ticketId}/messages`);
};