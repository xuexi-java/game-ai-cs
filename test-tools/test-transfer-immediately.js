/**
 * 测试恢复工单后立即转人工（不发送消息）
 * 验证后端fix: 恢复工单时自动创建session
 */

const { io } = require('socket.io-client');
const crypto = require('crypto');

const CONFIG = {
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

async function testTransferImmediately() {
  // 使用有活跃工单的玩家
  const uid = 'player003';
  const areaid = '1';
  const playerName = '王五';

  console.log('\n========================================');
  console.log('  恢复工单后立即转人工测试');
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

  if (!data.activeTicket) {
    console.log('  ⚠ 该用户无活跃工单，请使用其他用户测试');
    return;
  }

  const activeTicketTid = data.activeTicket.tid;

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

  // 3. 恢复工单
  console.log('\n[Step 3] 恢复工单...');

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('恢复工单超时')), 10000);

    const handleReady = (readyData) => {
      if (readyData.tid) {
        clearTimeout(timeout);
        socket.off('connection:ready', handleReady);
        console.log(`  ✓ 工单恢复成功: tid=${readyData.tid}, status=${readyData.status}`);
        resolve(readyData);
      }
    };

    socket.on('connection:ready', handleReady);

    socket.once('error', (err) => {
      console.log(`  收到错误: ${JSON.stringify(err)}`);
    });

    socket.emit('ticket:resume', { tid: activeTicketTid });
  });

  // 4. 立即请求转人工（不发送消息）
  console.log('\n[Step 4] 立即请求转人工（不发送消息）...');

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

    socket.emit('transfer:request', { reason: 'PLAYER_REQUEST' });
  });

  if (transferResult.success) {
    if (transferResult.convertedToTicket) {
      console.log(`  ✓ 转为加急工单: ${transferResult.ticketNo}`);
    } else {
      console.log(`  ✓ 已进入排队: position=${transferResult.queuePosition}`);
    }
    console.log('\n  ★ 测试通过：恢复工单后立即转人工成功！');
  } else if (!transferResult.timeout) {
    console.log(`  ✗ 转人工失败: ${transferResult.error}`);
    console.log('\n  ✗ 测试失败：恢复工单后立即转人工失败');
  } else {
    console.log('\n  ✗ 测试失败：转人工超时');
  }

  // 清理
  socket.disconnect();

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================\n');
}

testTransferImmediately().catch(console.error);
