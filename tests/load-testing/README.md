# 性能测试与压力测试指南

本目录包含游戏AI客服系统的完整性能测试套件。

## 目录结构

```
tests/load-testing/
├── scripts/
│   ├── http-api-load.js      # HTTP API 负载测试
│   ├── websocket-load.js     # WebSocket 压力测试
│   └── database-stress.js    # 数据库压力测试
├── results/                   # 测试结果输出目录
├── run-tests.ps1             # Windows 测试执行脚本
└── README.md                 # 本文档
```

## 环境准备

### 1. 安装 k6

**Windows (推荐使用 Chocolatey):**
```powershell
choco install k6
```

**Windows (使用 winget):**
```powershell
winget install k6
```

**Mac:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### 2. 确保服务运行

```bash
# 启动核心服务
docker-compose up -d

# 启动监控服务（可选，用于观察测试过程中的指标）
docker-compose --profile monitoring up -d
```

## 测试类型说明

### 1. 冒烟测试 (Smoke Test)
- **目的**: 快速验证系统基本功能正常
- **并发**: 1-5 用户
- **时长**: 30秒 - 2分钟
- **场景**: 验证关键接口可用

### 2. 负载测试 (Load Test)
- **目的**: 验证正常负载下的系统性能
- **并发**: 50-100 用户
- **时长**: 10-15 分钟
- **场景**: 模拟日常使用量

### 3. 压力测试 (Stress Test)
- **目的**: 找到系统性能极限
- **并发**: 逐步增加到 200-500 用户
- **时长**: 15-20 分钟
- **场景**: 持续增加负载直到系统开始出错

### 4. 峰值测试 (Spike Test)
- **目的**: 验证系统应对突发流量的能力
- **并发**: 瞬间增加到 500+ 用户
- **时长**: 2-5 分钟
- **场景**: 模拟突发事件（如游戏活动上线）

### 5. 耐久测试 (Soak Test)
- **目的**: 检测内存泄漏和长时间运行的稳定性
- **并发**: 中等负载（50-100 用户）
- **时长**: 1-4 小时
- **场景**: 持续运行检测稳定性

## 快速开始

### 运行 HTTP API 负载测试

```powershell
# 冒烟测试 (1个用户, 30秒)
k6 run --vus 1 --duration 30s scripts/http-api-load.js

# 负载测试 (50个用户, 5分钟)
k6 run --vus 50 --duration 5m scripts/http-api-load.js

# 压力测试 (使用脚本内置场景)
k6 run scripts/http-api-load.js

# 自定义并导出结果
k6 run --vus 100 --duration 10m --out json=results/http-results.json scripts/http-api-load.js
```

### 运行 WebSocket 压力测试

```powershell
# 基础测试 (50个连接, 5分钟)
k6 run --vus 50 --duration 5m scripts/websocket-load.js

# 压力测试 (使用脚本内置场景)
k6 run scripts/websocket-load.js

# 极限测试 (1000个连接)
k6 run --vus 1000 --duration 10m scripts/websocket-load.js
```

### 运行数据库压力测试

```powershell
# 基础测试
k6 run --vus 30 --duration 5m scripts/database-stress.js

# 完整压力测试 (使用脚本内置场景)
k6 run scripts/database-stress.js
```

## 配置环境变量

可以通过环境变量自定义测试配置：

```powershell
# Windows PowerShell
$env:BASE_URL = "https://your-server:21101"
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "your-password"
k6 run scripts/http-api-load.js

# 或使用 k6 的 -e 参数
k6 run -e BASE_URL=https://localhost:21101 -e ADMIN_USERNAME=admin scripts/http-api-load.js
```

## 性能指标解读

### 关键指标

| 指标 | 说明 | 健康阈值 |
|------|------|----------|
| http_req_duration (p95) | 95% 请求的响应时间 | < 500ms |
| http_req_duration (p99) | 99% 请求的响应时间 | < 1000ms |
| http_req_failed | 请求失败率 | < 1% |
| iterations | 完成的测试迭代次数 | 越高越好 |
| vus | 并发虚拟用户数 | 根据测试类型 |

### WebSocket 指标

| 指标 | 说明 | 健康阈值 |
|------|------|----------|
| ws_connect_duration (p95) | WebSocket 连接耗时 | < 1000ms |
| ws_message_latency (p95) | 消息往返延迟 | < 200ms |
| ws_connection_errors | 连接错误数 | < 10 |

### 数据库指标

| 指标 | 说明 | 健康阈值 |
|------|------|----------|
| query_duration (p95) | 查询响应时间 | < 500ms |
| write_duration (p95) | 写入响应时间 | < 1000ms |
| aggregate_duration (p95) | 聚合查询时间 | < 2000ms |

## 监控测试过程

### 使用 Grafana 实时监控

1. 确保监控服务已启动
2. 访问 Grafana: http://localhost:23103
3. 打开 "Game AI Backend Overview" 仪表板
4. 观察以下面板：
   - HTTP 请求速率
   - 响应时间分布
   - WebSocket 连接数
   - 数据库查询性能
   - 系统资源使用

### 使用 Prometheus 查询指标

```promql
# 请求速率
rate(game_ai_cs_http_requests_total[1m])

# 平均响应时间
rate(game_ai_cs_http_request_duration_seconds_sum[1m])
  / rate(game_ai_cs_http_request_duration_seconds_count[1m])

# WebSocket 活跃连接
game_ai_cs_ws_connections_active

# 错误率
rate(game_ai_cs_http_requests_total{status_code=~"5.."}[1m])
  / rate(game_ai_cs_http_requests_total[1m])
```

## 测试报告

测试完成后，k6 会生成详细的测试报告：

1. **控制台输出**: 实时显示测试进度和最终摘要
2. **JSON 结果**: 使用 `--out json=results/xxx.json` 保存详细数据
3. **HTML 报告**: 可使用第三方工具生成

### 生成 HTML 报告

```bash
# 安装 k6-reporter
npm install -g k6-reporter

# 生成 HTML 报告
k6-reporter results/http-results.json results/http-report.html
```

## 性能优化建议

根据测试结果，常见的优化方向：

### 如果 HTTP 延迟过高
1. 检查数据库查询是否需要优化（添加索引）
2. 增加 Redis 缓存
3. 启用 HTTP 压缩
4. 考虑增加后端实例数

### 如果 WebSocket 连接不稳定
1. 调整系统最大文件描述符限制
2. 增加 Node.js 内存限制
3. 检查心跳超时配置
4. 考虑使用 WebSocket 负载均衡

### 如果数据库成为瓶颈
1. 增加连接池大小
2. 优化慢查询
3. 添加读写分离
4. 考虑分表分库

## 故障排除

### k6 无法连接到服务

```powershell
# 检查服务是否运行
docker ps

# 检查端口是否开放
Test-NetConnection -ComputerName localhost -Port 21101
```

### SSL 证书错误

k6 脚本中已配置 `insecureSkipTLSVerify: true`，如仍有问题：
```powershell
k6 run --insecure-skip-tls-verify scripts/http-api-load.js
```

### 内存不足

如果测试大量并发用户时遇到内存问题：
```powershell
# 增加 k6 可用内存
$env:K6_OPTIONS = '{"noUsageReport": true}'
k6 run --vus 1000 scripts/http-api-load.js
```

## 参考资源

- [k6 官方文档](https://k6.io/docs/)
- [k6 最佳实践](https://k6.io/docs/testing-guides/api-load-testing/)
- [性能测试指标解读](https://k6.io/docs/using-k6/metrics/)
