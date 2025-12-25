/**
 * k6 HTTP API 负载测试脚本
 *
 * 安装 k6:
 *   Windows: choco install k6  或  winget install k6
 *   Mac: brew install k6
 *   Linux: https://k6.io/docs/getting-started/installation/
 *
 * 运行方式:
 *   k6 run scripts/http-api-load.js
 *   k6 run --vus 100 --duration 5m scripts/http-api-load.js
 *   k6 run --out json=results/http-results.json scripts/http-api-load.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const loginDuration = new Trend('login_duration');
const ticketCreateDuration = new Trend('ticket_create_duration');
const ticketListDuration = new Trend('ticket_list_duration');
const requestCounter = new Counter('total_requests');

// 配置
const BASE_URL = __ENV.BASE_URL || 'https://localhost:21101';
const ADMIN_USERNAME = __ENV.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'admin123';

// 测试场景配置
export const options = {
  // 场景定义
  scenarios: {
    // 场景1: 冒烟测试 - 快速验证系统是否正常
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30s',
      startTime: '0s',
      tags: { scenario: 'smoke' },
    },
    // 场景2: 负载测试 - 正常负载下的性能
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // 2分钟内增加到50用户
        { duration: '5m', target: 50 },   // 保持50用户5分钟
        { duration: '2m', target: 100 },  // 2分钟内增加到100用户
        { duration: '5m', target: 100 },  // 保持100用户5分钟
        { duration: '2m', target: 0 },    // 2分钟内减少到0
      ],
      startTime: '30s',
      tags: { scenario: 'load' },
    },
    // 场景3: 压力测试 - 找到系统极限
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '5m', target: 300 },
        { duration: '5m', target: 400 },
        { duration: '2m', target: 0 },
      ],
      startTime: '17m', // 在负载测试后开始
      tags: { scenario: 'stress' },
    },
    // 场景4: 峰值测试 - 突发流量
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 500 },  // 快速增加到500用户
        { duration: '1m', target: 500 },   // 保持1分钟
        { duration: '10s', target: 0 },    // 快速下降
      ],
      startTime: '37m',
      tags: { scenario: 'spike' },
    },
  },

  // 阈值定义 - 性能指标要求
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // 95%请求<500ms, 99%<1s
    http_req_failed: ['rate<0.01'],                   // 错误率<1%
    errors: ['rate<0.05'],                            // 自定义错误率<5%
    login_duration: ['p(95)<1000'],                   // 登录95%<1s
    ticket_create_duration: ['p(95)<2000'],           // 创建工单95%<2s
    ticket_list_duration: ['p(95)<500'],              // 列表查询95%<500ms
  },
};

// HTTP 请求配置
const httpParams = {
  headers: {
    'Content-Type': 'application/json',
  },
  insecureSkipTLSVerify: true,  // 跳过TLS验证（开发环境）
  timeout: '30s',
};

// 登录并获取 token
function login(username, password) {
  const payload = JSON.stringify({
    username: username,
    password: password,
  });

  const startTime = Date.now();
  const res = http.post(`${BASE_URL}/api/v1/auth/login`, payload, httpParams);
  loginDuration.add(Date.now() - startTime);
  requestCounter.add(1);

  const success = check(res, {
    'login status is 200 or 201': (r) => r.status === 200 || r.status === 201,
    'login has token': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.accessToken || body.access_token || body.token;
      } catch {
        return false;
      }
    },
  });

  errorRate.add(!success);

  if (success) {
    try {
      const body = JSON.parse(res.body);
      return body.accessToken || body.access_token || body.token;
    } catch {
      return null;
    }
  }
  return null;
}

// 获取认证头
function getAuthHeaders(token) {
  return {
    ...httpParams,
    headers: {
      ...httpParams.headers,
      'Authorization': `Bearer ${token}`,
    },
  };
}

// 主测试函数
export default function () {
  // 登录
  const token = login(ADMIN_USERNAME, ADMIN_PASSWORD);
  if (!token) {
    console.error('Login failed, skipping test iteration');
    sleep(1);
    return;
  }

  const authParams = getAuthHeaders(token);

  // API 测试组
  group('Health Check', () => {
    const res = http.get(`${BASE_URL}/api/v1/health`, httpParams);
    requestCounter.add(1);
    check(res, {
      'health check status is 200': (r) => r.status === 200,
    });
  });

  group('Ticket Operations', () => {
    // 获取工单列表
    const startList = Date.now();
    const listRes = http.get(`${BASE_URL}/api/v1/tickets?page=1&limit=10`, authParams);
    ticketListDuration.add(Date.now() - startList);
    requestCounter.add(1);

    const listSuccess = check(listRes, {
      'ticket list status is 200': (r) => r.status === 200,
      'ticket list has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.data !== undefined || body.tickets !== undefined || Array.isArray(body);
        } catch {
          return false;
        }
      },
    });
    errorRate.add(!listSuccess);

    // 创建工单 (10%的请求)
    if (Math.random() < 0.1) {
      const ticketPayload = JSON.stringify({
        title: `性能测试工单 - ${Date.now()}`,
        description: '这是一个性能测试创建的工单',
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        issueTypeId: 1,
        gameId: 1,
      });

      const startCreate = Date.now();
      const createRes = http.post(`${BASE_URL}/api/v1/tickets`, ticketPayload, authParams);
      ticketCreateDuration.add(Date.now() - startCreate);
      requestCounter.add(1);

      const createSuccess = check(createRes, {
        'ticket create status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      });
      errorRate.add(!createSuccess);
    }
  });

  group('User Operations', () => {
    // 获取当前用户信息
    const res = http.get(`${BASE_URL}/api/v1/users/me`, authParams);
    requestCounter.add(1);
    check(res, {
      'user info status is 200': (r) => r.status === 200,
    });
  });

  group('Dashboard', () => {
    // 获取仪表盘数据
    const res = http.get(`${BASE_URL}/api/v1/dashboard/metrics`, authParams);
    requestCounter.add(1);
    check(res, {
      'dashboard metrics status is 200': (r) => r.status === 200,
    });
  });

  group('Session Operations', () => {
    // 获取会话列表
    const res = http.get(`${BASE_URL}/api/v1/sessions?page=1&limit=10`, authParams);
    requestCounter.add(1);
    check(res, {
      'session list status is 200': (r) => r.status === 200,
    });
  });

  // 模拟用户思考时间
  sleep(Math.random() * 3 + 1); // 1-4秒随机等待
}

// 测试结束时的汇总
export function handleSummary(data) {
  return {
    'results/http-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}

// 文本汇总格式化
function textSummary(data, options) {
  const { metrics, root_group } = data;

  let summary = '\n========== 性能测试报告 ==========\n\n';

  // 核心指标
  summary += '📊 核心指标:\n';
  if (metrics.http_req_duration) {
    const dur = metrics.http_req_duration.values;
    summary += `  HTTP请求延迟: avg=${dur.avg.toFixed(2)}ms, p95=${dur['p(95)'].toFixed(2)}ms, p99=${dur['p(99)'].toFixed(2)}ms\n`;
  }
  if (metrics.http_reqs) {
    summary += `  总请求数: ${metrics.http_reqs.values.count}\n`;
    summary += `  请求速率: ${metrics.http_reqs.values.rate.toFixed(2)}/s\n`;
  }
  if (metrics.http_req_failed) {
    summary += `  失败率: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  }

  // 自定义指标
  summary += '\n📈 业务指标:\n';
  if (metrics.login_duration) {
    summary += `  登录延迟 p95: ${metrics.login_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  if (metrics.ticket_list_duration) {
    summary += `  工单列表 p95: ${metrics.ticket_list_duration.values['p(95)'].toFixed(2)}ms\n`;
  }
  if (metrics.ticket_create_duration) {
    summary += `  创建工单 p95: ${metrics.ticket_create_duration.values['p(95)'].toFixed(2)}ms\n`;
  }

  summary += '\n==================================\n';

  return summary;
}
