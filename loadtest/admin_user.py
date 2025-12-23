import random
from locust import between, task
from common import BaseHttpUser, BASE_PATH, random_text, extract_data

class AdminUser(BaseHttpUser):
    weight = 5
    wait_time = between(3, 6)

    def on_start(self):
        self.login_admin()

    @task(3)
    def dashboard(self):
        if not self.headers:
            if not self.login_admin():
                return
        self.client.get(f"{BASE_PATH}/tickets", headers=self.headers, name="admin_tickets")
        self.client.get(f"{BASE_PATH}/sessions", headers=self.headers, name="admin_sessions")

    @task(1)
    def reply_any(self):
        if not self.headers:
            return
        res = self.client.get(f"{BASE_PATH}/sessions", headers=self.headers, name="admin_sessions_pick")
        if res.status_code != 200:
            self.record_failure("admin_sessions_pick", res)
            return
        sessions = extract_data(res) or []
        if not isinstance(sessions, list) or not sessions:
            return
        target = random.choice(sessions)
        sid = target.get("id") if isinstance(target, dict) else None
        if not sid:
            return
        self.client.post(
            f"{BASE_PATH}/sessions/{sid}/join",
            headers=self.headers,
            name="admin_join_session",
        )
        self.client.post(
            f"{BASE_PATH}/messages/agent",
            json={"sessionId": sid, "content": random_text("reply")},
            headers=self.headers,
            name="admin_send_agent_msg",
        )
        self.client.patch(
            f"{BASE_PATH}/sessions/{sid}/close",
            headers=self.headers,
            name="admin_close_session",
        )

