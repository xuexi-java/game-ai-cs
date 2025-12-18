# 监控数据生成脚本

## 用途

自动生成业务数据以验证 Prometheus + Grafana 监控系统是否正常工作。

## 前置条件

1. **后端服务运行中**
   ```bash
   docker-compose ps backend
   # 应该显示 Up 状态
   ```

2. **已创建测试账号**
   - 管理员账号：`admin` / `admin123`
   - 客服账号：`agent1` / `agent123`
   
   如果没有，请在管理端创建。

3. **已创建游戏**
   - 至少需要一个游戏记录
   - 在管理端 → 游戏管理 → 添加游戏

4. **安装依赖**
   ```bash
   npm install
   ```

## 使用方法

### 方式 1：直接运行（推荐）

```bash
cd scripts
node generate-monitoring-data.js
```

### 方式 2：使用 npm script

在项目根目录的 `package.json` 中添加：

```json
{
  "scripts": {
    "test:monitoring": "node scripts/generate-monitoring-data.js"
  }
}
```

然后运行：

```bash
npm run test:monitoring
```

## 脚本功能

脚本会自动执行以下操作（重复 5 次）：

1. ✅ 创建工单
2. ✅ 创建会话
3. ✅ 玩家发送消息
4. ✅ 转人工（进入排队）
5. ⏳ 等待 2-7 秒（模拟排队）
6. ✅ 客服接入会话
7. ✅ 客服与玩家对话
8. ✅ 关闭会话

## 预期结果

运行脚本后，在 Grafana Dashboard 中应该看到：

### ✅ 有数据的指标

- **HTTP 请求吞吐（QPS）** - 明显增长
- **HTTP 请求 P95 延迟** - 显示延迟数据
- **排队等待时间 P95** - 显示 2-7 秒

### ⚠️ 可能无数据的指标

- **当前排队人数** - 可能为 0（因为会话都已接入或关闭）
- **WebSocket 连接数** - 为 0（脚本未建立 WebSocket 连接）

## 自定义配置

如果你的账号信息不同，请修改脚本中的配置：

```javascript
const config = {
  adminUsername: 'admin',      // 修改为你的管理员用户名
  adminPassword: 'admin123',   // 修改为你的管理员密码
  agentUsername: 'agent1',     // 修改为你的客服用户名
  agentPassword: 'agent123',   // 修改为你的客服密码
};
```

## 故障排查

### 问题 1: 登录失败

```
❌ 管理员登录失败: Unauthorized
```

**解决方案：**
- 检查用户名和密码是否正确
- 确认账号已创建且未被禁用

### 问题 2: 没有游戏

```
⚠️ 没有找到游戏，需要先创建游戏
```

**解决方案：**
- 登录管理端 http://localhost:20102
- 进入"游戏管理"
- 添加至少一个游戏

### 问题 3: 连接失败

```
❌ 创建工单失败: connect ECONNREFUSED
```

**解决方案：**
- 确认后端服务正在运行
- 检查端口 21101 是否可访问
- 运行 `curl http://localhost:21101/api/v1/metrics` 测试

## 查看监控数据

脚本运行完成后，访问：

- **Grafana Dashboard**: http://localhost:3000/d/game-ai-backend-overview
- **Prometheus**: http://localhost:9090
- **后端 Metrics**: http://localhost:21101/api/v1/metrics

## 持续生成数据

如果需要持续生成数据（用于压力测试），可以使用循环：

```bash
# Linux/Mac
while true; do node generate-monitoring-data.js; sleep 10; done

# Windows PowerShell
while ($true) { node generate-monitoring-data.js; Start-Sleep -Seconds 10 }
```

## 注意事项

1. 脚本会创建真实的工单和会话数据
2. 建议在测试环境运行
3. 生产环境请谨慎使用
4. 可以定期清理测试数据
