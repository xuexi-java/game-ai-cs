/**
 * 会话状态管理
 */
import { create } from 'zustand';
import type { Session, Message } from '../types';

export interface SessionState {
  session: Session | null;
  messages: Message[];
  
  setSession: (session: Session) => void;
  addMessage: (message: Message) => void;
  removeMessage: (messageId: string) => void;
  updateSession: (updates: Partial<Session>) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  messages: [],
  
  setSession: (session) => {
    // 确保消息按时间排序并去重
    let messages = Array.isArray(session.messages) ? session.messages : [];
    // 按时间排序
    messages = messages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    // 去重（基于 ID）
    const uniqueMessages = messages.filter(
      (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
    );
    set({ 
      session: {
        ...session,
        messages: uniqueMessages,
      },
      messages: uniqueMessages,
    });
  },
  
  addMessage: (message) => {
    set((state) => {
      // 检查消息是否已存在，避免重复添加
      const exists = state.messages.some((msg) => msg.id === message.id);
      if (exists) {
        return state;
      }
      // 添加新消息并重新排序
      const newMessages = [...state.messages, message].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      return {
        messages: newMessages,
        session: state.session
          ? {
              ...state.session,
              messages: newMessages,
            }
          : state.session,
      };
    });
  },

  removeMessage: (messageId) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== messageId),
      session: state.session
        ? {
            ...state.session,
            messages: (state.session.messages || []).filter(
              (msg) => msg.id !== messageId,
            ),
          }
        : state.session,
    }));
  },
  
  updateSession: (updates) => {
    set((state) => ({
      session: state.session ? { ...state.session, ...updates } : null,
    }));
  },
  
  reset: () => {
    set({
      session: null,
      messages: [],
    });
  },
}));
