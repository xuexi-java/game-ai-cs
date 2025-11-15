import apiClient from './api';
import type { DashboardMetrics } from '../types';

/**
 * 获取仪表盘指标
 */
export const getDashboardMetrics = async (params?: {
  gameId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<DashboardMetrics> => {
  const queryParams = new URLSearchParams();
  
  if (params?.gameId) queryParams.append('gameId', params.gameId);
  if (params?.startDate) queryParams.append('startDate', params.startDate);
  if (params?.endDate) queryParams.append('endDate', params.endDate);
  
  const url = `/dashboard/metrics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
  return apiClient.get(url);
};
