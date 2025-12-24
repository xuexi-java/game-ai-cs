# 多阶段构建 - 构建阶段
# 使用国内镜像源以避免网络问题
FROM node:20.19.5-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制源代码
COPY . .

# 构建应用（使用相对路径，不需要环境变量）
RUN npx vite build

# 生产阶段 - 使用 nginx
# 使用国内镜像源以避免网络问题
FROM nginx:alpine

# 复制构建产物到 nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 20101

CMD ["nginx", "-g", "daemon off;"]

