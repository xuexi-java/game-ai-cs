###############################################################################
# 日志清理脚本（Windows PowerShell 版本）
# 功能：删除 3 个月前的日志文件
# 使用方法：
#   - 手动执行：powershell -ExecutionPolicy Bypass -File scripts/clean-logs.ps1
#   - 定时任务：使用 Windows 任务计划程序
###############################################################################

# 设置日志目录
$LogDir = ".\backend\logs"
$ArchiveDir = ".\backend\logs\archive"

# 设置保留天数（3个月 = 90天）
$RetentionDays = 90

# 创建归档目录
if (-not (Test-Path $ArchiveDir)) {
    New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "日志清理脚本开始执行" -ForegroundColor Cyan
Write-Host "执行时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "日志目录: $LogDir" -ForegroundColor Cyan
Write-Host "保留天数: $RetentionDays 天" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 统计清理前的日志文件数量和大小
$BeforeFiles = Get-ChildItem -Path $LogDir -Filter "*.log*" -File -ErrorAction SilentlyContinue
$BeforeCount = $BeforeFiles.Count
$BeforeSize = ($BeforeFiles | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "清理前: $BeforeCount 个日志文件, 总大小: $([math]::Round($BeforeSize, 2)) MB" -ForegroundColor Yellow

# 查找并删除 3 个月前的日志文件
$CutoffDate = (Get-Date).AddDays(-$RetentionDays)
$OldFiles = Get-ChildItem -Path $LogDir -Filter "*.log*" -File -ErrorAction SilentlyContinue | 
    Where-Object { $_.LastWriteTime -lt $CutoffDate -and $_.Name -match '\.(log\.\d+|log\.gz)$' }

$DeletedCount = 0
foreach ($file in $OldFiles) {
    Write-Host "删除: $($file.Name) (最后修改: $($file.LastWriteTime))" -ForegroundColor Gray
    Remove-Item $file.FullName -Force
    $DeletedCount++
}

# 统计清理后的日志文件数量和大小
$AfterFiles = Get-ChildItem -Path $LogDir -Filter "*.log*" -File -ErrorAction SilentlyContinue
$AfterCount = $AfterFiles.Count
$AfterSize = ($AfterFiles | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "清理后: $AfterCount 个日志文件, 总大小: $([math]::Round($AfterSize, 2)) MB" -ForegroundColor Green
Write-Host "已删除: $DeletedCount 个日志文件" -ForegroundColor Green

# 压缩旧日志文件（可选，节省空间）
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "压缩旧日志文件..." -ForegroundColor Cyan

$CompressCutoffDate = (Get-Date).AddDays(-7)
$FilesToCompress = Get-ChildItem -Path $LogDir -Filter "*.log.*" -File -ErrorAction SilentlyContinue | 
    Where-Object { $_.LastWriteTime -lt $CompressCutoffDate -and $_.Extension -ne ".gz" }

$CompressedCount = 0
foreach ($file in $FilesToCompress) {
    try {
        $gzipPath = "$($file.FullName).gz"
        $inputStream = [System.IO.File]::OpenRead($file.FullName)
        $outputStream = [System.IO.File]::Create($gzipPath)
        $gzipStream = New-Object System.IO.Compression.GZipStream($outputStream, [System.IO.Compression.CompressionMode]::Compress)
        
        $inputStream.CopyTo($gzipStream)
        
        $gzipStream.Close()
        $outputStream.Close()
        $inputStream.Close()
        
        Remove-Item $file.FullName -Force
        Write-Host "压缩: $($file.Name) -> $($file.Name).gz" -ForegroundColor Gray
        $CompressedCount++
    }
    catch {
        Write-Host "压缩失败: $($file.Name) - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "已压缩: $CompressedCount 个日志文件" -ForegroundColor Green

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "日志清理完成" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 记录清理日志
$CleanupLog = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - 清理前: $BeforeCount 文件 ($([math]::Round($BeforeSize, 2)) MB), 清理后: $AfterCount 文件 ($([math]::Round($AfterSize, 2)) MB), 删除: $DeletedCount 文件"
Add-Content -Path "$LogDir\cleanup.log" -Value $CleanupLog
