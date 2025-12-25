/**
 * 简单性能测试脚本 (纯 Node.js，无需额外依赖)
 *
 * 运行方式:
 *   node simple-test.js                    # 默认测试
 *   node simple-test.js --vus 50           # 50并发
 *   node simple-test.js --duration 60      # 60秒
 *   node simple-test.js --stress           # 压力测试模式
 */

const https = require('https');
const http = require('http');

// 配置
const config = {
  baseUrl: process.env.BASE_URL || 'http://localhost:21101',
  vus: parseInt(process.argv.find(a => a.startsWith('--vus'))?.split('=')[1] || process.argv[process.argv.indexOf('--vus') + 1]) || 10,
  duration: parseInt(process.argv.find(a => a.startsWith('--duration'))?.split('=')[1] || process.argv[process.argv.indexOf('--duration') + 1]) || 30,
  stress: process.argv.includes('--stress'),
  username: 'admin',
  password: 'admin123',
};

// 统计数据
const stats = {
  requests: 0,
  success: 0,
  failed: 0,
  latencies: [],
  errors: {},
  startTime: null,
  endTime: null,
};

// 忽略自签名证书
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// HTTP 请求函数
function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const url = new URL(options.url || config.baseUrl + options.path);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      rejectUnauthorized: false,
    };

    const req = client.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        const latency = Date.now() - startTime;
        resolve({
          status: res.statusCode,
          body: data,
          latency,
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// 登录获取 token
async function login() {
  try {
    const res = await request({
      path: '/api/v1/auth/login',
      method: 'POST',
    }, {
      username: config.username,
      password: config.password,
    });

    if (res.status === 200 || res.status === 201) {
      const result = JSON.parse(res.body);
      // 支持多种响应格式
      const data = result.data || result;
      return data.accessToken || data.access_token || data.token;
    } else {
      console.error('Login response:', res.status, res.body.substring(0, 100));
    }
  } catch (e) {
    console.error('Login failed:', e.message);
  }
  return null;
}

// 测试场景
async function runScenario(token) {
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const scenarios = [
    // 健康检查 (公开)
    { path: '/api/v1/health', method: 'GET', weight: 3 },
    // 工单列表 (需要认证)
    { path: '/api/v1/tickets?page=1&pageSize=10', method: 'GET', headers: authHeaders, weight: 4 },
    // 用户信息 (需要认证)
    { path: '/api/v1/users/me', method: 'GET', headers: authHeaders, weight: 3 },
  ];

  // 按权重随机选择场景
  const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
  let random = Math.random() * totalWeight;
  let scenario = scenarios[0];
  for (const s of scenarios) {
    random -= s.weight;
    if (random <= 0) {
      scenario = s;
      break;
    }
  }

  try {
    const res = await request({
      path: scenario.path,
      method: scenario.method,
      headers: scenario.headers,
    });

    stats.requests++;
    stats.latencies.push(res.latency);

    if (res.status >= 200 && res.status < 400) {
      stats.success++;
    } else {
      stats.failed++;
      stats.errors[res.status] = (stats.errors[res.status] || 0) + 1;
    }
  } catch (e) {
    stats.requests++;
    stats.failed++;
    const errKey = e.message.substring(0, 30);
    stats.errors[errKey] = (stats.errors[errKey] || 0) + 1;
  }
}

// 虚拟用户
async function virtualUser(id, token, endTime) {
  while (Date.now() < endTime) {
    await runScenario(token);
    // 随机等待 100-500ms
    await new Promise(r => setTimeout(r, 100 + Math.random() * 400));
  }
}

// 计算百分位数
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// 打印进度
function printProgress() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const rps = stats.requests / elapsed;
  const avgLatency = stats.latencies.length > 0
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
    : 0;

  process.stdout.write(`\r请求: ${stats.requests} | 成功: ${stats.success} | 失败: ${stats.failed} | RPS: ${rps.toFixed(1)} | 平均延迟: ${avgLatency.toFixed(0)}ms    `);
}

// 打印最终报告
function printReport() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const rps = stats.requests / duration;
  const avgLatency = stats.latencies.length > 0
    ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
    : 0;
  const p50 = percentile(stats.latencies, 50);
  const p95 = percentile(stats.latencies, 95);
  const p99 = percentile(stats.latencies, 99);
  const maxLatency = Math.max(...stats.latencies, 0);
  const minLatency = Math.min(...stats.latencies, 0);
  const errorRate = stats.requests > 0 ? (stats.failed / stats.requests * 100) : 0;

  console.log('\n');
  console.log('═'.repeat(50));
  console.log('           性能测试报告');
  console.log('═'.repeat(50));
  console.log('');
  console.log('📊 测试配置:');
  console.log(`   并发用户: ${config.vus}`);
  console.log(`   测试时长: ${config.duration}秒`);
  console.log(`   目标地址: ${config.baseUrl}`);
  console.log('');
  console.log('📈 请求统计:');
  console.log(`   总请求数: ${stats.requests}`);
  console.log(`   成功请求: ${stats.success}`);
  console.log(`   失败请求: ${stats.failed}`);
  console.log(`   请求速率: ${rps.toFixed(2)} req/s`);
  console.log(`   错误率:   ${errorRate.toFixed(2)}%`);
  console.log('');
  console.log('⏱️  响应时间:');
  console.log(`   最小: ${minLatency}ms`);
  console.log(`   平均: ${avgLatency.toFixed(0)}ms`);
  console.log(`   P50:  ${p50}ms`);
  console.log(`   P95:  ${p95}ms`);
  console.log(`   P99:  ${p99}ms`);
  console.log(`   最大: ${maxLatency}ms`);

  if (Object.keys(stats.errors).length > 0) {
    console.log('');
    console.log('⚠️  错误分布:');
    for (const [key, count] of Object.entries(stats.errors)) {
      console.log(`   ${key}: ${count}次`);
    }
  }

  console.log('');
  console.log('═'.repeat(50));

  // 性能评估
  if (p95 < 500 && errorRate < 1) {
    console.log('✅ 性能评估: 优秀');
  } else if (p95 < 1000 && errorRate < 5) {
    console.log('⚠️  性能评估: 可接受');
  } else {
    console.log('❌ 性能评估: 需要优化');
  }
  console.log('═'.repeat(50));
}

// 主函数
async function main() {
  console.log('═'.repeat(50));
  console.log('       游戏AI客服 - 性能测试');
  console.log('═'.repeat(50));
  console.log('');
  console.log(`配置: ${config.vus} 并发用户, ${config.duration} 秒`);
  console.log(`目标: ${config.baseUrl}`);
  console.log('');

  // 登录获取 token
  console.log('🔐 正在登录...');
  const token = await login();
  if (token) {
    console.log('✅ 登录成功');
  } else {
    console.log('⚠️  登录失败，将使用未认证请求');
  }
  console.log('');

  // 压力测试模式 - 逐步增加并发
  if (config.stress) {
    console.log('🔥 压力测试模式 - 逐步增加并发');
    const stages = [
      { vus: 10, duration: 10 },
      { vus: 30, duration: 15 },
      { vus: 50, duration: 15 },
      { vus: 100, duration: 20 },
      { vus: 150, duration: 20 },
      { vus: 200, duration: 20 },
    ];

    for (const stage of stages) {
      console.log(`\n阶段: ${stage.vus} 并发用户, ${stage.duration} 秒`);
      stats.startTime = Date.now();
      const endTime = stats.startTime + stage.duration * 1000;

      const users = [];
      for (let i = 0; i < stage.vus; i++) {
        users.push(virtualUser(i, token, endTime));
      }

      const progressInterval = setInterval(printProgress, 1000);
      await Promise.all(users);
      clearInterval(progressInterval);
      printProgress();
    }

    stats.endTime = Date.now();
    printReport();
    return;
  }

  // 普通测试
  console.log('🚀 开始测试...');
  console.log('');

  stats.startTime = Date.now();
  const endTime = stats.startTime + config.duration * 1000;

  // 启动虚拟用户
  const users = [];
  for (let i = 0; i < config.vus; i++) {
    users.push(virtualUser(i, token, endTime));
  }

  // 进度显示
  const progressInterval = setInterval(printProgress, 1000);

  // 等待所有用户完成
  await Promise.all(users);
  clearInterval(progressInterval);

  stats.endTime = Date.now();
  printReport();
}

main().catch(console.error);
