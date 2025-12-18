# AI 开发上下文与约束（game-ai-cs）

> 目的：让 AI 编程工具（Cursor / Copilot / ChatGPT）在改动代码前先理解系统事实、边界与当前目标，
> 避免“看起来很专业但结论错误/改坏核心逻辑”。

## 1. 系统定位（What）
- 本项目是一个 **AI 客服系统**，包含：
  - 玩家端（Player）与管理端（Admin）前端
  - 后端：NestJS（TypeScript）
  - 数据层：PostgreSQL（Prisma）
  - 实时通信：WebSocket
  - 核心状态与调度：Redis（队列/状态/缓存/会话态）
- 目标优先级：**稳定性 > 性能 > 可观测性 > 功能迭代**

## 2. 核心事实（Source of Truth）
### 2.1 Redis 是核心基础设施（不是可选缓存）
Redis 负责承载系统的“实时态/并发态/顺序态”：
- 排队与调度（如 ZSET 管理队列、按优先级/时间排序）
- WebSocket 连接/在线状态管理（支持多实例、状态恢复）
- 工单/会话处理中间态（高频读写、短期状态）

### 2.2 PostgreSQL 是最终一致性存储
- 权威持久化数据存 PostgreSQL
- 通过 Prisma 访问
- Redis 与 DB 的一致性策略以业务需要为准（可能是最终一致）

### 2.3 WebSocket 是核心链路
- 消息处理位于热路径（hot path）
- 任何会增加延迟或阻塞事件循环的改动都必须谨慎

## 3. 当前阶段目标（Now）
### 3.1 本阶段唯一主目标：构建“最小可用监控基线（Baseline Monitoring）”
为了后续测试与性能优化，我们要先做到：
- 能分层判断：是 **Redis**、**DB**、**WS** 还是 **API** 出现瓶颈/错误
- 能量化：延迟（P95/P99）、吞吐、队列长度、等待时间
- 能对比：优化前后有可量化差异

### 3.2 本阶段不做（Not Now）
- 不做全链路分布式追踪（OpenTelemetry/Jaeger/Tempo）——后续再做
- 不做复杂告警体系——先有基线数据再设阈值
- 不做大重构（除非是为了监控必须的轻量改动）
- 不改变 Redis Key 语义/队列算法/业务规则（除非明确评审）

## 4. AI 操作边界（Must / Must Not）
### 4.1 MUST（必须遵守）
- 修改任何核心逻辑前：先列出现有行为、输入输出、边界条件
- 监控埋点必须低开销、不可阻塞（尤其 WS / 队列热路径）
- 任何涉及 Redis 的变更必须说明：
  - 使用的 key 模式（string/hash/zset等）
  - TTL 策略（是否需要）
  - 原子性与并发安全（Lua / multi / 原生命令）
- 新增监控必须可开关（可通过 env 控制采样/启用）

### 4.2 MUST NOT（禁止）
- 禁止在 WebSocket 热路径增加同步阻塞 I/O（文件写、重型日志、长计算）
- 禁止随意修改 Redis key 命名/数据结构/score 语义
- 禁止把高基数标签（如 userId、sessionId）直接作为 metrics label
- 禁止为了“好看”大量添加无用指标导致 Prometheus 爆炸

## 5. 监控指标设计原则（Metrics Rules）
- 指标分三类：
  1) RED 指标：Rate / Errors / Duration（API/WS）
  2) 资源指标：CPU/内存/事件循环延迟
  3) 业务指标：队列长度、等待时间、工单处理耗时
- 所有耗时指标必须支持 P50/P95/P99
- Label 必须有限且可控（route、status、queue_name 等）
- 所有指标必须能回答一个具体问题（写清楚“指标要回答什么”）

## 6. 最小监控清单（Baseline Metrics v0）
### 6.1 API
- http_requests_total{method,route,status}
- http_request_duration_seconds{route}

### 6.2 WebSocket
- ws_connections_active
- ws_messages_in_total
- ws_messages_out_total
- ws_message_processing_seconds

### 6.3 Redis
- redis_ops_per_sec（来自 exporter）
- redis_used_memory（来自 exporter）
- queue_length（来自业务侧/或 key size）
- queue_wait_time_seconds（业务侧）

### 6.4 PostgreSQL
- db_connections_active
- db_query_duration_seconds（或慢查询计数）

## 7. 执行方式（How we work）
- 先盘点：列出 Redis 使用点与关键 key（地图）
- 再埋点：只加最少指标，先形成基线
- 再测试：用固定脚本跑出一份基线报告
- 再优化：每次优化必须对比基线数据并记录结论
