import random
from locust import between, task
from common import BaseHttpUser, BASE_PATH, ENV_PLAYER_NAME, OK_POST_CODES, extract_data, random_text

class PlayerQueryUser(BaseHttpUser):
    weight = 10
    wait_time = between(2, 5)

    def on_start(self):
        self.player_id = ENV_PLAYER_NAME or f"player_{random.randint(1000, 9999)}"
        self.session_id = None
        gid = self.get_any_game_id()
        iid = self.get_any_issue_type_id()
        if not gid or not iid:
            return
        t = self.client.post(
            f"{BASE_PATH}/tickets",
            json={"gameId": gid, "playerIdOrName": self.player_id, "description": random_text("q"), "issueTypeIds": [iid]},
            name="player_query_setup_ticket",
        )
        if t.status_code in OK_POST_CODES:
            tid = extract_data(t).get("id")
            s = self.client.post(f"{BASE_PATH}/sessions", json={"ticketId": tid}, name="player_query_setup_session")
            if s.status_code in OK_POST_CODES:
                self.session_id = extract_data(s).get("id")

    @task(2)
    def poll_msgs(self):
        if not self.session_id:
            return
        self.client.get(
            f"{BASE_PATH}/messages/session/{self.session_id}",
            name="player_query_poll_msgs",
        )

    @task(1)
    def session_detail(self):
        if not self.session_id:
            return
        self.client.get(
            f"{BASE_PATH}/sessions/{self.session_id}",
            name="player_query_session_detail",
        )

