AI 客服系统 - 产品需求文档 (V2.1 最终版)

文档版本: V2.1
项目代号: game-ai-cs
核心目标: 构建一个以“前置分流”和“智能路由”为核心的、服务于多游戏的、AI 优先的 Web 客服平台。

1. 项目愿景与 V2.1 目标

1.1. 项目愿景

本系统旨在解决传统客服中“信息不足”、“无效排队”和“客服压力大”的核心痛点。我们将利用 AI (Dify) [cite: 3, project_ai_guidelines.md] 的能力，从“被动响应”转向“主动引导和智能分流”。

1.2. V2.1 核心流程

V2.1 的核心是**“前置分流 (Triage-First)”**模型 [cite: v2_workflow_implementation.md]。玩家的求助路径被重新设计，以确保正确的信息在正确的时间被分配给正确的处理单元（AI、实时人工、或异步工单）。

2. 核心用户角色 (Personas)

玩家 (Player):

痛点: 不想在游戏外重新登录；问题紧急时（如充值）不想排队；问题不紧急时（如建议）不想耗时等待。

V2.1 目标: 必须在“不登录”的情况下也能验证身份；必须能区分“紧急”和“非紧急”问题的处理通道。

一线客服 (Agent):

痛点: 80% 的时间在处理"你好"、"在吗"以及重复的简单问题；与玩家开始对话时，对玩家背景一无所知；需要手动创建工单。

V2.1 目标: 只处理"已验证身份"且"紧急"的实时聊天；在接入会话的第一秒就能看到玩家提交的所有表单信息（问题、截图、订单号）[cite: 步骤 1：玩家先"填单"，再咨询, cs_team_workflow_plain.txt]；AI 必须能辅助润色回复 [cite: 3.3, frontend_design_final.md]。

权限范围: 仅可访问"会话管理 (Workbench)"和"工单管理 (Tickets)"模块；**不可访问**"系统设置"、"数据分析"和"紧急排序规则管理"模块 [cite: 4.6, 本文档]。

运营/管理员 (Admin):

痛点: 无法区分不同游戏的客服数据；无法评估 AI 效果；无法灵活配置紧急排序规则。

V2.1 目标: 必须能按游戏（弹弹堂、神曲 [cite: 3.2, frontend_design_final.md]）配置 Dify API [cite: 3.2, frontend_design_final.md]；必须能看到"AI 拦截率"、"工单处理时长"等核心指标 [cite: 2.3 A, AI客服系统产品化实施方案.md]；必须能管理紧急排序规则，以优化排队队列的优先级算法 [cite: 4.5, 本文档]。

权限范围: 拥有**全部模块**的访问权限，包括"系统设置"、"数据分析"、"紧急排序规则管理"等管理功能 [cite: 4.6, 本文档]。

3. V2.1 核心业务流程 (玩家旅程)

这是本系统的最核心业务逻辑，完整定义了玩家从访问到解决的每一步。

步骤 1：身份验证 (Identity-First)

玩家访问客服网页（player-app）[cite: v2_workflow_implementation.md]，系统不显示聊天框。

UI: 玩家看到一个极简表单（View_IdentityCheck）[cite: ""]。

玩家输入: 
- **游戏选择**: 通过下拉框选择游戏（下拉框选项来源于系统设置中已配置的游戏列表，仅显示"已启用"状态的游戏）[cite: 4.4, 本文档]
- **区服选择**: 通过玩家自己输入
- **输入角色ID或昵称**（必填）[cite: ""]

后端动作: 后端（Nest.js）[cite: 5.1, installation_guide.md] 立即查询 Ticket [cite: v2_schema.prisma] 表，检查该玩家（playerIdOrName + gameId + serverId）[cite: ""] 是否有**"未关闭"**的工单。

**注意**: 步骤 1 仅用于身份验证和工单检查，**不收集问题描述和截图**。完整的问题信息将在步骤 3 中收集。

步骤 2：“逃生舱” (Escape Hatch)

(仅当步骤 1 找到“未关闭工单”[cite: ""]时触发)

UI: 系统不让玩家填新表单，而是显示“二选一”界面（View_EscapeHatch）[cite: ""]。

玩家选项:

[ 继续处理此工单 (#T-101) ]: 玩家被直接带入该工单的“异步聊天”界面（View_TicketChat），可查看历史并补充回复 [cite: ""]。

[ 我有新问题要提交 ]: 玩家进入“步骤 3”。

(如果步骤 1 未找到工单，玩家也直接进入“步骤 3”)

步骤 3："前置分流表单" (Intake Form)

UI: 玩家看到完整的"服务前置表单"（View_IntakeForm）[cite: 步骤 1：玩家先"填单"，再咨询, cs_team_workflow_plain.txt]。

**表单继承信息**: 系统自动继承步骤 1 中玩家选择的游戏、区服和角色ID/昵称，玩家无需重复填写。

玩家输入 (基于 cs_team_workflow_plain.txt [cite: 步骤 1：玩家先"填单"，再咨询, cs_team_workflow_plain.txt])：

- **问题描述**（必填，支持多行文本输入）
- **反馈的问题发生时间**（可选，日期时间选择器）
- **问题截图**（可选，支持上传最多 9 张图片，支持常见图片格式：JPG、PNG、GIF）
- **最近一笔充值订单号**（可选，用于身份验证）

后端动作:

系统正式创建一条新 Ticket [cite: v2_schema.prisma]，存入所有表单信息（包括步骤 1 的游戏、区服、角色ID，以及步骤 3 的问题描述、发生时间、截图、订单号），状态为 NEW。

【安全验证】: 系统异步调用“支付网关 API”[cite: ""]，验证 角色ID 和 充值订单号 是否匹配 [cite: ""]。

匹配成功: Ticket.identityStatus [cite: ""] 标记为 VERIFIED_PAYMENT。

匹配失败/未填: Ticket.identityStatus [cite: ""] 标记为 NOT_VERIFIED。

返回: 后端返回新 Ticket 的 ticketNo 和 token。

步骤 4：“AI 引导” (AI Triage)

UI: 玩家进入聊天界面（View_Chat）[cite: ""]，系统自动发起会话 (Session) [cite: v2_schema.prisma]。

Dify 动作: 后端将 Ticket 的"问题描述"（来自步骤 3）发送给 Dify [cite: 3, project_ai_guidelines.md]。Dify（workflow-triage）[cite: v2_workflow_implementation.md] 必须返回 JSON，包含：

initial_reply (引导语)

suggested_options (快捷选项) [cite: 步骤 2：表单引导, cs_team_workflow_plain.txt]

detected_intent (AI 识别的意图)

urgency (AI 判断的紧急性：urgent / non_urgent) [cite: v2_workflow_implementation.md]

UI: AI 在聊天框中显示“引导语”和“快捷选项”[cite: 步骤 2：表单引导, cs_team_workflow_plain.txt]，尝试自助解决。

步骤 5：“智能分流” (Smart Triage)

(当玩家在步骤 4 的聊天界面中点击"转人工"按钮[cite: 步骤 3：分流, cs_team_workflow_plain.txt]，或 AI 连续回答失败（置信度 < 0.6 [cite: ""]）时触发)

5.1. 【检查 1】客服是否上班？ (下班兜底) [cite: ""]

后端动作: 立即检查当前“在线客服” (Agent [cite: v2_schema.prisma]) 数量。

如果 (在线=0):

动作: 强制转工单[cite: ""]。Ticket.priority [cite: v2_schema.prisma] 标记为 URGENT (加急)。

UI: 玩家看到：“当前非工作时间，您的问题已转为【加急工单】(#T-12345)，我们将优先处理。” [cite: ""] (流程结束)

如果 (在线 > 0):

进入【检查 2】。

5.2. 【检查 2】玩家是否认为紧急？ (玩家复议) [cite: ""]

后端动作: 不信任 AI 的 urgency [cite: v2_workflow_implementation.md] 判断。向玩家推送一个“复议”请求 (server:ask_urgency) [cite: ""]。

UI: 玩家看到一个弹窗：“您的问题是否非常紧急，需要立即处理？”

选项 A：[ 是，非常紧急 (如充值/登录) ] [cite: ""]

选项 B：[ 否，不紧急 (如建议/BUG) ] [cite: ""]

5.3. 【执行】路由

如果玩家选 A (紧急):

动作: 转实时人工排队[cite: A. Erm_problem, cs_team_workflow_plain.txt]。后端将玩家推入 queue:normal（排队队列），并应用紧急排序规则计算优先级。

UI: 玩家看到排队界面，显示：
- "正在为您转接人工客服，请稍候..."
- 当前排队位置（如：您前面还有 3 位玩家）
- 预计等待时间（可选，基于历史数据估算）
- 实时更新排队状态

如果玩家选 B (不紧急):

动作: 转异步工单[cite: B. Erm_problem, cs_team_workflow_plain.txt]。

UI: 玩家看到：“您的问题已转为工单 (#T-12345)，客服将在 24 小时内处理，请留意游戏内邮件[cite: B. Erm_problem, cs_team_workflow_plain.txt]通知。” (流程结束)

4. 管理后台 (Admin Portal) 核心功能

4.1. 会话管理 (Workbench)

布局: 必须是“三栏式”（列表 / 对话 / 详情）[cite: 3.2, frontend_design_final.md]。

列表: 待接入列表必须显示玩家的 [游戏名] 和 等待时长 [cite: 3.2, frontend_design_final.md]。

**客服接入流程**:
- 客服在待接入列表中点击某个会话，点击"接入"按钮
- 后端将 Session 分配给该客服，状态更新为 IN_PROGRESS
- 玩家端收到通知："客服已接入，正在为您服务"
- 客服端自动加载该会话的所有历史消息（包括 AI 的回复）

对话: 聊天气泡必须是"客服视角"（玩家/AI 居左，自己居右）[cite: 3.3, frontend_design_final.md]。

详情 (关键): 必须在接入会话时，自动加载该 Ticket [cite: v2_schema.prisma] 的所有"前置表单"信息，包括：
- 玩家身份信息：游戏名称、区服名称、角色ID/昵称
- 问题信息：问题描述、问题发生时间
- 附件信息：问题截图（支持预览，最多9张）
- 验证信息：充值订单号（如有）、身份验证状态

AI 辅助: 必须提供“AI 优化 (✨)”按钮 [cite: 3.3, frontend_design_final.md]，用于润色客服的回复。

安全徽章: 必须在玩家信息旁显示**"身份已验证" (绿)** 或 "身份未验证" (红) [cite: ""]，基于 Ticket.identityStatus [cite: ""] 判断（VERIFIED_PAYMENT 显示已验证，NOT_VERIFIED 显示未验证）。

结束会话: 客服必须有"结束会话"按钮 [cite: ""]，点击后：
- 后端将 Session 状态标记为 CLOSED
- 玩家端自动弹出"满意度评价"弹窗
- 满意度评价包含：评分（1-5星）、评价标签（如：问题已解决、服务态度好、响应速度快等）、文字评价（可选）
- 评价数据保存到数据库，用于客服绩效考核和数据分析

4.2. 工单管理 (Tickets)

功能: 客服主管/二线支持在此处理“异步工单”。

排序: 列表必须支持按 priority (优先级) [cite: v2_schema.prisma] 排序，以确保“下班后”的 URGENT [cite: ""] 工单被优先处理。

双向通信: 客服在此页面回复工单，系统必须自动触发“游戏内邮件”[cite: ""]通知玩家。

4.3. 数据分析 (Dashboard)

核心指标: 必须展示 AI 拦截率 (AI 解决 / 总会话)、转人工率、工单平均解决时长 [cite: 2.3 A, AI客服系统产品化实施方案.md]。

4.4. 系统设置 (Settings)

UI: 必须是"游戏卡片"[cite: 3.2, frontend_design_final.md] 布局。

功能: 管理员点击卡片（如"弹弹堂1"），必须能弹窗配置该游戏专用的 Dify API Key 和 Dify Base URL [cite: 3.2, frontend_design_final.md, 4, v2_schema.prisma]。

游戏管理: 
- 管理员必须能在此页面**新增、编辑、删除**游戏配置
- 每个游戏配置包含：
  - 游戏ID（必填，唯一标识）
  - 游戏名称（必填）
  - 游戏图标（可选）
  - 启用状态（必填，默认：启用）
  - Dify API Key（必填）
  - Dify Base URL（必填）
  - **区服列表**（必填，支持新增、编辑、删除区服，每个区服包含：区服ID、区服名称）
- **玩家端的游戏下拉框选项必须实时同步此处的游戏列表**（仅显示"已启用"状态的游戏）[cite: 步骤 1, 本文档]
- **玩家端的区服下拉框选项必须根据所选游戏动态加载对应的区服列表** [cite: 步骤 1, 本文档]

4.5. 紧急排序规则管理 (Urgency Sorting Rules)

功能: 管理员可在此模块配置"实时人工排队队列"的排序规则，以优化紧急问题的处理优先级。

UI: 列表 + 表单弹窗布局。

CRUD 功能:

**创建规则 (Create)**:
- 管理员点击"新增规则"按钮，弹出表单
- 表单字段：
  - 规则名称（必填，如"充值问题优先"）
  - 匹配条件（必填，支持多条件组合，条件之间为"AND"关系）：
    - 关键词匹配（如：Ticket 的问题描述字段包含"充值"、"支付"等关键词）
    - 意图匹配（如：Session 的 detected_intent = "payment_issue"）
    - 身份状态匹配（如：Ticket.identityStatus = "VERIFIED_PAYMENT"）
    - 游戏匹配（如：Ticket.gameId = "dandan-tang-1"）
    - 区服匹配（如：Ticket.serverId = "server-001"）
    - 优先级匹配（如：Ticket.priority = "URGENT"）
  - 优先级权重（必填，数值 1-100，数值越大优先级越高）
  - 是否启用（默认：是）
  - 规则描述（可选）

**查看规则 (Read)**:
- 列表显示所有规则，包含：规则名称、匹配条件摘要、优先级权重、启用状态、创建时间
- 支持按"启用状态"筛选
- 支持按"优先级权重"排序

**编辑规则 (Update)**:
- 管理员点击列表中的"编辑"按钮，弹出表单（预填充现有数据）
- 可修改所有字段（同创建表单）

**删除规则 (Delete)**:
- 管理员点击列表中的"删除"按钮，弹出确认对话框
- 删除后，该规则立即失效，不再影响排队队列排序

排序算法: 
- 当玩家在步骤 5.3 中选择"紧急"并被推入"实时人工排队队列"时，后端必须遍历所有"已启用"的规则
- 计算每个玩家的"综合优先级分数" = Σ(匹配规则的优先级权重)
- 队列按"综合优先级分数"降序排列，分数相同则按"进入队列时间"（即 Session 创建时间或玩家选择"紧急"的时间）升序排列
- **注意**: 排序规则修改后，需要重新计算队列中所有玩家的优先级分数并重新排序

4.6. 鉴权系统 (Authentication & Authorization)

4.6.1. 用户认证 (Authentication)

登录方式: 管理员和客服均通过"用户名 + 密码"登录管理后台。

会话管理: 
- 登录成功后，后端返回 JWT Token
- Token 包含用户ID、角色类型（ROLE_ADMIN / ROLE_AGENT）、权限列表
- Token 有效期：建议设置为 8 小时（可根据安全策略调整）
- 前端必须将 Token 存储在 localStorage 或 sessionStorage
- 所有 API 请求必须在 Header 中携带 Token: `Authorization: Bearer <token>`
- **Token 过期处理**：
  - 当 API 返回 `401 Unauthorized` 时，前端自动清除本地 Token 并跳转到登录页
  - 支持 Token 刷新机制（可选）：提供 refresh token API，在 Token 即将过期时自动刷新

4.6.2. 角色权限 (Role-Based Access Control)

角色定义:

**ROLE_ADMIN (管理员)**:
- 权限范围：全部模块
- 可访问：系统设置、数据分析、紧急排序规则管理、会话管理、工单管理
- 可操作：所有 CRUD 操作

**ROLE_AGENT (客服)**:
- 权限范围：业务操作模块
- 可访问：会话管理 (Workbench)、工单管理 (Tickets)
- 可操作：接入会话、回复消息、结束会话、处理工单、查看工单详情
- **不可访问**：系统设置、数据分析、紧急排序规则管理

4.6.3. 前端路由守卫 (Route Guards)

实现要求:
- 前端路由必须实现"路由守卫"机制
- 当用户访问无权限的页面时，自动跳转到"403 无权限"页面或返回上一页
- 在导航菜单中，仅显示当前用户有权限的菜单项

4.6.4. 后端 API 鉴权 (API Authorization)

实现要求:
- 所有管理后台 API 端点必须验证 JWT Token
- 所有管理后台 API 端点必须检查用户角色权限
- 如果用户尝试访问无权限的 API，返回 `403 Forbidden` 错误

示例 API 权限映射:
- `GET /api/admin/settings` → 仅 ROLE_ADMIN
- `POST /api/admin/urgency-rules` → 仅 ROLE_ADMIN
- `GET /api/admin/workbench/sessions` → ROLE_ADMIN + ROLE_AGENT
- `POST /api/admin/workbench/sessions/:id/join` → ROLE_ADMIN + ROLE_AGENT