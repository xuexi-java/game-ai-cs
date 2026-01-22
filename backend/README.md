# AI 客服系统 - 后端服务

基于 NestJS 的多游戏客服系统后端 API，支持实时通信、智能分流、工单管理等核心功能。

## 📋 目录

- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [API 文档](#api-文档)
- [配置说明](#配置说明)
- [开发指南](#开发指南)
- [测试](#测试)
- [部署](#部署)
- [常见问题](#常见问题)

---

## 🚀 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | 20.19.5 | 运行环境 |
| NestJS | 10.3.0 | Web 框架 |
| PostgreSQL | - | 关系型数据库 |
| Prisma | 5.7.0 | ORM 工具 |
| Redis | - | 缓存与队列 |
| Socket.io | 4.7.2 | WebSocket 实时通信 |
| JWT | 10.2.0 | 身份认证 |
| Swagger | 7.1.17 | API 文档 |
| Prometheus | 15.1.3 | 监控指标 |

---

## ⚡ 快速开始

### 1. 环境准备

确保已安装以下软件：

```bash
# Node.js 20.19.5
node -v  # v20.19.5

# PostgreSQL（推荐 14+）
psql --version

# Redis（推荐 6+）
redis-cli --version
```

### 2. 安装依赖

```bash
cd backend
npm install
```

### 3. 配置环境变量

复制示例配置文件并修改：

```bash
cp .env.example .env
```

**最小化配置**（开发环境）：

```env
# 数据库
DATABASE_URL="postgresql://postgres:password@localhost:5432/game_ai_cs"

# JWT 密钥（开发环境可保持默认，生产环境必须修改）
JWT_SECRET="your-jwt-secret-key"

# Redis
REDIS_URL="redis://localhost:6379"

# 服务端口
PORT=21101
NODE_ENV=development

# 日志级别
LOG_LEVEL=INFO

# 前端 URL（支持多个，逗号分隔）
FRONTEND_URL="http://localhost:20101,http://localhost:5173"
```

**生产环境必须额外配置**：

```env
# 安全密钥（使用 openssl rand -hex 32 生成）
ENCRYPTION_SECRET_KEY="your-64-character-encryption-key"
WS_TOKEN_SECRET="your-ws-token-secret"
UPLOAD_TOKEN_SECRET="your-upload-token-secret"
SESSION_TOKEN_SECRET="your-session-token-secret"

# Dify AI 配置
DIFY_API_KEY="app-xxxxx"
DIFY_BASE_URL="https://your-dify-server/v1"

# WebSocket URL
WS_URL="wss://your-domain.com"
```

详细配置说明请查看 [配置说明](#配置说明) 章节。

### 4. 初始化数据库

```bash
# 创建数据库表结构
npx prisma migrate deploy

# （可选）填充测试数据
npx prisma db seed
```

### 5. 启动服务

```bash
# 开发模式（热重载）
npm run start:dev

# 生产模式
npm run build
npm run start:prod
```

服务启动后访问：
- API 服务：http://localhost:21101/api/v1
- 管理端 API 文档：http://localhost:21101/api/v1/docs/admin
- 玩家端 API 文档：http://localhost:21101/api/v1/docs/player
- 监控指标：http://localhost:21101/metrics

---

## 📁 项目结构

```
backend/
├── src/
│   ├── auth/                    # 认证模块（JWT、本地认证）
│   ├── user/                    # 用户管理
│   ├── game/                    # 游戏配置管理
│   ├── session/                 # 会话管理（核心）
│   │   ├── services/
│   │   │   ├── session-ai.service.ts        # AI 分流逻辑
│   │   │   ├── session-priority.service.ts  # 优先级计算
│   │   │   └── session-assignment.service.ts # 客服分配
│   │   └── session.service.ts
│   ├── ticket/                  # 工单管理
│   ├── ticket-message/          # 工单消息
│   ├── message/                 # 会话消息
│   ├── queue/                   # 排队系统（Redis）
│   ├── websocket/               # WebSocket 网关
│   │   └── websocket.gateway.ts
│   ├── player-api/              # 玩家端 API（无需 JWT）
│   │   ├── player-auth/         # 签名验证
│   │   ├── player-session/
│   │   └── player-upload/
│   ├── dify/                    # Dify AI 集成
│   ├── dashboard/               # 数据统计仪表盘
│   ├── satisfaction/            # 满意度评价
│   ├── issue-type/              # 问题类型管理
│   ├── urgency-rule/            # 紧急规则配置
│   ├── quick-reply/             # 快捷回复
│   ├── upload/                  # 文件上传（管理端）
│   ├── metrics/                 # Prometheus 监控指标
│   ├── common/                  # 公共模块
│   │   ├── guards/              # 守卫（认证、权限、限流）
│   │   ├── filters/             # 异常过滤器
│   │   ├── interceptors/        # 拦截器（日志、响应转换）
│   │   ├── logger/              # 日志服务
│   │   └── decorators/          # 装饰器
│   ├── prisma/                  # Prisma ORM
│   │   └── schema.prisma        # 数据库模型定义
│   ├── redis/                   # Redis 连接模块
│   └── main.ts                  # 应用入口
├── prisma/
│   ├── migrations/              # 数据库迁移文件
│   └── seed.js                  # 初始化数据脚本
├── test/                        # 测试文件
├── uploads/                     # 文件上传目录（运行时生成）
├── .env.example                 # 环境变量模板
└── package.json
```

### 核心模块说明

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| **session** | 会话生命周期管理、AI 分流、客服分配 | `session-ai.service.ts`<br>`session-assignment.service.ts` |
| **queue** | Redis 排队系统、优先级计算 | `queue.service.ts` |
| **websocket** | 实时消息推送、心跳检测、限流 | `websocket.gateway.ts` |
| **player-api** | 玩家端无 JWT 接口（签名验证） | `player-auth/` |
| **dify** | Dify AI 集成（智能对话、话术优化） | `dify.service.ts` |
| **ticket** | 工单系统（创建、分配、自动关闭） | `ticket.service.ts` |
| **dashboard** | 数据统计与监控 | `dashboard.service.ts` |

---

## 🔑 核心功能

### 1. 会话管理与智能分流

- **AI 智能分流**：集成 Dify，根据问题描述自动判断是否转人工
- **优先级计算**：基于玩家 VIP 等级、问题紧急度等因素动态计算
- **智能分配**：按客服负载、专长游戏自动分配会话
- **排队系统**：Redis Sorted Set 实现优先级排队

**核心代码**：
- [session-ai.service.ts](src/session/services/session-ai.service.ts) - AI 分流逻辑
- [queue.service.ts](src/queue/queue.service.ts) - 排队管理

### 2. WebSocket 实时通信

- **双向消息推送**：玩家 ↔ 客服实时通信
- **心跳检测**：15 秒间隔，3 次未响应自动断开
- **动态限流**：玩家/客服不同速率限制
- **断线重连**：自动恢复会话状态

**核心代码**：[websocket.gateway.ts](src/websocket/websocket.gateway.ts)

### 3. 工单系统

- **全生命周期管理**：创建、分配、进行中、已解决、已关闭
- **自动关闭机制**：超时未响应自动关闭（可配置）
- **多消息类型**：文本、图片、系统消息、菜单选项
- **满意度评价**：工单关闭后玩家可评分（1-5 星）

**核心代码**：[ticket.service.ts](src/ticket/ticket.service.ts)

### 4. 玩家端 API（Player API）

- **无需 JWT 认证**：基于签名验证（HMAC-SHA256）
- **Token 生成**：后端生成临时 Token，前端使用
- **防重放攻击**：timestamp + nonce 机制
- **支持场景**：WebView 嵌入、原生 App 接入

**核心代码**：[player-auth/](src/player-api/player-auth/)

### 5. Dify AI 集成

- **智能对话**：自动回答常见问题
- **话术优化**：客服回复前 AI 优化建议
- **问题分类**：自动识别问题类型和紧急度
- **多游戏配置**：每个游戏可配置独立 Dify 实例

**核心代码**：[dify.service.ts](src/dify/dify.service.ts)

### 6. 数据统计与监控

- **实时仪表盘**：在线客服数、待处理工单数、平均响应时间
- **Prometheus 指标**：队列长度、Redis 连接状态、API 调用量
- **日志系统**：批量写入、压缩归档、采样率控制

**核心代码**：
- [dashboard.service.ts](src/dashboard/dashboard.service.ts)
- [metrics/](src/metrics/)

---

## 📖 API 文档

启动服务后访问 Swagger 文档：

### 管理端 API（需要 JWT 认证）
http://localhost:21101/api/v1/docs/admin

包含模块：
- 认证登录/登出
- 用户管理
- 游戏配置
- 会话/工单管理
- 消息管理
- 仪表盘数据
- 快捷回复配置

### 玩家端 API（签名验证）
http://localhost:21101/api/v1/docs/player

包含模块：
- 获取 WebSocket Token
- 获取上传 Token
- 创建/查询会话
- 发送消息
- 文件上传

### 主要端点

| 端点 | 方法 | 描述 | 认证方式 |
|------|------|------|----------|
| `/api/v1/auth/login` | POST | 客服登录 | 无 |
| `/api/v1/sessions` | GET | 查询会话列表 | JWT |
| `/api/v1/sessions/:id/assign` | POST | 分配客服 | JWT |
| `/api/v1/tickets` | POST | 创建工单 | JWT |
| `/api/v1/player-api/auth/ws-token` | POST | 获取 WS Token | 签名 |
| `/api/v1/player-api/sessions` | POST | 创建会话 | 签名 |
| `/api/v1/dify/chat-messages` | POST | Dify AI 对话 | JWT |

---

## ⚙️ 配置说明

### 核心配置项

#### 数据库配置

```env
# PostgreSQL 连接字符串
DATABASE_URL="postgresql://用户名:密码@主机:端口/数据库名"
```

#### Redis 配置

```env
# Redis 连接 URL
REDIS_URL="redis://localhost:6379"

# 或使用分离配置
REDIS_HOST="localhost"
REDIS_PORT=6379

# 重试与超时配置
REDIS_MAX_RETRIES_PER_REQUEST=3
REDIS_CONNECT_TIMEOUT=5000
REDIS_PING_TIMEOUT=2000
```

#### 安全配置

```env
# JWT 密钥（生产环境必须修改）
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="1h"

# 数据加密密钥（用于加密 Dify API Key 等敏感信息）
ENCRYPTION_SECRET_KEY="your-64-character-hex-key"

# 玩家 API Token 密钥
WS_TOKEN_SECRET="your-ws-token-secret"
UPLOAD_TOKEN_SECRET="your-upload-token-secret"
SESSION_TOKEN_SECRET="your-session-token-secret"
```

生成安全密钥：
```bash
# JWT Secret
openssl rand -base64 32

# Encryption Key（64 字符 HEX）
openssl rand -hex 32
```

#### WebSocket 配置

```env
# WebSocket URL（玩家客户端连接地址）
WS_URL="ws://localhost:21101"  # 开发环境
# WS_URL="wss://cs.your-game.com"  # 生产环境

# 心跳检测（15秒*3次=45秒无响应断开）
WS_HEARTBEAT_CHECK_INTERVAL=15000
WS_HEARTBEAT_MAX_MISSED=3

# 限流配置
WS_PLAYER_RATE_LIMIT=200   # 玩家每分钟消息数
WS_AGENT_RATE_LIMIT=600    # 客服每分钟消息数
```

#### Dify AI 配置

```env
# Dify API 配置（可选，用于话术优化功能）
DIFY_API_KEY="app-xxxxx"
DIFY_BASE_URL="https://api.dify.ai/v1"
```

**注意**：
- 每个游戏可在管理端单独配置 Dify 实例
- 此处配置为全局默认（用于话术优化功能）

#### 日志配置

```env
# 日志级别：DEBUG | INFO | WARN | ERROR
LOG_LEVEL="INFO"

# 日志采样率（0.0-1.0，仅对成功且快速的请求生效）
LOG_SAMPLING_RATE="0.1"

# 日志批量写入配置
LOG_BATCH_SIZE=100
LOG_BATCH_INTERVAL=100

# 日志归档与清理
LOG_ENABLE_COMPRESSION=true
LOG_ARCHIVE_AFTER_DAYS=7
LOG_CLEAN_AFTER_DAYS=30
```

#### 工单自动关闭配置

```env
# 启用/禁用自动关闭
ENABLE_AUTO_CLOSURE=true

# WAITING 状态超时时间（小时）
WAITING_TIMEOUT_HOURS=72    # 3天

# IN_PROGRESS 状态（客服已回复）超时时间（小时）
REPLIED_TIMEOUT_HOURS=24    # 1天
```

#### 限流配置

```env
# 全局限流（每分钟请求数）
THROTTLE_GLOBAL_LIMIT=200

# Dify API 限流
THROTTLE_DIFY_LIMIT=100

# 会话接口限流
THROTTLE_SESSION_LIMIT=1000

# 工单接口限流
THROTTLE_TICKET_LIMIT=1000
```

#### 缓存配置

```env
# 启用缓存
CACHE_ENABLED=true

# 游戏配置缓存时长（秒）
CACHE_CONFIG_TTL_SECONDS=900

# 快捷回复缓存时长（秒）
CACHE_QUICK_REPLY_TTL_SECONDS=60

# 仪表盘缓存时长（秒）
DASHBOARD_CACHE_TTL_SECONDS=60
```

---

## 🛠️ 开发指南

### 本地开发

```bash
# 启动开发服务器（热重载）
npm run start:dev

# 启动调试模式
npm run start:debug
```

### 数据库操作

```bash
# 创建新迁移
npx prisma migrate dev --name your_migration_name

# 应用迁移（生产环境）
npx prisma migrate deploy

# 重置数据库（警告：会删除所有数据）
npx prisma migrate reset

# 查看数据库
npx prisma studio
```

### 日志管理

```bash
# 清理过期日志
npm run clean:logs

# 压缩归档日志
npm run archive:logs
```

### 代码规范

```bash
# 格式化代码
npm run format

# 代码检查
npm run lint
```

### 常用命令

```bash
# 生成 Prisma Client
npx prisma generate

# 查看 Prisma 客户端类型
npx prisma validate

# 查看数据库状态
npx prisma migrate status
```

---

## 🧪 测试

### 运行测试

```bash
# 单元测试
npm run test

# 测试覆盖率
npm run test:cov

# 监听模式
npm run test:watch

# 集成测试
npm run test:integration

# E2E 测试
npm run test:e2e

# 测试 Dify 模块
npm run test:dify
```

### 测试工具

```bash
# 测试新用户首次接入
node ../test-tools/test-brand-new-user.js
```

---

## 🚢 部署

### 生产环境部署步骤

1. **构建项目**

```bash
npm run build
```

2. **配置环境变量**

确保 `.env` 文件包含所有生产环境配置（特别是安全密钥）。

3. **数据库迁移**

```bash
npx prisma migrate deploy
```

4. **启动服务**

```bash
# 使用 PM2（推荐）
pm2 start dist/main.js --name "cs-backend"

# 或直接启动
npm run start:prod
```

### 使用 PM2 管理进程

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs cs-backend

# 重启
pm2 restart cs-backend

# 停止
pm2 stop cs-backend
```

**ecosystem.config.js 示例**：

```javascript
module.exports = {
  apps: [
    {
      name: 'cs-backend',
      script: './dist/main.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
```

### Docker 部署

```bash
# 构建镜像
docker build -t cs-backend:latest .

# 运行容器
docker run -d \
  --name cs-backend \
  -p 21101:21101 \
  --env-file .env \
  cs-backend:latest
```

### 健康检查

访问以下端点验证服务状态：

```bash
# 健康检查
curl http://localhost:21101/api/v1/health

# Metrics 监控
curl http://localhost:21101/metrics
```

---

## ❓ 常见问题

### 1. 数据库连接失败

**错误**：`P1001: Can't reach database server`

**解决方案**：
- 检查 PostgreSQL 是否启动：`pg_ctl status`
- 验证 `DATABASE_URL` 配置是否正确
- 确认防火墙未阻止端口 5432

### 2. Redis 连接失败

**错误**：`Redis connection refused`

**解决方案**：
- 检查 Redis 是否启动：`redis-cli ping`
- 验证 `REDIS_URL` 配置
- 确认防火墙未阻止端口 6379

### 3. WebSocket 连接失败

**问题**：前端无法连接 WebSocket

**解决方案**：
- 检查 `WS_URL` 配置与前端匹配
- 开发环境使用 `ws://`，生产环境使用 `wss://`
- 确认 CORS 配置允许前端域名

### 4. JWT Token 过期

**问题**：频繁要求重新登录

**解决方案**：
- 调整 `JWT_EXPIRES_IN` 配置（如 `8h`、`24h`）
- 前端实现自动刷新 Token 机制

### 5. Prisma 迁移冲突

**错误**：`Migration failed`

**解决方案**：
```bash
# 查看迁移状态
npx prisma migrate status

# 标记已应用的迁移（跳过错误迁移）
npx prisma migrate resolve --applied "migration_name"

# 或重置数据库（开发环境）
npx prisma migrate reset
```

### 6. 文件上传失败

**问题**：上传文件返回 403 或 500

**解决方案**：
- 检查 `UPLOAD_DIR` 目录权限（需要写权限）
- 验证 `MAX_FILE_SIZE` 配置（默认 10MB）
- 确认前端使用正确的 `X-Upload-Token` 头

### 7. Dify API 调用失败

**错误**：`Dify API error`

**解决方案**：
- 验证 `DIFY_API_KEY` 和 `DIFY_BASE_URL` 配置
- 检查 Dify 服务是否可访问
- 查看日志确认具体错误信息

### 8. 日志文件占用磁盘空间

**解决方案**：
```bash
# 清理过期日志
npm run clean:logs

# 启用日志压缩
LOG_ENABLE_COMPRESSION=true
LOG_ARCHIVE_AFTER_DAYS=7
LOG_CLEAN_AFTER_DAYS=30
```

### 9. Prometheus 指标未显示

**问题**：访问 `/metrics` 返回空

**解决方案**：
- 确认 `METRICS_KEY` 环境变量已设置
- 验证请求头携带正确的 `X-Metrics-Key`
- 检查是否有监控指标生成

### 10. 性能优化

**如何提升系统性能**：

- **启用缓存**：`CACHE_ENABLED=true`
- **调整日志采样率**：`LOG_SAMPLING_RATE=0.05`（降低日志量）
- **数据库索引**：检查慢查询并添加索引
- **Redis 连接池**：增加 `REDIS_MAX_RECONNECT_ATTEMPTS`
- **集群部署**：使用 PM2 cluster 模式

---

## 📚 相关文档

- [客服系统接入文档](../docs/客服系统接入文档.md)
- [生产环境部署指南](../docs/生产环境部署指南.md)
- [部署检查清单](../docs/部署检查清单.md)
- [产品使用文档](../docs/产品使用文档.md)

---

## 📞 技术支持

如有问题，请联系开发团队或提交 Issue。

**API 版本**：v1.0.0
**最后更新**：2026-01-22
