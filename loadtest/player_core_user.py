import random
from locust import between, task
from common import BaseHttpUser, BASE_PATH, ENV_PLAYER_NAME, OK_POST_CODES, random_text, extract_data

class PlayerCoreUser(BaseHttpUser):
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
        res = self.client.post(
            f"{BASE_PATH}/tickets",
            json={
                "gameId": gid,
                "playerIdOrName": self.player_id,
                "description": random_text("desc"),
                "issueTypeIds": [iid],
            },
            name="player_core_create_ticket",
        )
        if res.status_code not in OK_POST_CODES:
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
            name="player_core_create_session",
        )
        if res.status_code not in OK_POST_CODES:
            return None
        data = extract_data(res) or {}
        self.session_id = data.get("id") if isinstance(data, dict) else None
        return self.session_id

    @task(3)
    def send_message(self):
        if not self.session_id:
            self.create_session()
        if not self.session_id:
            return
        self.client.post(
            f"{BASE_PATH}/messages",
            json={"sessionId": self.session_id, "content": random_text("ask")},
            name="player_core_send_msg",
        )

    @task(2)
    def create_session_task(self):
        self.create_session()

