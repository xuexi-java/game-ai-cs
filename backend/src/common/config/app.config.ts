/**
 * 应用配置 - 统一管理所有可配置项
 * 避免硬编码，便于环境配置和维护
 */

export interface AppConfig {
  // ==================== 服务器配置 ====================
  server: {
    port: number;
    host: string;
  };

  // ==================== Redis 配置 ====================
  redis: {
    url?: string;
    host: string;
    port: number;
    maxRetriesPerRequest: number;
    maxReconnectAttempts: number;
    retryDelayBase: number;
    retryDelayMax: number;
    connectTimeout: number;
    pingTimeout: number;
  };

  // ==================== CORS 配置 ====================
  cors: {
    defaultDevOrigins: string[];
  };

  // ==================== WebSocket 配置 ====================
  websocket: {
    heartbeat: {
      checkInterval: number;
      maxMissedCount: number;
      pingTimeout: number;
    };
    rateLimit: {
      playerPerMinute: number;
      agentPerMinute: number;
      playerBurst: number;
      agentBurst: number;
      noticeCooldownMs: number;
    };
    stateTtl: number;
  };

  // ==================== 队列配置 ====================
  queue: {
    retryDelayBase: number;
    retryDelayMax: number;
    maxRetries: number;
  };

  // ==================== 限流配置 ====================
  throttle: {
    global: {
      ttl: number;
      limit: number;
    };
    difyApi: {
      ttl: number;
      limit: number;
    };
    session: {
      ttl: number;
      limit: number;
    };
    ticket: {
      ttl: number;
      limit: number;
    };
  };

  // ==================== 安全配置 ====================
  security: {
    encryption: {
      defaultKey: string;
      salt: string;
    };
    jwt: {
      defaultSecret: string;
      expiresIn: string;
    };
  };

  // ==================== 翻译服务配置 ====================
  translation: {
    baidu: {
      apiUrl: string;
      timeout: number;
    };
  };

  // ==================== Dify API 配置 ====================
  dify: {
    defaultLimit: number;
  };
}

/**
 * 获取应用配置
 * 优先使用环境变量，否则使用默认值
 */
export function getAppConfig(): AppConfig {
  return {
    server: {
      port: parseInt(process.env.PORT || '21101', 10),
      host: process.env.HOST || 'localhost',
    },

    redis: {
      url: process.env.REDIS_URL,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: parseInt(
        process.env.REDIS_MAX_RETRIES_PER_REQUEST || '3',
        10,
      ),
      maxReconnectAttempts: parseInt(
        process.env.REDIS_MAX_RECONNECT_ATTEMPTS || '5',
        10,
      ),
      retryDelayBase: parseInt(process.env.REDIS_RETRY_DELAY_BASE || '200', 10),
      retryDelayMax: parseInt(process.env.REDIS_RETRY_DELAY_MAX || '2000', 10),
      connectTimeout: parseInt(
        process.env.REDIS_CONNECT_TIMEOUT || '5000',
        10,
      ),
      pingTimeout: parseInt(process.env.REDIS_PING_TIMEOUT || '2000', 10),
    },

    cors: {
      defaultDevOrigins: (
        process.env.CORS_DEFAULT_DEV_ORIGINS ||
        'http://localhost:20101,http://localhost:20102,http://127.0.0.1:20101,http://127.0.0.1:20102'
      ).split(','),
    },

    websocket: {
      heartbeat: {
        checkInterval: parseInt(
          process.env.WS_HEARTBEAT_CHECK_INTERVAL || '15000',
          10,
        ),
        maxMissedCount: parseInt(
          process.env.WS_HEARTBEAT_MAX_MISSED || '3',
          10,
        ),
        pingTimeout: parseInt(
          process.env.WS_HEARTBEAT_PING_TIMEOUT || '15000',
          10,
        ),
      },
      rateLimit: {
        playerPerMinute: parseInt(process.env.WS_PLAYER_RATE_LIMIT || '200', 10),
        agentPerMinute: parseInt(process.env.WS_AGENT_RATE_LIMIT || '600', 10),
        playerBurst: parseInt(process.env.WS_PLAYER_BURST || '20', 10),
        agentBurst: parseInt(process.env.WS_AGENT_BURST || '60', 10),
        noticeCooldownMs: parseInt(
          process.env.WS_RATE_LIMIT_NOTICE_COOLDOWN || '1000',
          10,
        ),
      },
      stateTtl: parseInt(process.env.WS_STATE_TTL || '86400', 10),
    },

    queue: {
      retryDelayBase: parseInt(
        process.env.QUEUE_RETRY_DELAY_BASE || '1000',
        10,
      ),
      retryDelayMax: parseInt(process.env.QUEUE_RETRY_DELAY_MAX || '4000', 10),
      maxRetries: parseInt(process.env.QUEUE_MAX_RETRIES || '3', 10),
    },

    throttle: {
      global: {
        ttl: parseInt(process.env.THROTTLE_GLOBAL_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_GLOBAL_LIMIT || '200', 10),
      },
      difyApi: {
        ttl: parseInt(process.env.THROTTLE_DIFY_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_DIFY_LIMIT || '100', 10),
      },
      session: {
        ttl: parseInt(process.env.THROTTLE_SESSION_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_SESSION_LIMIT || '1000', 10),
      },
      ticket: {
        ttl: parseInt(process.env.THROTTLE_TICKET_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLE_TICKET_LIMIT || '1000', 10),
      },
    },

    security: {
      encryption: {
        defaultKey:
          process.env.ENCRYPTION_SECRET_KEY ||
          'default-secret-key-change-in-production-32-chars!!',
        salt: process.env.ENCRYPTION_SALT || 'game-ai-encryption-salt',
      },
      jwt: {
        defaultSecret:
          process.env.JWT_SECRET ||
          'SusHber0XrWDhXz_mv5-TgRAnmgQlcinGtVT8d-2250niMFCw_Z9fHH5G78qL879',
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
      },
    },

    translation: {
      baidu: {
        apiUrl:
          process.env.BAIDU_TRANSLATE_API_URL ||
          'https://fanyi-api.baidu.com/api/trans/vip/translate',
        timeout: parseInt(process.env.BAIDU_TRANSLATE_TIMEOUT || '30000', 10),
      },
    },

    dify: {
      defaultLimit: parseInt(process.env.DIFY_DEFAULT_LIMIT || '20', 10),
    },
  };
}

// 导出单例配置
export const appConfig = getAppConfig();
