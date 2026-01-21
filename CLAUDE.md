# Game AI Customer Service System

多游戏 AI 客服平台，核心功能是「前置分流」和「智能路由」。玩家端以 WebView 形式嵌入游戏客户端。

## 技术栈

- **后端**: NestJS 10 + TypeScript + Prisma 5 + PostgreSQL 14
- **管理端**: React 18 + Ant Design + Zustand + Vite
- **玩家端**: Vue 3 + TailwindCSS + Pinia + Vite (WebView 嵌入)
- **基础设施**: Redis + Socket.IO + Docker

## 目录结构

```
backend/                 # NestJS 后端
  src/
    auth/               # JWT 认证
    game/               # 游戏管理
    ticket/             # 工单管理
    session/            # 会话管理
    message/            # 消息管理
    queue/              # 队列分配
    websocket/          # WebSocket 网关
    dify/               # Dify AI 集成
    player-api/         # 玩家端 API (WebView 接入)
    common/
      encryption/       # AES-256-GCM 加密服务
      logger/           # 日志服务
  prisma/
    schema.prisma       # 数据库模型定义

frontend/admin-portal/  # React 管理后台
webview-player/         # Vue3 玩家端 (嵌入游戏客户端)
test-tools/             # 测试工具
  mock-game-server.js   # 模拟游戏服务器
docs/                   # 项目文档
```

## 常用命令

```bash
# 开发
npm run dev:backend       # 启动后端 (端口 21101)
npm run dev:admin         # 启动管理端 (端口 20101)
npm run dev:player        # 启动玩家端

# 数据库
npm run db:migrate        # 运行迁移
npm run db:generate       # 生成 Prisma Client
npm run db:seed           # 初始化种子数据
npm run db:studio         # 打开 Prisma Studio

# 测试
cd backend && npm test              # 运行所有测试
cd backend && npm test -- --watch   # 监听模式
node test-tools/mock-game-server.js # 启动模拟游戏服务器

# Docker
npm run docker:up         # 启动 PostgreSQL + Redis
npm run docker:down       # 停止容器
```

## WebView 游戏客户端接入

### 核心架构

```
游戏客户端 (APK)
  └─ WebView (webview-player)
       ├─ HTTP: POST /api/v1/player/connect (Bootstrap)
       ├─ HTTP: POST /api/v1/player/upload (图片上传)
       └─ WebSocket: 实时聊天
```

### 接入流程

1. **初始化**: 游戏客户端打开 WebView，调用 Bridge 获取玩家信息
2. **签名**: 游戏服务器计算签名 `sign = md5(gameid|uid|areaid|nonce|secret)`
3. **Bootstrap**: 调用 `/api/v1/player/connect` 获取 wsToken、工单状态
4. **WebSocket**: 使用 wsToken 建立连接，进行实时聊天

### 签名验证

```
签名公式: sign = md5(gameid|uid|areaid|ts|nonce|secret).toLowerCase()

参数:
- gameid: 游戏ID (与后台配置一致)
- uid: 玩家UID
- areaid: 区服ID
- ts: 时间戳(毫秒)，用于签名时效性校验（2小时有效期）
- nonce: 固定随机串 (游戏配置的 playerApiNonce)
- secret: 签名密钥 (游戏配置的 playerApiSecret)
```

### 关键接口

| 接口                            | 说明                                                |
| ------------------------------- | --------------------------------------------------- |
| `POST /api/v1/player/connect` | Bootstrap 入口，返回 wsToken/questList/activeTicket |
| `POST /api/v1/player/upload`  | 图片上传，Header 携带 X-Upload-Token                |
| WebSocket `/socket.io`        | 实时聊天，auth.token 携带 wsToken                   |

### WebSocket 事件

**客户端 → 服务器**:

- `ticket:create` - 创建工单
- `ticket:resume` - 恢复工单
- `message:send` - 发送消息 (需携带 clientMsgId)
- `transfer:request` - 转人工

**服务器 → 客户端**:

- `ticket:created` / `ticket:resumed` - 工单状态
- `message:ack` - 消息确认 (幂等)
- `message:receive` - 收到消息
- `agent:assigned` - 客服接入

## 加密服务

使用 AES-256-GCM 加密敏感数据 (如 Dify API Key)。

```typescript
// 加密
const encrypted = encryptionService.encrypt(plainText);
// 解密
const decrypted = encryptionService.decrypt(encrypted);
```

**格式**: `iv:tag:encrypted` (hex 编码)

**环境变量**:

```env
ENCRYPTION_SECRET_KEY=xxx  # 加密密钥 (至少32字符)
ENCRYPTION_SALT=xxx        # 盐值
```

## 测试

### 单元测试

```bash
cd backend
npm test                    # 运行所有测试
npm test -- queue.service   # 运行特定测试
npm test -- --coverage      # 覆盖率报告
```

### 集成测试 (WebView 全链路)

1. 启动后端和数据库
2. 启动模拟游戏服务器: `node test-tools/mock-game-server.js`
3. 启动玩家端: `npm run dev:player`
4. 访问 `http://localhost:3001/webview-test` 选择测试玩家

### 测试账号

| 类型   | 账号   | 密码     |
| ------ | ------ | -------- |
| 管理员 | admin  | admin123 |
| 客服   | agent1 | agent123 |

## 开发规范

### API 设计

- RESTful 路径: `/api/v1/{resource}`
- 使用 DTO 进行请求验证
- 统一响应格式

### 数据库操作

- 使用 Prisma Client，不写原生 SQL
- 修改 Schema 后必须运行 `db:migrate`
- 事务操作使用 `prisma.$transaction()`

### WebSocket

- 网关: `backend/src/websocket/websocket.gateway.ts`
- 事件命名: `snake_case` (如 `new_message`, `session_assigned`)
- 消息幂等: 使用 `clientMsgId` 去重

### 安全

- 敏感数据使用 `EncryptionService` 加密存储
- Dify API Key 存储在 Game 表，加密字段
- JWT 认证，Token 有效期 8 小时
- 玩家端签名验证，nonce 防篡改

## 环境变量

```env
# 数据库
DATABASE_URL=postgresql://...

# 认证
JWT_SECRET=xxx
JWT_EXPIRES_IN=8h

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# 加密
ENCRYPTION_SECRET_KEY=xxx  # 至少32字符
ENCRYPTION_SALT=xxx

# 玩家 API
PLAYER_API_WS_TOKEN_TTL=3600        # wsToken 有效期(秒)
PLAYER_API_UPLOAD_TOKEN_TTL=600     # uploadToken 有效期(秒)
```

## 关键文件位置

| 文件                                                    | 说明                          |
| ------------------------------------------------------- | ----------------------------- |
| `backend/src/player-api/`                             | 玩家端 API (WebView 接入核心) |
| `backend/src/player-api/guards/sign.guard.ts`         | 签名验证 Guard                |
| `backend/src/player-api/services/token.service.ts`    | Token 生成/验证               |
| `backend/src/common/encryption/encryption.service.ts` | 加密服务                      |
| `backend/src/websocket/websocket.gateway.ts`          | WebSocket 网关                |
| `backend/prisma/schema.prisma`                        | 数据库模型                    |
| `test-tools/mock-game-server.js`                      | 模拟游戏服务器                |
| `docs/游戏客户端接入改造方案.md`                      | WebView 接入详细文档          |

## 注意事项

1. **签名密钥安全**: `playerApiSecret` 只存在于游戏服务器，绝不下发到客户端
2. **消息幂等**: 每条消息必须携带 `clientMsgId`，5分钟内去重
3. **单连接约束**: 同一玩家只允许一个 WebSocket 连接，新连接踢旧连接
4. **工单约束**: 同一玩家同时只能有一个未关闭工单
5. **图片上传**: 前端压缩到 maxWidth=1920, quality=0.8，支持 HEIC 转换
6. **Token 过期**: wsToken 1小时，uploadToken 10分钟
