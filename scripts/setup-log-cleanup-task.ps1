###############################################################################
# 设置日志清理定时任务（Windows 任务计划程序）
# 功能：配置 Windows 定时任务，每月 1 号凌晨 2 点执行日志清理
# 使用方法：以管理员身份运行 PowerShell，执行此脚本
###############################################################################

# 检查是否以管理员身份运行
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "错误: 请以管理员身份运行此脚本" -ForegroundColor Red
    Write-Host "右键点击 PowerShell -> 以管理员身份运行" -ForegroundColor Yellow
    exit 1
}

# 获取项目根目录的绝对路径
$ProjectRoot = (Get-Location).Path
$ScriptPath = Join-Path $ProjectRoot "scripts\clean-logs.ps1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "设置日志清理定时任务" -ForegroundColor Cyan
Write-Host "项目路径: $ProjectRoot" -ForegroundColor Cyan
Write-Host "脚本路径: $ScriptPath" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 检查脚本是否存在
if (-not (Test-Path $ScriptPath)) {
    Write-Host "错误: 清理脚本不存在: $ScriptPath" -ForegroundColor Red
    exit 1
}

# 定时任务配置
$TaskName = "GameAI-LogCleanup"
$TaskDescription = "Game AI CS 项目日志清理任务（每月 1 号凌晨 2 点执行，删除 3 个月前的日志）"

# 检查任务是否已存在
$ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

if ($ExistingTask) {
    Write-Host "⚠ 定时任务已存在，删除旧任务..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

# 创建定时任务触发器（每月 1 号凌晨 2:00）
$Trigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At 2:00AM

# 创建定时任务操作
$Action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$ScriptPath`"" `
    -WorkingDirectory $ProjectRoot

# 创建定时任务设置
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -MultipleInstances IgnoreNew

# 注册定时任务（使用 SYSTEM 账户运行）
Register-ScheduledTask `
    -TaskName $TaskName `
    -Description $TaskDescription `
    -Trigger $Trigger `
    -Action $Action `
    -Settings $Settings `
    -User "SYSTEM" `
    -RunLevel Highest `
    -Force | Out-Null

Write-Host "✓ 定时任务创建成功" -ForegroundColor Green
Write-Host ""
Write-Host "定时任务配置：" -ForegroundColor Cyan
Write-Host "  任务名称: $TaskName" -ForegroundColor White
Write-Host "  执行时间: 每月 1 号凌晨 2:00" -ForegroundColor White
Write-Host "  执行脚本: $ScriptPath" -ForegroundColor White
Write-Host "  工作目录: $ProjectRoot" -ForegroundColor White
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "管理定时任务：" -ForegroundColor Cyan
Write-Host "  - 查看: Get-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "  - 启用: Enable-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "  - 禁用: Disable-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "  - 删除: Unregister-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "  - 手动执行: Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
Write-Host "  - 或直接运行: powershell -File '$ScriptPath'" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Cyan
