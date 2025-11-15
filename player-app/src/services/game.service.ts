/**
 * 游戏服务
 */
import apiClient from './api';
import type { Game } from '../types';

// 重新导出类型以保持向后兼容
export type { Game };

/**
 * 获取已启用的游戏列表
 */
export const getEnabledGames = async (): Promise<Game[]> => {
  return apiClient.get('/games/enabled');
};
