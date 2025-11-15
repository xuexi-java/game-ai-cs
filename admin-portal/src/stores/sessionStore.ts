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
  
  // Actions
  setQueuedSessions: (sessions: Session[]) => void;
  setActiveSessions: (sessions: Session[]) => void;
  setCurrentSession: (session: Session | null) => void;
  addMessage: (sessionId: string, message: Message) => void;
  setSessionMessages: (sessionId: string, messages: Message[]) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  removeFromQueue: (sessionId: string) => void;
  addToActive: (session: Session) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  activeSessions: [],
  queuedSessions: [],
  currentSession: null,
  sessionMessages: {},
  
  setQueuedSessions: (sessions) => set({ queuedSessions: sessions }),
  
  setActiveSessions: (sessions) => set({ activeSessions: sessions }),
  
  setCurrentSession: (session) => set({ currentSession: session }),
  
  addMessage: (sessionId, message) => set((state) => ({
    sessionMessages: {
      ...state.sessionMessages,
      [sessionId]: [...(state.sessionMessages[sessionId] || []), message]
    }
  })),
  
  setSessionMessages: (sessionId, messages) => set((state) => ({
    sessionMessages: {
      ...state.sessionMessages,
      [sessionId]: messages
    }
  })),
  
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
}));
