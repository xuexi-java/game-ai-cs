#!/bin/bash
# 启动脚本 - 带日志分流
# 用于开发/测试环境手动启动

set -e

# 进入后端目录
cd "$(dirname "$0")/../backend"

# 创建日志目录
mkdir -p logs

# 设置环境变量
export NODE_ENV=${NODE_ENV:-production}
export LOG_LEVEL=${LOG_LEVEL:-INFO}

echo "🚀 启动后端服务..."
echo "   NODE_ENV: $NODE_ENV"
echo "   LOG_LEVEL: $LOG_LEVEL"
echo "   日志目录: ./logs"
echo ""

# 启动应用，分流日志
# stdout (INFO/WARN) -> access.log
# stderr (ERROR) -> error.log
node dist/main.js \
  > >(tee -a logs/access.log) \
  2> >(tee -a logs/error.log >&2)
