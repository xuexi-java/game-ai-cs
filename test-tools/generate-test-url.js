const crypto = require('crypto');

// 配置（与后台游戏配置一致）
const config = {
  gameid: '10001',
  uid: 'player002',
  areaid: '1',
  playerName: 'Test Player',
  nonce: 'n7k9m2x4p6q8w3e5',   // 游戏的 playerApiNonce
  secret: 's3cr3t_k7m9n2p4q6x8w1e5r0t2y4u6',
  apiUrl: 'http://localhost:21101',
  h5Url: 'http://localhost:5173'
};

// 生成签名（含时间戳）
const ts = Date.now();
const signStr = `${config.gameid}|${config.uid}|${config.areaid}|${ts}|${config.nonce}|${config.secret}`;
const sign = crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();

// 构建 URL
const params = new URLSearchParams({
  gameid: config.gameid,
  uid: config.uid,
  areaid: config.areaid,
  playerName: config.playerName,
  ts: ts.toString(),
  nonce: config.nonce,
  sign: sign,
  apiUrl: config.apiUrl,
  platform: 'web'
});

const testUrl = `${config.h5Url}/?${params.toString()}`;
const expiryTime = new Date(ts + 2 * 60 * 60 * 1000);

console.log('='.repeat(80));
console.log('测试 URL 已生成（有效期 2 小时）');
console.log('='.repeat(80));
console.log('');
console.log('URL:');
console.log(testUrl);
console.log('');
console.log('详情:');
console.log(`  时间戳: ${ts} (${new Date(ts).toISOString()})`);
console.log(`  过期时间: ${expiryTime.toISOString()}`);
console.log(`  签名: ${sign}`);
console.log('');
console.log('在浏览器中打开此 URL 测试远程模式');
console.log('='.repeat(80));
