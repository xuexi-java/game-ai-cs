/**
 * 测试配置
 * 包含测试环境URL、账号信息、超时设置等
 */

export const testConfig = {
  // 应用URL
  urls: {
    playerApp: process.env.PLAYER_APP_URL || 'http://10.10.17.167:20101',
    adminPortal: process.env.ADMIN_PORTAL_URL || 'http://10.10.17.167:20102',
    backend: process.env.BACKEND_URL || 'http://10.10.17.167:3000',
  },

  // 测试账号
  accounts: {
    admin: {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
    },
    agent: {
      username: process.env.AGENT_USERNAME || 'agent',
      password: process.env.AGENT_PASSWORD || 'agent123',
    },
  },

  // 超时设置（毫秒）
  timeouts: {
    pageLoad: 30000,
    elementWait: 10000,
    apiRequest: 15000,
  },

  // 重试设置
  retry: {
    maxAttempts: 3,
    delay: 1000,
  },

  // 截图设置
  screenshots: {
    basePath: './tests/reports/screenshots',
    format: 'png',
    enabled: true,
  },
};






