import os
import random
import time
from locust import between, task
from common import BaseHttpUser, BASE_PATH, OK_POST_CODES, random_text, extract_data

class AIMessageUser(BaseHttpUser):
    weight = 15
    wait_time = between(0.5, 1)

    def on_start(self):
        self.player_id = f"stress_{random.randint(1000, 9999)}"
        self.sid = os.getenv("AI_SESSION_ID") or None
        setup_prob = float(os.getenv("AI_SETUP_PROB", "0.05"))
        if self.sid:
            return
        if random.random() > setup_prob:
            return
        time.sleep(random.uniform(0, 1.5))
        gid = self.get_any_game_id()
        iid = self.get_any_issue_type_id()
        if not gid or not iid:
            return
        t = self.client.post(
            f"{BASE_PATH}/tickets",
            json={"gameId": gid, "playerIdOrName": self.player_id, "description": "stress", "issueTypeIds": [iid]},
            name="ai_setup_ticket",
        )
        if t.status_code in OK_POST_CODES:
            tid = extract_data(t).get("id")
            s = self.client.post(f"{BASE_PATH}/sessions", json={"ticketId": tid}, name="ai_setup_session")
            if s.status_code in OK_POST_CODES:
                self.sid = extract_data(s).get("id")

    @task
    def rapid_send(self):
        if not self.sid:
            return
        self.client.post(
            f"{BASE_PATH}/messages",
            json={"sessionId": self.sid, "content": random_text("stress")},
            name="ai_send_msg",
        )
