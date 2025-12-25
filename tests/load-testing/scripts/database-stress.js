/**
 * k6 数据库压力测试脚本
 *
 * 通过API接口测试数据库性能，包括：
 * - 复杂查询
 * - 高并发写入
 * - 大数据量分页
 * - 聚合统计
 *
 * 运行方式:
 *   k6 run scripts/database-stress.js
 *   k6 run --vus 50 --duration 10m scripts/database-stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const queryDuration = new Trend('query_duration');
const writeDuration = new Trend('write_duration');
const aggregateDuration = new Trend('aggregate_duration');
const paginationDuration = new Trend('pagination_duration');
const searchDuration = new Trend('search_duration');

// 配置
const BASE_URL = __ENV.BASE_URL || 'https://localhost:21101';
const ADMIN_USERNAME = __ENV.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'admin123';

// 测试场景配置
export const options = {
  scenarios: {
    // 场景1: 读密集型测试
    read_heavy: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
      tags: { scenario: 'read_heavy' },
    },
    // 场景2: 写密集型测试
    write_heavy: {
      executor: 'constant-vus',
      vus: 20,
      duration: '5m',
      startTime: '5m',
      tags: { scenario: 'write_heavy' },
      env: { WRITE_HEAVY: 'true' },
    },
    // 场景3: 混合读写测试
    mixed: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '3m', target: 100 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'mixed' },
    },
    // 场景4: 极限并发测试
    max_concurrent: {
      executor: 'constant-arrival-rate',
      rate: 200,           // 每秒200个请求
      timeUnit: '1s',
      duration: '3m',
      preAllocatedVUs: 100,
      maxVUs: 500,
      startTime: '17m',
      tags: { scenario: 'max_concurrent' },
    },
  },

  thresholds: {
    query_duration: ['p(95)<500'],        // 查询95%<500ms
    write_duration: ['p(95)<1000'],       // 写入95%<1s
    aggregate_duration: ['p(95)<2000'],   // 聚合95%<2s
    pagination_duration: ['p(95)<300'],   // 分页95%<300ms
    search_duration: ['p(95)<1000'],      // 搜索95%<1s
    errors: ['rate<0.05'],                // 错误率<5%
  },
};

// HTTP 请求配置
const httpParams = {
  headers: { 'Content-Type': 'application/json' },
  insecureSkipTLSVerify: true,
  timeout: '30s',
};

let authToken = null;

// 初始化 - 登录获取token
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    httpParams
  );

  if (loginRes.status === 200 || loginRes.status === 201) {
    try {
      const body = JSON.parse(loginRes.body);
      return { token: body.accessToken || body.access_token || body.token };
    } catch (e) {
      console.error('Failed to parse login response');
    }
  }
  return { token: null };
}

// 获取认证头
function getAuthParams(token) {
  return {
    ...httpParams,
    headers: {
      ...httpParams.headers,
      'Authorization': `Bearer ${token}`,
    },
  };
}

// 主测试函数
export default function (data) {
  const token = data.token;
  if (!token) {
    console.error('No auth token available');
    sleep(1);
    return;
  }

  const authParams = getAuthParams(token);
  const isWriteHeavy = __ENV.WRITE_HEAVY === 'true';

  // 测试组1: 分页查询测试
  group('Pagination Tests', () => {
    // 测试不同页码和每页数量
    const pageSizes = [10, 20, 50, 100];
    const pageSize = pageSizes[Math.floor(Math.random() * pageSizes.length)];
    const page = Math.floor(Math.random() * 10) + 1;

    const startTime = Date.now();
    const res = http.get(
      `${BASE_URL}/api/v1/tickets?page=${page}&limit=${pageSize}`,
      authParams
    );
    paginationDuration.add(Date.now() - startTime);

    const success = check(res, {
      'pagination status is 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  // 测试组2: 复杂查询测试
  group('Complex Query Tests', () => {
    // 带过滤条件的查询
    const statuses = ['open', 'pending', 'in_progress', 'resolved', 'closed'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const priority = priorities[Math.floor(Math.random() * priorities.length)];

    const startTime = Date.now();
    const res = http.get(
      `${BASE_URL}/api/v1/tickets?status=${status}&priority=${priority}&page=1&limit=20`,
      authParams
    );
    queryDuration.add(Date.now() - startTime);

    const success = check(res, {
      'complex query status is 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  // 测试组3: 搜索测试
  group('Search Tests', () => {
    const searchTerms = ['问题', '游戏', '账号', '充值', '登录', 'bug', 'error'];
    const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];

    const startTime = Date.now();
    const res = http.get(
      `${BASE_URL}/api/v1/tickets?search=${encodeURIComponent(term)}&page=1&limit=20`,
      authParams
    );
    searchDuration.add(Date.now() - startTime);

    const success = check(res, {
      'search status is 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  // 测试组4: 聚合统计测试
  group('Aggregation Tests', () => {
    const startTime = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/dashboard/metrics`, authParams);
    aggregateDuration.add(Date.now() - startTime);

    const success = check(res, {
      'aggregation status is 200': (r) => r.status === 200,
    });
    errorRate.add(!success);
  });

  // 测试组5: 写入测试
  if (isWriteHeavy || Math.random() < 0.3) {
    group('Write Tests', () => {
      // 创建工单
      const ticketPayload = JSON.stringify({
        title: `数据库压测工单 ${Date.now()}-${__VU}`,
        description: `这是数据库压力测试创建的工单，用于测试写入性能。VU: ${__VU}, Iteration: ${__ITER}`,
        priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
        issueTypeId: 1,
        gameId: 1,
      });

      const startTime = Date.now();
      const res = http.post(`${BASE_URL}/api/v1/tickets`, ticketPayload, authParams);
      writeDuration.add(Date.now() - startTime);

      const success = check(res, {
        'write status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      });
      errorRate.add(!success);

      // 如果创建成功，尝试更新
      if (success && res.body) {
        try {
          const ticket = JSON.parse(res.body);
          if (ticket.id) {
            const updatePayload = JSON.stringify({
              status: 'in_progress',
              priority: 'high',
            });

            const updateStart = Date.now();
            const updateRes = http.patch(
              `${BASE_URL}/api/v1/tickets/${ticket.id}`,
              updatePayload,
              authParams
            );
            writeDuration.add(Date.now() - updateStart);

            check(updateRes, {
              'update status is 200': (r) => r.status === 200,
            });
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    });
  }

  // 测试组6: 关联查询测试
  group('Related Query Tests', () => {
    // 获取工单详情（包含关联数据）
    const ticketIds = [1, 2, 3, 4, 5];
    const ticketId = ticketIds[Math.floor(Math.random() * ticketIds.length)];

    const startTime = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/tickets/${ticketId}`, authParams);
    queryDuration.add(Date.now() - startTime);

    // 即使404也算正常（工单可能不存在）
    check(res, {
      'related query status is valid': (r) => r.status === 200 || r.status === 404,
    });

    // 获取工单消息
    if (res.status === 200) {
      const msgStart = Date.now();
      const msgRes = http.get(`${BASE_URL}/api/v1/tickets/${ticketId}/messages`, authParams);
      queryDuration.add(Date.now() - msgStart);
    }
  });

  // 测试组7: 会话数据测试
  group('Session Data Tests', () => {
    const startTime = Date.now();
    const res = http.get(
      `${BASE_URL}/api/v1/sessions?page=1&limit=20&status=active`,
      authParams
    );
    queryDuration.add(Date.now() - startTime);

    check(res, {
      'session query status is 200': (r) => r.status === 200,
    });
  });

  // 模拟思考时间
  sleep(Math.random() * 2 + 0.5);
}

// 测试结束时的汇总
export function handleSummary(data) {
  return {
    'results/database-summary.json': JSON.stringify(data, null, 2),
    stdout: generateReport(data),
  };
}

function generateReport(data) {
  const { metrics } = data;

  let report = '\n========== 数据库性能测试报告 ==========\n\n';

  report += '📊 查询性能:\n';
  if (metrics.query_duration) {
    const q = metrics.query_duration.values;
    report += `  通用查询: avg=${q.avg.toFixed(2)}ms, p95=${q['p(95)'].toFixed(2)}ms, max=${q.max.toFixed(2)}ms\n`;
  }
  if (metrics.pagination_duration) {
    const p = metrics.pagination_duration.values;
    report += `  分页查询: avg=${p.avg.toFixed(2)}ms, p95=${p['p(95)'].toFixed(2)}ms\n`;
  }
  if (metrics.search_duration) {
    const s = metrics.search_duration.values;
    report += `  搜索查询: avg=${s.avg.toFixed(2)}ms, p95=${s['p(95)'].toFixed(2)}ms\n`;
  }
  if (metrics.aggregate_duration) {
    const a = metrics.aggregate_duration.values;
    report += `  聚合统计: avg=${a.avg.toFixed(2)}ms, p95=${a['p(95)'].toFixed(2)}ms\n`;
  }

  report += '\n📈 写入性能:\n';
  if (metrics.write_duration) {
    const w = metrics.write_duration.values;
    report += `  写入操作: avg=${w.avg.toFixed(2)}ms, p95=${w['p(95)'].toFixed(2)}ms, max=${w.max.toFixed(2)}ms\n`;
  }

  report += '\n⚠️  错误统计:\n';
  if (metrics.errors) {
    report += `  错误率: ${(metrics.errors.values.rate * 100).toFixed(2)}%\n`;
  }
  if (metrics.http_req_failed) {
    report += `  HTTP失败率: ${(metrics.http_req_failed.values.rate * 100).toFixed(2)}%\n`;
  }

  report += '\n==========================================\n';

  return report;
}
