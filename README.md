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

- Node.js 18+
- Docker Desktop (用于本地开发)
- PostgreSQL 14+ (如果不用Docker)

### 1. 克隆项目

```bash
git clone <repository-url>
cd game-ai-cs
```

### 2. 安装依赖

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

### 3. 启动数据库

```bash
# 从项目根目录启动Docker服务
npm run docker:up

# 或者
docker-compose up -d
```

### 4. 初始化数据库

```bash
# 从项目根目录
npm run db:generate  # 生成Prisma Client
npm run db:migrate   # 运行数据库迁移
npm run db:seed      # 初始化种子数据
```

### 5. 启动开发服务

**后端服务**:
```bash
cd backend
npm run start:dev
```
后端服务运行在: http://localhost:3000

**玩家端**:
```bash
cd player-app
npm run dev
```
玩家端运行在: http://localhost:5173

**管理端**:
```bash
cd admin-portal
npm run dev
```
管理端运行在: http://localhost:5174 (需要配置不同端口)

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

```bash
npm run docker:up      # 启动服务
npm run docker:down    # 停止服务
npm run docker:logs    # 查看日志
```

### 后端开发

```bash
cd backend
npm run start:dev     # 开发模式（热重载）
npm run build         # 构建生产版本
npm run start:prod    # 生产模式运行
npm run test          # 运行测试
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

- **管理员**: `admin` / `admin123`
- **客服**: `agent1` / `agent123`

⚠️ **重要**: 生产环境请务必修改这些默认密码！

## 📖 文档

- [产品需求文档](./docs/AI%20客服系统%20-%20产品需求文档.md)
- [数据库设计文档](./docs/数据库设计文档.md)
- [技术文档](./docs/技术文档.md)
- [数据库创建指南](./docs/数据库创建指南.md)

## 🛠️ 技术栈

### 后端
- **框架**: Nest.js 10.x
- **语言**: TypeScript 5.x
- **数据库**: PostgreSQL 14+
- **ORM**: Prisma 5.x
- **认证**: JWT
- **WebSocket**: Socket.io

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
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/game_ai_cs?schema=public"
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="8h"
REDIS_URL="redis://localhost:6379"
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
```

### 玩家端 (.env)

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000
```

### 管理端 (.env)

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_WS_URL=ws://localhost:3000
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
- `UrgencyRule` - 紧急排序规则
- `SatisfactionRating` - 满意度评价

详细设计请参考 [数据库设计文档](./docs/数据库设计文档.md)

## 🧪 测试

```bash
# 后端测试
cd backend
npm run test          # 单元测试
npm run test:e2e      # E2E测试
npm run test:cov      # 测试覆盖率
```

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

### Docker部署

```bash
docker-compose -f docker-compose.prod.yml up -d
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

## 📄 许可证

ISC

## 🙏 致谢

- [Nest.js](https://nestjs.com/)
- [Prisma](https://www.prisma.io/)
- [React](https://react.dev/)
- [Ant Design](https://ant.design/)
- [Dify](https://dify.ai/)
