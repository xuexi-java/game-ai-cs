/**
 * 调试 Bootstrap vs ticket:create 不一致问题
 *
 * 问题：新用户在 Bootstrap 时显示无活跃工单，但创建工单时提示有未关闭工单
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

async function testFullFlow(uid, playerName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  测试用户: ${uid} (${playerName})`);
  console.log('='.repeat(60));

  const areaid = '1';
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

  // Step 1: Bootstrap
  console.log('\n[Step 1] 调用 Bootstrap API...');
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

  const bootstrapResponse = await bootstrapRes.json();
  const bootstrapData = bootstrapResponse.data?.data || bootstrapResponse.data || bootstrapResponse;

  if (!bootstrapData.wsToken) {
    console.error('  ✗ Bootstrap 失败:', bootstrapResponse);
    return;
  }

  console.log('  ✓ Bootstrap 成功');
  console.log(`  activeTicket: ${bootstrapData.activeTicket ? bootstrapData.activeTicket.tid : '无'}`);

  if (bootstrapData.activeTicket) {
    console.log(`\n  ⚠️  Bootstrap 返回了活跃工单，前端应该显示"继续咨询"弹窗`);
    console.log(`  工单号: ${bootstrapData.activeTicket.tid}`);
    console.log(`  状态: ${bootstrapData.activeTicket.status}`);
  } else {
    console.log(`\n  ✓ Bootstrap 无活跃工单，前端应该显示分类选择`);
  }

  // Step 2: 连接 WebSocket
  console.log('\n[Step 2] 连接 WebSocket...');
  const socket = io(CONFIG.BACKEND_WS, {
    transports: ['websocket'],
    reconnection: false,
    auth: { token: bootstrapData.wsToken }
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('连接超时')), 10000);

    socket.on('connect', () => {
      console.log('  ✓ WebSocket 连接成功');
    });

    socket.on('connection:ready', (data) => {
      clearTimeout(timeout);
      console.log('  ✓ 连接就绪');
      resolve(data);
    });

    socket.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`连接错误: ${JSON.stringify(err)}`));
    });
  });

  // Step 3: 尝试创建工单（不设置 confirmClose）
  console.log('\n[Step 3] 尝试创建工单 (confirmClose=false)...');

  const issueTypeId = bootstrapData.questList[0]?.id;
  if (!issueTypeId) {
    console.error('  ✗ 没有可用的问题类型');
    socket.disconnect();
    return;
  }

  const createResult = await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('  ⚠ 创建工单超时');
      resolve({ timeout: true });
    }, 10000);

    socket.once('ticket:created', (data) => {
      clearTimeout(timeout);
      console.log('  ✓ 收到 ticket:created 事件');
      resolve({ success: true, event: 'ticket:created', data });
    });

    socket.once('error', (err) => {
      clearTimeout(timeout);
      console.log('  收到 error 事件:', JSON.stringify(err, null, 2));
      resolve({ success: false, event: 'error', data: err });
    });

    console.log(`  发送 ticket:create: issueType=${issueTypeId}, confirmClose=false`);
    socket.emit('ticket:create', { issueType: issueTypeId, confirmClose: false });
  });

  // 分析结果
  console.log('\n[分析结果]');
  if (createResult.success) {
    console.log('  ✓ 工单创建成功');
    console.log(`  工单号: ${createResult.data.tid}`);

    if (!bootstrapData.activeTicket) {
      console.log('\n  结论: 正常 - Bootstrap无活跃工单，创建新工单成功');
    } else {
      console.log('\n  ⚠️  异常: Bootstrap有活跃工单，但创建新工单也成功了（不应该）');
    }
  } else if (createResult.event === 'error') {
    const errorCode = createResult.data.code;
    console.log(`  ✗ 创建失败，错误码: ${errorCode}`);
    console.log(`  错误信息: ${createResult.data.message}`);

    if (errorCode === 'CONFIRM_CLOSE_REQUIRED') {
      console.log(`  存在的工单号: ${createResult.data.data?.existingTicketNo}`);

      if (!bootstrapData.activeTicket) {
        console.log('\n  ⚠️  BUG: Bootstrap说无活跃工单，但ticket:create说有！');
        console.log('  可能原因:');
        console.log('  1. Bootstrap和ticket:create的查询条件不一致');
        console.log('  2. 有其他进程在Bootstrap之后创建了工单');
        console.log('  3. gameId解析不一致');
      } else {
        console.log('\n  结论: 正常 - Bootstrap有活跃工单，创建时被拒绝');
      }
    }
  }

  // 清理
  socket.disconnect();
  console.log('\n[清理完成]');
}

async function main() {
  console.log('========================================');
  console.log('  Bootstrap vs ticket:create 一致性测试');
  console.log('========================================');

  // 测试已知有工单的用户
  await testFullFlow('player005', '钱七');

  // 测试已知无工单的用户
  await testFullFlow('player001', '张三');

  // 测试全新用户
  const newUid = `test_new_${Date.now()}`;
  await testFullFlow(newUid, '全新用户');

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================\n');
}

main().catch(console.error);
