import { create } from 'zustand';
import type { User } from '../types';
import { getCurrentUser, clearUserInfo, requestLogout } from '../services/auth.service';
import { websocketService } from '../services/websocket.service';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
  initAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  
  setUser: (user) => set({ 
    user, 
    isAuthenticated: !!user 
  }),
  
  logout: () => {
    requestLogout().finally(() => {
      websocketService.disconnect();
      clearUserInfo();
      set({ 
        user: null, 
        isAuthenticated: false 
      });
    });
  },
  
  initAuth: () => {
    const user = getCurrentUser();
    set({ 
      user, 
      isAuthenticated: !!user 
    });
  },
}));
