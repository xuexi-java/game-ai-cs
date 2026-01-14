const crypto = require('crypto');

async function testSignature(tsOffset = 0, label = '') {
  const config = {
    gameid: 'test_game',
    uid: 'player001',
    areaid: '1',
    playerName: 'Test',
    nonce: 'testnonce1234567',
    secret: 'test-secret-123'
  };

  const ts = Date.now() + tsOffset;
  const signStr = `${config.gameid}|${config.uid}|${config.areaid}|${ts}|${config.nonce}|${config.secret}`;
  const sign = crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();

  const body = { ...config, ts, sign };
  delete body.secret;

  try {
    const response = await fetch('http://localhost:21101/api/v1/player/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const json = await response.json();
    console.log(`[${label}] HTTP ${response.status}:`, json);
  } catch (error) {
    console.error(`[${label}] 错误:`, error.message);
  }
}

// 运行测试
(async () => {
  console.log('测试签名时效性...\n');

  await testSignature(0, '✓ 有效 - 当前时间');
  await testSignature(-3 * 60 * 60 * 1000, '✗ 过期 - 3小时前');
  await testSignature(3 * 60 * 60 * 1000, '✗ 过期 - 3小时后');
})();
