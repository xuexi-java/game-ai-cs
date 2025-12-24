# Docker 部署问题修复说明

## 问题总结

### 问题1：AI优化功能在Docker中不能正常使用

**根本原因：**
- Docker Compose 配置中缺少 `DIFY_API_KEY` 和 `DIFY_BASE_URL` 环境变量
- 虽然 `backend/.env` 文件中有配置，但Docker容器不会读取该文件
- 后端代码需要这些环境变量才能调用Dify API进行话术优化

**修复方案：**
1. 在 `docker-compose.yml` 的 backend 服务中添加了 Dify 环境变量配置
2. 在根目录 `.env` 文件中添加了 Dify 配置（供 docker-compose 读取）
3. 更新了 `.env.example` 文件，添加完整的环境变量说明

### 问题2：端口配置错误

**实际情况：**
- Docker配置中的端口和本地开发端口是**相反的**，这是配置错误
- **正确的端口分配应该是：**
  - 管理端（admin-portal）：**20101**
  - 玩家端（player-app）：**20102**
  - 后端（backend）：21101

**配置说明：**
```yaml
# docker-compose.yml 端口映射（已修正）
admin-portal:  20101:20101  # 宿主机:容器
player-app:    20102:20102
backend:       21101:21101
postgres:      22101:5432
redis:         22102:6379
```

**修复内容：**
- 修正了 `docker-compose.yml` 中的端口映射
- 修正了 `frontend/admin-portal/nginx.conf` 监听端口为 20101
- 修正了 `frontend/admin-portal/Dockerfile` EXPOSE 端口为 20101
- 修正了 `frontend/player-app/nginx.conf` 监听端口为 20102
- 修正了 `frontend/player-app/Dockerfile` EXPOSE 端口为 20102

### 问题3：环境变量配置层级

**配置文件说明：**

1. **根目录 `.env`** - Docker Compose 读取
   - 用于 docker-compose.yml 中的 `${变量名}` 替换
   - 影响所有容器的环境变量

2. **backend/.env** - 本地开发时读取
   - 仅在本地运行 `npm run start:dev` 时生效
   - Docker 部署时不会读取此文件

3. **frontend/*/.env** - 前端构建时读取
   - Vite 构建时会将环境变量编译进静态文件
   - Docker 构建后无法动态修改
   - 但由于使用了 nginx 代理，前端通过相对路径访问后端，不依赖这些变量

## 修复内容

### 1. docker-compose.yml

```yaml
backend:
  environment:
    # 添加了 Dify 配置（带默认值）
    - DIFY_API_KEY=${DIFY_API_KEY:-app-pVK7Yup3O9DG6Zr1p8cSfe3p}
    - DIFY_BASE_URL=${DIFY_BASE_URL:-http://ai.sh7road.com/v1}
    # 添加了百度翻译配置（带默认值）
    - BAIDU_TRANSLATE_APP_ID=${BAIDU_TRANSLATE_APP_ID:-20250311002299702}
    - BAIDU_TRANSLATE_SECRET=${BAIDU_TRANSLATE_SECRET:-H1dETwWWqk45uN2DzGxK}
```

### 2. 根目录 .env

```bash
# Dify AI 话术优化配置
DIFY_API_KEY=app-pVK7Yup3O9DG6Zr1p8cSfe3p
DIFY_BASE_URL=http://ai.sh7road.com/v1

# 百度翻译配置
BAIDU_TRANSLATE_APP_ID=20250311002299702
BAIDU_TRANSLATE_SECRET=H1dETwWWqk45uN2DzGxK

# JWT 和加密配置
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=8h
ENCRYPTION_SECRET_KEY=default-secret-key-change-in-production-32-chars!!
```

### 3. 前端端口配置

修正了所有前端相关的端口配置，使其与本地开发保持一致：

**admin-portal（管理端 - 20101）：**
- `docker-compose.yml`: `20101:20101`
- `nginx.conf`: `listen 20101`
- `Dockerfile`: `EXPOSE 20101`

**player-app（玩家端 - 20102）：**
- `docker-compose.yml`: `20102:20102`
- `nginx.conf`: `listen 20102`
- `Dockerfile`: `EXPOSE 20102`

## 部署步骤

### 重新部署（修复AI优化功能）

```bash
# 1. 停止并删除现有容器
docker-compose down

# 2. 确认根目录 .env 文件存在且配置正确
cat .env

# 3. 重新构建并启动（如果代码有更新）
docker-compose up -d --build

# 或者只重启（如果只是环境变量更新）
docker-compose up -d
```

### 验证修复

```bash
# 1. 查看后端日志，确认环境变量已加载
docker-compose logs backend | grep -i dify

# 2. 进入后端容器检查环境变量
docker exec -it game-ai-cs-backend sh
echo $DIFY_API_KEY
echo $DIFY_BASE_URL
exit

# 3. 测试AI优化功能
# 在管理端创建工单并使用AI优化功能
```

## 注意事项

1. **生产环境安全**
   - 修改 `.env` 中的默认密钥和密码
   - 不要将 `.env` 文件提交到 Git（已在 .gitignore 中）
   - 使用强密码和随机密钥

2. **Dify API 配置**
   - 确保 Dify API 地址可访问
   - 确认 API Key 有效且有足够的调用额度
   - 如果使用自建 Dify，修改 `DIFY_BASE_URL`

3. **端口冲突**
   - 确保宿主机端口未被占用：
     - 管理端：20101
     - 玩家端：20102
     - 后端：21101
     - PostgreSQL：22101
     - Redis：22102
     - Prometheus：23101
     - Loki：23102
     - Grafana：23103
   - 如需修改端口，需要同步修改：
     - `docker-compose.yml` 端口映射
     - `frontend/*/nginx.conf` 监听端口
     - `frontend/*/Dockerfile` EXPOSE 端口

4. **网络访问**
   - 前端通过 nginx 代理访问后端，使用容器内部网络
   - 外部访问使用宿主机端口
   - 确保防火墙允许相应端口

## 常见问题

### Q1: AI优化功能仍然不工作？

**检查清单：**
```bash
# 1. 确认环境变量已设置
docker exec game-ai-cs-backend env | grep DIFY

# 2. 查看后端错误日志
docker-compose logs backend --tail=100

# 3. 测试 Dify API 连接
docker exec game-ai-cs-backend sh -c "curl -I $DIFY_BASE_URL"

# 4. 检查数据库中的游戏配置
# 游戏表中也可以配置独立的 Dify API，会覆盖环境变量
```

### Q2: 如何修改端口？

如果需要修改端口，必须同步修改以下文件：

**修改管理端端口（默认20101）：**
1. `docker-compose.yml` - admin-portal 的 ports 映射
2. `frontend/admin-portal/nginx.conf` - listen 端口
3. `frontend/admin-portal/Dockerfile` - EXPOSE 端口
4. `frontend/admin-portal/vite.config.ts` - server.port（本地开发）

**修改玩家端端口（默认20102）：**
1. `docker-compose.yml` - player-app 的 ports 映射
2. `frontend/player-app/nginx.conf` - listen 端口
3. `frontend/player-app/Dockerfile` - EXPOSE 端口
4. `frontend/player-app/vite.config.ts` - server.port（本地开发）

**修改后端端口（默认21101）：**
1. `docker-compose.yml` - backend 的 ports 映射和 PORT 环境变量
2. `backend/.env` - PORT 配置（本地开发）
3. `frontend/*/nginx.conf` - proxy_pass 地址
4. `frontend/*/vite.config.ts` - proxy.target（本地开发）

### Q3: 本地开发和Docker部署端口一致吗？

**现在已经一致了：**

| 服务 | 本地开发 | Docker部署 |
|------|---------|-----------|
| 管理端 | 20101 | 20101 |
| 玩家端 | 20102 | 20102 |
| 后端 | 21101 | 21101 |
| PostgreSQL | 22101 | 22101 |
| Redis | 22102 | 22102 |

**配置文件说明：**
- **本地开发**：使用 `backend/.env` 和 `frontend/*/vite.config.ts`
- **Docker部署**：使用根目录 `.env` 和 `docker-compose.yml`

## 相关文档

- [端口配置说明](./端口配置说明.md)
- [运维部署命令](./运维部署命令.md)
- [产品使用文档](./产品使用文档.md)
