/**
 * 模拟游戏服务器
 *
 * 功能：
 * 1. 提供玩家认证接口，返回带签名的玩家信息
 * 2. 模拟游戏服务器与客服系统的对接流程
 *
 * 启动命令: node mock-game-server.js
 * 默认端口: 3001
 */

const http = require('http');
const crypto = require('crypto');
const url = require('url');

// ============ 配置区域 - 需要与客服后台游戏配置一致 ============

// 本机 IP 地址（APK 测试时必须用内网 IP，不能用 localhost）
// Windows: ipconfig 查看
// Mac/Linux: ifconfig 或 ip addr
const LOCAL_IP = process.env.LOCAL_IP || '10.10.17.200';

const CONFIG = {
  // 游戏标识（与客服后台配置的游戏名称一致）
  GAME_ID: process.env.GAME_ID || 'test_game',

  // 签名密钥（与客服后台配置的 playerApiSecret 一致）
  SECRET: process.env.SECRET || 's3cr3t_k7m9n2p4q6x8w1e5r0t2y4u6',

  // 固定 Nonce（与客服后台配置的 playerApiNonce 一致）
  NONCE: process.env.NONCE || 'n7k9m2x4p6q8w3e5',
  // 配置区
  WEBVIEW_URL: process.env.WEBVIEW_URL || `http://10.0.2.2:5173`,

  // 模拟玩家数据库
  PLAYERS: {
    'player001': { name: '张三' },
    'player002': { name: '李四' },
    'player003': { name: '王五' },
    'player004': { name: '赵六' },
    'player005': { name: '钱七' },
    'player006': { name: '孙八' },
    'player007': { name: '周九' },
    'player008': { name: '吴十' },
    'player009': { name: '郑十一' },
    'player010': { name: '冯十二' },
    'vip001': { name: 'VIP玩家A' },
    'vip002': { name: 'VIP玩家B' },
    'test_cn': { name: '测试玩家' },
    'test_en': { name: 'Test Player' },
  },

  // 服务器端口
  PORT: process.env.PORT || 3001,

  // 客服系统地址（用于 API 调用）
  // 浏览器测试可用 localhost，APK 测试必须用内网 IP
  CS_API_URL: process.env.CS_API_URL || `http://${LOCAL_IP}:21101`,
  CS_WS_URL: process.env.CS_WS_URL || `ws://${LOCAL_IP}:21101`,

  // webview-player 地址
  WEBVIEW_URL: process.env.WEBVIEW_URL || `http://${LOCAL_IP}:5173`,
};

/**
 * 生成签名
 * 签名公式: sign = md5(gameid|uid|areaid|ts|nonce|secret).toLowerCase()
 * ts 为时间戳(毫秒)，用于签名时效性校验
 */
function generateSign(gameid, uid, areaid, ts, nonce, secret) {
  const signStr = `${gameid}|${uid}|${areaid}|${ts}|${nonce}|${secret}`;
  return crypto.createHash('md5').update(signStr).digest('hex').toLowerCase();
}

/**
 * 处理 CORS
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * 发送 JSON 响应
 */
function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * 解析请求体
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// 创建 HTTP 服务器
const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  try {
    // ============ API 路由 ============

    /**
     * GET /api/config
     * 获取游戏服务器配置（仅用于测试页面显示）
     */
    if (pathname === '/api/config' && req.method === 'GET') {
      sendJson(res, {
        success: true,
        data: {
          gameId: CONFIG.GAME_ID,
          csApiUrl: CONFIG.CS_API_URL,
          csWsUrl: CONFIG.CS_WS_URL,
          webviewUrl: CONFIG.WEBVIEW_URL,
          nonce: CONFIG.NONCE,
          players: Object.keys(CONFIG.PLAYERS).map(uid => ({
            uid,
            name: CONFIG.PLAYERS[uid].name,
          })),
        }
      });
      return;
    }

    /**
     * POST /api/get-cs-auth
     * 获取客服系统认证信息（游戏客户端调用）
     *
     * 请求参数:
     *   - uid: 玩家ID
     *   - areaid: 区服ID
     *
     * 返回:
     *   - gameid, uid, areaid, playerName, ts, nonce, sign, h5Url
     *   - 这些参数直接用于调用客服系统的 /api/v1/player/connect
     */
    if (pathname === '/api/get-cs-auth' && req.method === 'POST') {
      const body = await parseBody(req);
      const { uid, areaid = '1' } = body;

      if (!uid) {
        sendJson(res, { success: false, error: '缺少 uid 参数' }, 400);
        return;
      }

      // 查找玩家
      const player = CONFIG.PLAYERS[uid];
      if (!player) {
        sendJson(res, { success: false, error: '玩家不存在' }, 404);
        return;
      }

      // 生成时间戳和签名
      const ts = Date.now();
      const sign = generateSign(
        CONFIG.GAME_ID,
        uid,
        areaid,
        ts,
        CONFIG.NONCE,
        CONFIG.SECRET
      );

      // 返回认证信息
      sendJson(res, {
        success: true,
        data: {
          // 客服系统所需的认证参数
          h5Url: CONFIG.WEBVIEW_URL,
          gameid: CONFIG.GAME_ID,
          uid: uid,
          areaid: areaid,
          ts: ts,
          playerName: player.name,
          nonce: CONFIG.NONCE,
          sign: sign,  
        }
      });

      console.log(`  -> 生成认证: uid=${uid}, sign=${sign.substring(0, 8)}...`);
      return;
    }

    /**
     * GET /webview-test
     * WebView 测试入口页面 - 选择玩家后跳转到 webview-player
     */
    if (pathname === '/webview-test' && req.method === 'GET') {
      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WebView 测试入口</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
    }
    .container {
      background: rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 40px;
      max-width: 400px;
      width: 90%;
    }
    h1 { text-align: center; margin-bottom: 30px; font-size: 24px; }
    .player-list { display: flex; flex-direction: column; gap: 15px; }
    .player-btn {
      padding: 15px 20px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .player-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(102,126,234,0.4);
    }
    .info {
      margin-top: 30px;
      padding: 15px;
      background: rgba(0,0,0,0.2);
      border-radius: 8px;
      font-size: 13px;
      color: #aaa;
    }
    .info p { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎮 选择测试玩家</h1>
    <div class="player-list" id="playerList">加载中...</div>
    <div class="info">
      <p><strong>游戏:</strong> <span id="gameId">-</span></p>
      <p><strong>API:</strong> <span id="apiUrl">-</span></p>
    </div>
  </div>
  <script>
    let webviewUrl = '';

    async function init() {
      const res = await fetch('/api/config');
      const { data } = await res.json();

      webviewUrl = data.webviewUrl;
      document.getElementById('gameId').textContent = data.gameId;
      document.getElementById('apiUrl').textContent = data.csApiUrl;

      const list = document.getElementById('playerList');
      list.innerHTML = '';

      data.players.forEach(player => {
        const btn = document.createElement('button');
        btn.className = 'player-btn';
        btn.textContent = player.name + ' (' + player.uid + ')';
        btn.onclick = () => openWebView(player.uid, player.name, data);
        list.appendChild(btn);
      });
    }

    function openWebView(uid, playerName, config) {
      fetch('/api/get-cs-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, areaid: '1' })
      })
        .then(res => res.json())
        .then(result => {
          if (!result.success) {
            alert(result.error || '获取认证失败');
            return;
          }

          const auth = result.data || {};
          const params = new URLSearchParams({
            gameid: auth.gameid,
            uid: auth.uid,
            areaid: auth.areaid,
            playerName: auth.playerName,
            ts: String(auth.ts || ''),
            nonce: auth.nonce,
            sign: auth.sign,
            apiUrl: config.csApiUrl,
            platform: 'web'
          });

          window.location.href = webviewUrl + '?' + params.toString();
        })
        .catch(error => {
          console.error('获取认证失败:', error);
          alert('获取认证失败');
        });
    }

    init();
  </script>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    /**
     * GET /
     * 返回测试页面
     */
    if (pathname === '/' && req.method === 'GET') {
      res.writeHead(302, { 'Location': '/webview-test' });
      res.end();
      return;
    }

    // 404
    sendJson(res, { success: false, error: 'Not Found' }, 404);

  } catch (error) {
    console.error('Error:', error);
    sendJson(res, { success: false, error: error.message }, 500);
  }
});

// 启动服务器
server.listen(CONFIG.PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  模拟游戏服务器已启动');
  console.log('='.repeat(60));
  console.log('');
  console.log(`  服务地址: http://localhost:${CONFIG.PORT}`);
  console.log('');
  console.log('  配置信息:');
  console.log(`    游戏ID:     ${CONFIG.GAME_ID}`);
  console.log(`    Secret:     ${CONFIG.SECRET}`);
  console.log(`    Nonce:      ${CONFIG.NONCE}`);
  console.log(`    客服API:    ${CONFIG.CS_API_URL}`);
  console.log('');
  console.log('  可用接口:');
  console.log('    GET  /api/config      - 获取配置');
  console.log('    POST /api/get-cs-auth - 获取客服认证信息');
  console.log('');
  console.log('  测试玩家:');
  Object.entries(CONFIG.PLAYERS).forEach(([uid, player]) => {
    console.log(`    ${uid}: ${player.name}`);
  });
  console.log('');
  console.log('  WebView 测试入口:');
  console.log(`    http://localhost:${CONFIG.PORT}/webview-test`);
  console.log('');
  console.log('='.repeat(60));
  console.log('');
});
