/**
 * 游戏服务
 */
import apiClient from './api';
import type { Game } from '../types';

// 重新导出类型以保持向后兼容
export type { Game };

/**
 * API 响应格式
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  timestamp: string;
}

/**
 * 获取已启用的游戏列表
 */
export const getEnabledGames = async (): Promise<Game[]> => {
  const response = await apiClient.get<ApiResponse<Game[]>>('/games/enabled');
  // 后端使用 TransformInterceptor 包装响应，需要提取 data 字段
  if (response && typeof response === 'object' && 'data' in response) {
    return Array.isArray(response.data) ? response.data : [];
  }
  // 兼容直接返回数组的情况
  return Array.isArray(response) ? response : [];
};
