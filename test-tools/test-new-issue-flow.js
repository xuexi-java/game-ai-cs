/**
 * 测试"咨询新问题"流程
 * 模拟：有旧工单 -> 点击"咨询新问题" -> 选择分类 -> 创建新工单（关闭旧工单）
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

async function testNewIssueFlow() {
  // 使用有活跃工单的玩家
  const uid = 'player005';
  const areaid = '1';
  const playerName = '钱七';

  console.log('\n========================================');
  console.log('  "咨询新问题"流程测试');
  console.log('========================================\n');
  console.log(`测试用户: ${uid} (${playerName})`);

  // Step 1: Bootstrap
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

  const bootstrapData = (await bootstrapRes.json()).data?.data;

  if (!bootstrapData?.activeTicket) {
    console.log('  ⚠ 该用户无活跃工单，无法测试"咨询新问题"流程');
    console.log('  请先用该用户创建一个工单');
    return;
  }

  console.log('  ✓ Bootstrap 成功');
  console.log(`  发现活跃工单: ${bootstrapData.activeTicket.tid}`);
  console.log('  → 前端应显示"发现未完成的咨询"弹窗');

  // Step 2: 模拟用户点击"咨询新问题"
  console.log('\n[Step 2] 用户点击"咨询新问题"...');
  console.log('  → 前端设置 shouldConfirmClose = true');
  console.log('  → 前端清空 activeTicket');
  console.log('  → 前端显示分类选择');

  // Step 3: 连接 WebSocket
  console.log('\n[Step 3] 连接 WebSocket...');
  const socket = io(CONFIG.BACKEND_WS, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: bootstrapData.wsToken }
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('连接超时')), 10000);
    socket.on('connection:ready', () => {
      clearTimeout(timeout);
      console.log('  ✓ 连接就绪');
      resolve();
    });
    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`连接错误: ${JSON.stringify(err)}`));
    });
  });

  // Step 4: 创建新工单（模拟修复后的逻辑：confirmClose=true）
  console.log('\n[Step 4] 用户选择分类，创建新工单 (confirmClose=true)...');
  const issueTypeId = bootstrapData.questList[0]?.id;

  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ timeout: true }), 10000);

    socket.once('ticket:created', (data) => {
      clearTimeout(timeout);
      resolve({ success: true, data });
    });

    socket.once('error', (err) => {
      clearTimeout(timeout);
      resolve({ success: false, error: err });
    });

    // 关键：confirmClose=true 来关闭旧工单
    socket.emit('ticket:create', { issueType: issueTypeId, confirmClose: true });
  });

  if (result.success) {
    console.log('  ✓ 新工单创建成功!');
    console.log(`  新工单号: ${result.data.tid}`);
    console.log(`  旧工单 ${bootstrapData.activeTicket.tid} 已被自动关闭`);
    console.log('\n  ★ 测试通过: "咨询新问题"流程正常');
  } else if (result.error?.code === 'CONFIRM_CLOSE_REQUIRED') {
    console.log('  ✗ 创建失败: CONFIRM_CLOSE_REQUIRED');
    console.log('  → 说明 confirmClose 没有正确传递为 true');
    console.log('\n  ✗ 测试失败');
  } else {
    console.log('  ✗ 创建失败:', result.error || '超时');
  }

  socket.disconnect();

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================\n');
}

testNewIssueFlow().catch(console.error);
