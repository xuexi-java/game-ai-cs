import { create } from 'zustand';
import { quickReplyService } from '../services/quickReply.service';

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

interface QuickReplyState {
  // 分类
  categories: Category[];
  selectedCategoryId: string | null;
  loadingCategories: boolean;

  // 快捷回复
  replies: Reply[];
  totalReplies: number;
  currentPage: number;
  pageSize: number;
  loading: boolean;

  // 排序筛选
  sortBy: 'usageCount' | 'favoriteCount' | 'lastUsedAt';
  onlyFavorites: boolean;

  // Actions
  fetchCategories: () => Promise<void>;
  fetchReplies: (page: number) => Promise<void>;
  setSelectedCategory: (categoryId: string | null) => void;
  setSortBy: (sortBy: 'usageCount' | 'favoriteCount' | 'lastUsedAt') => void;
  toggleOnlyFavorites: () => void;
  toggleFavorite: (replyId: string) => Promise<void>;
  createReply: (data: any) => Promise<void>;
  updateReply: (replyId: string, data: any) => Promise<void>;
  deleteReply: (replyId: string) => Promise<void>;
  createCategory: (data: any) => Promise<void>;
  updateCategory: (categoryId: string, data: any) => Promise<void>;
  deleteCategory: (categoryId: string) => Promise<void>;
}

export const useQuickReplyStore = create<QuickReplyState>((set, get) => ({
  categories: [],
  selectedCategoryId: null,
  loadingCategories: false,

  replies: [],
  totalReplies: 0,
  currentPage: 1,
  pageSize: 20,
  loading: false,

  sortBy: 'usageCount',
  onlyFavorites: false,

  fetchCategories: async () => {
    try {
      set({ loadingCategories: true });
      const data = await quickReplyService.getCategories();
      set({ categories: data });
      // 自动选择第一个分类
      if (data && data.length > 0 && !get().selectedCategoryId) {
        set({ selectedCategoryId: data[0].id });
      }
    } catch (error) {
      console.error('获取分类失败:', error);
    } finally {
      set({ loadingCategories: false });
    }
  },

  fetchReplies: async (page: number = 1) => {
    try {
      set({ loading: true });
      const { selectedCategoryId, sortBy, onlyFavorites, pageSize } = get();
      
      const data = await quickReplyService.getReplies({
        categoryId: selectedCategoryId || undefined,
        sortBy,
        onlyFavorites,
        page,
        pageSize,
      });

      // 处理响应数据 - 确保得到正确的分页数据
      if (data && data.data) {
        set({
          replies: data.data,
          totalReplies: data.pagination?.total || 0,
          currentPage: page,
        });
      } else if (Array.isArray(data)) {
        // 备选处理：如果直接是数组
        set({
          replies: data,
          totalReplies: data.length,
          currentPage: page,
        });
      }
    } catch (error) {
      console.error('获取快捷回复失败:', error);
    } finally {
      set({ loading: false });
    }
  },

  setSelectedCategory: (categoryId: string | null) => {
    set({ selectedCategoryId: categoryId, currentPage: 1 });
    // 触发重新加载
    get().fetchReplies(1);
  },

  setSortBy: (sortBy: 'usageCount' | 'favoriteCount' | 'lastUsedAt') => {
    set({ sortBy, currentPage: 1 });
    get().fetchReplies(1);
  },

  toggleOnlyFavorites: () => {
    set((state) => ({
      onlyFavorites: !state.onlyFavorites,
      currentPage: 1,
    }));
    get().fetchReplies(1);
  },

  toggleFavorite: async (replyId: string) => {
    try {
      await quickReplyService.toggleFavorite(replyId);
      // 更新回复列表中的收藏状态
      set((state) => ({
        replies: state.replies.map((reply) => {
          if (reply.id === replyId) {
            return {
              ...reply,
              isFavorited: !reply.isFavorited,
              favoriteCount: reply.isFavorited
                ? reply.favoriteCount - 1
                : reply.favoriteCount + 1,
            };
          }
          return reply;
        }),
      }));
    } catch (error) {
      console.error('收藏失败:', error);
    }
  },

  createReply: async (data: any) => {
    try {
      await quickReplyService.createReply(data);
      get().fetchReplies(1);
    } catch (error) {
      console.error('创建快捷回复失败:', error);
      throw error;
    }
  },

  updateReply: async (replyId: string, data: any) => {
    try {
      await quickReplyService.updateReply(replyId, data);
      get().fetchReplies(get().currentPage);
    } catch (error) {
      console.error('更新快捷回复失败:', error);
      throw error;
    }
  },

  deleteReply: async (replyId: string) => {
    try {
      await quickReplyService.deleteReply(replyId);
      get().fetchReplies(get().currentPage);
    } catch (error) {
      console.error('删除快捷回复失败:', error);
      throw error;
    }
  },

  createCategory: async (data: any) => {
    try {
      await quickReplyService.createCategory(data);
      get().fetchCategories();
    } catch (error) {
      console.error('创建分类失败:', error);
      throw error;
    }
  },

  updateCategory: async (categoryId: string, data: any) => {
    try {
      await quickReplyService.updateCategory(categoryId, data);
      get().fetchCategories();
    } catch (error) {
      console.error('更新分类失败:', error);
      throw error;
    }
  },

  deleteCategory: async (categoryId: string) => {
    try {
      await quickReplyService.deleteCategory(categoryId);
      get().fetchCategories();
    } catch (error) {
      console.error('删除分类失败:', error);
      throw error;
    }
  },
}));
