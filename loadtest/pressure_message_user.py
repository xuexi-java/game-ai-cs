import os
import random
from locust import between, task
from common import BaseHttpUser, BASE_PATH, OK_POST_CODES, random_text, extract_data

class PressureMessageUser(BaseHttpUser):
    wait_time = between(0.3, 0.8)

    def on_start(self):
        self.sid = os.getenv("AI_SESSION_ID") or None
        prob = float(os.getenv("PRESSURE_SETUP_PROB", "0.02"))
        if self.sid:
            return
        if random.random() > prob:
            return
        gid = self.get_any_game_id()
        iid = self.get_any_issue_type_id()
        if not gid or not iid:
            return
        t = self.client.post(
            f"{BASE_PATH}/tickets",
            json={"gameId": gid, "playerIdOrName": f"p_{random.randint(1000,9999)}", "description": "pressure", "issueTypeIds": [iid]},
            name="pressure_setup_ticket",
        )
        if t.status_code in OK_POST_CODES:
            tid = extract_data(t).get("id")
            s = self.client.post(
                f"{BASE_PATH}/sessions",
                json={"ticketId": tid},
                name="pressure_setup_session",
            )
            if s.status_code in OK_POST_CODES:
                self.sid = extract_data(s).get("id")

    @task
    def send_core_message(self):
        if not self.sid:
            return
        self.client.post(
            f"{BASE_PATH}/sessions/{self.sid}/messages",
            json={"content": random_text("core"), "messageType": "TEXT"},
            name="pressure_send_message",
        )

