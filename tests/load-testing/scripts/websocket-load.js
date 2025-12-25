/**
 * k6 WebSocket 负载测试脚本
 *
 * 运行方式:
 *   k6 run scripts/websocket-load.js
 *   k6 run --vus 500 --duration 10m scripts/websocket-load.js
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// 自定义指标
const wsConnectDuration = new Trend('ws_connect_duration');
const wsMessageLatency = new Trend('ws_message_latency');
const wsConnectionErrors = new Counter('ws_connection_errors');
const wsMessagesReceived = new Counter('ws_messages_received');
const wsMessagesSent = new Counter('ws_messages_sent');
const activeConnections = new Gauge('ws_active_connections');
const errorRate = new Rate('errors');

// 配置
const WS_URL = __ENV.WS_URL || 'wss://localhost:21101';
const HTTP_URL = __ENV.HTTP_URL || 'https://localhost:21101';
const PLAYER_ID = __ENV.PLAYER_ID || 'test-player';
const GAME_ID = __ENV.GAME_ID || 'game-001';

// 测试场景配置
export const options = {
  scenarios: {
    // 场景1: WebSocket 连接稳定性测试
    connection_stability: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
      tags: { scenario: 'stability' },
    },
    // 场景2: WebSocket 连接压力测试
    connection_stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '2m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 0 },
      ],
      startTime: '5m',
      tags: { scenario: 'stress' },
    },
    // 场景3: 高并发消息测试
    message_flood: {
      executor: 'constant-vus',
      vus: 100,
      duration: '3m',
      startTime: '13m',
      tags: { scenario: 'message_flood' },
      env: { MESSAGE_RATE: 'high' },
    },
  },

  thresholds: {
    ws_connect_duration: ['p(95)<1000'],       // 95%连接<1s
    ws_message_latency: ['p(95)<200'],         // 95%消息延迟<200ms
    ws_connection_errors: ['count<100'],       // 连接错误<100次
    errors: ['rate<0.05'],                     // 错误率<5%
  },
};

// 生成唯一的玩家ID
function generatePlayerId() {
  return `player-${__VU}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 主测试函数
export default function () {
  const playerId = generatePlayerId();
  const messageRate = __ENV.MESSAGE_RATE === 'high' ? 10 : 3; // 每秒消息数

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&playerId=${playerId}&gameId=${GAME_ID}`;

  const startTime = Date.now();

  const res = ws.connect(wsUrl, {
    headers: {
      'Origin': HTTP_URL,
    },
  }, function (socket) {
    const connectDuration = Date.now() - startTime;
    wsConnectDuration.add(connectDuration);
    activeConnections.add(1);

    let messageCount = 0;
    let lastPingTime = Date.now();

    // 连接成功检查
    check(socket, {
      'WebSocket connected': (s) => s !== null,
    });

    // 错误处理
    socket.on('error', function (e) {
      console.error(`WebSocket error: ${e.message}`);
      wsConnectionErrors.add(1);
      errorRate.add(true);
    });

    // 接收消息
    socket.on('message', function (data) {
      wsMessagesReceived.add(1);
      messageCount++;

      // 解析 Socket.IO 消息
      try {
        // Socket.IO 消息格式: "42[event,data]" 或 "3" (pong)
        if (data.startsWith('42')) {
          const jsonStr = data.substring(2);
          const [event, payload] = JSON.parse(jsonStr);

          // 计算消息延迟（如果消息包含时间戳）
          if (payload && payload.timestamp) {
            const latency = Date.now() - payload.timestamp;
            wsMessageLatency.add(latency);
          }

          // 处理不同事件
          switch (event) {
            case 'agent_message':
            case 'ai_message':
            case 'system_message':
              // 收到客服消息
              console.log(`Received ${event}: ${JSON.stringify(payload).substring(0, 100)}`);
              break;
            case 'session_created':
              console.log('Session created');
              break;
            case 'queue_position':
              console.log(`Queue position: ${payload.position}`);
              break;
          }
        } else if (data === '3') {
          // Pong 响应
          const pingLatency = Date.now() - lastPingTime;
          wsMessageLatency.add(pingLatency);
        }
      } catch (e) {
        // 非JSON消息，忽略
      }

      errorRate.add(false);
    });

    // 连接打开
    socket.on('open', function () {
      console.log(`WebSocket opened for ${playerId}`);

      // 发送 Socket.IO 握手
      socket.send('40'); // Socket.IO connect packet

      // 创建会话
      setTimeout(() => {
        const createSessionMsg = JSON.stringify([
          'create_session',
          {
            playerId: playerId,
            gameId: GAME_ID,
            playerName: `测试玩家${__VU}`,
            issueType: 'general',
            timestamp: Date.now(),
          },
        ]);
        socket.send(`42${createSessionMsg}`);
        wsMessagesSent.add(1);
      }, 500);
    });

    // 连接关闭
    socket.on('close', function () {
      console.log(`WebSocket closed for ${playerId}`);
      activeConnections.add(-1);
    });

    // 定期发送消息和心跳
    const messageInterval = 1000 / messageRate;
    let iteration = 0;

    // 保持连接一段时间
    const connectionDuration = 60000; // 60秒
    const startConnection = Date.now();

    while (Date.now() - startConnection < connectionDuration) {
      iteration++;

      // 每隔一段时间发送心跳
      if (iteration % 25 === 0) {
        lastPingTime = Date.now();
        socket.send('2'); // Socket.IO ping
        wsMessagesSent.add(1);
      }

      // 发送玩家消息
      if (iteration % (messageRate * 5) === 0) { // 每5秒发送一条消息
        const playerMessage = JSON.stringify([
          'player_message',
          {
            content: `测试消息 #${iteration} from ${playerId}`,
            type: 'text',
            timestamp: Date.now(),
          },
        ]);
        socket.send(`42${playerMessage}`);
        wsMessagesSent.add(1);
      }

      sleep(messageInterval / 1000);
    }

    // 正常关闭连接
    socket.close();
  });

  // 检查连接结果
  const success = check(res, {
    'WebSocket connection successful': (r) => r && r.status === 101,
  });

  if (!success) {
    wsConnectionErrors.add(1);
    errorRate.add(true);
  }

  sleep(1);
}

// 测试结束时的汇总
export function handleSummary(data) {
  return {
    'results/websocket-summary.json': JSON.stringify(data, null, 2),
    stdout: generateReport(data),
  };
}

function generateReport(data) {
  const { metrics } = data;

  let report = '\n========== WebSocket 性能测试报告 ==========\n\n';

  report += '📊 连接指标:\n';
  if (metrics.ws_connect_duration) {
    const dur = metrics.ws_connect_duration.values;
    report += `  连接延迟: avg=${dur.avg.toFixed(2)}ms, p95=${dur['p(95)'].toFixed(2)}ms\n`;
  }
  if (metrics.ws_connection_errors) {
    report += `  连接错误: ${metrics.ws_connection_errors.values.count}\n`;
  }

  report += '\n📈 消息指标:\n';
  if (metrics.ws_message_latency) {
    const lat = metrics.ws_message_latency.values;
    report += `  消息延迟: avg=${lat.avg.toFixed(2)}ms, p95=${lat['p(95)'].toFixed(2)}ms\n`;
  }
  if (metrics.ws_messages_sent) {
    report += `  发送消息数: ${metrics.ws_messages_sent.values.count}\n`;
  }
  if (metrics.ws_messages_received) {
    report += `  接收消息数: ${metrics.ws_messages_received.values.count}\n`;
  }

  report += '\n=============================================\n';

  return report;
}
