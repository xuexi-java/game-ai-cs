
> 适用场景：**壳 APK（WebView）+ 假游戏服务器（签名/鉴权）+ 本机客服后端 + Postgres/Redis + 上传链路**  
> 目标：在尽量接近真实上线链路的条件下，验证玩家端接入、鉴权、WS 实时聊天、恢复工单、图片上传、幂等等关键能力。

---

## 1. 背景与目标

### 1.1 背景
玩家端以 **H5（Vue）运行在 Android WebView** 中接入游戏。上线链路包含：
- 游戏客户端（Android APK 壳）内嵌 WebView 加载玩家端 H5
- 游戏服务器提供签名/鉴权参数（模拟）
- 客服后端提供 `/api/player/connect` + WebSocket（Socket.io）实时聊天
- Postgres 存工单/消息，Redis 做 wsToken、uploadToken、clientMsgId 幂等去重

### 1.2 测试目标
在尽量接近真实上线的条件下验证：
1) **可用性**：能打开、能聊天、能恢复、能上传图片  
2) **正确性**：工单状态与历史一致、消息不丢不重、鉴权可靠  
3) **稳定性**：切后台/弱网/断网/重连可恢复  
4) **安全性（MVP范围）**：签名校验、nonce 配置验证、域名白名单、token 生命周期  
5) **兼容性**：主流 Android WebView 环境行为一致（键盘、文件选择、WSS 等)

---

## 2. 范围

### 2.1 纳入测试（MVP）
- APK 壳打开 H5（https）并通过域名白名单加载资源
- connect bootstrap：返回 wsToken、history、bootstrapMessages、activeTicket、inputMode
- WS 建连（wss）+ ticket:create / ticket:resume + message:send + message:ack + message:receive
- 幂等去重：相同 clientMsgId 不重复入库，ack 一致
- 工单恢复：activeTicket banner → resume 拉历史（只读/可写规则）
- 图片发送：系统选图 → HTTP 上传 → WS 发送 IMAGE 元数据 → 双端可见
- 断线重连：切后台/网络切换/WS断开后恢复
- 单玩家单连接：新连接踢旧连接（验证不会串线）

### 2.2 不纳入（后续阶段）
- 二级菜单/复杂表单编排/VIP 分流/复杂 SLA
- 大规模并发压测到生产级（本计划只做轻量性能验证）
- iOS WKWebView（可作为扩展计划）

---

## 3. 测试环境与拓扑

### 3.1 环境组件
- **Android 壳 APK**：内嵌 WebView，加载 H5 URL，具备：
  - 返回/关闭
  - 域名白名单拦截（只允许 cs 域/静态资源域）
  - 文件选择（相册/相机）
- **玩家端 H5（Vue）**：部署到本机静态服务器或临时域名（建议 https）
- **假游戏服务器（Mock Game Server）**：提供签名包/打开参数
- **客服后端（CS Backend）**：本机运行（建议 docker）
- **Postgres + Redis**：docker-compose 起
- **文件存储（可选）**：本机存储或 MinIO（建议 MinIO 更像线上）

### 3.2 网络与域名（尽量贴近线上）
建议强制走：
- H5：`https://cs-test.xxx.com/player.html`
- API：`https://api-cs-test.xxx.com`
- WS：`wss://ws-cs-test.xxx.com`

实现方式（任选其一）：
- 局域网 + 自签证书安装到手机
- 内网穿透（ngrok/frp/cloudflared）提供真实域名与 TLS

> 要求：不要只用 `http://localhost`，否则 WSS/证书/混合内容等线上问题测不到。

---

## 4. 角色与职责
- **客户端组**：壳 APK（WebView容器能力）、域名白名单、文件选择、返回键等
- **前端组（你）**：H5 渲染、connect 调用、WS 协议、重连策略、上传流程
- **后端组**：connect/WS/上传/鉴权/幂等/落库/广播
- **测试负责人（你）**：组织用例执行、问题归档、回归验证、验收结论

---

## 5. 测试数据与账号准备

### 5.1 测试账号/玩家身份
准备至少 3 个 playerUid：
- U1：正常用户（无 activeTicket）
- U2：有未完成工单（WAITING/IN_PROGRESS）
- U3：用来做“同账号多设备/踢旧连接”测试

每个账号绑定：
- gameId、serverId/areaId、（可选）roleId

### 5.2 工单与消息数据
- 预置 1 条 activeTicket（U2），包含 20+ 条历史消息（含 bot/agent/user）
- 预置 1 条 RESOLVED 工单（只读恢复用）

---

## 6. 测试策略与阶段

### 6.1 阶段划分
1) **冒烟（Smoke）**：10 分钟内验证链路通（打开 → connect → ws → 发消息 → ack）
2) **功能（Functional）**：覆盖核心业务场景与边界
3) **稳定性（Stability）**：切后台、弱网、重连、重复提交、token 过期
4) **安全性（Security MVP）**：签名/nonce配置/域名白名单/token TTL
5) **轻量性能（Light Perf）**：小并发连接与消息吞吐（验证无明显瓶颈）

---

## 7. 详细测试用例

### 7.1 冒烟用例（必须全部通过）
**S-01 打开页面成功**
- 操作：壳 APK 打开 H5 URL
- 期望：页面非白屏，显示欢迎语/菜单（bootstrapMessages）

**S-02 connect 成功**
- 操作：H5 调 `/api/player/connect`
- 期望：200；返回 wsToken/wsUrl/history/bootstrapMessages/inputMode

**S-03 WS 建连成功**
- 操作：用 wsToken 建立 wss
- 期望：收到 `connection:ready`（或等价事件），无鉴权错误

**S-04 ticket:create + 发送文本**
- 操作：ticket:create → message:send(TEXT)
- 期望：收到 `message:ack`；DB message +1；页面显示发送成功；bot 回复正常（若有）

---

### 7.2 功能用例（核心链路）
**F-01 首次进入（无 activeTicket）**
- 期望：显示 welcome + 菜单；输入框初始 LOCKED（如设计如此）
- 点分类后：输入框解锁；后端回一条引导消息

**F-02 有 activeTicket 顶部 banner**
- 账号：U2
- 期望：connect 返回 activeTicket；前端展示 banner
- 点击恢复：ticket:resume 成功；加载历史（最近 50 条）

**F-03 只读工单恢复（RESOLVED）**
- 操作：resume RESOLVED 工单
- 期望：返回 history + readOnly=true；message:send 被拒绝（READ_ONLY_TICKET）

**F-04 未绑定 ticket 发送消息**
- 操作：WS 连上但不 ticket:create/resume，直接 message:send
- 期望：error=NO_TICKET_BOUND；DB 不新增消息

**F-05 幂等：重复 clientMsgId**
- 操作：同一 tid 下连续发两次相同 clientMsgId 的 message:send
- 期望：DB 只新增 1 条；ack 的 serverMsgId 相同（或第二次返回已存在标识）

**F-06 客服端可见性（与现有客服端联动）**
- 操作：将 ticket 状态置 WAITING（触发转人工或模拟）
- 期望：现有客服端能看到该工单并接入；双方消息互通

**F-07 多语言支持**
- 操作：connect 时传入 `language=en-US`
- 期望：返回对应语言的 bootstrapMessages/questList（如已配置）；响应中 language 字段与请求一致

**F-08 超长消息处理**
- 操作：发送 5000+ 字符的文本消息
- 期望：按规则截断或拒绝，返回明确提示；不崩溃/不假死

**F-09 特殊字符消息**
- 操作：发送包含 emoji、HTML 标签（`<script>`）、SQL 注入（`'; DROP TABLE`）的消息
- 期望：正常入库显示，不被执行；XSS/SQL 注入无效

---

### 7.3 图片用例（最容易踩坑）
**I-01 Android 选图弹窗可用**
- 操作：点击“图片”按钮，触发 `<input type=file>`
- 期望：系统相册/相机能弹出；选图后拿到 File

**I-02 上传鉴权失败**
- 操作：不带 uploadToken/带错 token 调 upload
- 期望：401；前端提示失败；不发送 IMAGE 消息

**I-03 上传成功 + IMAGE 消息入库/广播**
- 操作：upload 成功 → WS 发 IMAGE_SEND/UPLOAD_DONE
- 期望：DB message(type=IMAGE) +1；玩家端显示图片；客服端也能看到（至少 url 文本）

**I-04 大图限制**
- 操作：上传 10MB+ 图片
- 期望：按规则拒绝或压缩；返回明确错误；不崩溃/不假死

---

### 7.4 稳定性用例（上线后最常见）
**R-01 切后台 30 秒回来**
- 操作：Home 键→回来
- 期望：H5 自动重连（重新 connect 或 resume）；消息不丢；输入状态正确

**R-02 网络切换（Wi-Fi ↔ 4G）**
- 期望：WS 断开后能重连；不会重复入库（依赖 clientMsgId 幂等）

**R-03 wsToken 过期**
- 操作：等待 wsToken TTL 过期再连接
- 期望：WS 鉴权失败；H5 自动走 connect 重新拿 token

**R-04 uploadToken 过期**
- 期望：upload 返回 401；前端重新走 connect 获取新 uploadToken 后重试成功

**R-05 并发连接（同一 playerUid 两台设备）**
- 期望：新连接踢旧连接；旧连接收到明确断开原因；不会串线

---

### 7.5 安全性用例（MVP必做）

> **签名协议说明**
> - 签名参数：`gameid/uid/areaid/nonce/sign`（无 timestamp）
> - 签名公式：`sign = md5(gameid|uid|areaid|nonce|secret).toLowerCase()`
> - nonce 为游戏配置中的**固定值**（`playerApiNonce`），不做防重放

**SEC-01 签名正确/错误**
- 正确签名：connect 返回 200，获取 wsToken
- 错误签名（secret 不对）：INVALID_SIGN（401）
- 缺少必填参数：MISSING_PARAMS（400）

**SEC-02 Nonce 不匹配**
- 操作：connect 时传入与游戏配置不一致的 nonce
- 期望：INVALID_SIGN（401）

**SEC-03 游戏未配置 Nonce**
- 操作：connect 到 `playerApiNonce` 为空的游戏
- 期望：NONCE_NOT_CONFIGURED（401）

**SEC-04 游戏未启用 Player API**
- 操作：connect 到 `playerApiEnabled=false` 的游戏
- 期望：API_DISABLED（401）

**SEC-05 域名白名单**
- 操作：H5 页面内点击外链（非白名单域）
- 期望：WebView 拦截并改用系统浏览器（或直接阻止）

---

### 7.6 轻量性能用例（非压测，但能发现明显问题）
**PERF-01 50~200 并发 WS 连接（本机/测试机）**
- 期望：连接成功率 > 99%，无明显 CPU/内存爆涨，延迟可接受

**PERF-02 消息吞吐**
- 10 个客户端各发送 100 条文本
- 期望：无丢包；ack 正常；DB 写入数量正确；Redis 去重无异常

工具建议：k6（HTTP）+ 自写 socket.io-client 脚本或 Artillery（WS）

---

## 8. 通过标准（Exit Criteria）
MVP 允许上线（或进入 staging）的最低标准：
- 冒烟用例 100% 通过
- 功能用例核心（F-01~F-06）全通过；F-07~F-09 建议通过
- 图片用例 I-01~I-03 全通过（I-04 可作为限制提示）
- 稳定性 R-01/R-02/R-03/R-05 至少通过（R-04建议通过）
- 安全性 SEC-01~SEC-05 全通过
- 关键缺陷（阻塞/高优）清零：
  - 阻塞：白屏、无法 connect、WS 无法连、无法发消息、无法恢复
  - 高优：重复入库、串线、鉴权可绕过、图片选不了/传不了

---

## 9. 缺陷分级与处理时限
- **P0 阻塞**：当天修复+回归（白屏/无法连/串线/重复入库）
- **P1 高优**：2 天内修复（重连不稳/图片失败率高/错误提示缺失）
- **P2 中优**：版本内修复（UI细节/提示文案/日志不全）
- **P3 低优**：排期优化（体验优化/动效/埋点）

---

## 10. 工具与日志要求（强烈建议）
- Android WebView 调试：Chrome remote inspect
- 网络抓包：Charles/mitmproxy（注意 https 证书）
- 服务端日志：每个请求/WS事件打印 traceId、playerUid、tid、clientMsgId
- DB/Redis 可观测：
  - Redis key：wsToken、uploadToken、dedup key TTL
  - DB：message 条数与最新时间

---

## 11. 风险与对策
- **证书/HTTPS/WSS**：自签证书导致真机不信任 → 提前安装证书或用内网穿透提供正规 TLS
- **Android 文件选择不弹**：壳 APK 未实现 file chooser → 客户端组必须优先完成
- **切后台 WS 断开**：H5 必须实现 visibilitychange 重连策略 → 稳定性用例强制覆盖
- **重复消息/乱序**：必须有 ack + clientMsgId 幂等 → 用例 F-05 强制覆盖

---

## 12. 执行节奏建议（最小但靠谱）
- 第 1 天：环境搭建 + 冒烟（S-01~S-04）
- 第 2 天：功能（F-01~F-06）
- 第 3 天：图片（I-01~I-04）+ 稳定性（R-01~R-05）
- 第 4 天：安全性（SEC）+ 轻量性能（PERF）+ 全量回归

---
