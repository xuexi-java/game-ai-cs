# AI客服系统产品化实施方案

> 基于Dify工作流的游戏客服系统完整解决方案
> 
> **目标用户规模**：月咨询13000人（日均~430次）
> **核心场景**：玩家咨询、账号问题、投诉建议

---

## 一、系统架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        前端接入层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  游戏内客服   │  │  Web客服页面  │  │  管理后台     │      │
│  │  (SDK/插件)  │  │  (独立H5)    │  │  (运营/人工)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                        API网关层                              │
│         统一认证、限流、日志、API路由                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      业务服务层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 会话管理服务  │  │ 转人工服务    │  │ 用户服务      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 工单管理服务  │  │ 统计分析服务  │  │ 知识库服务    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      AI引擎层                                 │
│              Dify API (智能问答 + 意图识别)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      数据存储层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  PostgreSQL  │  │     Redis    │  │     OSS      │      │
│  │ (业务数据)    │  │  (缓存/队列)  │  │  (聊天记录)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、核心功能模块

### 2.1 玩家端功能（前端）

#### A. 智能对话界面
- ✅ 实时聊天窗口（WebSocket长连接）
- ✅ 快捷问题按钮（常见问题快速入口）
- ✅ 富文本消息（文本、图片）
- ✅ 用户满意度评价

#### B. 转人工功能
- ✅ 转人工按钮（随时可点击）
- ✅ 排队提示（当前队列人数、预计等待时间）
- ✅ 人工客服接入提示
- ✅ 会话结束提示

#### C. 辅助功能
- ✅ 附件上传（截图、日志文件）
- ✅ 快速复制（订单号、错误码等）
- ✅ 会话导出

---

### 2.2 人工客服端（管理后台）

#### A. 工作台
- ✅ 待接入队列（实时刷新）
- ✅ 进行中会话列表
- ✅ 会话详情面板
  - 玩家信息（ID、等级、VIP状态、充值记录）
  - AI对话历史
  - 快捷回复库
  - 内部备注
- ✅ 多会话并行处理（最多3-5个）
- ✅ 会话转接/协作

#### B. 工单系统
- ✅ 工单创建（从会话直接生成）
- ✅ 工单分类（账号、充值、bug、投诉等）
- ✅ 优先级管理
- ✅ 工单流转（分配、处理、关闭）
- ✅ SLA监控（响应时长、解决时长）

#### C. 知识库管理
- ✅ 问答对管理（增删改查）
- ✅ 分类标签管理
- ✅ 批量导入/导出
- ✅ 知识库测试（模拟玩家提问）
- ✅ 同步到Dify接口

---

### 2.3 运营管理端

#### A. 数据大盘
- ✅ 实时监控
  - 当前在线人工客服数
  - 进行中会话数
  - 排队人数
  - AI拦截率（AI成功解决的比例）
- ✅ 统计报表
  - 每日咨询量趋势
  - 高频问题TOP20
  - 平均响应时长
  - 满意度分布
  - 转人工原因分析

#### B. 质量管理
- ✅ 会话质检（抽查人工对话质量）
- ✅ AI效果分析
  - 意图识别准确率
  - 答非所问统计
  - 未匹配问题收集
- ✅ 敏感词监控

#### C. 配置管理
- ✅ 转人工规则配置
  - 关键词触发（"投诉"、"退款"等）
  - 连续未匹配次数阈值
  - 特定意图直接转人工
- ✅ 客服排班管理
- ✅ 快捷回复模板管理
- ✅ 系统参数配置

---

## 三、技术选型建议

基于您的需求（从零搭建、高效开发），推荐以下技术栈：

### 3.1 前端技术栈

| 模块        | 推荐技术                   | 理由               |
| --------- | ---------------------- | ---------------- |
| **玩家端H5** | Vue 3 + Vant UI        | 轻量、组件丰富、适合移动端    |
| **管理后台**  | React + Ant Design Pro | 成熟的中后台解决方案       |
| **实时通信**  | Socket.io Client       | 简单易用的WebSocket封装 |
| **状态管理**  | Pinia / Zustand        | 轻量级状态管理          |

### 3.2 后端技术栈

| 模块        | 推荐技术                        | 理由              |
| --------- | --------------------------- | --------------- |
| **API服务** | Node.js + Express / Nest.js | 生态丰富、开发效率高      |
| **实时通信**  | Socket.io Server            | 与前端配合，支持房间/命名空间 |
| **任务队列**  | Bull (基于Redis)              | 处理异步任务（通知、统计等）  |
| **ORM**   | Prisma / TypeORM            | 类型安全、迁移管理方便     |

### 3.3 基础设施

| 模块 | 推荐技术 | 理由 |
|------|----------|------|
| **数据库** | PostgreSQL 14+ | 可靠性高、支持JSON字段 |
| **缓存** | Redis 7+ | 会话缓存、消息队列、限流 |
| **文件存储** | 阿里云OSS / MinIO | OSS成熟稳定，MinIO可自建 |
| **部署** | Docker + Docker Compose | 易于部署和扩展 |
| **监控** | Prometheus + Grafana | 开源监控方案 |

---

## 四、核心业务流程设计

### 4.1 AI对话流程

```
玩家发送消息
    ↓
前端通过WebSocket发送到后端
    ↓
后端接收并保存消息记录
    ↓
调用Dify API（传入用户消息 + 上下文）
    ↓
Dify处理（意图识别 → 知识库匹配 → 生成回复）
    ↓
后端接收Dify响应
    ↓
判断：是否需要转人工？
    ├─ 是 → 触发转人工流程
    └─ 否 → 返回AI回复给玩家
         ↓
    保存对话记录 + 统计数据
```

### 4.2 转人工触发逻辑

```python
# 转人工判断规则（伪代码）

def should_transfer_to_human(message, context):
    # 规则1：用户主动要求
    if contains_keywords(message, ["人工", "转人工", "客服"]):
        return True, "用户主动要求"
    
    # 规则2：AI置信度过低
    if context.confidence < 0.6:
        return True, "AI置信度不足"
    
    # 规则3：连续未匹配
    if context.unmatched_count >= 3:
        return True, "连续3次未匹配"
    
    # 规则4：特定意图
    if context.intent in ["投诉", "退款申请", "账号被盗"]:
        return True, f"敏感意图：{context.intent}"
    
    # 规则5：工作时间外（可配置是否启用）
    if not is_working_hours() and context.priority == "high":
        return True, "非工作时间高优先级问题"
    
    return False, None
```

### 4.3 人工接入流程

```
转人工触发
    ↓
创建排队记录（存入Redis队列）
    ↓
前端显示排队提示
    ↓
后端轮询：有空闲客服？
    ├─ 无 → 继续排队（定时推送排队位置）
    └─ 有 → 分配给客服
         ↓
    推送通知给客服后台
         ↓
    客服点击接入
         ↓
    双方建立会话（共享历史对话）
         ↓
    人工对话开始
         ↓
    会话结束 → 满意度评价 → 生成工单（可选）
```

---

## 五、数据库设计（核心表）

### 5.1 用户表 (users)
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    player_id VARCHAR(100) UNIQUE NOT NULL,  -- 游戏玩家ID
    nickname VARCHAR(100),
    avatar_url VARCHAR(500),
    vip_level INT DEFAULT 0,
    total_recharge DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.2 会话表 (sessions)
```sql
CREATE TABLE sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    user_id BIGINT REFERENCES users(id),
    status VARCHAR(20) NOT NULL,  -- active, waiting, closed
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    assigned_agent_id BIGINT,  -- 人工客服ID
    transfer_reason VARCHAR(200),  -- 转人工原因
    satisfaction_score INT,  -- 1-5分
    tags TEXT[],  -- 标签数组
    INDEX idx_user_id (user_id),
    INDEX idx_status (status)
);
```

### 5.3 消息表 (messages)
```sql
CREATE TABLE messages (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT REFERENCES sessions(id),
    sender_type VARCHAR(20) NOT NULL,  -- user, ai, agent
    sender_id VARCHAR(100),
    content TEXT NOT NULL,
    content_type VARCHAR(20) DEFAULT 'text',  -- text, image, file
    metadata JSONB,  -- 额外信息（意图、置信度等）
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_session_id (session_id)
);
```

### 5.4 工单表 (tickets)
```sql
CREATE TABLE tickets (
    id BIGSERIAL PRIMARY KEY,
    ticket_no VARCHAR(50) UNIQUE NOT NULL,
    session_id BIGINT REFERENCES sessions(id),
    user_id BIGINT REFERENCES users(id),
    category VARCHAR(50) NOT NULL,  -- account, payment, bug, complaint
    priority VARCHAR(20) DEFAULT 'normal',  -- low, normal, high, urgent
    status VARCHAR(20) DEFAULT 'open',  -- open, processing, resolved, closed
    title VARCHAR(200) NOT NULL,
    description TEXT,
    assigned_to BIGINT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    resolved_at TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_user_id (user_id)
);
```

### 5.5 知识库表 (knowledge_base)
```sql
CREATE TABLE knowledge_base (
    id BIGSERIAL PRIMARY KEY,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    hit_count INT DEFAULT 0,  -- 命中次数
    helpful_count INT DEFAULT 0,  -- 有帮助次数
    is_active BOOLEAN DEFAULT true,
    dify_sync_status VARCHAR(20),  -- 同步状态
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 六、关键接口设计

### 6.1 Dify集成接口

#### 调用Dify API
```javascript
// backend/services/dify.service.js

async function callDifyAPI(userMessage, conversationId) {
    const response = await axios.post(
        `${DIFY_API_URL}/chat-messages`,
        {
            inputs: {},
            query: userMessage,
            response_mode: "blocking",
            conversation_id: conversationId || undefined,
            user: userId
        },
        {
            headers: {
                'Authorization': `Bearer ${DIFY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        }
    );
    
    return {
        answer: response.data.answer,
        conversation_id: response.data.conversation_id,
        intent: response.data.metadata?.intent,
        confidence: response.data.metadata?.confidence,
        message_id: response.data.message_id
    };
}
```

### 6.2 核心API端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/chat/send` | POST | 发送消息（AI回复） |
| `/api/chat/transfer` | POST | 请求转人工 |
| `/api/chat/history` | GET | 获取历史记录 |
| `/api/chat/feedback` | POST | 满意度评价 |
| `/api/agent/queue` | GET | 获取排队列表 |
| `/api/agent/accept` | POST | 接入会话 |
| `/api/agent/close` | POST | 结束会话 |
| `/api/ticket/create` | POST | 创建工单 |
| `/api/knowledge/sync` | POST | 同步到Dify |
| `/api/stats/dashboard` | GET | 数据大盘 |

---

## 七、开发排期建议（3个月MVP）

### 阶段一：基础架构搭建（2周）
- [x] 项目初始化、技术栈搭建
- [x] 数据库设计与建表
- [x] Dify API对接测试
- [x] WebSocket通信框架搭建
- [x] 基础认证鉴权

### 阶段二：核心功能开发（5周）

**第3-4周：AI对话功能**
- [x] 玩家端聊天界面
- [x] 消息收发（WebSocket）
- [x] Dify API集成
- [x] 会话管理
- [x] 历史记录

**第5-6周：转人工功能**
- [x] 转人工触发逻辑
- [x] 排队系统
- [x] 人工客服工作台
- [x] 会话分配算法
- [x] 人工对话功能

**第7周：工单系统**
- [x] 工单创建与流转
- [x] 工单列表与详情
- [x] 状态管理

### 阶段三：运营支撑（3周）

**第8周：知识库管理**
- [x] 知识库CRUD
- [x] 同步到Dify
- [x] 测试工具

**第9周：数据统计**
- [x] 基础报表
- [x] 实时监控
- [x] 数据导出

**第10周：质量管理**
- [x] 满意度评价
- [x] 会话质检
- [x] AI效果分析

### 阶段四：测试与优化（2周）

**第11周：功能测试**
- [x] 单元测试
- [x] 集成测试
- [x] 压力测试（模拟并发）
- [x] Bug修复

**第12周：上线准备**
- [x] 部署脚本
- [x] 监控配置
- [x] 使用文档
- [x] 灰度发布

---

## 八、详细的下一步行动计划

### 第1步：环境准备（第1天）

1. **创建项目目录结构**
```bash
ai-customer-service/
├── frontend/
│   ├── player-app/         # 玩家端（Vue3）
│   └── admin-portal/       # 管理后台（React）
├── backend/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── chat/       # 聊天模块
│   │   │   ├── agent/      # 人工客服模块
│   │   │   ├── ticket/     # 工单模块
│   │   │   ├── knowledge/  # 知识库模块
│   │   │   └── stats/      # 统计模块
│   │   ├── common/
│   │   └── main.ts
│   ├── prisma/
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   └── nginx/
└── docs/
```

2. **初始化技术栈**
```bash
# 后端
cd backend
npm init -y
npm install express socket.io prisma @prisma/client axios redis bull
npm install -D typescript @types/node @types/express nodemon

# 前端-玩家端
cd ../frontend/player-app
npm create vue@latest
npm install vant socket.io-client axios pinia

# 前端-管理后台
cd ../admin-portal
npx create-react-app . --template typescript
npm install antd socket.io-client axios zustand
```

### 第2步：Dify深度测试（第1-2天）

创建一个测试脚本，系统性测试Dify能力：

```javascript
// test-dify.js
const testCases = [
    // 常规问答
    { question: "如何充值？", expectedIntent: "充值咨询" },
    { question: "忘记密码怎么办？", expectedIntent: "账号问题" },
    
    // 边界情况
    { question: "你好", expectedIntent: "greeting" },
    { question: "在吗", expectedIntent: "greeting" },
    { question: "asdfghjkl", expectedIntent: "unknown" },
    
    // 转人工触发
    { question: "我要投诉", shouldTransfer: true },
    { question: "转人工", shouldTransfer: true },
    
    // 多轮对话测试
    { conversation: [
        { q: "我充值了但没到账", a: "..." },
        { q: "充了100元", a: "..." },
        { q: "订单号是12345", a: "..." }
    ]}
];

// 运行测试并生成报告
```

**测试重点**：
- ✅ 知识库覆盖率（哪些问题能答，哪些不能）
- ✅ 意图识别准确率
- ✅ 答案质量评估
- ✅ 响应速度
- ✅ 并发能力

### 第3步：数据库初始化（第3天）

1. 使用Prisma创建schema
2. 执行数据库迁移
3. 准备测试数据（100条模拟玩家、1000条模拟对话）

### 第4步：核心服务开发（第4-10天）

优先级排序：
1. **Dify集成服务** ⭐⭐⭐⭐⭐（最优先）
2. **WebSocket通信** ⭐⭐⭐⭐⭐
3. **会话管理** ⭐⭐⭐⭐
4. **转人工逻辑** ⭐⭐⭐⭐
5. **简易工作台** ⭐⭐⭐

---

## 九、风险点与应对策略

### 风险1：Dify API性能瓶颈
**现象**：高并发时响应慢、超时
**应对**：
- 设置合理的超时时间（5秒）
- 超时后自动转人工
- 使用Redis缓存高频问答
- 考虑Dify私有化部署

### 风险2：知识库质量不足
**现象**：AI答非所问率高，转人工率超过50%
**应对**：
- 第一个月重点收集"未匹配问题"
- 每周迭代知识库
- 建立"黄金QA库"（高频问题优先优化）
- 设置人工审核机制

### 风险3：人工客服不足
**现象**：高峰期排队时间过长
**应对**：
- 优化AI拦截率（目标70%+）
- 高峰期临时增加客服
- VIP玩家优先级处理
- 异步工单处理（非紧急问题）

### 风险4：数据安全与隐私
**应对**：
- 敏感信息脱敏（密码、支付信息）
- 聊天记录加密存储
- 定期数据清理（超过6个月）
- 权限分级管理

---

## 十、成功指标（KPI）

### 上线后第1个月目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| **AI拦截率** | ≥ 60% | AI成功解决的比例 |
| **平均响应时长** | ≤ 3秒 | AI首次回复时间 |
| **转人工率** | ≤ 40% | 需要人工介入的比例 |
| **人工平均等待** | ≤ 2分钟 | 转人工后等待时间 |
| **满意度** | ≥ 80% | 评价4-5分的比例 |
| **系统可用性** | ≥ 99.5% | 月度在线时间 |

### 第2-3个月优化目标

| 指标 | 目标值 |
|------|--------|
| AI拦截率 | ≥ 75% |
| 转人工率 | ≤ 25% |
| 满意度 | ≥ 85% |

---

## 十一、预算与资源估算

### 人力需求（3个月MVP）

| 角色 | 人数 | 工作量 |
|------|------|--------|
| 后端工程师 | 1-2人 | 全职3个月 |
| 前端工程师 | 1-2人 | 全职3个月 |
| 产品经理 | 1人 | 半职（需求、测试） |
| 测试工程师 | 1人 | 最后1个月 |

### 基础设施成本（月）

| 项目 | 配置 | 月成本（估算） |
|------|------|----------------|
| 应用服务器 | 4核8G × 2台 | ¥600 |
| 数据库 | PostgreSQL 2核4G | ¥300 |
| Redis | 1G内存 | ¥100 |
| OSS存储 | 100GB + 流量 | ¥50 |
| 带宽 | 10Mbps | ¥200 |
| **合计** | - | **¥1,250/月** |

> 注：Dify成本需根据您的部署方式（云服务/私有化）单独评估

---

## 十二、立即可以开始的3件事

### 1️⃣ 今天就做：Dify压力测试（2小时）
- 编写自动化测试脚本
- 测试100个常见问题
- 生成测试报告（识别哪些问题需要补充知识库）

### 2️⃣ 明天开始：搭建项目框架（1天）
- 创建代码仓库
- 初始化前后端项目
- 配置Docker开发环境

### 3️⃣ 本周完成：核心接口打通（3天）
- 后端对接Dify API
- 实现简单的WebSocket通信
- 前端实现基础聊天界面
- 完成第一个E2E流程（玩家发消息→AI回复）

---

## 附录：参考资料

### Dify API文档
- 官方文档：https://docs.dify.ai/
- API参考：https://docs.dify.ai/api-reference

### 推荐开源项目（可参考）
- **ChatUI**：https://github.com/alibaba/ChatUI （聊天界面）
- **Socket.io**：https://socket.io/docs/v4/ （实时通信）
- **Bull**：https://github.com/OptimalBits/bull （任务队列）

---

## 总结：您的下一步行动清单 ✅

- [ ] 第1天：运行Dify深度测试，生成测试报告
- [ ] 第2天：基于测试结果，补充知识库（至少补充50条QA）
- [ ] 第3天：确定技术栈，创建项目代码仓库
- [ ] 第4-5天：搭建开发环境，实现Dify API对接
- [ ] 第6-10天：开发玩家端聊天界面 + WebSocket通信
- [ ] 第11-15天：开发转人工功能 + 人工客服工作台
- [ ] 第16-20天：开发工单系统 + 知识库管理
- [ ] 第21-25天：开发数据统计 + 运营后台
- [ ] 第26-30天：全面测试 + Bug修复

**预计上线时间：3个月后**

有任何疑问随时问我！🚀


