/**
 * 测试转人工功能
 */

const { io } = require('socket.io-client');
const crypto = require('crypto');

const CONFIG = {
  MOCK_SERVER: 'http://localhost:3001',
  BACKEND_API: 'http://localhost:21101',
  BACKEND_WS: 'http://localhost:21101',
  GAME_ID: 'test_game',
  SECRET: 'test-secret-123',
  NONCE: 'testnonce1234567',
};

function generateSign(gameid, uid, areaid, nonce, secret) {
  const signStr = `${gameid}|${uid}|${areaid}|${nonce}|${secret}`;
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
}

async function testTransfer() {
  // 使用一个全新的用户
  const uid = 'transfer_test_' + Date.now();
  const areaid = '1';
  const playerName = '转人工测试用户';

  console.log('\n========================================');
  console.log('  转人工功能测试');
  console.log('========================================\n');
  console.log(`测试用户: ${uid}`);

  // 1. Bootstrap
  console.log('\n[Step 1] Bootstrap...');
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

  const bootstrapRes = await fetch(`${CONFIG.BACKEND_API}/api/v1/player/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameid: CONFIG.GAME_ID,
      uid,
      areaid,
      playerName,
      nonce: CONFIG.NONCE,
      sign
    })
  });

  const bootstrapData = await bootstrapRes.json();
  const data = bootstrapData.data?.data || bootstrapData.data || bootstrapData;

  if (!data.wsToken) {
    console.error('Bootstrap 失败:', bootstrapData);
    return;
  }

  console.log('  ✓ Bootstrap 成功');
  console.log(`  wsToken: ${data.wsToken.substring(0, 30)}...`);
  console.log(`  activeTicket: ${data.activeTicket ? data.activeTicket.tid : '无'}`);

  // 2. WebSocket 连接
  console.log('\n[Step 2] WebSocket 连接...');
  const socket = io(CONFIG.BACKEND_WS, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: data.wsToken }
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('连接超时')), 10000);

    socket.on('connect', () => {
      console.log(`  ✓ 连接成功: ${socket.id}`);
    });

    socket.on('connection:ready', (readyData) => {
      clearTimeout(timeout);
      console.log(`  ✓ 连接就绪: gameid=${readyData.gameid}, uid=${readyData.uid}`);
      resolve();
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`连接错误: ${JSON.stringify(err)}`));
    });
  });

  // 3. 创建工单
  console.log('\n[Step 3] 创建工单...');
  const issueTypeId = data.questList[0].id;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('创建工单超时')), 10000);

    socket.once('ticket:created', (ticketData) => {
      clearTimeout(timeout);
      console.log(`  ✓ 工单创建成功: tid=${ticketData.tid}`);
      resolve(ticketData);
    });

    socket.emit('ticket:create', { issueType: issueTypeId, confirmClose: true });
  });

  // 4. 发送消息
  console.log('\n[Step 4] 发送消息...');
  const clientMsgId = `test_${Date.now()}`;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('发送消息超时')), 10000);

    socket.once('message:ack', (ackData) => {
      clearTimeout(timeout);
      console.log(`  ✓ 消息发送成功: ${ackData.id}`);
      resolve();
    });

    socket.emit('message:send', {
      content: '你好，我需要帮助',
      clientMsgId,
      type: 'TEXT'
    });
  });

  // 5. 请求转人工
  console.log('\n[Step 5] 请求转人工...');

  const transferResult = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('  ⚠ 转人工超时');
      resolve({ timeout: true });
    }, 10000);

    socket.once('transfer:result', (result) => {
      clearTimeout(timeout);
      console.log('  收到 transfer:result:', JSON.stringify(result, null, 2));
      resolve(result);
    });

    socket.once('error', (err) => {
      console.log('  收到 error:', JSON.stringify(err, null, 2));
    });

    socket.emit('transfer:request', { reason: 'TEST_TRANSFER' });
  });

  if (transferResult.success) {
    if (transferResult.convertedToTicket) {
      console.log(`  ✓ 转为加急工单: ${transferResult.ticketNo}`);
    } else {
      console.log(`  ✓ 已进入排队: position=${transferResult.queuePosition}`);
    }
  } else if (!transferResult.timeout) {
    console.log(`  ✗ 转人工失败: ${transferResult.error}`);
  }

  // 清理
  socket.disconnect();

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================\n');
}

testTransfer().catch(console.error);
