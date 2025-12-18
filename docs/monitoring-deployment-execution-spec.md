# 监控部署执行规格（Monitoring Deployment Execution Spec）

## 0. 目标

本执行规格用于约束 AI 编程助手完成以下任务：

- 部署 Prometheus
- 部署 Grafana
- 配置 Prometheus 抓取后端指标
- 创建最小可用 Grafana Dashboard（只读）

AI 不允许偏离本规格的任何内容。

---

## 1. Prometheus 部署规则

### 1.1 部署方式

- 使用 Docker Compose
- 不修改现有 backend 的 docker-compose 文件
- 单独创建 monitoring 相关 compose 文件

### 1.2 Prometheus 配置要求

- scrape_interval: 15s
- metrics_path: `/api/v1/metrics`
- 抓取目标：当前后端服务

允许的 target 配置方式：
- `host.docker.internal`
- 或 Docker 网络内服务名（需明确说明）

禁止：
- ❌ 随机端口
- ❌ 动态发现
- ❌ k8s / consul / 其他复杂机制

---

## 2. Grafana 部署规则

### 2.1 基本要求

- 使用官方 grafana 镜像
- 通过 Docker Compose 启动
- 不启用告警
- 不启用用户管理
- 只作为可视化工具

### 2.2 数据源规则

- Grafana 必须内置一个 Prometheus 数据源
- 数据源 URL 指向 Prometheus 容器
- 不允许硬编码 localhost

---

## 3. Dashboard（最小可用）

### 3.1 Dashboard 数量

- 只创建 **1 个 Dashboard**
- 名称：`Game AI Backend - Overview`

### 3.2 必须包含的 Panel（不可删减）

1. 当前排队人数  
   - PromQL：`sum(queue_length)`

2. 排队等待时间 P95  
   - PromQL：
     ```promql
     histogram_quantile(
       0.95,
       sum(rate(queue_wait_time_seconds_bucket[5m])) by (le)
     )
     ```

3. WebSocket 活跃连接数  
   - PromQL：`sum(ws_connections_active)`

4. HTTP 请求吞吐（QPS）  
   - PromQL：`sum(rate(http_requests_total[1m]))`

5. HTTP 请求 P95 延迟  
   - PromQL：
     ```promql
     histogram_quantile(
       0.95,
       sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
     )
     ```

### 3.3 其他限制

- 禁止自动生成多余 Panel
- 禁止复杂变量
- 禁止告警规则
- 禁止导入外部 Dashboard

---

## 4. 输出规则

- 只输出新增 / 修改的文件内容
- 不自动执行 docker-compose
- 不解释设计原因
