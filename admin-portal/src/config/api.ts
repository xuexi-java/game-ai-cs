/**
 * API 与 WebSocket 配置
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

export const WS_URL =
  import.meta.env.VITE_WS_URL || 'ws://localhost:3000';

export const DIFY_BASE_URL =
  import.meta.env.VITE_DIFY_BASE_URL || 'http://118.89.16.95/v1';

export const DIFY_API_KEY =
  import.meta.env.VITE_DIFY_API_KEY ||
  'app-PpXCMUQnEnvDbMAN5M86BFp6';

export const DIFY_APP_MODE = (import.meta.env.VITE_DIFY_APP_MODE ||
  'chat') as 'chat' | 'workflow';

export const DIFY_WORKFLOW_ID =
  import.meta.env.VITE_DIFY_WORKFLOW_ID || '';

export const AGENT_STATUS_POLL_INTERVAL =
  Number(import.meta.env.VITE_AGENT_STATUS_POLL_INTERVAL || 30000);
