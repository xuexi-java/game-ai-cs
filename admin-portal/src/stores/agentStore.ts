import { create } from 'zustand';
import type { OnlineAgent } from '../types';

interface AgentState {
  allAgents: OnlineAgent[];
  onlineAgents: OnlineAgent[];
  setAllAgents: (agents: OnlineAgent[]) => void;
  setOnlineAgents: (agents: OnlineAgent[]) => void;
  updateAgentStatus: (
    agentId: string,
    isOnline: boolean,
    payload?: Partial<OnlineAgent>,
  ) => void;
}

const normalizeAgents = (agents: OnlineAgent[]): OnlineAgent[] => {
  const map = new Map<string, OnlineAgent>();
  agents.forEach((agent) => {
    map.set(agent.id, { ...agent });
  });
  return Array.from(map.values());
};

export const useAgentStore = create<AgentState>((set) => ({
  allAgents: [],
  onlineAgents: [],
  setAllAgents: (agents) =>
    set({
      allAgents: normalizeAgents(agents),
      onlineAgents: normalizeAgents(agents.filter((agent) => agent.isOnline)),
    }),
  setOnlineAgents: (agents) =>
    set((state) => {
      const onlineMap = new Map(
        agents.map((agent) => [agent.id, { ...agent, isOnline: true }]),
      );

      const updatedAll = state.allAgents.map((agent) => {
        if (onlineMap.has(agent.id)) {
          const updated = onlineMap.get(agent.id)!;
          onlineMap.delete(agent.id);
          return { ...agent, ...updated, isOnline: true };
        }
        return { ...agent, isOnline: false };
      });

      onlineMap.forEach((agent) => {
        updatedAll.push(agent);
      });

      return {
        allAgents: normalizeAgents(updatedAll),
        onlineAgents: normalizeAgents(
          updatedAll.filter((agent) => agent.isOnline),
        ),
      };
    }),
  updateAgentStatus: (agentId, isOnline, payload) =>
    set((state) => {
      let foundAgent: OnlineAgent | null = null;
      const updatedAll = state.allAgents.map((agent) => {
        if (agent.id === agentId) {
          const updated = {
            ...agent,
            ...payload,
            isOnline,
          };
          foundAgent = updated;
          return updated;
        }
        return agent;
      });

      if (!foundAgent) {
        const newAgent: OnlineAgent = {
          id: agentId,
          username: payload?.username || '客服',
          realName: payload?.realName,
          avatar: payload?.avatar,
          isOnline,
          lastLoginAt: payload?.lastLoginAt,
        };
        updatedAll.push(newAgent);
        foundAgent = newAgent;
      }

      const updatedOnline = isOnline
        ? [
            ...state.onlineAgents.filter((agent) => agent.id !== agentId),
            foundAgent,
          ]
        : state.onlineAgents.filter((agent) => agent.id !== agentId);

      return {
        allAgents: normalizeAgents(updatedAll),
        onlineAgents: normalizeAgents(
          updatedOnline.filter((agent) => agent.isOnline),
        ),
      };
    }),
}));

