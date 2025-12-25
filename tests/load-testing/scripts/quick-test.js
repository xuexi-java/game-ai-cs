/**
 * 快速性能测试脚本
 *
 * 用于快速验证系统性能，执行时间短，覆盖主要功能。
 *
 * 运行方式:
 *   k6 run scripts/quick-test.js
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 指标
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const wsConnectTime = new Trend('ws_connect_time');

// 配置
const BASE_URL = __ENV.BASE_URL || 'https://localhost:21101';
const WS_URL = __ENV.WS_URL || 'wss://localhost:21101';

export const options = {
  stages: [
    { duration: '10s', target: 10 },   // 预热
    { duration: '30s', target: 30 },   // 加载
    { duration: '20s', target: 50 },   // 峰值
    { duration: '10s', target: 0 },    // 冷却
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    errors: ['rate<0.1'],
    api_latency: ['p(95)<500'],
  },
};

const httpParams = {
  headers: { 'Content-Type': 'application/json' },
  insecureSkipTLSVerify: true,
  timeout: '10s',
};

export default function () {
  // 1. 健康检查
  group('Health Check', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/health`, httpParams);
    apiLatency.add(Date.now() - start);

    const success = check(res, {
      'health check OK': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  // 2. 登录测试
  group('Login', () => {
    const start = Date.now();
    const res = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({
        username: __ENV.ADMIN_USERNAME || 'admin',
        password: __ENV.ADMIN_PASSWORD || 'admin123',
      }),
      httpParams
    );
    apiLatency.add(Date.now() - start);

    const success = check(res, {
      'login OK': (r) => r.status === 200 || r.status === 201,
    });
    errorRate.add(!success);

    if (success) {
      try {
        const body = JSON.parse(res.body);
        const token = body.accessToken || body.access_token || body.token;

        if (token) {
          // 使用 token 获取用户信息
          const authParams = {
            ...httpParams,
            headers: {
              ...httpParams.headers,
              Authorization: `Bearer ${token}`,
            },
          };

          const userRes = http.get(`${BASE_URL}/api/v1/users/me`, authParams);
          check(userRes, {
            'user info OK': (r) => r.status === 200,
          });
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  });

  // 3. 公开API测试
  group('Public API', () => {
    const start = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/metrics`, httpParams);
    apiLatency.add(Date.now() - start);

    check(res, {
      'metrics accessible': (r) => r.status === 200,
    });
  });

  sleep(Math.random() * 2 + 0.5);
}

export function handleSummary(data) {
  const { metrics } = data;

  let summary = '\n====== 快速测试报告 ======\n\n';

  if (metrics.http_req_duration) {
    const d = metrics.http_req_duration.values;
    summary += `HTTP延迟: avg=${d.avg.toFixed(0)}ms, p95=${d['p(95)'].toFixed(0)}ms\n`;
  }
  if (metrics.http_reqs) {
    summary += `总请求数: ${metrics.http_reqs.values.count}\n`;
    summary += `请求速率: ${metrics.http_reqs.values.rate.toFixed(1)}/s\n`;
  }
  if (metrics.errors) {
    summary += `错误率: ${(metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  }

  // 结果判断
  const p95 = metrics.http_req_duration?.values['p(95)'] || 0;
  const errRate = metrics.errors?.values.rate || 0;

  summary += '\n';
  if (p95 < 500 && errRate < 0.05) {
    summary += '✅ 性能良好\n';
  } else if (p95 < 1000 && errRate < 0.1) {
    summary += '⚠️ 性能可接受，但有优化空间\n';
  } else {
    summary += '❌ 性能不达标，需要优化\n';
  }

  summary += '\n==========================\n';

  return { stdout: summary };
}
