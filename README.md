# AI 客服系统 (game-ai-cs)

一个以"前置分流"和"智能路由"为核心的多游戏AI客服平台。

## 📋 项目概述

本系统旨在解决传统客服中"信息不足"、"无效排队"和"客服压力大"的核心痛点。利用 AI (Dify) 的能力，从"被动响应"转向"主动引导和智能分流"。

### 核心特性

- ✅ **前置分流**: 玩家先填表单，再咨询，确保客服获得完整信息
- ✅ **智能路由**: AI自动判断问题紧急程度，智能分配到人工或工单
- ✅ **多游戏支持**: 支持多个游戏，每个游戏独立配置
- ✅ **紧急排序**: 可配置的排队队列优先级规则
- ✅ **实时通信**: WebSocket实时消息推送
- ✅ **身份验证**: 无需登录，通过游戏信息验证身份
- ✅ **AI优化回复**: 客服回复内容AI智能优化，提升专业度和友好度
- ✅ **快捷回复**: 支持快捷回复模板，提高客服效率
- ✅ **个人偏好**: 支持快捷回复个人偏好设置
- ✅ **智能排队**: 自动分配客服，显示排队位置和预计等待时间
- ✅ **工单管理**: 完整的工单生命周期管理
- ✅ **满意度评价**: 会话结束后收集玩家满意度反馈

## 🏗️ 项目结构

```
game-ai-cs/
├── backend/              # 后端服务 (Nest.js)
│   ├── src/
│   │   ├── auth/        # 认证授权模块
│   │   ├── game/        # 游戏管理模块
│   │   ├── ticket/      # 工单模块
│   │   ├── session/     # 会话模块
│   │   ├── message/     # 消息模块
│   │   └── ...
│   └── package.json
├── player-app/          # 玩家端前端 (React + Vite)
│   ├── src/
│   │   ├── pages/      # 页面
│   │   ├── components/ # 组件
│   │   ├── stores/     # 状态管理
│   │   └── services/   # API服务
│   └── package.json
├── admin-portal/        # 管理端前端 (React + Vite)
│   ├── src/
│   │   ├── pages/      # 页面
│   │   ├── components/ # 组件
│   │   ├── stores/     # 状态管理
│   │   └── services/   # API服务
│   └── package.json
├── prisma/             # 数据库Schema和迁移
│   ├── schema.prisma
│   └── migrations/
├── docs/                # 项目文档
│   ├── AI 客服系统 - 产品需求文档.md
│   ├── 数据库设计文档.md
│   ├── 技术文档.md
│   └── 数据库创建指南.md
├── docker-compose.yml   # Docker服务配置
└── package.json         # 根项目配置
```

## 🚀 快速开始

### 前置要求

- **Node.js**: 20.19.5 (LTS版本)
- **Docker Desktop**: 用于本地开发 (可选)
- **PostgreSQL**: 14+ (如果不用Docker)
- **Git**: 用于代码克隆

### 1. 克隆项目

```bash
git clone <repository-url>
cd game-ai-cs
```

### 2. 配置环境变量

**Docker 部署方式**（推荐）:

```bash
# 在项目根目录执行
# 仅需要配置后端环境变量（可选，用于生产环境）
cp backend/.env.example backend/.env

# 编辑 backend/.env 文件，根据实际情况修改配置
# 注意：Docker 部署时，前端使用相对路径，不需要配置前端环境变量
```

⚠️ **重要**: Docker 部署时请确保修改以下配置：
- `DATABASE_URL`: 数据库连接字符串（Docker 中会自动配置，但可以自定义）
- `JWT_SECRET`: JWT 密钥（生产环境必须修改）
- `DIFY_API_KEY`: Dify API 密钥（如果使用 AI 功能）
- `DIFY_BASE_URL`: Dify 服务地址（如果使用 AI 功能）

**本地开发方式**:

```bash
# 在项目根目录执行
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/player-app/.env.example frontend/player-app/.env
cp frontend/admin-portal/.env.example frontend/admin-portal/.env

# 编辑 .env 文件，根据实际情况修改配置
```

⚠️ **注意**: 
- Docker 部署时，前端使用相对路径通过 Nginx 代理，**不需要**配置前端环境变量
- 本地开发模式（`npm run dev`）才需要配置前端环境变量

### 3. 安装依赖

```bash
# 安装根项目依赖
npm install

# 安装后端依赖
cd backend
npm install

# 安装玩家端依赖
cd ../player-app
npm install

# 安装管理端依赖
cd ../admin-portal
npm install
```

### 4. 启动数据库

```bash
# 在项目根目录执行
cd game-ai-cs  # 确保在项目根目录

# 方式一：使用 npm 脚本
npm run docker:up

# 方式二：直接使用 docker-compose
docker-compose up -d postgres
```

> 📍 **注意**: 所有 Docker 相关命令都需要在**项目根目录**执行

### 5. 初始化数据库

```bash
# 在项目根目录执行
cd game-ai-cs  # 确保在项目根目录

npm run db:generate  # 生成Prisma Client
npm run db:migrate   # 运行数据库迁移
npm run db:seed      # 初始化种子数据
```

> 📍 **注意**: 
> - 如果使用 Docker 部署，数据库迁移会在容器启动时自动执行，无需手动运行
> - 这些命令需要在**项目根目录**执行

### 6. 启动服务

#### 方式一：使用 Docker 部署（推荐）

> 📍 **重要提示**: 以下所有 `docker-compose` 命令都需要在**项目根目录**（`game-ai-cs/`）执行。

**前置准备**:

1. 确保已安装 Docker 和 Docker Compose
   ```bash
   # 检查 Docker 版本
   docker --version
   docker-compose --version
   ```

2. 配置环境变量（可选，用于生产环境）
   ```bash
   # 在项目根目录创建 .env 文件（如果还没有）
   # 可以设置以下环境变量：
   # JWT_SECRET=your-production-secret-key
   # DIFY_API_KEY=your-dify-api-key
   # DIFY_BASE_URL=your-dify-base-url
   ```

**部署步骤**:

1. **进入项目根目录**
   ```bash
   cd game-ai-cs  # 或你的项目目录名
   ```

2. **停止并清理旧容器（如果存在）**
   ```bash
   # 在项目根目录执行
   docker-compose down
   ```

3. **构建并启动所有服务**
   ```bash
   # 在项目根目录执行
   # -d: 后台运行
   # --build: 重新构建镜像
   docker-compose up -d --build
   ```

   这个命令会：
   - 构建 PostgreSQL 数据库容器
   - 构建后端服务容器（包括生成 Prisma Client 和运行数据库迁移）
   - 构建前端服务容器（玩家端和管理端）
   - 启动所有服务并建立网络连接

4. **检查服务状态**
   ```bash
   # 在项目根目录执行
   docker-compose ps
   ```

   应该看到所有服务状态为 `Up`：
   - `game-ai-cs-postgres` (数据库)
   - `game-ai-cs-backend` (后端服务)
   - `game-ai-cs-admin-portal` (管理端)
   - `game-ai-cs-player-app` (玩家端)

5. **初始化数据库种子数据（可选）**
   ```bash
   # 在项目根目录执行
   # 这会创建默认的管理员和客服账户
   docker-compose exec backend npx prisma db seed --schema=./prisma/schema.prisma
   ```

**服务访问地址**：
- 玩家端: http://localhost:20101
- 管理端: http://localhost:20102
- 后端API: http://localhost:21101/api/v1
- API文档: http://localhost:21101/api/v1/docs

**常用管理命令**:

```bash
# 在项目根目录执行以下命令

# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend          # 后端日志
docker-compose logs -f admin-portal     # 管理端日志
docker-compose logs -f player-app       # 玩家端日志
docker-compose logs -f postgres         # 数据库日志

# 重启特定服务
docker-compose restart backend
docker-compose restart admin-portal
docker-compose restart player-app

# 停止所有服务（保留数据）
docker-compose stop

# 停止并删除所有容器（保留数据卷）
docker-compose down

# 停止并删除所有容器和数据卷（⚠️ 会删除数据库数据）
docker-compose down -v

# 重新构建特定服务
docker-compose build backend
docker-compose up -d backend

# 进入容器内部（用于调试）
docker-compose exec backend sh          # 进入后端容器
docker-compose exec postgres psql -U postgres -d game_ai_cs  # 进入数据库
```

**开发环境模式**:

如果需要使用开发模式（支持热重载）：

```bash
# 在项目根目录执行
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

**故障排查**:

1. **查看服务日志**
   ```bash
   # 在项目根目录执行
   docker-compose logs -f backend
   ```

2. **检查容器状态**
   ```bash
   # 在项目根目录执行
   docker-compose ps
   ```

3. **重新构建服务**
   ```bash
   # 在项目根目录执行
   docker-compose build --no-cache backend
   docker-compose up -d backend
   ```

4. **检查数据库连接**
   ```bash
   # 在项目根目录执行
   docker-compose exec postgres pg_isready -U postgres -d game_ai_cs
   ```

**注意事项**:

- ✅ 所有 `docker-compose` 命令必须在**项目根目录**执行
- ✅ 首次启动会自动运行数据库迁移，无需手动执行
- ✅ 前端使用相对路径，通过 Nginx 代理访问后端，无需配置环境变量
- ✅ 数据库数据会持久化保存在 Docker 卷中，即使容器删除也不会丢失
- ⚠️ 生产环境请务必修改 `JWT_SECRET` 环境变量
- ⚠️ 生产环境建议使用 `docker-compose.prod.yml`（如果存在）进行部署

#### 方式二：本地开发模式（需要本地安装 Node.js）

**后端服务**:
```bash
cd backend
npm run start:dev
```
后端服务运行在: http://localhost:21101

**玩家端**:
```bash
cd frontend/player-app
npm run dev
```
玩家端运行在: http://localhost:20101

**管理端**:
```bash
cd frontend/admin-portal
npm run dev
```
管理端运行在: http://localhost:20102

**注意**: 本地开发模式需要：
- 确保 Docker 服务（PostgreSQL）已启动：`docker-compose up -d postgres`
- 配置正确的环境变量（`.env` 文件）
- 运行数据库迁移和种子数据

## 📚 开发命令

### 数据库相关

```bash
# 生成Prisma Client
npm run db:generate

# 创建数据库迁移
npm run db:migrate

# 部署迁移（生产环境）
npm run db:migrate:deploy

# 打开Prisma Studio（数据库可视化工具）
npm run db:studio

# 初始化种子数据
npm run db:seed

# 重置数据库（删除所有数据并重新迁移）
npm run db:reset
```

### Docker相关

> 📍 **执行位置**: 所有命令在**项目根目录**执行

```bash
# 在项目根目录执行
npm run docker:up      # 启动服务
npm run docker:down    # 停止服务
npm run docker:logs    # 查看日志

# 或者直接使用 docker-compose 命令（在项目根目录）
docker-compose up -d --build    # 构建并启动所有服务
docker-compose down              # 停止所有服务
docker-compose logs -f           # 查看所有服务日志
docker-compose ps                # 查看服务状态
```

### 后端开发

```bash
cd backend
npm run start:dev     # 开发模式（热重载）
npm run build         # 构建生产版本
npm run start:prod    # 生产模式运行
```

### 前端开发

```bash
# 玩家端
cd player-app
npm run dev           # 开发服务器
npm run build         # 构建生产版本
npm run preview       # 预览生产构建

# 管理端
cd admin-portal
npm run dev           # 开发服务器
npm run build         # 构建生产版本
npm run preview       # 预览生产构建
```

## 🔐 默认账户

数据库初始化后会创建以下默认账户：

### 管理员账户
- `admin` / `admin123` (系统管理员)
- `admin2` / `admin123` (副管理员)

### 客服账户
- `agent1` / `agent123` (客服001)
- `agent2` / `agent123` (客服002)
- `agent3` / `agent123` (客服003)

⚠️ **重要**: 
- 生产环境请务必修改所有账户的默认密码！
- 建议使用强密码（至少8位，包含字母和数字）
- 可通过管理端修改账户密码

## 📖 文档

### 产品文档
- [产品需求文档](./docs/AI%20客服系统%20-%20产品需求文档.md)
- [产品使用文档](./docs/产品使用文档.md) - **新用户必读**

### 技术文档
- [技术文档](./docs/技术文档.md)
- [数据库设计文档](./docs/数据库设计文档.md)
- [数据库创建指南](./docs/数据库创建指南.md)
- [生产环境部署指南](./docs/生产环境部署指南.md) - **生产部署必读**

### 配置文档
- [Dify配置指南](./docs/Dify配置指南.md)
- [AI优化功能配置指南](./docs/AI优化功能配置指南.md)
- [功能测试指南](./docs/功能测试指南.md)

## 🛠️ 技术栈

### 后端
- **框架**: Nest.js 10.x
- **语言**: TypeScript 5.x
- **数据库**: PostgreSQL 14+
- **ORM**: Prisma 5.x
- **认证**: JWT
- **WebSocket**: Socket.io
- **日志**: JSON 单行格式，stdout/stderr 分流，支持 ELK/Loki

### 前端
- **框架**: React 18.x
- **语言**: TypeScript 5.x
- **构建工具**: Vite 5.x
- **UI组件库**: Ant Design 5.x
- **状态管理**: Zustand
- **路由**: React Router 6.x
- **HTTP客户端**: Axios

## 📁 环境变量配置

### 后端 (.env)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:22101/game_ai_cs?schema=public"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="8h"
PORT=21101
NODE_ENV="development"
FRONTEND_URL="http://localhost:20101,http://localhost:20102"
REDIS_HOST=localhost
REDIS_PORT=6379
ENCRYPTION_SECRET_KEY="your-32-char-secret-key-here-change-in-production"
```

⚠️ **重要**: 
- `ENCRYPTION_SECRET_KEY`: 用于加密敏感数据（如 Dify API Key），生产环境必须设置为至少32字符的强随机字符串
- 如果修改了 `ENCRYPTION_SECRET_KEY`，数据库中已加密的数据将无法解密，需要重新加密

### 玩家端 (.env) - 仅本地开发需要

> ⚠️ **注意**: Docker 部署时，前端使用相对路径，**不需要**配置这些环境变量。

```env
# 仅用于本地开发模式（npm run dev）
VITE_API_BASE_URL=http://localhost:21101/api/v1
VITE_WS_URL=http://localhost:21101
```

### 管理端 (.env) - 仅本地开发需要

> ⚠️ **注意**: Docker 部署时，前端使用相对路径，**不需要**配置这些环境变量。

```env
# 仅用于本地开发模式（npm run dev）
VITE_API_BASE_URL=http://localhost:21101/api/v1
VITE_WS_URL=ws://localhost:21101
```

## 🗄️ 数据库结构

系统包含以下核心数据表：

- `Game` - 游戏配置
- `Server` - 区服
- `Ticket` - 工单
- `TicketAttachment` - 工单附件
- `Session` - 会话
- `Message` - 消息
- `TicketMessage` - 工单消息
- `User` - 用户（管理员/客服）
- `IssueType` - 问题类型
- `UrgencyRule` - 紧急排序规则
- `SatisfactionRating` - 满意度评价
- `QuickReply` - 快捷回复
- `QuickReplyCategory` - 快捷回复分类
- `QuickReplyUserPreference` - 快捷回复个人偏好

详细设计请参考 [数据库设计文档](./docs/数据库设计文档.md)

## 📦 构建部署

### 生产环境构建

```bash
# 后端
cd backend
npm run build
npm run start:prod

# 前端
cd player-app
npm run build

cd ../admin-portal
npm run build
```

### 生产环境部署

详细的生产环境部署步骤请参考 [生产环境部署指南](./docs/生产环境部署指南.md)，包括：

- 服务器环境准备
- 数据库配置
- Nginx 反向代理配置
- PM2 进程管理
- SSL 证书配置
- 监控和日志
- 备份和恢复

### Docker部署

**生产环境部署**:

```bash
# 在项目根目录执行
docker-compose -f docker-compose.prod.yml up -d --build
```

**标准部署**（开发/测试环境）:

```bash
# 在项目根目录执行
docker-compose up -d --build
```


## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 开发规范

- 使用 TypeScript 进行开发
- 遵循 ESLint 和 Prettier 配置
- 提交前运行测试
- 遵循 Git Commit 规范

## 📊 日志管理

系统日志为 JSON 单行格式，stdout/stderr 分流，支持 ELK/Loki 接入。

### 日志特性

- ✅ **JSON 格式**: 结构化日志，易于分析和查询
- ✅ **自动轮转**: 单个文件达到 100MB 自动轮转，保留最近 10 个文件
- ✅ **定期清理**: 自动删除 3 个月前的日志文件
- ✅ **链路追踪**: 每个请求自动生成 traceId，支持完整链路追踪
- ✅ **慢请求检测**: 自动检测慢请求（>500ms WARN，>2000ms ERROR）
- ✅ **分流输出**: stdout（INFO/WARN）和 stderr（ERROR）分流
- ✅ **日志优化**: 每个请求只记录 1 条日志，删除冗余字段，日志量减半（2025-12-19 优化）

### 日志配置

```bash
# 查看日志（Docker 环境）
docker-compose logs -f backend

# 查看日志（PM2 环境）
pm2 logs game-ai-backend

# 设置定期清理（Linux/macOS）
./scripts/setup-log-cleanup-cron.sh

# 设置定期清理（Windows，以管理员身份运行）
.\scripts\setup-log-cleanup-task.ps1

# 手动清理日志
./scripts/clean-logs.sh  # Linux/macOS
.\scripts\clean-logs.ps1  # Windows
```

详细配置请参考：
- [日志配置说明](./docs/日志配置说明.md)
- [运维部署命令](./docs/运维部署命令.md)

## 🐛 问题反馈

如遇到问题，请：

1. 查看 [常见问题排查](./docs/生产环境部署指南.md#常见问题排查)
2. 查看日志文件（`backend/logs/access.log` 和 `backend/logs/error.log`）
3. 按 traceId 查询完整请求链路：`grep "traceId" backend/logs/*.log`
4. 提交 [GitHub Issue](https://github.com/xuexi-java/game-ai/issues)

## 🔄 更新日志

### 最新版本功能

- ✅ 修复转人工功能：自动分配客服，保持排队状态等待客服主动接入
- ✅ 实现快捷回复个人偏好：支持用户自定义启用/禁用和内容
- ✅ 修复快捷回复500错误：添加错误处理避免表不存在时崩溃
- ✅ 优化工单提交：添加完整的错误处理和验证
- ✅ 优化排队系统：实时显示排队位置和预计等待时间
- ✅ **日志系统优化**（2025-12-19）：
  - 日志量减半：每个请求只记录 1 条日志（合并 request + response）
  - 删除 userAgent：节省约 60% 日志空间
  - 确保 traceId/userId 完整：所有日志都包含完整追踪信息
  - 优化日志格式：cost 带单位（如 "150ms"），更直观

## 📄 许可证

ISC

## 🙏 致谢

- [Nest.js](https://nestjs.com/) - 强大的 Node.js 框架
- [Prisma](https://www.prisma.io/) - 现代化的 ORM
- [React](https://react.dev/) - 用户界面库
- [Ant Design](https://ant.design/) - 企业级 UI 组件库
- [Dify](https://dify.ai/) - LLM 应用开发平台
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
