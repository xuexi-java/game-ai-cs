/**
 * 调试新用户工单问题
 * 检查为什么新用户会显示有未关闭的工单
 */

const crypto = require('crypto');

const CONFIG = {
  BACKEND_API: 'http://localhost:21101',
  GAME_ID: 'test_game',
  SECRET: 'test-secret-123',
  NONCE: 'testnonce1234567',
};

function generateSign(gameid, uid, areaid, nonce, secret) {
  const signStr = `${gameid}|${uid}|${areaid}|${nonce}|${secret}`;
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
}

async function testUser(uid, playerName) {
  console.log(`\n========== 测试用户: ${uid} (${playerName}) ==========`);

  const areaid = '1';
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

  console.log(`请求参数:`);
  console.log(`  gameid: ${CONFIG.GAME_ID}`);
  console.log(`  uid: ${uid}`);
  console.log(`  areaid: ${areaid}`);
  console.log(`  playerName: ${playerName}`);
  console.log(`  sign: ${sign.substring(0, 16)}...`);

  const res = await fetch(`${CONFIG.BACKEND_API}/api/v1/player/connect`, {
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

  const response = await res.json();
  console.log(`\n原始响应结构: success=${response.success}`);

  const data = response.data?.data || response.data || response;

  console.log(`\n解析后数据:`);
  console.log(`  wsToken: ${data.wsToken ? '有' : '无'}`);
  console.log(`  activeTicket: ${data.activeTicket ? JSON.stringify(data.activeTicket, null, 4) : '无'}`);

  if (data.activeTicket) {
    console.log(`\n⚠️  该用户有活跃工单!`);
    console.log(`  工单号: ${data.activeTicket.tid}`);
    console.log(`  状态: ${data.activeTicket.status}`);
    console.log(`  创建时间: ${data.activeTicket.createdAt}`);
  } else {
    console.log(`\n✓ 该用户无活跃工单`);
  }

  return data;
}

async function main() {
  console.log('========================================');
  console.log('  新用户工单问题调试');
  console.log('========================================');
  console.log(`后端地址: ${CONFIG.BACKEND_API}`);
  console.log(`游戏ID: ${CONFIG.GAME_ID}`);

  // 测试 mock-game-server 中定义的所有玩家
  const mockServerPlayers = [
    { uid: 'player001', name: '张三' },
    { uid: 'player002', name: '李四' },
    { uid: 'player003', name: '王五' },
    { uid: 'player004', name: '赵六' },
    { uid: 'player005', name: '钱七' },
    { uid: 'player006', name: '孙八' },
    { uid: 'player007', name: '周九' },
    { uid: 'player008', name: '吴十' },
    { uid: 'player009', name: '郑十一' },
    { uid: 'player010', name: '冯十二' },
    { uid: 'vip001', name: 'VIP玩家A' },
    { uid: 'vip002', name: 'VIP玩家B' },
    { uid: 'test_cn', name: '测试玩家' },
    { uid: 'test_en', name: 'Test Player' },
  ];

  // 测试前几个用户
  for (const player of mockServerPlayers.slice(0, 6)) {
    await testUser(player.uid, player.name);
  }

  // 测试一个真正的新用户（随机生成的UID）
  const randomUid = `brand_new_user_${Date.now()}`;
  await testUser(randomUid, '全新测试用户');

  console.log('\n========================================');
  console.log('  调试完成');
  console.log('========================================\n');
}

main().catch(console.error);
