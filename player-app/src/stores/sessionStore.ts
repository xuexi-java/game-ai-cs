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
  updateSession: (updates: Partial<Session>) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  messages: [],
  
  setSession: (session) => {
    set({ 
      session,
      messages: session.messages || [],
    });
  },
  
  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
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
