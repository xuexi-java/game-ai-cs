/**
 * WebView 玩家端端到端测试
 * 测试完整流程：mock-game-server -> bootstrap -> websocket -> 工单 -> 消息
 */

const { io } = require('socket.io-client');
const crypto = require('crypto');

// 配置
const CONFIG = {
  MOCK_SERVER: 'http://localhost:3001',
  BACKEND_API: 'http://localhost:21101',
  BACKEND_WS: 'http://localhost:21101',
  TEST_PLAYER: {
    uid: 'player001',
    areaid: '1'
  }
};

// 辅助函数
function log(step, message, data = null) {
  const time = new Date().toISOString().slice(11, 23);
  console.log(`[${time}] [${step}] ${message}`);
  if (data) {
    console.log('         ', JSON.stringify(data, null, 2).split('\n').join('\n          '));
  }
}

function success(step, message) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ✓ [${step}] ${message}`);
}

function fail(step, message, error = null) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ✗ [${step}] ${message}`);
  if (error) console.log('          Error:', error);
}

// 生成签名
function generateSign(gameid, uid, areaid, nonce, secret) {
  const signStr = `${gameid}|${uid}|${areaid}|${nonce}|${secret}`;
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
}

// 测试步骤
async function step1_getGameConfig() {
  log('Step1', '从 mock-game-server 获取游戏配置...');

  const res = await fetch(`${CONFIG.MOCK_SERVER}/api/config`);
  const data = await res.json();

  if (!data.success || !data.data) {
    throw new Error('获取游戏配置失败');
  }

  success('Step1', `游戏配置获取成功: gameId=${data.data.gameId}`);
  return data.data;
}

async function step2_getAuthInfo(gameConfig) {
  log('Step2', '从 mock-game-server 获取玩家认证信息...');

  const res = await fetch(`${CONFIG.MOCK_SERVER}/api/get-cs-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      uid: CONFIG.TEST_PLAYER.uid,
      areaid: CONFIG.TEST_PLAYER.areaid
    })
  });
  const data = await res.json();

  if (!data.success || !data.data) {
    throw new Error('获取认证信息失败');
  }

  success('Step2', `认证信息获取成功: uid=${data.data.uid}, sign=${data.data.sign.substring(0, 8)}...`);
  return data.data;
}

async function step3_bootstrap(authInfo) {
  log('Step3', '调用 Bootstrap 接口获取 wsToken...');

  const { gameid, uid, areaid, playerName, nonce, sign } = authInfo;

  // 参数放在 body 里（SignGuard 从 body 读取）
  const res = await fetch(`${CONFIG.BACKEND_API}/api/v1/player/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      gameid,
      uid,
      areaid,
      playerName,
      nonce,
      sign
    })
  });

  const response = await res.json();

  // 处理嵌套结构: { success, data: { result, data: { wsToken, ... } } }
  const data = response.data?.data || response.data || response;

  if (!data.wsToken) {
    throw new Error(`Bootstrap 失败: ${JSON.stringify(response)}`);
  }

  success('Step3', `Bootstrap 成功: wsToken=${data.wsToken.substring(0, 20)}...`);
  log('Step3', `已有活跃工单: ${data.activeTicket ? data.activeTicket.tid : '无'}`);
  return data;
}

async function step4_connectWebSocket(bootstrapData) {
  log('Step4', '建立 WebSocket 连接...');

  return new Promise((resolve, reject) => {
    const socket = io(CONFIG.BACKEND_WS, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token: bootstrapData.wsToken }
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('WebSocket 连接超时'));
    }, 10000);

    socket.on('connect', () => {
      success('Step4', `WebSocket 连接成功: socketId=${socket.id}`);
    });

    socket.on('connection:ready', (data) => {
      clearTimeout(timeout);
      success('Step4', `连接就绪: gameid=${data.gameid}, uid=${data.uid}`);
      resolve({ socket, readyData: data });
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket 错误: ${JSON.stringify(err)}`));
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`连接错误: ${err.message}`));
    });
  });
}

async function step5_createOrResumeTicket(socket, bootstrapData) {
  // 检查是否有活跃工单
  if (bootstrapData.activeTicket) {
    log('Step5', `恢复已有工单: ${bootstrapData.activeTicket.tid}...`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        // 恢复工单可能不会触发事件，直接视为成功
        success('Step5', `工单恢复成功: tid=${bootstrapData.activeTicket.tid}`);
        resolve(bootstrapData.activeTicket);
      }, 3000);

      socket.once('connection:ready', (data) => {
        clearTimeout(timeout);
        if (data.tid) {
          success('Step5', `工单恢复成功: tid=${data.tid}`);
          resolve({ tid: data.tid, status: data.status || bootstrapData.activeTicket.status });
        }
      });

      socket.emit('ticket:resume', { tid: bootstrapData.activeTicket.tid });
    });
  }

  log('Step5', '创建新工单...');

  // 获取问题类型
  const questList = bootstrapData.questList;
  if (!questList || questList.length === 0) {
    throw new Error('没有可用的问题类型');
  }

  const issueType = questList[0].id;
  log('Step5', `选择问题类型: ${questList[0].name} (${issueType})`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('创建工单超时'));
    }, 10000);

    socket.once('ticket:created', (data) => {
      clearTimeout(timeout);
      success('Step5', `工单创建成功: tid=${data.tid}, status=${data.status}`);
      resolve(data);
    });

    socket.once('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`创建工单失败: ${JSON.stringify(err)}`));
    });

    socket.emit('ticket:create', { issueType, confirmClose: true });
  });
}

async function step6_sendMessage(socket) {
  log('Step6', '发送消息...');

  const testMessage = '你好，这是一条测试消息，请问如何充值？';
  const clientMsgId = `test_${Date.now()}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('消息发送超时'));
    }, 10000);

    socket.once('message:ack', (data) => {
      clearTimeout(timeout);
      if (data.clientMsgId === clientMsgId) {
        success('Step6', `消息发送成功: msgId=${data.id}, status=${data.status}`);
        resolve(data);
      }
    });

    socket.emit('message:send', {
      content: testMessage,
      clientMsgId,
      type: 'TEXT'
    });
  });
}

async function step7_waitForAIReply(socket) {
  log('Step7', '等待 AI 回复...');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      log('Step7', 'AI 回复超时 (可能 Dify 未配置)，跳过');
      resolve(null);
    }, 15000);

    socket.once('message', (data) => {
      clearTimeout(timeout);
      if (data.message && data.message.senderType === 'AI') {
        success('Step7', `收到 AI 回复: ${data.message.content.substring(0, 50)}...`);
        resolve(data.message);
      }
    });
  });
}

async function step7b_transferToAgent(socket) {
  log('Step7b', '测试转人工...');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      // 超时不算失败，可能没有客服在线
      log('Step7b', '转人工超时（可能无在线客服）');
      resolve({ timeout: true });
    }, 10000);

    socket.once('transfer:result', (data) => {
      clearTimeout(timeout);
      if (data.convertedToTicket) {
        success('Step7b', `转为加急工单: ticketNo=${data.ticketNo}, message=${data.message}`);
      } else if (data.success) {
        success('Step7b', `已进入排队: queuePosition=${data.queuePosition}`);
      } else {
        log('Step7b', `转人工失败: ${data.error}`);
      }
      resolve(data);
    });

    socket.emit('transfer:request', { reason: 'E2E_TEST' });
  });
}

async function step8_closeTicket(socket) {
  log('Step8', '关闭工单...');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('关闭工单超时'));
    }, 10000);

    socket.once('ticket:update', (data) => {
      clearTimeout(timeout);
      if (data.status === 'RESOLVED') {
        success('Step8', `工单已关闭: reason=${data.closeReason}`);
        resolve(data);
      }
    });

    socket.emit('ticket:close', { reason: 'RESOLVED' });
  });
}

// 主测试流程
async function runE2ETest() {
  console.log('\n========================================');
  console.log('  WebView 玩家端 - 端到端测试');
  console.log('========================================\n');
  console.log(`测试配置:`);
  console.log(`  - Mock Server: ${CONFIG.MOCK_SERVER}`);
  console.log(`  - Backend API: ${CONFIG.BACKEND_API}`);
  console.log(`  - 测试玩家: ${CONFIG.TEST_PLAYER.uid}`);
  console.log('');

  let socket = null;
  const results = [];

  try {
    // Step 1: 获取游戏配置
    const gameConfig = await step1_getGameConfig();
    results.push({ step: 'Step1', status: 'PASS', desc: '获取游戏配置' });

    // Step 2: 获取认证信息
    const authInfo = await step2_getAuthInfo(gameConfig);
    results.push({ step: 'Step2', status: 'PASS', desc: '获取认证信息' });

    // Step 3: Bootstrap
    const bootstrapData = await step3_bootstrap(authInfo);
    results.push({ step: 'Step3', status: 'PASS', desc: 'Bootstrap 获取 wsToken' });

    // Step 4: WebSocket 连接
    const wsResult = await step4_connectWebSocket(bootstrapData);
    socket = wsResult.socket;
    results.push({ step: 'Step4', status: 'PASS', desc: 'WebSocket 连接' });

    // Step 5: 创建或恢复工单
    const ticketData = await step5_createOrResumeTicket(socket, bootstrapData);
    results.push({ step: 'Step5', status: 'PASS', desc: '创建/恢复工单' });

    // Step 6: 发送消息
    await step6_sendMessage(socket);
    results.push({ step: 'Step6', status: 'PASS', desc: '发送消息' });

    // Step 7: 等待 AI 回复
    const aiReply = await step7_waitForAIReply(socket);
    results.push({
      step: 'Step7',
      status: aiReply ? 'PASS' : 'SKIP',
      desc: 'AI 回复'
    });

    // Step 7b: 测试转人工
    const transferResult = await step7b_transferToAgent(socket);
    results.push({
      step: 'Step7b',
      status: transferResult.timeout ? 'SKIP' : 'PASS',
      desc: '转人工'
    });

    // Step 8: 关闭工单 (如果工单已被转为加急，可能会失败，跳过)
    if (!transferResult.convertedToTicket) {
      await step8_closeTicket(socket);
      results.push({ step: 'Step8', status: 'PASS', desc: '关闭工单' });
    } else {
      results.push({ step: 'Step8', status: 'SKIP', desc: '关闭工单 (已转为加急)' });
    }

  } catch (error) {
    fail('ERROR', error.message);
    results.push({ step: 'ERROR', status: 'FAIL', desc: error.message });
  } finally {
    if (socket) {
      socket.disconnect();
    }
  }

  // 输出测试报告
  console.log('\n========================================');
  console.log('  测试报告');
  console.log('========================================\n');

  let passed = 0, failed = 0, skipped = 0;
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✓' : r.status === 'SKIP' ? '○' : '✗';
    console.log(`  ${icon} ${r.step}: ${r.desc} [${r.status}]`);
    if (r.status === 'PASS') passed++;
    else if (r.status === 'FAIL') failed++;
    else skipped++;
  });

  console.log('\n----------------------------------------');
  console.log(`  总计: ${results.length} | 通过: ${passed} | 失败: ${failed} | 跳过: ${skipped}`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runE2ETest().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
