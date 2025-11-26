import apiClient from './api';

export interface QuickReplyCategory {
  id: string;
  name: string;
  description?: string;
  sortOrder: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    quickReplies: number;
  };
}

export interface CreateQuickReplyCategoryDto {
  name: string;
  description?: string;
  sortOrder?: number;
  enabled?: boolean;
}

export interface UpdateQuickReplyCategoryDto {
  name?: string;
  description?: string;
  sortOrder?: number;
  enabled?: boolean;
}

/**
 * 获取所有分类
 */
export async function getQuickReplyCategories(enabledOnly: boolean = false): Promise<QuickReplyCategory[]> {
  const response = await apiClient.get('/quick-reply-categories', {
    params: { enabledOnly },
  });
  return response.data || response;
}

/**
 * 创建分类
 */
export async function createQuickReplyCategory(data: CreateQuickReplyCategoryDto): Promise<QuickReplyCategory> {
  const response = await apiClient.post('/quick-reply-categories', data);
  return response.data || response;
}

/**
 * 更新分类
 */
export async function updateQuickReplyCategory(
  id: string,
  data: UpdateQuickReplyCategoryDto,
): Promise<QuickReplyCategory> {
  const response = await apiClient.patch(`/quick-reply-categories/${id}`, data);
  return response.data || response;
}

/**
 * 删除分类
 */
export async function deleteQuickReplyCategory(id: string, force: boolean = false): Promise<void> {
  await apiClient.delete(`/quick-reply-categories/${id}`, {
    params: { force },
  });
}

/**
 * 获取分类使用统计
 */
export async function getCategoryUsageStats(id: string) {
  const response = await apiClient.get(`/quick-reply-categories/${id}/stats`);
  return response;
}

