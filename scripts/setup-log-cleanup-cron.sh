#!/bin/bash

###############################################################################
# 设置日志清理定时任务（Linux/macOS）
# 功能：配置 crontab 定时执行日志清理脚本
# 使用方法：./scripts/setup-log-cleanup-cron.sh
###############################################################################

# 获取项目根目录的绝对路径
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT_PATH="$PROJECT_ROOT/scripts/clean-logs.sh"

echo "=========================================="
echo "设置日志清理定时任务"
echo "项目路径: $PROJECT_ROOT"
echo "脚本路径: $SCRIPT_PATH"
echo "=========================================="

# 检查脚本是否存在
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "错误: 清理脚本不存在: $SCRIPT_PATH"
    exit 1
fi

# 赋予执行权限
chmod +x "$SCRIPT_PATH"
echo "✓ 已赋予脚本执行权限"

# 定时任务配置
# 每月 1 号凌晨 2 点执行
CRON_SCHEDULE="0 2 1 * *"
CRON_COMMAND="cd $PROJECT_ROOT && $SCRIPT_PATH >> $PROJECT_ROOT/backend/logs/cleanup.log 2>&1"
CRON_ENTRY="$CRON_SCHEDULE $CRON_COMMAND"

# 检查是否已存在相同的定时任务
if crontab -l 2>/dev/null | grep -q "$SCRIPT_PATH"; then
    echo "⚠ 定时任务已存在，跳过添加"
    echo ""
    echo "当前定时任务："
    crontab -l | grep "$SCRIPT_PATH"
else
    # 添加定时任务
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo "✓ 定时任务添加成功"
    echo ""
    echo "定时任务配置："
    echo "  时间: 每月 1 号凌晨 2:00"
    echo "  命令: $CRON_COMMAND"
fi

echo ""
echo "=========================================="
echo "查看当前所有定时任务："
echo "=========================================="
crontab -l

echo ""
echo "=========================================="
echo "管理定时任务："
echo "  - 查看: crontab -l"
echo "  - 编辑: crontab -e"
echo "  - 删除: crontab -r"
echo "  - 手动执行: $SCRIPT_PATH"
echo "=========================================="
