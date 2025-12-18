#!/usr/bin/env node

/**
 * 监控数据生成脚本
 * 用于产生业务数据以验证 Prometheus + Grafana 监控系统
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:21101/api/v1';

// 配置
const config = {
  adminUsername: 'admin',
  adminPassword: 'admin123',
  agentUsername: 'agent1',
  agentPassword: 'agent123',
  gameId: null, // 将在运行时获取
};

let adminToken = null;
let agentToken = null;

// 工具函数：延迟
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 工具函数：日志
const log = (message, data = '') => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data);
};

// 1. 管理员登录
async function adminLogin() {
  try {
    log('📝 管理员登录...');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      username: config.adminUsername,
      password: config.adminPassword,
    });
    adminToken = response.data.data.access_token;
    log('✅ 管理员登录成功');
    return true;
  } catch (error) {
    log('❌ 管理员登录失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 2. 客服登录
async function agentLogin() {
  try {
    log('📝 客服登录...');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      username: config.agentUsername,
      password: config.agentPassword,
    });
    agentToken = response.data.data.access_token;
    log('✅ 客服登录成功');
    return true;
  } catch (error) {
    log('❌ 客服登录失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 3. 获取游戏列表
async function getGames() {
  try {
    log('🎮 获取游戏列表...');
    const response = await axios.get(`${BASE_URL}/games`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const games = response.data.data.items;
    if (games.length > 0) {
      config.gameId = games[0].id;
      log('✅ 获取游戏成功:', games[0].name);
      return true;
    } else {
      log('⚠️  没有找到游戏，需要先创建游戏');
      return false;
    }
  } catch (error) {
    log('❌ 获取游戏失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 4. 创建工单
async function createTicket(index) {
  try {
    log(`📋 创建工单 #${index}...`);
    const response = await axios.post(`${BASE_URL}/tickets`, {
      gameId: config.gameId,
      playerIdOrName: `test_player_${index}`,
      contactInfo: `player${index}@test.com`,
      description: `测试工单 ${index} - 用于监控数据生成`,
      priority: index % 2 === 0 ? 'URGENT' : 'NORMAL',
    });
    const ticketId = response.data.data.id;
    log(`✅ 工单创建成功: ${response.data.data.ticketNo}`);
    return ticketId;
  } catch (error) {
    log(`❌ 创建工单失败:`, error.response?.data?.message || error.message);
    return null;
  }
}

// 5. 创建会话
async function createSession(ticketId) {
  try {
    log('💬 创建会话...');
    const response = await axios.post(`${BASE_URL}/sessions`, {
      ticketId: ticketId,
    });
    const sessionId = response.data.data.id;
    log('✅ 会话创建成功');
    return sessionId;
  } catch (error) {
    log('❌ 创建会话失败:', error.response?.data?.message || error.message);
    return null;
  }
}

// 6. 转人工（进入排队）
async function transferToAgent(sessionId) {
  try {
    log('🙋 转人工（进入排队）...');
    const response = await axios.post(`${BASE_URL}/sessions/${sessionId}/transfer`, {
      urgency: 'URGENT',
    });
    log('✅ 进入排队成功');
    return true;
  } catch (error) {
    log('❌ 转人工失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 7. 客服接入会话
async function agentJoinSession(sessionId) {
  try {
    log('👨‍💼 客服接入会话...');
    const response = await axios.post(
      `${BASE_URL}/sessions/${sessionId}/join`,
      {},
      {
        headers: { Authorization: `Bearer ${agentToken}` },
      }
    );
    log('✅ 客服接入成功');
    return true;
  } catch (error) {
    log('❌ 客服接入失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 8. 发送消息
async function sendMessage(sessionId, content, isAgent = false) {
  try {
    const token = isAgent ? agentToken : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    
    await axios.post(
      `${BASE_URL}/sessions/${sessionId}/messages`,
      { content },
      { headers }
    );
    log(`💬 ${isAgent ? '客服' : '玩家'}发送消息: ${content.substring(0, 20)}...`);
    return true;
  } catch (error) {
    log('❌ 发送消息失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 9. 关闭会话
async function closeSession(sessionId) {
  try {
    log('🔚 关闭会话...');
    await axios.post(
      `${BASE_URL}/sessions/${sessionId}/close`,
      {},
      {
        headers: { Authorization: `Bearer ${agentToken}` },
      }
    );
    log('✅ 会话关闭成功');
    return true;
  } catch (error) {
    log('❌ 关闭会话失败:', error.response?.data?.message || error.message);
    return false;
  }
}

// 主流程：完整的业务流程
async function runFullWorkflow(index) {
  log(`\n========== 开始工作流 #${index} ==========`);
  
  // 创建工单
  const ticketId = await createTicket(index);
  if (!ticketId) return false;
  
  await sleep(500);
  
  // 创建会话
  const sessionId = await createSession(ticketId);
  if (!sessionId) return false;
  
  await sleep(500);
  
  // 玩家发送消息
  await sendMessage(sessionId, `你好，我是玩家 ${index}，遇到了问题`);
  await sleep(300);
  
  // 转人工（进入排队）
  const transferred = await transferToAgent(sessionId);
  if (!transferred) return false;
  
  // 等待一段时间（模拟排队）
  const waitTime = Math.floor(Math.random() * 5000) + 2000; // 2-7秒
  log(`⏳ 排队等待 ${waitTime}ms...`);
  await sleep(waitTime);
  
  // 客服接入
  const joined = await agentJoinSession(sessionId);
  if (!joined) return false;
  
  await sleep(500);
  
  // 客服发送消息
  await sendMessage(sessionId, '您好，我是客服，请问有什么可以帮您？', true);
  await sleep(500);
  
  // 玩家回复
  await sendMessage(sessionId, '我的账号无法登录');
  await sleep(500);
  
  // 客服回复
  await sendMessage(sessionId, '好的，我帮您查看一下，请稍等', true);
  await sleep(1000);
  
  // 关闭会话
  await closeSession(sessionId);
  
  log(`========== 工作流 #${index} 完成 ==========\n`);
  return true;
}

// 主函数
async function main() {
  console.log('🚀 监控数据生成脚本启动\n');
  
  // 登录
  const adminLoggedIn = await adminLogin();
  if (!adminLoggedIn) {
    console.log('\n❌ 管理员登录失败，脚本终止');
    process.exit(1);
  }
  
  const agentLoggedIn = await agentLogin();
  if (!agentLoggedIn) {
    console.log('\n❌ 客服登录失败，脚本终止');
    process.exit(1);
  }
  
  // 获取游戏
  const hasGame = await getGames();
  if (!hasGame) {
    console.log('\n❌ 没有可用的游戏，脚本终止');
    console.log('💡 提示：请先在管理端创建游戏');
    process.exit(1);
  }
  
  console.log('\n✅ 初始化完成，开始生成监控数据...\n');
  
  // 执行多个工作流
  const workflowCount = 5; // 生成 5 个完整流程
  
  for (let i = 1; i <= workflowCount; i++) {
    await runFullWorkflow(i);
    
    // 每个流程之间间隔一段时间
    if (i < workflowCount) {
      await sleep(2000);
    }
  }
  
  console.log('\n🎉 所有工作流完成！');
  console.log('\n📊 现在可以查看 Grafana Dashboard:');
  console.log('   http://localhost:3000/d/game-ai-backend-overview\n');
  console.log('预期看到的数据：');
  console.log('  ✅ HTTP 请求吞吐（QPS）- 应该有明显增长');
  console.log('  ✅ HTTP 请求 P95 延迟 - 应该有数据');
  console.log('  ✅ 排队等待时间 P95 - 应该显示 2-7 秒');
  console.log('  ⚠️  当前排队人数 - 可能为 0（因为都已接入）');
  console.log('  ⚠️  WebSocket 连接数 - 可能为 0（脚本未建立 WS 连接）\n');
}

// 运行
main().catch(error => {
  console.error('\n💥 脚本执行出错:', error.message);
  process.exit(1);
});
