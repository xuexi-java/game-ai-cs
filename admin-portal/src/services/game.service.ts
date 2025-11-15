import apiClient from './api';
import type { Game, Server } from '../types';

export interface CreateGameRequest {
  name: string;
  icon?: string;
  enabled?: boolean;
  difyApiKey?: string;
  difyBaseUrl?: string;
}

export interface UpdateGameRequest extends Partial<CreateGameRequest> {}

export interface CreateServerRequest {
  name: string;
  description?: string;
  enabled?: boolean;
}

export interface UpdateServerRequest extends Partial<CreateServerRequest> {}

/**
 * 获取所有游戏
 */
export const getGames = async (): Promise<Game[]> => {
  return apiClient.get('/games');
};

/**
 * 获取游戏详情
 */
export const getGameById = async (id: string): Promise<Game> => {
  return apiClient.get(`/games/${id}`);
};

/**
 * 创建游戏
 */
export const createGame = async (data: CreateGameRequest): Promise<Game> => {
  return apiClient.post('/games', data);
};

/**
 * 更新游戏
 */
export const updateGame = async (id: string, data: UpdateGameRequest): Promise<Game> => {
  return apiClient.patch(`/games/${id}`, data);
};

/**
 * 删除游戏
 */
export const deleteGame = async (id: string): Promise<void> => {
  return apiClient.delete(`/games/${id}`);
};

/**
 * 获取游戏的服务器列表
 */
export const getGameServers = async (gameId: string): Promise<Server[]> => {
  return apiClient.get(`/games/${gameId}/servers`);
};

/**
 * 创建服务器
 */
export const createServer = async (gameId: string, data: CreateServerRequest): Promise<Server> => {
  return apiClient.post(`/games/${gameId}/servers`, data);
};

/**
 * 更新服务器
 */
export const updateServer = async (id: string, data: UpdateServerRequest): Promise<Server> => {
  return apiClient.patch(`/games/servers/${id}`, data);
};

/**
 * 删除服务器
 */
export const deleteServer = async (id: string): Promise<void> => {
  return apiClient.delete(`/games/servers/${id}`);
};
