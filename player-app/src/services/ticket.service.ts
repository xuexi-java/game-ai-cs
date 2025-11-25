/**
 * 工单服务
 */
import apiClient from './api';
import type { TicketDetail } from '../types';

export interface CheckOpenTicketRequest {
  gameId: string;
  serverId?: string;
  serverName?: string;
  playerIdOrName: string;
}

export interface CheckOpenTicketResponse {
  hasOpenTicket: boolean;
  ticket?: {
    id: string;
    ticketNo: string;
    token: string;
  } | null;
}

export interface CreateTicketRequest {
  gameId: string;
  serverId?: string;
  serverName?: string;
  playerIdOrName: string;
  description: string;
  occurredAt?: string;
  paymentOrderNo?: string;
  attachments?: string[];
  issueTypeIds: string[]; // 新增：问题类型 IDs
}

export interface CreateTicketResponse {
  id?: string;
  ticketId?: string;
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
 * 检查是否有相同问题类型的未完成工单
 */
export const checkOpenTicketByIssueType = async (data: {
  gameId: string;
  serverId: string;
  playerIdOrName: string;
  issueTypeId: string;
}): Promise<CheckOpenTicketResponse> => {
  return apiClient.post('/tickets/check-open-by-issue-type', data);
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
export const getTicketByToken = async (token: string): Promise<TicketDetail> => {
  return apiClient.get(`/tickets/by-token/${token}`);
};

/**
 * 根据工单号获取工单信息
 */
export const getTicketByTicketNo = async (ticketNo: string): Promise<TicketDetail> => {
  return apiClient.get(`/tickets/by-ticket-no/${ticketNo}`);
};

/**
 * 工单消息接口
 */
export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId?: string | null;
  sender?: {
    id: string;
    username: string;
    realName?: string | null;
  } | null;
  content: string;
  createdAt: string;
}

/**
 * 根据 token 获取工单消息列表
 */
export const getTicketMessagesByToken = async (
  token: string
): Promise<TicketMessage[]> => {
  return apiClient.get(`/tickets/by-token/${token}/messages`);
};

/**
 * 根据工单号获取工单消息列表
 */
export const getTicketMessagesByTicketNo = async (
  ticketNo: string
): Promise<TicketMessage[]> => {
  return apiClient.get(`/tickets/by-ticket-no/${ticketNo}/messages`);
};

/**
 * 根据 token 发送工单消息
 */
export const sendTicketMessageByToken = async (
  token: string,
  content: string
): Promise<TicketMessage> => {
  return apiClient.post(`/tickets/by-token/${token}/messages`, { content });
};

