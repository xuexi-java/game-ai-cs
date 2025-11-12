# Game AI Customer Service System

游戏AI客服系统 - 基于Dify工作流的智能客服解决方案

## 📋 项目简介

本项目是一个完整的游戏AI客服系统，采用前后端分离架构，集成Dify AI工作流，为游戏玩家提供智能化的客服服务。

## 🏗️ 项目结构

```
game-ai-cs/
├── backend/                 # 后端服务 (NestJS)
│   ├── src/                # 源代码
│   ├── test/               # 测试文件
│   ├── dist/               # 编译输出
│   ├── package.json        # 后端依赖配置
│   └── tsconfig.json       # TypeScript配置
│
├── frontend/               # 前端应用
│   ├── admin-portal/       # 管理后台 (React + Ant Design)
│   │   ├── src/           # 源代码
│   │   ├── package.json   # 前端依赖配置
│   │   └── vite.config.ts # Vite配置
│   │
│   └── player-app/         # 玩家端应用 (Vue 3)
│       ├── src/           # 源代码
│       ├── package.json   # 前端依赖配置
│       └── vite.config.ts # Vite配置
│
├── docker/                 # Docker配置
│   └── docker-compose.yml # Docker Compose配置
│
├── docs/                   # 项目文档
│   ├── AI客服系统产品化方案.md
│   ├── AI 客服系统后台页面设计文档.md
│   └── ai开发规范.md
│
├── frontend-design-demo/   # 前端设计演示
│   ├── admin_demo_v3.html
│   └── player_demo_v3.html
│
├── .gitignore             # Git忽略配置
└── README.md              # 项目说明文档
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.x
- npm >= 9.x 或 yarn >= 1.22.x
- Docker (可选，用于本地开发环境)

### 安装依赖

#### 后端服务

```bash
cd backend
npm install
```

#### 管理后台

```bash
cd frontend/admin-portal
npm install
```

#### 玩家端应用

```bash
cd frontend/player-app
npm install
```

### 运行项目

#### 启动后端服务

```bash
cd backend
npm run start:dev
```

后端服务将在 `http://localhost:3000` 启动

#### 启动管理后台

```bash
cd frontend/admin-portal
npm run dev
```

管理后台将在 `http://localhost:5173` 启动

#### 启动玩家端应用

```bash
cd frontend/player-app
npm run dev
```

玩家端应用将在 `http://localhost:5174` 启动

### 使用 Docker

```bash
cd docker
docker-compose up -d
```

## 📦 技术栈

### 后端
- **框架**: NestJS 11.x
- **语言**: TypeScript 5.7.x
- **数据库**: PostgreSQL (通过 Docker)
- **缓存**: Redis (通过 Docker)

### 前端 - 管理后台
- **框架**: React 19.x
- **UI库**: Ant Design 5.28.x
- **构建工具**: Vite
- **语言**: TypeScript 5.9.x

### 前端 - 玩家端
- **框架**: Vue 3.5.x
- **构建工具**: Vite
- **语言**: TypeScript 5.9.x

## 📚 项目文档

详细的项目文档位于 `docs/` 目录：

- [AI客服系统产品化方案](./docs/AI客服系统产品化方案.md) - 完整的产品化实施方案
- [AI 客服系统后台页面设计文档](./docs/AI%20客服系统后台页面设计文档.md) - 后台页面设计规范
- [AI开发规范](./docs/ai开发规范.md) - 开发规范和最佳实践

## 🔧 开发规范

请参考 [AI开发规范文档](./docs/ai开发规范.md) 了解详细的开发规范和代码标准。

## 📝 项目特性

- ✅ 前后端分离架构
- ✅ TypeScript 全栈开发
- ✅ 基于 Dify 的 AI 工作流集成
- ✅ 实时客服对话功能
- ✅ 工单管理系统
- ✅ 数据统计分析
- ✅ Docker 容器化部署

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用私有许可证，未经授权不得使用。

## 👥 团队

- 开发团队：Game AI CS Team

---

**注意**: 本项目仍在积极开发中，API 和功能可能会有变化。
