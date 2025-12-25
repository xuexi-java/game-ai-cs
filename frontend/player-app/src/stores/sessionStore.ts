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
  updateMessage: (messageId: string, updates: Partial<Message>) => void;
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

  updateMessage: (messageId, updates) => {
    set((state) => {
      const updatedMessages = state.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );
      return {
        messages: updatedMessages,
        session: state.session
          ? {
            ...state.session,
            messages: updatedMessages,
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
    set((state) => {
      // ✅ 修复：如果传入的 messages 是空数组，不应该清空现有消息
      if (updates.messages !== undefined) {
        if (Array.isArray(updates.messages)) {
          // 如果传入空数组，保留现有消息（可能是会话更新但消息列表为空）
          if (updates.messages.length === 0 && state.messages.length > 0) {
            return {
              session: state.session ? { ...state.session, ...updates } : null,
              messages: state.messages, // 保留现有消息
            };
          }
          
          // 合并消息
          const newMessages = updates.messages;
          const mergedMessages = [...state.messages];
          newMessages.forEach((newMsg) => {
            const exists = mergedMessages.some((msg) => msg.id === newMsg.id);
            if (!exists) {
              mergedMessages.push(newMsg);
            }
          });

          const sortedMessages = mergedMessages.sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );

          return {
            session: state.session ? { ...state.session, ...updates } : null,
            messages: sortedMessages,
          };
        }
      }

      // If no messages in update, just update session fields
      return {
        session: state.session ? { ...state.session, ...updates } : null,
        messages: state.messages, // ✅ 修复：保留现有消息
      };
    });
  },

  reset: () => {
    set({
      session: null,
      messages: [],
    });
  },
}));
