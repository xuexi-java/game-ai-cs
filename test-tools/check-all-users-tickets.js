/**
 * 检查 mock-game-server 中所有用户的工单状态
 */

const crypto = require('crypto');

const CONFIG = {
  BACKEND_API: 'http://localhost:21101',
  GAME_ID: 'test_game',
  SECRET: 'test-secret-123',
  NONCE: 'testnonce1234567',
};

// mock-game-server 中定义的所有玩家
const MOCK_SERVER_PLAYERS = [
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

function generateSign(gameid, uid, areaid, nonce, secret) {
  const signStr = `${gameid}|${uid}|${areaid}|${nonce}|${secret}`;
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
}

async function checkUser(uid, playerName) {
  const areaid = '1';
  const sign = generateSign(CONFIG.GAME_ID, uid, areaid, CONFIG.NONCE, CONFIG.SECRET);

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

  return {
    uid,
    playerName,
    hasTicket: !!data.activeTicket,
    ticketNo: data.activeTicket?.tid || null,
    status: data.activeTicket?.status || null,
  };
}

async function main() {
  console.log('========================================');
  console.log('  mock-game-server 用户工单状态');
  console.log('========================================\n');

  const results = [];
  const withTicket = [];
  const withoutTicket = [];

  for (const player of MOCK_SERVER_PLAYERS) {
    const result = await checkUser(player.uid, player.name);
    results.push(result);

    if (result.hasTicket) {
      withTicket.push(result);
    } else {
      withoutTicket.push(result);
    }
  }

  console.log('【有活跃工单的用户】（会显示"发现未完成的咨询"弹窗）:');
  if (withTicket.length === 0) {
    console.log('  无');
  } else {
    for (const u of withTicket) {
      console.log(`  ❌ ${u.uid} (${u.playerName}) - 工单: ${u.ticketNo} [${u.status}]`);
    }
  }

  console.log('\n【无活跃工单的用户】（可以正常测试新用户流程）:');
  if (withoutTicket.length === 0) {
    console.log('  无');
  } else {
    for (const u of withoutTicket) {
      console.log(`  ✓ ${u.uid} (${u.playerName})`);
    }
  }

  console.log('\n========================================');
  console.log(`  统计: ${withTicket.length} 个有工单, ${withoutTicket.length} 个无工单`);
  console.log('========================================\n');

  if (withoutTicket.length > 0) {
    console.log('💡 建议：使用以下用户测试"新用户"流程:');
    console.log(`   ${withoutTicket[0].uid} (${withoutTicket[0].playerName})`);
  } else {
    console.log('⚠️  警告：所有预设用户都有活跃工单！');
    console.log('   需要先关闭一些工单，或者直接使用全新的随机UID测试');
  }
}

main().catch(console.error);
