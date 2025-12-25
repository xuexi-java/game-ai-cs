"""
Game-AI 客服系统 - 压力测试入口

使用方式:
  # 基础测试 (10 用户, 2分钟)
  locust -f loadtest/locustfile.py --host=http://localhost:21101 -u 10 -r 2 -t 2m --headless

  # Web UI 模式
  locust -f loadtest/locustfile.py --host=http://localhost:21101

  # 压力测试 (100 用户, 10分钟)
  locust -f loadtest/locustfile.py --host=http://localhost:21101 -u 100 -r 10 -t 10m --headless

  # 峰值测试 (500 用户)
  locust -f loadtest/locustfile.py --host=http://localhost:21101 -u 500 -r 50 -t 5m --headless

环境变量:
  ADMIN_USER    - 管理员用户名 (默认: admin)
  ADMIN_PASS    - 管理员密码 (默认: admin123)
  GAME_ID       - 指定游戏ID (可选)
  ISSUE_TYPE_ID - 指定问题类型ID (可选)
  PLAYER_NAME   - 玩家名称前缀 (可选)

用户类权重分配:
  PlayerUser     - 60% (玩家核心业务流)
  AIMessageUser  - 15% (AI消息高并发)
  WsUser         - 15% (WebSocket长连接)
  AdminUser      - 10% (管理端操作)
"""

# 导入所有用户类，Locust 会自动识别
from player_user import PlayerUser
from ai_message_user import AIMessageUser
from ws_user import WsUser
from admin_user import AdminUser

# 如果需要单独测试某个用户类，可以注释其他导入
# 例如只测试玩家流程:
# from player_user import PlayerUser
