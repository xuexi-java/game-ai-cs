# 聊天界面 UI 优化详细方案

## 一、管理端工作台（ActivePage）优化

### 1. 布局结构优化

#### 优化 1.1：左侧面板使用折叠列表
**问题：** 固定 50/50 分割不灵活，空间利用率低

**解决方案：**
```tsx
// 添加折叠状态
const [queueCollapsed, setQueueCollapsed] = useState(false);
const [activeCollapsed, setActiveCollapsed] = useState(false);

// 折叠头部组件
<div className="group-header" onClick={() => setQueueCollapsed(!queueCollapsed)}>
  <span>待接入队列 ({queuedSessions.length})</span>
  {queueCollapsed ? <DownOutlined /> : <UpOutlined />}
</div>
{!queueCollapsed && (
  <div className="session-group-content">
    {/* 会话列表 */}
  </div>
)}
```

**CSS 调整：**
```css
.session-groupent: flex-start;
}

/* 对应的气泡样式 */
.bubble-player-v3 {
  /* 玩家消息 - 绿色，右侧圆角小 */
  background: #95ec69;
  border-top-right-radius: 4px;
  border-bottom-right-radius: 4px;
}

.bubble-ai-v3,
.bubble-agent-v3 {
  /* AI/客服消息 - 白色，左侧圆角小 */
  background: #ffffff;
  border-top-left-radius: 4px;
  border-bottom-left-radius: 4px;
}
```

#### 问题 2.2：Footer 背景色过于突出
**现状：**
- Footer 使用紫色渐变背景（`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`）
- 与整体白色聊天背景形成强烈对比
- 输入框在紫色背景上，视觉冲击大

**问题：**
- 紫色渐变过于抢眼，分散用户注意力
- 输入框的白色半透明背景在紫色上对比度不够
- 不符合简洁的聊天界面设计原则
- 与主流聊天应用的设计风格不一致

**优化建议：**
```css
.chat-footer-v3 {
  /* 改为浅色背景，更符合聊天应用习惯 */
  background: #f8f9fa;
  border-top: 1px solid #e5e7eb;
  padding: 12px 16px;
}

.chat-input-v3 {
  /* 纯白背景，边框更清晰 */
  background: #ffffff !important;
  border: 1px solid #d1d5db !important;
  border-radius: 20px !important;
}

.send-btn-v3 {
  /* 保持蓝色，但更柔和 */
  background: #1890ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.3);
}

/* 工具按钮颜色调整 */
.toolbar-btn {
  color: #6b7280;
}

.transfer-btn-v3 {
  background: #ffffff;
  border: 1px solid #d1d5db;
  color: #1890ff;
}
```

#### 问题 2.3：Header 在不同模式下区分不够明显
**现状：**
- AI 模式：半透明白色背景
- 客服模式：深紫色背景（`rgba(55, 43, 123, 0.85)`）

**问题：**
- 深紫色背景在移动端显得过于沉重
- 与 Footer 的紫色渐变重复，缺乏层次感
- 客服模式下的深色背景与聊天区域的白色背景对比过强

**优化建议：**
```css
.chat-header-v3 {
  /* 统一使用浅色背景 */
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* 通过图标和文字颜色区分模式 */
.chat-header-v3.header-ai .header-avatar {
  background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
}

.chat-header-v3.header-agent .header-avatar {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
}

/* 添加模式标识 */
.header-mode-badge {
  background: #e6f7ff;
  color: #1890ff;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
```

### 2. 交互体验问题

#### 问题 2.4：快捷回复按钮样式不统一
**现状：**
- 快捷回复按钮使用半透明白色背景
- 在紫色 Footer 上显示
- 边框和文字颜色对比度不够

**问题：**
- 按钮不够突出，用户可能忽略
- 在紫色背景上的可读性差
- 没有明确的视觉层次

**优化建议：**
```css
.quick-action-btn {
  /* 纯白背景，更清晰 */
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #374151;
  padding: 8px 16px;
  border-radius: 16px;
  font-size: 14px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.quick-action-btn:hover {
  border-color: #1890ff;
  color: #1890ff;