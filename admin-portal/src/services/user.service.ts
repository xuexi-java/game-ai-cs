import apiClient from './api';
import type { PaginationResponse, User, OnlineAgent } from '../types';

export interface UserQueryParams {
  page?: number;
  pageSize?: number;
  role?: 'ADMIN' | 'AGENT';
  search?: string;
}

export interface UserPayload {
  username: string;
  password?: string;
  role: 'ADMIN' | 'AGENT';
  realName?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

export const getUsers = async (
  params: UserQueryParams = {},
): Promise<PaginationResponse<User>> => {
  return apiClient.get('/users', { params });
};

export const createUser = async (data: UserPayload) => {
  return apiClient.post('/users', data);
};

export const updateUser = async (id: string, data: Partial<UserPayload>) => {
  return apiClient.patch(`/users/${id}`, data);
};

export const deleteUser = async (id: string) => {
  return apiClient.delete(`/users/${id}`);
};

export const getOnlineAgents = async (): Promise<OnlineAgent[]> => {
  return apiClient.get('/users/agents/online');
};

