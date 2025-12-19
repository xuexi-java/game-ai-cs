#!/bin/bash

###############################################################################
# 日志清理脚本
# 功能：删除 3 个月前的日志文件
# 使用方法：
#   - 手动执行：./scripts/clean-logs.sh
#   - 定时任务：crontab -e 添加 0 2 1 * * /path/to/scripts/clean-logs.sh
###############################################################################

# 设置日志目录
LOG_DIR="./backend/logs"
ARCHIVE_DIR="./backend/logs/archive"

# 设置保留天数（3个月 = 90天）
RETENTION_DAYS=90

# 创建归档目录
mkdir -p "$ARCHIVE_DIR"

echo "=========================================="
echo "日志清理脚本开始执行"
echo "执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "日志目录: $LOG_DIR"
echo "保留天数: $RETENTION_DAYS 天"
echo "=========================================="

# 统计清理前的日志文件数量和大小
BEFORE_COUNT=$(find "$LOG_DIR" -maxdepth 1 -type f -name "*.log*" | wc -l)
BEFORE_SIZE=$(du -sh "$LOG_DIR" | cut -f1)

echo "清理前: $BEFORE_COUNT 个日志文件, 总大小: $BEFORE_SIZE"

# 查找并删除 3 个月前的日志文件
# 支持的文件格式：*.log, *.log.1, *.log.2, *.log.gz 等
find "$LOG_DIR" -maxdepth 1 -type f \( -name "*.log.*" -o -name "*.log.gz" \) -mtime +$RETENTION_DAYS -print -delete

# 统计清理后的日志文件数量和大小
AFTER_COUNT=$(find "$LOG_DIR" -maxdepth 1 -type f -name "*.log*" | wc -l)
AFTER_SIZE=$(du -sh "$LOG_DIR" | cut -f1)
DELETED_COUNT=$((BEFORE_COUNT - AFTER_COUNT))

echo "清理后: $AFTER_COUNT 个日志文件, 总大小: $AFTER_SIZE"
echo "已删除: $DELETED_COUNT 个日志文件"

# 压缩当前日志文件（可选，节省空间）
# 注意：只压缩非当前使用的日志文件
echo "=========================================="
echo "压缩旧日志文件..."

# 查找 7 天前的 .log.* 文件并压缩
find "$LOG_DIR" -maxdepth 1 -type f -name "*.log.*" ! -name "*.gz" -mtime +7 -exec gzip {} \;

COMPRESSED_COUNT=$(find "$LOG_DIR" -maxdepth 1 -type f -name "*.log.*.gz" -mtime -1 | wc -l)
echo "已压缩: $COMPRESSED_COUNT 个日志文件"

echo "=========================================="
echo "日志清理完成"
echo "=========================================="

# 记录清理日志
echo "$(date '+%Y-%m-%d %H:%M:%S') - 清理前: $BEFORE_COUNT 文件 ($BEFORE_SIZE), 清理后: $AFTER_COUNT 文件 ($AFTER_SIZE), 删除: $DELETED_COUNT 文件" >> "$LOG_DIR/cleanup.log"
