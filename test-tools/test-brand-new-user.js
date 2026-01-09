/**
 * 测试全新用户是否正确返回无活跃工单
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

async function test() {
  // 使用一个全新的、从未用过的UID
  const uid = 'brand_new_user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const areaid = '1';
  const playerName = '全新测试用户';
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

  console.log('========================================');
  console.log('  全新用户测试');
  console.log('========================================');
  console.log('\n测试用户 UID:', uid);
  console.log('(这个UID是随机生成的，数据库中肯定不存在)\n');

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

  console.log('Bootstrap 结果:');
  console.log('  activeTicket:', data.activeTicket ? JSON.stringify(data.activeTicket, null, 2) : '无 (null)');

  if (data.activeTicket) {
    console.log('\n❌ BUG: 全新用户不应该有活跃工单!');
    console.log('  这说明后端查询逻辑有问题，可能：');
    console.log('  1. 查询条件没有正确过滤 uid');
    console.log('  2. gameId 匹配有问题');
    console.log('  3. 返回了其他用户的工单');
  } else {
    console.log('\n✓ 正常: 全新用户没有活跃工单');
    console.log('  后端查询逻辑正确');
  }

  console.log('\n========================================\n');
}

test().catch(console.error);
