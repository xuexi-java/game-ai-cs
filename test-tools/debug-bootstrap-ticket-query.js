/**
 * 调试 Bootstrap 工单查询问题
 * 对比 Bootstrap API 和直接数据库查询的结果
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

async function testBootstrap(uid, playerName) {
  const areaid = '1';
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

  console.log(`\n=== 测试用户: ${uid} (${playerName}) ===`);
  console.log(`请求参数: gameid=${CONFIG.GAME_ID}, uid=${uid}, areaid=${areaid}`);

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
    console.log(`\n[Bootstrap 结果] 找到活跃工单:`);
    console.log(`  工单号: ${data.activeTicket.tid}`);
    console.log(`  状态: ${data.activeTicket.status}`);
    console.log(`  创建时间: ${data.activeTicket.createdAt}`);
    return { hasTicket: true, ticket: data.activeTicket };
  } else {
    console.log(`\n[Bootstrap 结果] 未找到活跃工单`);
    return { hasTicket: false };
  }
}

async function main() {
  console.log('========================================');
  console.log('  Bootstrap 工单查询调试');
  console.log('========================================');
  console.log('\n提示: 请查看后端日志中的 [Bootstrap] 和 [ticket:create] 标签');
  console.log('来对比两个查询使用的 gameId 和 uid 是否一致\n');

  // 测试用户列表
  const testUsers = [
    { uid: 'vip002', name: 'VIP玩家B' },
    { uid: 'player005', name: '钱七' },
    { uid: 'player001', name: '张三' },
  ];

  for (const user of testUsers) {
    await testBootstrap(user.uid, user.name);
  }

  console.log('\n========================================');
  console.log('  测试完成');
  console.log('========================================');
  console.log('\n下一步: 检查后端日志，对比 Bootstrap 和 ticket:create 的查询参数');
}

main().catch(console.error);
