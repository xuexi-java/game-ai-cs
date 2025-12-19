/**
 * PM2 配置文件
 * 用于生产环境部署和日志管理
 * 
 * 使用方法：
 * - 启动：pm2 start ecosystem.config.js
 * - 查看日志：pm2 logs game-ai-backend
 * - 重启：pm2 restart game-ai-backend
 * - 停止：pm2 stop game-ai-backend
 */
module.exports = {
  apps: [{
    name: 'game-ai-backend',
    script: 'dist/main.js',
    instances: 1,
    exec_mode: 'cluster',
    
    // 环境变量
    env: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'INFO',
      PORT: 21101,
    },
    
    // 日志配置
    out_file: './logs/access.log',  // stdout -> access.log (INFO/WARN)
    error_file: './logs/error.log', // stderr -> error.log (ERROR)
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    
    // 日志轮转（自动按大小轮转）
    // 单个日志文件最大 100MB，保留最近 10 个文件
    // 超过 100MB 自动创建 .log.1, .log.2 等
    max_size: '100M',
    max_files: 10,
    
    // 日志归档（配合定时清理脚本）
    // 定时任务会删除 3 个月前的 .log.* 文件
    // 详见：scripts/clean-logs.sh 或 scripts/clean-logs.ps1
    
    // 自动重启
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // 监控
    watch: false,
    ignore_watch: ['node_modules', 'logs', 'uploads'],
  }]
};
