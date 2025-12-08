
# Docker 部署与运维全操作手册

本文档提供了本项目所有相关的 Docker 运维命令，从基础的启动停止到进阶的数据库维护。

目录：
1. [🚀 核心命令（启动/停止）](#1-核心命令)
2. [🛠️ 服务管理（重启/日志）](#2-服务管理)
3. [💾 数据库与数据维护](#3-数据库与数据维护)
4. [🔧 进阶调试与排查](#4-进阶调试与排查)
5. [❓ 关于数据持久化的说明](#5-关于数据持久化的说明)

---

## 1. 核心命令

### ✅ 一键启动（最常用）
启动所有服务（后端、前端、数据库、Redis）。如果镜像不存在会自动构建。
```powershell
docker-compose up -d
```
> `-d`: Detached mode，后台静默运行。

### 🔄 重新构建并启动
当你修改了代码（尤其是后端代码或 `package.json`），需要重新编译镜像时使用：
```powershell
docker-compose up -d --build
```

### 🛑 停止服务
停止并删除容器，**保留数据库数据**。
```powershell
docker-compose down
```

### 🧨 停止并【清空数据】（慎用）
停止服务，并且**删除数据库的所有数据**。下次启动相当于全新安装。
```powershell
docker-compose down -v
```
> `-v`: 同时删除挂载的数据卷 (Volumes)。

---

## 2. 服务管理

### 📋 查看服务状态
```powershell
docker-compose ps
```

### 📜 查看日志
**查看所有服务的实时日志：**
```powershell
docker-compose logs -f
```

**只查看后端的日志：**
```powershell
docker-compose logs -f backend
```

**只查看数据库的日志：**
```powershell
docker-compose logs -f postgres
```

### 🔄 单独重启某个服务
如果只想重启后端（例如改了配置），不需要重启整个 Docker 组：
```powershell
docker-compose restart backend
```

---

## 3. 数据库与数据维护

### 🌱 手动重新运行种子数据 (Seed)
如果需要在容器运行中强制重新填充初始数据：
```powershell
docker-compose exec backend npx prisma db seed
```

### 🦋 手动执行数据库迁移 (Migrate)
如果数据库结构变更了，通常容器启动时会自动跑，但也可以手动跑：
```powershell
docker-compose exec backend npx prisma migrate deploy
```

### 🐚 进入数据库命令行 (psql)
直接进入 Postgres 数据库查询数据：
```powershell
docker-compose exec postgres psql -U postgres -d game_ai_cs
```
*   退出命令: `\q`
*   查看所有表: `\dt`

---

## 4. 进阶调试与排查

### 💻 进入容器内部 (Shell)
类似于 SSH 进入容器内部，查看文件或手动执行命令。

**进入后端容器：**
```powershell
docker-compose exec backend sh
```
> 注意：我们的镜像基于 Alpine Linux，所以使用 `sh` 而不是 `bash`。

**进入 Redis 容器（使用 CLI）：**
```powershell
docker-compose exec redis redis-cli
```

### 🧹 清理 Docker 垃圾
如果磁盘空间不足，可以清理未使用的镜像和构建缓存：
```powershell
docker system prune -a
```

---

## 5. 关于数据持久化的说明

### ❓ 为了重新构建镜像，我运行了 down，数据丢了吗？
**回答：没有丢失。**
只要你没有加 `-v` 参数，Docker 会保留 `postgres_data` 数据卷。下次 `docker-compose up` 时，Postgres 会挂载旧的数据卷，你的用户数据依然存在。

### ❓ 如何验证种子数据是否生效？
查看后端日志，搜索关键字：
```powershell
docker-compose logs backend | grep "seed"
```
如果输出包含 `The seed command has been executed`，说明种子数据初始化成功。
