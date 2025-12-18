🧭 Prometheus + Grafana 监控接入问题总结与解决方案文档

项目背景：
在 game-ai-backend（NestJS + Docker Compose）中接入 Prometheus 指标采集与 Grafana 可视化。

一、目标与预期
目标

后端暴露 Prometheus 标准 metrics endpoint

Prometheus 能成功 scrape

Grafana 能基于指标画图

指标语义清晰、无污染、可扩展

成功标准

curl /api/v1/metrics 返回 Prometheus 文本格式

Prometheus Targets 页面显示 UP

Grafana 能查询并显示指标

二、问题总览（遇到的所有核心问题）
问题 1：Prometheus 抓取失败（DOWN）

现象

Prometheus /targets 页面显示 DOWN

错误信息类似：

expected equal, got ":" (INVALID)
while parsing "{\"success\":..."


根因

/api/v1/metrics 返回的是 JSON 格式

实际返回内容被统一响应拦截器包装成：

{
  "success": true,
  "data": "...",
  "timestamp": ...
}


Prometheus 只接受 text/plain 的 metrics 协议

问题 2：NestJS 拦截器污染 metrics 协议

涉及拦截器

TransformInterceptor

MetricsInterceptor

具体问题

metrics 响应被 JSON 包装（协议破坏）

metrics 请求本身被 metrics interceptor 统计（自引用污染）

问题 3：Docker 网络与 Target 地址混乱

表现

尝试使用：

localhost:21101

backend:21101

cs-backend:21101

Prometheus 报错：

lookup backend: no such host
connection refused


根因

Prometheus 容器与 backend 不在同一 network

或 target host 与 docker network alias 不匹配

混用了「宿主机视角」和「容器内视角」

问题 4：Prometheus 配置和容器状态不一致

表现

容器已启动，但 /targets 无法访问

docker ps 显示 prometheus / grafana 在跑，但访问失败

根因

external: true 的 network 不存在

Prometheus 实际未成功启动 scrape job

docker-compose.monitoring.yml 与主 compose 的 network 不一致

三、解决方案（最终正确做法）
✅ 解决方案 1：专用 Metrics Controller（关键）
新增文件

backend/src/metrics/metrics.controller.ts

核心原则

不使用 NestJS 自动 response

不返回 JSON

严格输出 Prometheus 文本

@Get('/metrics')
getMetrics(@Res() res: Response) {
  res.set('Content-Type', 'text/plain; version=0.0.4');
  res.send(register.metrics());
}

✅ 解决方案 2：绕过所有拦截器（非常关键）
修改 1：TransformInterceptor
if (req.path === '/api/v1/metrics') {
  return next.handle();
}


避免 metrics 被包装成 { success, data }

修改 2：MetricsInterceptor
if (req.path === '/api/v1/metrics') {
  return next.handle();
}


避免 metrics endpoint 统计自身

✅ 解决方案 3：Prometheus scrape 配置修正

monitoring/prometheus/prometheus.yml

scrape_configs:
  - job_name: 'game-ai-backend'
    metrics_path: '/api/v1/metrics'
    static_configs:
      - targets: ['backend:21101']


前提

Prometheus 和 backend 在同一个 docker network

backend container alias 包含 backend

✅ 解决方案 4：Docker Network 对齐
统一 network

主服务 compose

monitoring compose

都使用同一个 network（非 external 或提前创建）

docker network create game-ai-cs-network


或由 compose 自动创建

✅ 解决方案 5：验证链路（最终验收）
1️⃣ Backend
curl http://localhost:21101/api/v1/metrics


✔ 返回 # HELP / # TYPE 格式文本

2️⃣ Prometheus

访问：

http://localhost:9090/targets


✔ backend target 为 UP

3️⃣ Grafana

Explore → 查询：

queue_length


✔ 有数据（即使是 0）

四、关键经验总结（非常重要）
1️⃣ metrics 是“协议端点”，不是普通 API

❌ 不能 JSON

❌ 不能包装

❌ 不能改格式

✅ 必须原样输出

2️⃣ 拦截器是 NestJS 中最容易踩坑的地方

全局 interceptor ≠ 所有 endpoint 都适用

metrics / health / webhook 都应该特判

3️⃣ Docker 中永远要分清两种视角
场景	应该用
Prometheus → backend	container name / alias
浏览器 → Prometheus	localhost:9090
4️⃣ 错误信息是“线索”，不是噪音
expected equal, got ":"


这句话 100% 指向：协议不是 Prometheus 格式