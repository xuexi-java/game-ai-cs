# 玩家端前端应用

这是一个基于 React + TypeScript + Ant Design 构建的现代化客服系统玩家端应用。

## 🚀 功能特性

### 核心功能
- **身份验证流程** - 游戏选择、区服输入、角色验证
- **智能工单检测** - 自动检测未关闭工单，提供逃生舱选择
- **问题反馈表单** - 支持文本描述、图片上传、时间选择
- **实时聊天系统** - WebSocket 实时通信，支持 AI 和人工客服
- **排队管理** - 智能排队系统，实时状态更新
- **工单异步聊天** - 支持工单的异步消息处理

### UI/UX 增强
- **现代化设计** - 渐变背景、圆角卡片、阴影效果
- **响应式布局** - 完美适配桌面端和移动端
- **动画效果** - 流畅的页面切换和元素动画
- **主题定制** - 统一的色彩方案和组件样式

### 聊天功能增强
- **表情选择器** - 丰富的表情包支持
- **文件上传** - 图片文件上传和预览
- **快捷回复** - 常用回复语句快速选择
- **消息类型** - 支持文本、图片、系统通知等多种消息类型
- **发送者标识** - 清晰的 AI、客服、玩家身份区分

### 错误处理与用户体验
- **错误边界** - 全局错误捕获和友好提示
- **网络状态监控** - 实时网络连接状态提示
- **加载状态** - 优雅的加载动画和骨架屏
- **表单验证** - 完善的输入验证和错误提示

## 🛠 技术栈

- **前端框架**: React 19.2.0
- **类型系统**: TypeScript 5.9.3
- **UI 组件库**: Ant Design 5.21.0
- **状态管理**: Zustand 5.0.1
- **路由管理**: React Router DOM 6.28.0
- **实时通信**: Socket.IO Client 4.7.5
- **HTTP 客户端**: Axios 1.13.2
- **时间处理**: Day.js 1.11.13
- **文件上传**: Ali-OSS 6.23.0
- **构建工具**: Vite 7.2.2

## 📁 项目结构

```
src/
├── components/          # 公共组件
│   ├── Chat/           # 聊天相关组件
│   │   ├── MessageList.tsx      # 消息列表
│   │   ├── EmojiPicker.tsx      # 表情选择器
│   │   ├── FileUpload.tsx       # 文件上传
│   │   └── QuickReplies.tsx     # 快捷回复
│   ├── ErrorBoundary/  # 错误边界
│   ├── Loading/        # 加载组件
│   └── NetworkStatus/  # 网络状态
├── pages/              # 页面组件
│   ├── IdentityCheck/  # 身份验证
│   ├── EscapeHatch/    # 逃生舱
│   ├── IntakeForm/     # 前置表单
│   ├── Chat/           # AI 聊天
│   ├── Queue/          # 排队页面
│   └── TicketChat/     # 工单聊天
├── services/           # API 服务
│   ├── api.ts          # HTTP 客户端配置
│   ├── game.service.ts # 游戏相关 API
│   ├── ticket.service.ts # 工单相关 API
│   ├── session.service.ts # 会话相关 API
│   ├── message.service.ts # 消息相关 API
│   └── upload.service.ts # 文件上传 API
├── stores/             # 状态管理
│   ├── sessionStore.ts # 会话状态
│   └── ticketStore.ts  # 工单状态
├── utils/              # 工具函数
│   └── validation.ts   # 表单验证
├── config/             # 配置文件
│   └── api.ts          # API 配置
└── App.tsx             # 应用入口
```

## 🎨 设计特色

### 视觉设计
- **渐变色彩**: 使用紫蓝渐变作为主色调
- **圆角设计**: 统一的 8-12px 圆角
- **阴影效果**: 多层次阴影营造层次感
- **动画交互**: 悬停、点击等交互动画

### 用户体验
- **流程引导**: 清晰的步骤指引
- **状态反馈**: 实时的操作反馈
- **错误处理**: 友好的错误提示
- **加载体验**: 优雅的加载状态

## 🔧 开发命令

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 代码检查
npm run lint

# 预览构建结果
npm run preview
```

## 📱 响应式支持

应用完全支持响应式设计，在不同设备上都有良好的用户体验：

- **桌面端** (>768px): 完整功能和最佳体验
- **移动端** (≤768px): 优化的移动端界面和交互

## 🌐 浏览器兼容性

- Chrome 88+
- Firefox 85+
- Safari 14+
- Edge 88+

## 🚀 部署说明

1. 配置环境变量:
   ```bash
   VITE_API_BASE_URL=http://your-api-server.com/api/v1
   VITE_WS_URL=ws://your-websocket-server.com
   ```

2. 构建项目:
   ```bash
   npm run build
   ```

3. 部署 `dist` 目录到静态文件服务器

## 📝 更新日志

### v1.0.0 (2024-11-14)
- ✨ 完整的用户流程实现
- 🎨 现代化 UI 设计
- 💬 增强的聊天功能
- 📱 响应式设计支持
- 🛡️ 完善的错误处理
- ✅ 表单验证增强
- 🔄 实时状态同步

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request 来改进项目。

## 📄 许可证

MIT License