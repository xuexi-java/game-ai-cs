/**
 * 调试工单查询问题
 */

const crypto = require('crypto');

const CONFIG = {
  BACKEND_API: 'http://localhost:21101',
  GAME_ID: 'test_game',
  SECRET: 'test-secret-123',
  NONCE: 'testnonce1234567',
};

// 生成签名
function generateSign(gameid, uid, areaid, nonce, secret) {
  const signStr = `${gameid}|${uid}|${areaid}|${nonce}|${secret}`;
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
}

async function testPlayer(uid, playerName) {
  console.log(`\n========== 测试玩家: ${uid} (${playerName}) ==========`);

  const areaid = '1';
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

  console.log(`请求参数: gameid=${CONFIG.GAME_ID}, uid=${uid}, areaid=${areaid}`);
  console.log(`签名: ${sign.substring(0, 16)}...`);

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
  const data = response.data?.data || response.data || response;

  if (data.activeTicket) {
    console.log(`❌ 存在活跃工单:`);
    console.log(`   - tid: ${data.activeTicket.tid}`);
    console.log(`   - status: ${data.activeTicket.status}`);
    console.log(`   - createdAt: ${data.activeTicket.createdAt}`);
    console.log(`   - issueType: ${data.activeTicket.issueType}`);
  } else {
    console.log(`✓ 无活跃工单`);
  }

  return data;
}

async function main() {
  console.log('调试工单查询问题\n');
  console.log(`后端地址: ${CONFIG.BACKEND_API}`);
  console.log(`游戏ID: ${CONFIG.GAME_ID}`);

  // 测试多个玩家
  const players = [
    { uid: 'player001', name: '张三' },
    { uid: 'player002', name: '李四' },
    { uid: 'player003', name: '王五' },
    { uid: 'new_test_user_' + Date.now(), name: '全新测试用户' },
  ];

  for (const player of players) {
    await testPlayer(player.uid, player.name);
  }

  console.log('\n========== 测试完成 ==========\n');
}

main().catch(console.error);
