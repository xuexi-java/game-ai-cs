#!/bin/bash

# 数据库初始化脚本
# 用于快速设置开发环境

echo "🚀 开始初始化数据库..."

# 检查 .env 文件
if [ ! -f .env ]; then
    echo "📝 创建 .env 文件..."
    cp .env.example .env
    echo "✅ .env 文件已创建，请检查配置"
fi

# 检查 Docker 是否运行
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker"
    exit 1
fi

# 启动 Docker 服务
echo "🐳 启动 Docker 服务..."
docker-compose up -d

# 等待 PostgreSQL 就绪
echo "⏳ 等待 PostgreSQL 就绪..."
sleep 5

# 检查数据库连接
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "⏳ 等待数据库连接..."
    sleep 2
done

echo "✅ PostgreSQL 已就绪"

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 生成 Prisma Client
echo "🔧 生成 Prisma Client..."
npm run db:generate

# 运行数据库迁移
echo "📊 运行数据库迁移..."
npm run db:migrate

# 初始化种子数据
echo "🌱 初始化种子数据..."
npm run db:seed

echo ""
echo "✅ 数据库初始化完成！"
echo ""
echo "📋 默认账户信息:"
echo "   管理员: admin / admin123"
echo "   客服: agent1 / agent123"
echo ""
echo "⚠️  请在生产环境中修改默认密码！"
echo ""
echo "💡 提示:"
echo "   - 查看数据库: npm run db:studio"
echo "   - 停止服务: npm run docker:down"
echo "   - 查看日志: npm run docker:logs"

