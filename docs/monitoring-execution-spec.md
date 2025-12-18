# 监控执行规格（Monitoring Execution Spec）- P1

## 0. 文档目的（必须理解）

本文档用于 **约束 AI 编程助手的实现行为**。

AI 只能实现本文档中 **明确写出的内容**，
**不允许自行设计、不允许扩展、不允许优化、不允许猜测意图**。

本文档中的规则为【不可协商规则】。

---

## 1. 指标定义（语义冻结，不可修改）

### 1.1 WebSocket 指标

---

### ws_connections_active

- 类型：Gauge
- 标签（Label）：
  - client_type：`player` | `agent`

- 语义定义：
  - 当前活跃的 WebSocket 连接数量

#### client_type 判定规则（强制）

**只允许使用消息处理入口判定，禁止使用 token、namespace 或其他方式。**

判定规则如下：

- 事件名为 `send-message`  
  → `client_type = "player"`

- 事件名为 `agent:send-message`  
  → `client_type = "agent"`

⚠️ 禁止行为：
- ❌ 根据 JWT / token 内容判断
- ❌ 根据 namespace 判断
- ❌ 根据 URL / query / header 判断

---

### ws_messages_total

- 类型：Counter
- 标签（Label）：
  - direction：`in` | `out`

- 语义定义：
  - `direction = in`  
    → WebSocket 消息进入后端（玩家或客服发送）
  - `direction = out`  
    → WebSocket 消息由后端发出（系统推送）

说明：
- 该指标描述的是 **消息流量方向**
- 不区分玩家 / 客服角色
- 不引入 sender / receiver 等额外标签

---

## 1.2 HTTP 指标

---

### http_requests_total

- 类型：Counter
- 标签（Label）：
  - method
  - route
  - status_code

- 语义定义：
  - HTTP 请求总数

---

### http_request_duration_seconds

- 类型：Histogram
- 标签（Label）：
  - method
  - route

- buckets：
  - `[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]`

- 语义定义：
  - HTTP 请求从进入后端到完成响应的耗时（秒）

---

### HTTP route 解析规则（强制）

`route` 标签 **必须是稳定、低基数的路由模板**。

解析优先级（按顺序）：

1. `request.route.path`  
   - Express / NestJS 提供的路由模板（首选）

2. 当前 handler 的方法名  
   - 作为兜底方案

3. 固定字符串 `"unknown"`

⚠️ 禁止行为：
- ❌ 使用 `request.url` 作为主要 route 来源
- ❌ 使用包含 query 参数的 URL
- ❌ 通过正则猜测业务路径

---

## 2. 允许修改 / 新增的代码位置（白名单）

AI 只允许在以下位置新增或修改代码：

- `backend/src/metrics/*`
- `backend/src/common/interceptors/*`
- `backend/src/websocket/websocket.gateway.ts`
- `backend/src/main.ts`

⚠️ 禁止修改其他任何文件。

---

## 3. 禁止事项（硬约束）

以下行为 **一律禁止**：

- ❌ 引入高基数标签  
  - 禁止的 label 示例：
    - userId
    - sessionId
    - agentId
    - ticketId
    - UUID
    - IP
    - 任意动态值

- ❌ 修改业务逻辑
- ❌ 修改返回结构
- ❌ 修改异常处理流程
- ❌ 引入新的 npm 依赖
- ❌ 重构或格式化无关代码

---

## 4. 输出规则（必须遵守）

- 输出设计说明或解释性文字
- 如发现文档存在歧义，必须先指出，不得自行假设
