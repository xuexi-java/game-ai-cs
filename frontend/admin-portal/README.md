# AI 客服系统 - 管理端前端

基于 React + TypeScript + Ant Design 的多游戏客服管理系统前端应用,提供客服工作台、工单管理、数据统计等功能。

## 📋 目录

- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心功能](#核心功能)
- [配置说明](#配置说明)
- [开发指南](#开发指南)
- [构建部署](#构建部署)
- [常见问题](#常见问题)

---

## 🚀 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.2.0 | UI 框架 |
| TypeScript | 5.9.3 | 类型安全 |
| Vite | 5.4.10 | 构建工具 |
| Ant Design | 5.21.0 | UI 组件库 |
| Ant Design Pro Components | 2.7.18 | 高级业务组件 |
| React Router | 6.28.0 | 路由管理 |
| Zustand | 5.0.1 | 状态管理 |
| Socket.io Client | 4.7.5 | WebSocket 实时通信 |
| Axios | 1.13.2 | HTTP 请求 |
| ECharts | 5.6.0 | 数据可视化 |
| Day.js | 1.11.13 | 时间处理 |

---

## ⚡ 快速开始

### 1. 环境准备

确保已安装 Node.js 20.19.5：

```bash
node -v  # v20.19.5
```

### 2. 安装依赖

```bash
cd frontend/admin-portal
npm install
```

### 3. 配置环境变量

复制示例配置文件并修改：

```bash
cp .env.example .env
```

**开发环境配置**：

```env
# API 服务器地址
VITE_API_BASE_URL=http://localhost:21101/api/v1

# WebSocket 服务器地址
VITE_WS_URL=ws://localhost:21101
```

**生产环境配置**：

```env
# 使用生产域名
VITE_API_BASE_URL=https://api.your-domain.com/api/v1
VITE_WS_URL=wss://api.your-domain.com
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:20101 查看应用。

**默认测试账号**：
- 管理员：`admin` / `admin123`
- 客服：`agent1` / `agent123`

---

## 📁 项目结构

```
frontend/admin-portal/
├── src/
│   ├── pages/                       # 页面组件
│   │   ├── Login/                   # 登录页
│   │   ├── Dashboard/               # 数据仪表盘
│   │   ├── Workbench/               # 客服工作台（实时聊天）
│   │   ├── Sessions/                # 会话管理
│   │   ├── Tickets/                 # 工单管理
│   │   ├── Games/                   # 游戏配置管理
│   │   ├── Settings/                # 系统设置
│   │   │   ├── Users/               # 用户管理
│   │   │   ├── IssueTypes/          # 问题类型管理
│   │   │   ├── UrgencyRules/        # 紧急规则配置
│   │   │   └── QuickReplies/        # 快捷回复管理
│   │   └── Profile/                 # 个人资料
│   ├── components/                  # 公共组件
│   │   ├── Layout/                  # 布局组件
│   │   ├── ChatWindow/              # 聊天窗口
│   │   ├── MessageItem/             # 消息项
│   │   ├── SessionList/             # 会话列表
│   │   ├── TicketDetail/            # 工单详情
│   │   └── ...
│   ├── services/                    # API 服务
│   │   ├── api.ts                   # Axios 配置与拦截器
│   │   ├── auth.ts                  # 认证接口
│   │   ├── session.ts               # 会话接口
│   │   ├── ticket.ts                # 工单接口
│   │   ├── message.ts               # 消息接口
│   │   ├── game.ts                  # 游戏配置接口
│   │   ├── user.ts                  # 用户管理接口
│   │   ├── websocket.ts             # WebSocket 连接
│   │   └── dashboard.ts             # 数据统计接口
│   ├── stores/                      # 状态管理（Zustand）
│   │   ├── authStore.ts             # 认证状态
│   │   ├── sessionStore.ts          # 会话状态
│   │   ├── messageStore.ts          # 消息状态
│   │   └── notificationStore.ts     # 通知状态
│   ├── hooks/                       # 自定义 Hooks
│   │   ├── useWebSocket.ts          # WebSocket Hook
│   │   ├── useAuth.ts               # 认证 Hook
│   │   └── useNotification.ts       # 通知 Hook
│   ├── types/                       # TypeScript 类型定义
│   │   ├── session.ts               # 会话类型
│   │   ├── ticket.ts                # 工单类型
│   │   ├── message.ts               # 消息类型
│   │   └── user.ts                  # 用户类型
│   ├── utils/                       # 工具函数
│   │   ├── format.ts                # 格式化工具
│   │   ├── storage.ts               # 本地存储工具
│   │   └── constants.ts             # 常量定义
│   ├── config/                      # 配置文件
│   │   └── index.ts                 # 全局配置
│   ├── assets/                      # 静态资源
│   ├── App.tsx                      # 根组件
│   └── main.tsx                     # 应用入口
├── public/                          # 静态文件
├── .env.example                     # 环境变量模板
├── vite.config.ts                   # Vite 配置
├── tsconfig.json                    # TypeScript 配置
└── package.json
```

### 核心模块说明

| 模块 | 职责 | 关键文件 |
|------|------|----------|
| **Workbench** | 客服工作台、实时聊天、消息处理 | `pages/Workbench/`<br>`components/ChatWindow/` |
| **Sessions** | 会话列表、分配、状态管理 | `pages/Sessions/`<br>`services/session.ts` |
| **Tickets** | 工单列表、详情、创建、关闭 | `pages/Tickets/`<br>`services/ticket.ts` |
| **Dashboard** | 数据统计、图表展示 | `pages/Dashboard/`<br>`services/dashboard.ts` |
| **Games** | 游戏配置、Dify API 配置 | `pages/Games/`<br>`services/game.ts` |
| **Settings** | 系统配置、用户管理、快捷回复 | `pages/Settings/` |
| **WebSocket** | 实时消息推送、心跳检测 | `services/websocket.ts`<br>`hooks/useWebSocket.ts` |

---

## 🔑 核心功能

### 1. 客服工作台（Workbench）

**功能特点**：
- 实时聊天窗口，支持多会话切换
- 消息类型支持：文本、图片、系统消息、菜单选项
- 快捷回复功能（可配置）
- AI 话术优化建议（Dify 集成）
- 输入状态指示器（对方正在输入...）
- 历史消息加载（分页）
- 文件上传与预览

**核心组件**：
- ChatWindow - 聊天窗口主体
- MessageItem - 消息项渲染
- SessionList - 会话列表

**WebSocket 事件**：
```typescript
// 接收消息
socket.on('message', (message) => { ... });

// 接收会话更新
socket.on('sessionUpdate', (session) => { ... });

// 接收排队位置更新
socket.on('queueUpdate', (data) => { ... });
```

### 2. 会话管理（Sessions）

**功能特点**：
- 会话列表（支持筛选、搜索、分页）
- 会话状态：排队中、进行中、已完成
- 分配客服（自动/手动）
- 会话优先级显示
- 批量操作（批量分配、批量关闭）
- 实时状态更新（WebSocket）

**筛选条件**：
- 游戏
- 状态（QUEUED / IN_PROGRESS / COMPLETED）
- 客服
- 时间范围

### 3. 工单管理（Tickets）

**功能特点**：
- 工单列表（支持筛选、搜索、排序）
- 工单详情（查看完整对话历史）
- 工单状态：等待中、进行中、已解决、已关闭
- 问题类型管理
- 紧急度标记
- 满意度评价查看
- 工单导出（CSV）

**工单生命周期**：
```
创建 → 等待分配 → 进行中 → 已解决 → 已关闭
       ↓
    自动关闭（超时）
```

### 4. 数据仪表盘（Dashboard）

**实时统计**：
- 在线客服数量
- 待处理工单数
- 今日新增工单
- 平均响应时间
- 平均处理时长
- 满意度评分

**图表展示**：
- 工单趋势图（折线图）
- 问题类型分布（饼图）
- 客服工作量统计（柱状图）
- 满意度趋势（折线图）

**数据刷新**：
- 自动刷新（每 30 秒）
- 手动刷新按钮
- 时间范围选择（今日、近 7 天、近 30 天）

### 5. 游戏配置管理（Games）

**配置项**：
- 游戏基本信息（名称、描述）
- Dify AI 配置
  - API Key（加密存储）
  - Base URL
  - 测试连接
- 问题类型关联
- 紧急规则配置
- 启用/禁用游戏

### 6. 系统设置（Settings）

#### 用户管理
- 创建/编辑/删除用户
- 角色分配（ADMIN / AGENT）
- 密码重置
- 用户状态管理

#### 问题类型管理
- 创建/编辑问题类型
- 问题描述与指引
- 关联游戏

#### 紧急规则配置
- 创建/编辑紧急规则
- 规则条件（关键词匹配、VIP 等级）
- 优先级权重

#### 快捷回复管理
- 创建/编辑快捷回复
- 分类管理
- 关联游戏
- 排序

### 7. 实时通信（WebSocket）

**自动重连机制**：
```typescript
// 断线自动重连
socket.on('disconnect', () => {
  setTimeout(() => reconnect(), 3000);
});
```

**心跳检测**：
- 服务端每 15 秒发送 ping
- 客户端响应 pong
- 3 次未响应自动断开

**事件订阅**：
| 事件名 | 描述 | 数据 |
|--------|------|------|
| `message` | 新消息 | `Message` |
| `sessionUpdate` | 会话状态更新 | `Session` |
| `queueUpdate` | 排队位置更新 | `{ sessionId, position }` |
| `ticketUpdate` | 工单状态更新 | `Ticket` |
| `agentStatusUpdate` | 客服状态变更 | `{ agentId, status }` |

---

## ⚙️ 配置说明

### 环境变量

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `VITE_API_BASE_URL` | 后端 API 地址 | `http://localhost:21101/api/v1` |
| `VITE_WS_URL` | WebSocket 服务器地址 | `ws://localhost:21101` |

### Vite 配置

**vite.config.ts**：

```typescript
export default defineConfig({
  server: {
    port: 20101,        // 开发服务器端口
    proxy: {
      '/api': {
        target: 'http://localhost:21101',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,   // 生产环境关闭 sourcemap
  },
});
```

### Axios 拦截器

**请求拦截器**：
```typescript
// 自动添加 JWT Token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**响应拦截器**：
```typescript
// 统一错误处理
axios.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // 跳转登录页
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

---

## 🛠️ 开发指南

### 本地开发

```bash
# 启动开发服务器（热重载）
npm run dev

# 访问应用
# http://localhost:20101
```

### 代码规范

```bash
# 代码检查
npm run lint

# 自动修复
npm run lint -- --fix
```

### 添加新页面

1. 在 `src/pages/` 创建新目录
2. 创建 `index.tsx` 文件
3. 在 `App.tsx` 添加路由

**示例**：
```typescript
// src/pages/NewPage/index.tsx
export default function NewPage() {
  return <div>New Page</div>;
}

// App.tsx
<Route path="/new-page" element={<NewPage />} />
```

### 添加新 API 接口

1. 在 `src/services/` 添加接口函数
2. 使用 TypeScript 定义类型

**示例**：
```typescript
// src/services/newService.ts
import api from './api';
import { NewResource } from '@/types/newResource';

export const getNewResources = async (): Promise<NewResource[]> => {
  return api.get('/new-resources');
};

export const createNewResource = async (data: Partial<NewResource>) => {
  return api.post('/new-resources', data);
};
```

### 使用 Zustand 状态管理

**创建 Store**：
```typescript
// src/stores/newStore.ts
import { create } from 'zustand';

interface NewStore {
  items: any[];
  setItems: (items: any[]) => void;
}

export const useNewStore = create<NewStore>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}));
```

**使用 Store**：
```typescript
import { useNewStore } from '@/stores/newStore';

function Component() {
  const { items, setItems } = useNewStore();
  // ...
}
```

### 自定义 Hook 开发

**示例**：
```typescript
// src/hooks/useData.ts
import { useState, useEffect } from 'react';

export function useData(apiCall: () => Promise<any>) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading };
}
```

---

## 🚢 构建部署

### 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录。

### 预览构建产物

```bash
npm run preview
```

### 部署到 Nginx

**步骤**：

1. 构建项目
```bash
npm run build
```

2. 将 `dist/` 目录内容复制到 Nginx 服务器

3. 配置 Nginx

**nginx.conf 示例**：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/admin-portal;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://backend-server:21101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io/ {
        proxy_pass http://backend-server:21101;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

4. 重启 Nginx
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### 部署到 Docker

**Dockerfile 示例**：

```dockerfile
FROM node:20.19.5-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**构建与运行**：
```bash
docker build -t cs-admin-portal:latest .
docker run -d -p 80:80 cs-admin-portal:latest
```

### 部署到 CDN

1. 构建项目
2. 将 `dist/` 目录上传到 CDN（如阿里云 OSS、腾讯云 COS）
3. 配置 CDN 域名解析
4. 设置缓存规则（HTML 文件不缓存，静态资源长缓存）

**环境变量注入**（运行时配置）：

```javascript
// public/config.js
window.__APP_CONFIG__ = {
  API_BASE_URL: 'https://api.your-domain.com/api/v1',
  WS_URL: 'wss://api.your-domain.com',
};
```

在 `index.html` 中引入：
```html
<script src="/config.js"></script>
```

---

## ❓ 常见问题

### 1. 开发服务器启动失败

**错误**：`Port 20101 is already in use`

**解决方案**：
- 修改 `vite.config.ts` 中的端口号
- 或终止占用端口的进程

### 2. API 请求失败（CORS 错误）

**错误**：`Access-Control-Allow-Origin` 错误

**解决方案**：
- 确认后端 `.env` 中配置了正确的 `FRONTEND_URL`
- 开发环境使用 Vite proxy（见 vite.config.ts）

### 3. WebSocket 连接失败

**问题**：控制台显示 WebSocket 连接错误

**解决方案**：
- 检查 `VITE_WS_URL` 配置与后端匹配
- 开发环境使用 `ws://`，生产环境使用 `wss://`
- 确认后端 WebSocket 服务正常运行

### 4. Token 过期频繁登出

**问题**：频繁要求重新登录

**解决方案**：
- 调整后端 `JWT_EXPIRES_IN` 配置
- 实现 Token 自动刷新机制

### 5. 图片上传失败

**问题**：上传图片返回错误

**解决方案**：
- 检查文件大小是否超过限制（默认 10MB）
- 确认后端 `UPLOAD_DIR` 目录权限
- 验证 `X-Upload-Token` 是否正确

### 6. 消息未实时更新

**问题**：新消息不显示

**解决方案**：
- 检查 WebSocket 连接状态
- 确认已订阅正确的事件
- 查看浏览器控制台是否有错误

### 7. 构建失败

**错误**：`Type error` 或 `Build failed`

**解决方案**：
```bash
# 清理缓存
rm -rf node_modules
npm cache clean --force
npm install

# 检查 TypeScript 配置
npx tsc --noEmit
```

### 8. 样式不生效

**问题**：Ant Design 组件样式异常

**解决方案**：
- 确认 `antd` 版本匹配
- 检查 CSS 导入顺序
- 清除浏览器缓存

### 9. 生产环境白屏

**问题**：部署后页面空白

**解决方案**：
- 检查浏览器控制台错误
- 确认 `.env.production` 配置正确
- 验证资源路径（base 配置）
- 检查 Nginx 配置（try_files）

### 10. 性能优化

**如何提升应用性能**：

- **代码分割**：使用 React.lazy 懒加载页面
```typescript
const Dashboard = lazy(() => import('./pages/Dashboard'));
```

- **图片优化**：压缩图片、使用 WebP 格式
- **缓存策略**：静态资源长缓存、API 数据适当缓存
- **减少重渲染**：使用 React.memo、useMemo、useCallback
- **虚拟滚动**：长列表使用虚拟滚动（react-virtualized）

---

## 🔧 常用命令速查

```bash
# 开发
npm run dev              # 启动开发服务器
npm run build            # 构建生产版本
npm run preview          # 预览构建产物
npm run lint             # 代码检查

# 依赖管理
npm install              # 安装依赖
npm update               # 更新依赖
npm outdated             # 查看过期依赖

# 清理
rm -rf node_modules      # 删除依赖
rm -rf dist              # 删除构建产物
npm cache clean --force  # 清理缓存
```

---

## 📚 相关文档

- [客服端产品使用文档](../../docs/客服端产品使用文档.md)
- [产品使用文档](../../docs/产品使用文档.md)
- [后端 API 文档](../../backend/README.md)
- [Ant Design 文档](https://ant.design/components/overview-cn/)
- [React Router 文档](https://reactrouter.com/)

---

## 📞 技术支持

如有问题，请联系开发团队或提交 Issue。

**应用版本**：v0.0.0
**最后更新**：2026-01-22
