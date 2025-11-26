import apiClient from './api';

interface QueryReplyDto {
  categoryId?: string;
  onlyFavorites?: boolean;
  onlyRecent?: boolean;
  sortBy?: 'usageCount' | 'favoriteCount' | 'lastUsedAt';
  page?: number;
  pageSize?: number;
}

export const quickReplyService = {
  /**
   * 获取分类列表
   */
  getCategories: () => {
    return apiClient.get('/quick-reply/categories');
  },

  /**
   * 获取快捷回复列表
   */
  getReplies: (query?: QueryReplyDto) => {
    return apiClient.get('/quick-reply/replies', { params: query });
  },

  /**
   * 切换收藏状态
   */
  toggleFavorite: (replyId: string) => {
    return apiClient.post(`/quick-reply/replies/${replyId}/favorite`);
  },

  /**
   * 获取用户收藏列表
   */
  getUserFavorites: (page: number = 1, pageSize: number = 20) => {
    return apiClient.get('/quick-reply/favorites', {
      params: { page, pageSize },
    });
  },

  /**
   * 增加使用次数
   */
  incrementUsage: (replyId: string) => {
    return apiClient.post(`/quick-reply/replies/${replyId}/usage`);
  },
};
