import random
from locust import between, task
from common import BaseHttpUser, BASE_PATH, ENV_PLAYER_NAME, OK_POST_CODES, random_text, extract_data

class PlayerUser(BaseHttpUser):
    weight = 60
    wait_time = between(2, 5)

    def on_start(self):
        self.player_id = ENV_PLAYER_NAME or f"player_{random.randint(1000, 9999)}"
        self.session_id = None
        self.ticket_id = None

    def create_ticket(self):
        gid = self.get_any_game_id()
        iid = self.get_any_issue_type_id()
        if not gid or not iid:
            return None
        payload = {
            "gameId": gid,
            "playerIdOrName": self.player_id,
            "description": random_text("desc"),
            "issueTypeIds": [iid],
        }
        res = self.client.post(f"{BASE_PATH}/tickets", json=payload, name="player_create_ticket")
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_ticket", res)
            return None
        data = extract_data(res) or {}
        self.ticket_id = data.get("id") if isinstance(data, dict) else None
        return self.ticket_id

    def create_session(self):
        if not self.ticket_id:
            self.ticket_id = self.create_ticket()
        if not self.ticket_id:
            return None
        res = self.client.post(
            f"{BASE_PATH}/sessions",
            json={"ticketId": self.ticket_id},
            name="player_create_session",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_session", res)
            return None
        data = extract_data(res) or {}
        self.session_id = data.get("id") if isinstance(data, dict) else None
        return self.session_id

    # 核心业务吞吐测试
    @task(3)
    def send_message(self):
        if not self.session_id:
            self.create_session()
        if not self.session_id:
            return
        self.client.post(
            f"{BASE_PATH}/messages",
            json={"sessionId": self.session_id, "content": random_text("ask")},
            name="player_send_msg",
        )
        # 简单轮询一次，确保读负载被覆盖
        res = self.client.get(
            f"{BASE_PATH}/messages/session/{self.session_id}",
            name="player_poll_msgs",
        )
        if res.status_code != 200:
            self.record_failure("player_poll_msgs", res)

    # 核心业务吞吐测试
    @task(2)
    def create_session_task(self):
        self.create_session()

    # 查询类（低权重）
    @task(1)
    def list_messages(self):
        if not self.session_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/messages/session/{self.session_id}",
            name="player_list_messages",
        )
        if res.status_code != 200:
            self.record_failure("player_list_messages", res)

    # 查询类（低权重）
    @task(1)
    def session_detail(self):
        if not self.session_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/sessions/{self.session_id}",
            name="player_session_detail",
        )
        if res.status_code != 200:
            self.record_failure("player_session_detail", res)

    # 边缘能力（已禁用 - 翻译功能）
    @task(0)
    def translate_message(self):
        return

    # 注意：player 端不应调用 /metrics 接口（仅管理端可用）
    # 已移除 player_metrics 任务
