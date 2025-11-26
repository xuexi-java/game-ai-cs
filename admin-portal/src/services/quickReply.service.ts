import apiClient from './api';

interface CreateCategoryDto {
  name: string;
  isGlobal?: boolean;
  sortOrder?: number;
}

interface UpdateCategoryDto {
  name?: string;
  isGlobal?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

interface CreateReplyDto {
  categoryId: string;
  content: string;
  isGlobal?: boolean;
  sortOrder?: number;
}

interface UpdateReplyDto {
  categoryId?: string;
  content?: string;
  isGlobal?: boolean;
  sortOrder?: number;
  isActive?: boolean;
}

interface QueryReplyDto {
  categoryId?: string;
  onlyFavorites?: boolean;
  onlyRecent?: boolean;
  sortBy?: 'usageCount' | 'favoriteCount' | 'lastUsedAt';
  page?: number;
  pageSize?: number;
}

interface Category {
  id: string;
  name: string;
  isGlobal: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  _count: { replies: number };
}

interface Reply {
  id: string;
  categoryId: string;
  content: string;
  isGlobal: boolean;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  favoriteCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  isFavorited: boolean;
  category: Category;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export const quickReplyService = {
  /**
   * 获取分类列表
   */
  getCategories: async (): Promise<Category[]> => {
    const response = await apiClient.get('/quick-reply/categories');
    return Array.isArray(response) ? response : [];
  },

  /**
   * 创建分类
   */
  createCategory: async (data: CreateCategoryDto): Promise<Category> => {
    return await apiClient.post('/quick-reply/categories', data);
  },

  /**
   * 更新分类
   */
  updateCategory: async (id: string, data: UpdateCategoryDto): Promise<Category> => {
    return await apiClient.patch(`/quick-reply/categories/${id}`, data);
  },

  /**
   * 删除分类
   */
  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/quick-reply/categories/${id}`);
  },

  /**
   * 获取快捷回复列表
   */
  getReplies: async (query?: QueryReplyDto): Promise<PaginatedResponse<Reply>> => {
    return await apiClient.get('/quick-reply/replies', { params: query });
  },

  /**
   * 创建快捷回复
   */
  createReply: async (data: CreateReplyDto): Promise<Reply> => {
    return await apiClient.post('/quick-reply/replies', data);
  },

  /**
   * 更新快捷回复
   */
  updateReply: async (id: string, data: UpdateReplyDto): Promise<Reply> => {
    return await apiClient.patch(`/quick-reply/replies/${id}`, data);
  },

  /**
   * 删除快捷回复
   */
  deleteReply: async (id: string): Promise<void> => {
    await apiClient.delete(`/quick-reply/replies/${id}`);
  },

  /**
   * 切换收藏状态
   */
  toggleFavorite: async (replyId: string): Promise<{ success: boolean }> => {
    return await apiClient.post(`/quick-reply/replies/${replyId}/favorite`);
  },

  /**
   * 获取用户收藏列表
   */
  getUserFavorites: async (page: number = 1, pageSize: number = 20): Promise<PaginatedResponse<Reply>> => {
    return await apiClient.get('/quick-reply/favorites', {
      params: { page, pageSize },
    });
  },

  /**
   * 增加使用次数
   */
  incrementUsage: async (replyId: string): Promise<{ success: boolean }> => {
    return await apiClient.post(`/quick-reply/replies/${replyId}/usage`);
  },
};
