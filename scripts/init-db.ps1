# PowerShell 数据库初始化脚本
# 用于 Windows 环境快速设置开发环境

Write-Host "🚀 开始初始化数据库..." -ForegroundColor Green

# 检查 .env 文件
if (-not (Test-Path .env)) {
    Write-Host "📝 创建 .env 文件..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host "✅ .env 文件已创建，请检查配置" -ForegroundColor Green
}

# 检查 Docker 是否运行
try {
    docker info | Out-Null
} catch {
    Write-Host "❌ Docker 未运行，请先启动 Docker Desktop" -ForegroundColor Red
    exit 1
}

# 启动 Docker 服务
Write-Host "🐳 启动 Docker 服务..." -ForegroundColor Yellow
docker-compose up -d

# 等待 PostgreSQL 就绪
Write-Host "⏳ 等待 PostgreSQL 就绪..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# 检查数据库连接
$maxRetries = 30
$retryCount = 0
while ($retryCount -lt $maxRetries) {
    try {
        docker-compose exec -T postgres pg_isready -U postgres | Out-Null
        if ($LASTEXITCODE -eq 0) {
            break
        }
    } catch {
        # 忽略错误，继续重试
    }
    Write-Host "⏳ 等待数据库连接... ($retryCount/$maxRetries)" -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    $retryCount++
}

if ($retryCount -ge $maxRetries) {
    Write-Host "❌ 数据库连接超时" -ForegroundColor Red
    exit 1
}

Write-Host "✅ PostgreSQL 已就绪" -ForegroundColor Green

# 安装依赖
if (-not (Test-Path node_modules)) {
    Write-Host "📦 安装依赖..." -ForegroundColor Yellow
    npm install
}

# 生成 Prisma Client
Write-Host "🔧 生成 Prisma Client..." -ForegroundColor Yellow
npm run db:generate

# 运行数据库迁移
Write-Host "📊 运行数据库迁移..." -ForegroundColor Yellow
npm run db:migrate

# 初始化种子数据
Write-Host "🌱 初始化种子数据..." -ForegroundColor Yellow
npm run db:seed

Write-Host ""
Write-Host "✅ 数据库初始化完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📋 默认账户信息:" -ForegroundColor Cyan
Write-Host "   管理员: admin / admin123"
Write-Host "   客服: agent1 / agent123"
Write-Host ""
Write-Host "⚠️  请在生产环境中修改默认密码！" -ForegroundColor Yellow
Write-Host ""
Write-Host "💡 提示:" -ForegroundColor Cyan
Write-Host "   - 查看数据库: npm run db:studio"
Write-Host "   - 停止服务: npm run docker:down"
Write-Host "   - 查看日志: npm run docker:logs"

