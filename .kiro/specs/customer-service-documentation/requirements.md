# 需求文档 - 客服端产品使用文档完善

## 简介

本需求旨在完善AI客服系统的客服端产品使用文档，基于实际运行的系统功能（http://localhost:20101），提供全面、准确、易懂的操作指南，帮助客服人员和管理员快速掌握系统使用方法。

## 术语表

- **System**: AI客服系统客服端
- **User**: 使用系统的客服人员或管理员
- **Agent**: 客服角色用户
- **Admin**: 管理员角色用户
- **Session**: 与玩家的会话
- **Ticket**: 工单
- **Quick_Reply**: 快捷回复模板
- **Issue_Type**: 问题类型
- **Dashboard**: 仪表盘
- **Workbench**: 客服工作台

## 需求

### 需求 1: 系统概述和快速开始

**用户故事**: 作为新用户，我想了解系统的基本功能和如何开始使用，以便快速上手系统。

#### 验收标准

1. THE System SHALL 提供系统概述章节，包含核心功能介绍
2. THE System SHALL 提供角色权限说明，区分客服和管理员权限
3. THE System SHALL 提供登录步骤说明，包含访问地址和登录流程
4. THE System SHALL 提供首次登录后的界面导航说明

### 需求 2: 仪表盘功能文档

**用户故事**: 作为用户，我想了解仪表盘的各项指标含义，以便监控工作状态和绩效。

#### 验收标准

1. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"总工单数"指标的含义和计算方式
2. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"未关闭工单"指标的含义
3. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"已关闭工单"指标的含义
4. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"平均满意度"指标的含义和评分范围
5. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"平均响应时间"和"平均解决时间"的含义
6. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"AI接单率"的含义和计算方式
7. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明日期筛选功能的使用方法
8. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"每日工单统计"图表的解读方法
9. WHEN 用户查看仪表盘文档 THEN THE System SHALL 说明"客服工作统计"图表的解读方法

### 需求 3: 客服工作台功能文档

**用户故事**: 作为客服，我想了解如何使用工作台接入会话和处理玩家问题，以便高效完成工作。

#### 验收标准

1. WHEN 用户查看工作台文档 THEN THE System SHALL 说明工作台的三个区域布局（会话列表、聊天区、详情区）
2. WHEN 用户查看工作台文档 THEN THE System SHALL 说明"刷新列表"按钮的功能
3. WHEN 用户查看工作台文档 THEN THE System SHALL 说明"在线客服"区域显示的内容
4. WHEN 用户查看工作台文档 THEN THE System SHALL 说明"待接入队列"的含义和如何接入会话
5. WHEN 用户查看工作台文档 THEN THE System SHALL 说明"进行中会话"的含义和管理方法
6. WHEN 用户查看工作台文档 THEN THE System SHALL 说明如何发送文本消息
7. WHEN 用户查看工作台文档 THEN THE System SHALL 说明如何使用快捷回复功能
8. WHEN 用户查看工作台文档 THEN THE System SHALL 说明如何使用AI优化回复功能
9. WHEN 用户查看工作台文档 THEN THE System SHALL 说明如何发送图片和文件
10. WHEN 用户查看工作台文档 THEN THE System SHALL 说明如何查看玩家信息和会话历史
11. WHEN 用户查看工作台文档 THEN THE System SHALL 说明如何结束会话

### 需求 4: 工单管理功能文档

**用户故事**: 作为用户，我想了解如何查看和管理工单，以便跟踪问题处理进度。

#### 验收标准

1. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明工单列表的各列含义（工单号、游戏、区服、玩家、问题描述、状态、问题类型、创建时间）
2. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明如何使用搜索功能查找工单
3. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明如何使用筛选器（选择游戏、状态、问题类型、开始日期）
4. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明工单状态的含义（已解决、进行中、待处理等）
5. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明如何查看工单详情
6. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明如何分配或转派工单
7. WHEN 用户查看工单管理文档 THEN THE System SHALL 说明如何刷新工单列表

### 需求 5: 会话管理功能文档

**用户故事**: 作为用户，我想了解如何查看和管理历史会话，以便回顾过往沟通记录。

#### 验收标准

1. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明会话列表的各列含义（工单编号、游戏、区服、玩家ID/昵称、状态、处理客服、挂机时间、更新时间）
2. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明会话状态的含义（已关闭、进行中等）
3. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明如何使用搜索功能查找会话
4. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明如何使用筛选器（状态、选择游戏、客服、开始日期）
5. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明如何查看会话详情和聊天记录
6. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明处理客服字段的含义（系统管理员、AI客服等）
7. WHEN 用户查看会话管理文档 THEN THE System SHALL 说明如何刷新会话列表

### 需求 6: 系统设置功能文档（管理员）

**用户故事**: 作为管理员，我想了解如何配置系统设置，以便管理问题类型、快捷回复、用户和游戏。

#### 验收标准

1. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明问题类型规则的配置方法
2. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明优先级权重的含义和设置方法
3. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明如何启用/禁用问题类型
4. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明是否直接转人工的配置
5. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明如何添加、编辑、删除问题类型
6. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明快捷回复管理的使用方法
7. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明如何创建快捷回复分类
8. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明如何添加、编辑、删除快捷回复
9. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明快捷回复的收藏和使用频次功能
10. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明用户管理的功能（添加、编辑、删除、重置密码）
11. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明角色类型的区别（客服、管理员）
12. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明游戏管理的功能（添加、编辑游戏配置）
13. WHEN 管理员查看系统设置文档 THEN THE System SHALL 说明Dify配置的作用和设置方法

### 需求 7: 常见问题和最佳实践

**用户故事**: 作为用户，我想了解常见问题的解决方法和使用技巧，以便更高效地使用系统。

#### 验收标准

1. THE System SHALL 提供至少5个常见问题及其解决方案
2. THE System SHALL 提供客服工作的最佳实践建议
3. THE System SHALL 提供快捷回复使用技巧
4. THE System SHALL 提供会话管理的最佳实践
5. THE System SHALL 提供工单处理的效率提升建议

### 需求 8: 文档格式和可读性

**用户故事**: 作为用户，我想阅读格式清晰、结构合理的文档，以便快速找到所需信息。

#### 验收标准

1. THE System SHALL 使用清晰的标题层级结构
2. THE System SHALL 在适当位置使用截图说明操作步骤
3. THE System SHALL 使用列表、表格等格式提升可读性
4. THE System SHALL 使用图标和强调标记突出重要信息
5. THE System SHALL 提供完整的目录导航
6. THE System SHALL 使用一致的术语和表述方式
7. THE System SHALL 在每个功能模块提供操作步骤说明
