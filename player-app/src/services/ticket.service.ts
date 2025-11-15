/**
 * 工单服务
 */
import apiClient from './api';

export interface CheckOpenTicketRequest {
  gameId: string;
  serverId: string;
  playerIdOrName: string;
}

export interface CheckOpenTicketResponse {
  hasOpenTicket: boolean;
  ticket?: {
    id: string;
    ticketNo: string;
    token: string;
  };
}

export interface CreateTicketRequest {
  gameId: string;
  serverId: string;
  playerIdOrName: string;
  description: string;
  occurredAt?: string;
  paymentOrderNo?: string;
  attachments?: string[];
}

export interface CreateTicketResponse {
  id: string;
  ticketNo: string;
  token: string;
}

/**
 * 检查是否有未关闭的工单
 */
export const checkOpenTicket = async (
  data: CheckOpenTicketRequest
): Promise<CheckOpenTicketResponse> => {
  return apiClient.post('/tickets/check-open', data);
};

/**
 * 创建新工单
 */
export const createTicket = async (
  data: CreateTicketRequest
): Promise<CreateTicketResponse> => {
  return apiClient.post('/tickets', data);
};

/**
 * 根据 token 获取工单信息
 */
export const getTicketByToken = async (token: string) => {
  return apiClient.get(`/tickets/by-token/${token}`);
};

