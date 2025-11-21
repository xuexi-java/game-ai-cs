@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title AI 客服系统 - 启动脚本

echo.
echo ================================================================
echo        AI 客服系统 - 启动脚本
echo ================================================================
echo.

REM 检查 Node.js
echo [1/5] 检查 Node.js 环境...
where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VERSION=%%i
echo [成功] Node.js 已安装 ^(版本: %NODE_VERSION%^)

REM 检查 npm
echo [2/5] 检查 npm 环境...
where npm >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 npm，请先安装 npm
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VERSION=%%i
echo [成功] npm 已安装 ^(版本: %NPM_VERSION%^)

REM 检查 Docker
echo [3/5] 检查 Docker 环境...
where docker >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Docker，请先安装 Docker Desktop
    pause
    exit /b 1
)

REM 检查 Docker 是否运行
docker info >nul 2>&1
if errorlevel 1 (
    echo [警告] Docker 未运行，正在尝试启动 Docker Desktop...
    set DOCKER_FOUND=0
    if exist "C:\Program Files\Docker\Docker\Docker Desktop.exe" (
        start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
        set DOCKER_FOUND=1
    )
    if !DOCKER_FOUND! equ 0 (
        set "PROGFILES86=%ProgramFiles(x86)%"
        if exist "!PROGFILES86!\Docker\Docker\Docker Desktop.exe" (
            start "" "!PROGFILES86!\Docker\Docker\Docker Desktop.exe"
            set DOCKER_FOUND=1
        )
    )
    if !DOCKER_FOUND! equ 0 (
        set "LOCALAPP=%LOCALAPPDATA%"
        if exist "!LOCALAPP!\Docker\Docker Desktop.exe" (
            start "" "!LOCALAPP!\Docker\Docker Desktop.exe"
            set DOCKER_FOUND=1
        )
    )
    if !DOCKER_FOUND! equ 0 (
        echo [错误] 未找到 Docker Desktop，请手动启动
        pause
        exit /b 1
    )
    echo 等待 Docker 启动...
    timeout /t 15 /nobreak >nul
    REM 再次检查
    set DOCKER_READY=0
    for /l %%i in (1,1,10) do (
        docker info >nul 2>&1
        if not errorlevel 1 (
            set DOCKER_READY=1
            goto docker_ready
        )
        timeout /t 3 /nobreak >nul
    )
    :docker_ready
    if !DOCKER_READY!==0 (
        echo [错误] Docker 启动超时，请手动启动 Docker Desktop 后重试
        pause
        exit /b 1
    )
)
echo [成功] Docker 正在运行

REM 启动 Docker 服务
echo [4/5] 启动 Docker 服务 ^(PostgreSQL 和 Redis^)...
docker-compose up -d
if errorlevel 1 (
    echo [错误] Docker 服务启动失败
    pause
    exit /b 1
)
echo [成功] Docker 服务已启动

REM 等待数据库就绪
echo 等待数据库就绪...
set DB_READY=0
for /l %%i in (1,1,30) do (
    docker-compose exec -T postgres pg_isready -U postgres >nul 2>&1
    if not errorlevel 1 (
        set DB_READY=1
        goto db_ready
    )
    timeout /t 2 /nobreak >nul
)
:db_ready
if !DB_READY! equ 1 (
    echo [成功] 数据库已就绪
) else (
    echo [警告] 数据库连接超时，但继续启动应用服务...
)

REM 创建日志目录
if not exist "logs" mkdir logs

REM 启动后端服务
echo [5/5] 启动后端服务...
cd /d "%~dp0backend"
start /b cmd /c "npm run start:dev > ..\logs\backend.log 2> ..\logs\backend-error.log"
cd /d "%~dp0"
timeout /t 3 /nobreak >nul
echo [成功] 后端服务已启动 ^(日志: logs\backend.log^)

REM 启动管理端前端
echo 启动管理端前端...
cd /d "%~dp0admin-portal"
start /b cmd /c "npm run dev > ..\logs\admin.log 2> ..\logs\admin-error.log"
cd /d "%~dp0"
timeout /t 2 /nobreak >nul
echo [成功] 管理端前端已启动 ^(日志: logs\admin.log^)

REM 启动玩家端前端
echo 启动玩家端前端...
cd /d "%~dp0player-app"
start /b cmd /c "npm run dev > ..\logs\player.log 2> ..\logs\player-error.log"
cd /d "%~dp0"
timeout /t 2 /nobreak >nul
echo [成功] 玩家端前端已启动 ^(日志: logs\player.log^)

echo.
echo ================================================================
echo        服务启动完成！
echo ================================================================
echo.
echo 服务访问地址：
echo   - 后端服务:    http://localhost:3000
echo   - 管理端:      http://localhost:5174
echo   - 玩家端:      http://localhost:5173
echo   - API 文档:    http://localhost:3000/api/v1/docs
echo.
echo 日志文件位于 'logs' 文件夹
echo.
echo 提示：
echo   - 所有服务都在后台运行
echo   - 查看日志: type logs\backend.log
echo   - 实时查看后端日志: powershell -Command "Get-Content logs\backend.log -Wait -Tail 50"
echo   - 停止服务: 按 Ctrl+C 或关闭此窗口
echo.
echo 按任意键退出启动脚本（服务将继续在后台运行）...
pause >nul

