/**
 * wsToken 错误场景测试脚本
 * 用于验证详细错误日志输出
 */

const { io } = require('socket.io-client');
const jwt = require('jsonwebtoken');

const WS_URL = 'http://localhost:21101';
const WS_SECRET = 'game-ai-ws-secret'; // 默认 secret

console.log('========================================');
console.log('  wsToken 错误场景测试');
console.log('========================================\n');

// 测试场景
const testCases = [
  {
    name: '1. 空 Token',
    token: '',
    expected: 'wsToken为空',
  },
  {
    name: '2. 无效格式 Token',
    token: 'invalid-token-format',
    expected: 'JWT解析失败',
  },
  {
    name: '3. 错误签名 Token',
    token: jwt.sign({ gameid: 'test', areaid: '1', uid: 'u1', type: 'ws' }, 'wrong-secret', { expiresIn: '1h' }),
    expected: 'JWT解析失败: invalid signature',
  },
  {
    name: '4. 过期 Token',
    token: jwt.sign({ gameid: 'test', areaid: '1', uid: 'u1', type: 'ws' }, WS_SECRET, { expiresIn: '-1s' }),
    expected: 'Token已过期',
  },
  {
    name: '5. 类型错误 Token (session 类型)',
    token: jwt.sign({ gameid: 'test', areaid: '1', uid: 'u1', type: 'session' }, WS_SECRET, { expiresIn: '1h' }),
    expected: 'Token类型错误',
  },
  {
    name: '6. 缺少字段 Token (无 gameid)',
    token: jwt.sign({ areaid: '1', uid: 'u1', type: 'ws' }, WS_SECRET, { expiresIn: '1h' }),
    expected: 'Token缺少必要字段: gameid',
  },
  {
    name: '7. 缺少多个字段 Token',
    token: jwt.sign({ type: 'ws' }, WS_SECRET, { expiresIn: '1h' }),
    expected: 'Token缺少必要字段: gameid, areaid, uid',
  },
];

async function runTest(testCase, index) {
  return new Promise((resolve) => {
    console.log(`\n测试 ${testCase.name}`);
    console.log(`  预期: ${testCase.expected}`);

    const socket = io(WS_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false, // 禁用重连
      auth: {
        token: testCase.token
      },
      timeout: 5000,
    });

    let resolved = false;
    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      socket.disconnect();
      resolve(result);
    };

    socket.on('connect', () => {
      console.log(`  结果: 连接成功 (意外)`);
      finish(false);
    });

    socket.on('error', (data) => {
      console.log(`  结果: 收到错误 - ${data.message}`);
      finish(true);
    });

    socket.on('connect_error', (err) => {
      console.log(`  结果: 连接错误 - ${err.message}`);
      finish(true);
    });

    socket.on('disconnect', (reason) => {
      console.log(`  结果: 断开 - ${reason}`);
      finish(true);
    });

    // 超时处理
    setTimeout(() => {
      console.log(`  结果: 超时`);
      finish(false);
    }, 3000);
  });
}

async function main() {
  console.log(`目标: ${WS_URL}`);
  console.log(`测试数量: ${testCases.length}`);

  for (let i = 0; i < testCases.length; i++) {
    await runTest(testCases[i], i);
    // 间隔 500ms
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n========================================');
  console.log('  测试完成! 请查看后端日志输出');
  console.log('========================================\n');

  process.exit(0);
}

main().catch(console.error);
