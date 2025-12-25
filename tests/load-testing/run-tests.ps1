<#
.SYNOPSIS
    游戏AI客服系统性能测试执行脚本

.DESCRIPTION
    提供简化的命令行接口来运行各种性能测试

.EXAMPLE
    .\run-tests.ps1 -TestType smoke
    .\run-tests.ps1 -TestType load -Duration 5m -VUs 50
    .\run-tests.ps1 -TestType stress
    .\run-tests.ps1 -TestType websocket -VUs 100
    .\run-tests.ps1 -TestType database
    .\run-tests.ps1 -TestType all

.PARAMETER TestType
    测试类型: smoke, load, stress, spike, websocket, database, all

.PARAMETER VUs
    并发虚拟用户数 (默认根据测试类型自动设置)

.PARAMETER Duration
    测试持续时间 (默认根据测试类型自动设置)

.PARAMETER BaseUrl
    后端服务地址 (默认: https://localhost:21101)

.PARAMETER ExportResults
    是否导出JSON结果 (默认: true)
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("smoke", "load", "stress", "spike", "websocket", "database", "all")]
    [string]$TestType,

    [int]$VUs = 0,
    [string]$Duration = "",
    [string]$BaseUrl = "https://localhost:21101",
    [string]$Username = "admin",
    [string]$Password = "admin123",
    [bool]$ExportResults = $true
)

$ErrorActionPreference = "Stop"

# 检查 k6 是否安装
function Test-K6Installed {
    try {
        $null = Get-Command k6 -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ScriptsDir = Join-Path $ScriptDir "scripts"
$ResultsDir = Join-Path $ScriptDir "results"

# 确保结果目录存在
if (-not (Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Path $ResultsDir | Out-Null
}

# 检查 k6
if (-not (Test-K6Installed)) {
    Write-Host "❌ k6 未安装。请先安装 k6:" -ForegroundColor Red
    Write-Host "   choco install k6" -ForegroundColor Yellow
    Write-Host "   或 winget install k6" -ForegroundColor Yellow
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   游戏AI客服系统 - 性能测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置环境变量
$env:BASE_URL = $BaseUrl
$env:HTTP_URL = $BaseUrl
$env:WS_URL = $BaseUrl -replace "https://", "wss://" -replace "http://", "ws://"
$env:ADMIN_USERNAME = $Username
$env:ADMIN_PASSWORD = $Password

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

function Run-Test {
    param(
        [string]$Script,
        [string]$Name,
        [int]$DefaultVUs,
        [string]$DefaultDuration,
        [hashtable]$ExtraEnv = @{}
    )

    $ActualVUs = if ($VUs -gt 0) { $VUs } else { $DefaultVUs }
    $ActualDuration = if ($Duration -ne "") { $Duration } else { $DefaultDuration }

    Write-Host "🚀 运行 $Name" -ForegroundColor Green
    Write-Host "   并发用户: $ActualVUs" -ForegroundColor Gray
    Write-Host "   持续时间: $ActualDuration" -ForegroundColor Gray
    Write-Host "   目标地址: $BaseUrl" -ForegroundColor Gray
    Write-Host ""

    # 设置额外环境变量
    foreach ($key in $ExtraEnv.Keys) {
        [Environment]::SetEnvironmentVariable($key, $ExtraEnv[$key])
    }

    $ScriptPath = Join-Path $ScriptsDir $Script
    $ResultFile = Join-Path $ResultsDir "$($Name.ToLower() -replace ' ', '-')_$Timestamp.json"

    $Args = @(
        "run"
        "--vus", $ActualVUs
        "--duration", $ActualDuration
    )

    if ($ExportResults) {
        $Args += "--out"
        $Args += "json=$ResultFile"
    }

    $Args += $ScriptPath

    Write-Host "执行命令: k6 $($Args -join ' ')" -ForegroundColor DarkGray
    Write-Host ""

    & k6 @Args

    if ($ExportResults -and (Test-Path $ResultFile)) {
        Write-Host ""
        Write-Host "📊 结果已保存到: $ResultFile" -ForegroundColor Cyan
    }
}

# 根据测试类型执行相应测试
switch ($TestType) {
    "smoke" {
        Run-Test -Script "http-api-load.js" -Name "冒烟测试" -DefaultVUs 1 -DefaultDuration "30s"
    }

    "load" {
        Run-Test -Script "http-api-load.js" -Name "负载测试" -DefaultVUs 50 -DefaultDuration "5m"
    }

    "stress" {
        Write-Host "🚀 运行 压力测试 (使用内置场景)" -ForegroundColor Green
        Write-Host "   这将运行完整的压力测试场景，包括:" -ForegroundColor Gray
        Write-Host "   - 冒烟测试 (30秒)" -ForegroundColor Gray
        Write-Host "   - 负载测试 (逐步增加到100用户)" -ForegroundColor Gray
        Write-Host "   - 压力测试 (逐步增加到400用户)" -ForegroundColor Gray
        Write-Host "   - 峰值测试 (突发500用户)" -ForegroundColor Gray
        Write-Host ""

        $ScriptPath = Join-Path $ScriptsDir "http-api-load.js"
        $ResultFile = Join-Path $ResultsDir "stress_$Timestamp.json"

        $Args = @("run")
        if ($ExportResults) {
            $Args += "--out"
            $Args += "json=$ResultFile"
        }
        $Args += $ScriptPath

        & k6 @Args
    }

    "spike" {
        Run-Test -Script "http-api-load.js" -Name "峰值测试" -DefaultVUs 500 -DefaultDuration "2m"
    }

    "websocket" {
        Run-Test -Script "websocket-load.js" -Name "WebSocket压力测试" -DefaultVUs 100 -DefaultDuration "5m"
    }

    "database" {
        Run-Test -Script "database-stress.js" -Name "数据库压力测试" -DefaultVUs 30 -DefaultDuration "5m"
    }

    "all" {
        Write-Host "📋 将依次运行所有测试类型..." -ForegroundColor Yellow
        Write-Host ""

        # 冒烟测试
        Run-Test -Script "http-api-load.js" -Name "冒烟测试" -DefaultVUs 1 -DefaultDuration "30s"
        Write-Host ""
        Write-Host "-----------------------------------" -ForegroundColor DarkGray
        Write-Host ""

        # 负载测试
        Run-Test -Script "http-api-load.js" -Name "负载测试" -DefaultVUs 50 -DefaultDuration "3m"
        Write-Host ""
        Write-Host "-----------------------------------" -ForegroundColor DarkGray
        Write-Host ""

        # WebSocket测试
        Run-Test -Script "websocket-load.js" -Name "WebSocket测试" -DefaultVUs 50 -DefaultDuration "2m"
        Write-Host ""
        Write-Host "-----------------------------------" -ForegroundColor DarkGray
        Write-Host ""

        # 数据库测试
        Run-Test -Script "database-stress.js" -Name "数据库测试" -DefaultVUs 30 -DefaultDuration "2m"
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   测试完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "查看结果文件: $ResultsDir" -ForegroundColor Gray
Write-Host ""
