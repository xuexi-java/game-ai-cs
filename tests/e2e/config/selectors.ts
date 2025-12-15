/**
 * 统一的CSS选择器定义
 * 用于测试中的元素定位
 */

export const PlayerSelectors = {
  // 身份验证页面
  identityCheck: {
    gameSelect: '.ant-select-selector',
    gameOption: '.ant-select-item',
    serverInput: 'input[placeholder*="区服"]',
    playerIdInput: 'input[placeholder*="角色ID"]',
    issueTypeSelect: '.ant-select-selector:last-of-type',
    issueTypeOption: '.ant-select-item',
    nextButton: 'button[type="submit"]',
    formCard: '.page-card',
  },
  
  // 问题反馈表单
  intakeForm: {
    descriptionTextarea: 'textarea[placeholder*="问题描述"]',
    occurredAtPicker: '.ant-picker',
    uploadButton: '.ant-upload',
    uploadTrigger: '.ant-upload-select',
    uploadList: '.ant-upload-list',
    uploadItem: '.ant-upload-list-item',
    uploadRemove: '.ant-upload-list-item-actions .anticon-delete',
    paymentOrderInput: 'input[placeholder*="订单号"]',
    submitButton: 'button[type="submit"]',
  },
  
  // 逃生舱页面
  escapeHatch: {
    pageCard: '.page-card',
    ticketNo: 'strong',
    continueButton: 'button:has-text("继续处理")',
    newTicketButton: 'button:has-text("新问题")',
  },
  
  // 聊天页面
  chat: {
    messageList: '.message-list, .message-list-v3',
    messageItem: '.message-item-v3, .ant-list-item',
    messageInput: 'textarea[placeholder*="输入消息"], textarea[placeholder*="请输入"]',
    sendButton: 'button:has-text("发送"), button[type="submit"]',
    transferButton: 'button:has-text("转人工")',
    quickReplyButton: '.quick-reply-button, button[aria-label*="快捷回复"]',
    quickReplyDrawer: '.ant-drawer',
    quickReplyItem: '.ant-list-item',
    quickActionTag: '.ant-tag',
    aiTypingIndicator: '.typing-indicator, .ai-typing',
    fileUploadButton: '.ant-upload, button[aria-label*="上传"]',
    emojiButton: 'button[aria-label*="表情"], .emoji-button',
  },
  
  // 排队页面
  queue: {
    queuePosition: '.queue-position',
    estimatedTime: '.estimated-time',
    queueStatus: '.queue-status',
  },
  
  // 工单聊天
  ticketChat: {
    ticketNo: '.ticket-no',
    messageList: '.message-list',
    messageInput: 'textarea',
    sendButton: 'button[type="submit"]',
  },
};

export const AdminSelectors = {
  // 登录页面
  login: {
    usernameInput: 'input[placeholder*="用户名"]',
    passwordInput: 'input[placeholder*="密码"]',
    loginButton: 'button:has-text("登录"), button:has-text("立即登录")',
    demoAccount: '.demo-account',
  },
  
  // 仪表盘
  dashboard: {
    metricsCards: '.metric-card',
    charts: '.chart-container',
    gameSelect: '.ant-select',
    dateRangePicker: '.ant-picker-range',
  },
  
  // 工作台
  workbench: {
    sessionList: '.session-list',
    sessionItem: '.session-item',
    acceptButton: 'button:has-text("接入")',
    messageInput: 'textarea',
    sendButton: 'button:has-text("发送")',
    quickReplySelect: '.quick-reply-select',
  },
  
  // 工单管理
  tickets: {
    ticketList: '.ticket-list',
    ticketItem: '.ticket-item',
    filterSelect: '.ant-select',
    searchInput: 'input[placeholder*="搜索"]',
    statusBadge: '.ant-badge',
  },
  
  // 会话管理
  sessions: {
    sessionList: '.session-list',
    sessionItem: '.session-item',
    statusFilter: '.status-filter',
  },
  
  // 游戏管理
  games: {
    gameList: '.game-list',
    addButton: 'button:has-text("添加")',
    editButton: 'button:has-text("编辑")',
    deleteButton: 'button:has-text("删除")',
  },
  
  // 系统设置
  settings: {
    menu: '.settings-menu',
    urgencyRules: '.urgency-rules',
    users: '.users-list',
    quickReplies: '.quick-replies-list',
  },
};

export const CommonSelectors = {
  // 通用选择器
  loading: '.ant-spin',
  errorMessage: '.ant-message-error, .ant-notification-error',
  successMessage: '.ant-message-success',
  modal: '.ant-modal',
  modalOkButton: '.ant-modal .ant-btn-primary',
  modalCancelButton: '.ant-modal .ant-btn-default',
  card: '.ant-card',
  button: 'button',
  input: 'input',
  select: '.ant-select',
  form: 'form',
};

