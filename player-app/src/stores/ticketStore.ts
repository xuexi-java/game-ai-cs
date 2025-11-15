/**
 * 工单状态管理
 */
import { create } from 'zustand';

export interface TicketState {
  // 步骤1：身份验证信息
  gameId: string | null;
  serverId: string | null;
  playerIdOrName: string | null;
  
  // 步骤3：工单信息
  ticketId: string | null;
  ticketNo: string | null;
  ticketToken: string | null;
  
  // 设置身份信息
  setIdentity: (gameId: string, serverId: string, playerIdOrName: string) => void;
  
  // 设置工单信息
  setTicket: (ticketId: string, ticketNo: string, token: string) => void;
  
  // 重置状态
  reset: () => void;
}

export const useTicketStore = create<TicketState>((set) => ({
  gameId: null,
  serverId: null,
  playerIdOrName: null,
  ticketId: null,
  ticketNo: null,
  ticketToken: null,
  
  setIdentity: (gameId, serverId, playerIdOrName) => {
    set({ gameId, serverId, playerIdOrName });
  },
  
  setTicket: (ticketId, ticketNo, token) => {
    set({ ticketId, ticketNo, ticketToken: token });
  },
  
  reset: () => {
    set({
      gameId: null,
      serverId: null,
      playerIdOrName: null,
      ticketId: null,
      ticketNo: null,
      ticketToken: null,
    });
  },
}));

