# Game-AI 客服系统 - 压力测试

## 快速开始

### 1. 安装依赖

```bash
pip install locust python-socketio
```

### 2. 运行测试

```bash
# 进入项目根目录
cd game-ai

# Web UI 模式 (推荐，访问 http://localhost:8089)
locust -f loadtest/locustfile.py --host=http://localhost:21101
```

## 测试命令

### 冒烟测试 (验证系统正常)
```bash
locust -f loadtest/locustfile.py --host=http://localhost:21101 \
  -u 5 -r 1 -t 1m --headless
```

### 负载测试 (正常业务负载)
```bash
locust -f loadtest/locustfile.py --host=http://localhost:21101 \
  -u 50 -r 5 -t 10m --headless
```

### 压力测试 (找系统极限)
```bash
locust -f loadtest/locustfile.py --host=http://localhost:21101 \
  -u 200 -r 20 -t 15m --headless
```

### 峰值测试 (突发流量)
```bash
locust -f loadtest/locustfile.py --host=http://localhost:21101 \
  -u 500 -r 100 -t 5m --headless
```

## 文件结构

```
loadtest/
├── locustfile.py      # 主入口文件
├── common.py          # 公共模块 (登录、工具函数)
├── player_user.py     # 玩家用户类 (60%)
├── ai_message_user.py # AI消息用户类 (15%)
├── ws_user.py         # WebSocket用户类 (15%)
├── admin_user.py      # 管理端用户类 (10%)
└── README.md          # 本文档
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| ADMIN_USER | admin | 管理员用户名 |
| ADMIN_PASS | admin123 | 管理员密码 |
| GAME_ID | (自动获取) | 指定测试的游戏ID |
| ISSUE_TYPE_ID | (自动获取) | 指定问题类型ID |
| PLAYER_NAME | player_{random} | 玩家名称前缀 |

---

# 压力测试设计文档

## 1. 测试目标

* 验证系统在**预期业务负载**下的性能是否达标
* 评估系统在**高并发场景**下的稳定性
* 找出系统**容量上限与性能瓶颈**
* 为上线与容量规划提供数据依据

## 2. 测试范围

### 2.1 包含范围

* 用户鉴权与会话管理
* 客服/玩家核心业务流程
* AI 消息处理能力
* WebSocket 实时通信
* 管理端查询与操作接口

### 2.2 不包含范围

* 运维后台低频接口
* 非线上使用的调试接口

## 3. 用户类设计

### PlayerUser (60%)

模拟玩家完整咨询流程：
* 创建工单 → 创建会话 → 发送消息 → 接收回复 → 查询状态

### AIMessageUser (15%)

AI消息高并发测试：
* 高频消息发送
* 短思考时间 (0.5-1s)
* 用于找 AI 服务瓶颈

### WsUser (15%)

WebSocket 长连接测试：
* 维持长连接
* 心跳保活
* 验证在线用户规模

### AdminUser (10%)

管理端操作模拟：
* 查询会话/工单列表
* 接入会话
* 回复消息
* 关闭会话

## 4. 性能指标目标

| 指标 | 目标值 |
|------|--------|
| 平均响应时间 | < 200ms |
| P95 响应时间 | < 500ms |
| P99 响应时间 | < 1000ms |
| 错误率 | < 1% |
| RPS | > 100 (单实例) |

## 5. 压力测试阶梯

```
50 → 100 → 200 → 300 → 500
```

观察系统拐点，记录各阶段性能数据。

## 6. 导出报告

```bash
locust -f loadtest/locustfile.py --host=http://localhost:21101 \
  -u 100 -r 10 -t 10m --headless \
  --csv=results/stress_test
```

生成文件：
- `stress_test_stats.csv` - 请求统计
- `stress_test_failures.csv` - 失败详情
- `stress_test_stats_history.csv` - 历史数据

## 7. 注意事项

1. **测试环境隔离**: 不要在生产环境运行压力测试
2. **数据清理**: 测试后清理测试数据
3. **资源监控**: 测试期间监控服务器 CPU/内存/数据库连接
4. **渐进加压**: 从低并发开始，逐步增加用户数
