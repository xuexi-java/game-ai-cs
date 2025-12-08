import { create } from 'zustand';
import type { Session, Message } from '../types';

interface SessionState {
  // 当前活跃的会话
  activeSessions: Session[];
  // 排队中的会话
  queuedSessions: Session[];
  // 当前选中的会话
  currentSession: Session | null;
  // 会话消息
  sessionMessages: Record<string, Message[]>;
  // 未读消息计数
  unreadCounts: Record<string, number>;
  // 最后阅读时间
  lastReadTimes: Record<string, number>;
  
  // Actions
  setQueuedSessions: (sessions: Session[]) => void;
  setActiveSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  addMessage: (sessionId: string, message: Message) => void;
  setSessionMessages: (sessionId: string, messages: Message[]) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  removeFromQueue: (sessionId: string) => void;
  addToActive: (session: Session) => void;
  // 未读消息相关操作
  incrementUnread: (sessionId: string) => void;
  clearUnread: (sessionId: string) => void;
  getTotalUnread: () => number;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activeSessions: [],
  queuedSessions: [],
  currentSession: null,
  sessionMessages: {},
  unreadCounts: {},
  lastReadTimes: {},
  
  setQueuedSessions: (sessions) => set({ queuedSessions: sessions }),
  
  setActiveSessions: (sessions) => set({ activeSessions: sessions }),
  
  setCurrentSession: (session) => set((state) => {
    // 清除之前会话的未读数
    if (state.currentSession?.id) {
      const newCounts = { ...state.unreadCounts };
      delete newCounts[state.currentSession.id];
      const newReadTimes = { ...state.lastReadTimes };
      newReadTimes[state.currentSession.id] = Date.now();
      return {
        currentSession: session,
        unreadCounts: newCounts,
        lastReadTimes: newReadTimes,
      };
    }
    return { currentSession: session };
  }),
  
  addMessage: (sessionId, message) => set((state) => {
    const existingMessages = state.sessionMessages[sessionId] || [];
    // 检查消息是否已存在，避免重复添加
    const exists = existingMessages.some((msg) => msg.id === message.id);
    if (exists) {
      return state;
    }
    // 添加新消息并重新排序
    const newMessages = [...existingMessages, message].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    // 如果消息不是来自当前用户，且不在当前查看的会话中，增加未读数
    const isCurrentSession = state.currentSession?.id === sessionId;
    const isFromCurrentUser = message.senderType === 'AGENT';
    const shouldIncrementUnread = !isCurrentSession && !isFromCurrentUser;
    
    return {
      sessionMessages: {
        ...state.sessionMessages,
        [sessionId]: newMessages
      },
      unreadCounts: shouldIncrementUnread
        ? {
            ...state.unreadCounts,
            [sessionId]: (state.unreadCounts[sessionId] || 0) + 1,
          }
        : state.unreadCounts,
    };
  }),
  
  setSessionMessages: (sessionId, messages) => set((state) => {
    // 确保消息按时间排序并去重
    let sortedMessages = Array.isArray(messages) ? messages : [];
    // 按时间排序
    sortedMessages = sortedMessages.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    // 去重（基于 ID）
    const uniqueMessages = sortedMessages.filter(
      (msg, index, self) => index === self.findIndex((m) => m.id === msg.id)
    );
    return {
      sessionMessages: {
        ...state.sessionMessages,
        [sessionId]: uniqueMessages
      }
    };
  }),
  
  updateSession: (sessionId, updates) => set((state) => {
    const updateSessionInArray = (sessions: Session[]) =>
      sessions.map(session => 
        session.id === sessionId ? { ...session, ...updates } : session
      );
    
    return {
      queuedSessions: updateSessionInArray(state.queuedSessions),
      activeSessions: updateSessionInArray(state.activeSessions),
      currentSession: state.currentSession?.id === sessionId 
        ? { ...state.currentSession, ...updates }
        : state.currentSession
    };
  }),
  
  removeFromQueue: (sessionId) => set((state) => ({
    queuedSessions: state.queuedSessions.filter(session => session.id !== sessionId)
  })),
  
  addToActive: (session) => set((state) => ({
    activeSessions: [...state.activeSessions, session]
  })),
  
  // 增加未读消息数
  incrementUnread: (sessionId) => set((state) => ({
    unreadCounts: {
      ...state.unreadCounts,
      [sessionId]: (state.unreadCounts[sessionId] || 0) + 1,
    },
  })),
  
  // 清除未读消息数
  clearUnread: (sessionId) => set((state) => {
    const newCounts = { ...state.unreadCounts };
    delete newCounts[sessionId];
    const newReadTimes = { ...state.lastReadTimes };
    newReadTimes[sessionId] = Date.now();
    return {
      unreadCounts: newCounts,
      lastReadTimes: newReadTimes,
    };
  }),
  
  // 获取总未读数
  getTotalUnread: () => {
    const state = get();
    return Object.values(state.unreadCounts).reduce((sum, count) => sum + count, 0);
  },
}));
