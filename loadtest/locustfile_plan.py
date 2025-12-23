import os
import random
import string
import time
from typing import Any, Dict, Optional, Sequence

import socketio
import gevent
from locust import HttpUser, User, between, task, events

BASE_PATH = os.getenv("BASE_PATH", "/api/v1")
ENV_GAME_ID = os.getenv("GAME_ID")
ENV_PLAYER_NAME = os.getenv("PLAYER_NAME")
ENV_ISSUE_TYPE_ID = os.getenv("ISSUE_TYPE_ID")
ADMIN_CREDENTIAL = {
    "username": os.getenv("ADMIN_USER", "admin"),
    "password": os.getenv("ADMIN_PASS", "admin123"),
}

WEIGHT_PLAYER = 60
WEIGHT_AI_MSG = 15
WEIGHT_WS = 15
WEIGHT_ADMIN = 5
WEIGHT_AUTH = 5

OK_POST_CODES: Sequence[int] = (200, 201, 204)

def random_text(prefix: str = "msg", n: int = 6) -> str:
    s = "".join(random.choices(string.ascii_letters + string.digits, k=n))
    return f"{prefix}-{s}"

def extract_data(res) -> Optional[Any]:
    try:
        payload = res.json()
    except Exception:
        return None
    if isinstance(payload, dict) and "data" in payload:
        return payload.get("data")
    return payload

class BaseHttpUser(HttpUser):
    abstract = True
    token: Optional[str] = None
    headers: Optional[Dict[str, str]] = None

    def record_failure(self, name: str, res):
        if getattr(res, "status_code", None) in (401, 429):
            return
        elapsed_ms = (
            res.elapsed.total_seconds() * 1000 if getattr(res, "elapsed", None) else 0
        )
        response_text = getattr(res, "text", "") or ""
        self.environment.events.request.fire(
            request_type="HTTP",
            name=name,
            response_time=elapsed_ms,
            response_length=len(response_text),
            exception=Exception(f"{res.status_code} {response_text}"),
        )

    def login_admin(self) -> bool:
        res = self.client.post(f"{BASE_PATH}/auth/login", json=ADMIN_CREDENTIAL, name="auth_login")
        if res.status_code != 200:
            self.record_failure("auth_login", res)
            return False
        data = extract_data(res) or {}
        token = data.get("accessToken")
        if not token:
            return False
        self.token = token
        self.headers = {"Authorization": f"Bearer {token}"}
        return True

    def logout_admin(self):
        if not self.headers:
            return
        self.client.post(f"{BASE_PATH}/auth/logout", headers=self.headers, name="auth_logout")
        self.token = None
        self.headers = None

    def get_any_issue_type_id(self) -> Optional[str]:
        if ENV_ISSUE_TYPE_ID:
            return ENV_ISSUE_TYPE_ID
        cached = getattr(self, "_issue_type_id", None)
        if cached:
            return cached
        res = self.client.get(f"{BASE_PATH}/issue-types", name="issue_types_enabled")
        if res.status_code != 200:
            self.record_failure("issue_types_enabled", res)
            return None
        types = extract_data(res) or []
        if isinstance(types, list) and types:
            t = types[0]
            v = t.get("id") if isinstance(t, dict) else None
            if v:
                setattr(self, "_issue_type_id", v)
                return v
        return None

    def get_any_game_id(self) -> Optional[str]:
        if ENV_GAME_ID:
            return ENV_GAME_ID
        cached = getattr(self, "_game_id", None)
        if cached:
            return cached
        res = self.client.get(f"{BASE_PATH}/games/enabled", name="games_enabled")
        if res.status_code != 200:
            self.record_failure("games_enabled", res)
            return None
        games = extract_data(res) or []
        if isinstance(games, list) and games:
            g = games[0]
            v = g.get("id") if isinstance(g, dict) else None
            if v:
                setattr(self, "_game_id", v)
                return v
        return None

class AuthUser(BaseHttpUser):
    weight = WEIGHT_AUTH
    wait_time = between(5, 10)

    @task
    def login_logout(self):
        if not self.login_admin():
            return
        self.logout_admin()

class PlayerUser(BaseHttpUser):
    weight = WEIGHT_PLAYER
    wait_time = between(2, 5)

    def on_start(self):
        self.player_id = ENV_PLAYER_NAME or f"player_{random.randint(1000, 9999)}"

    def create_ticket(self) -> Optional[str]:
        game_id = self.get_any_game_id()
        issue_type_id = self.get_any_issue_type_id()
        if not game_id or not issue_type_id:
            return None
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id,
            "description": random_text("desc"),
            "issueTypeIds": [issue_type_id],
        }
        res = self.client.post(f"{BASE_PATH}/tickets", json=payload, name="player_create_ticket")
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_ticket", res)
            return None
        data = extract_data(res) or {}
        return data.get("id") if isinstance(data, dict) else None

    def create_session(self, ticket_id: str) -> Optional[str]:
        res = self.client.post(f"{BASE_PATH}/sessions", json={"ticketId": ticket_id}, name="player_create_session")
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_session", res)
            return None
        data = extract_data(res) or {}
        return data.get("id") if isinstance(data, dict) else None

    @task
    def full_flow(self):
        tid = self.create_ticket()
        if not tid:
            return
        sid = self.create_session(tid)
        if not sid:
            return
        self.client.post(
            f"{BASE_PATH}/messages",
            json={"sessionId": sid, "content": random_text("ask")},
            name="player_send_msg",
        )
        for _ in range(5):
            time.sleep(1)
            res = self.client.get(f"{BASE_PATH}/messages/session/{sid}", name="player_poll_msgs")
            if res.status_code == 200:
                msgs = extract_data(res) or []
                if isinstance(msgs, list) and len(msgs) > 1:
                    break
        self.client.get(f"{BASE_PATH}/sessions/{sid}", name="player_session_detail")

class AIMessageUser(BaseHttpUser):
    weight = WEIGHT_AI_MSG
    wait_time = between(0.5, 1)

    def on_start(self):
        self.player_id = f"stress_{random.randint(1000, 9999)}"
        self.sid = None
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

class WsUser(User):
    weight = WEIGHT_WS
    wait_time = between(10, 30)

    def on_start(self):
        self.ws_host = self.environment.host or "http://localhost:3000"
        self.sio = socketio.Client()

        @self.sio.event
        def connect():
            events.request.fire(request_type="WS", name="ws_connect", response_time=0, response_length=0)

        @self.sio.event
        def connect_error(data):
            events.request.fire(request_type="WS", name="ws_connect_error", response_time=0, response_length=0, exception=Exception(str(data)))

    @task
    def keepalive(self):
        try:
            self.sio.connect(self.ws_host, transports=["websocket", "polling"]) 
            self.sio.emit("ping")
            gevent.sleep(random.randint(10, 20))
            self.sio.disconnect()
        except Exception as e:
            events.request.fire(request_type="WS", name="ws_fail", response_time=0, response_length=0, exception=e)

class AdminUser(BaseHttpUser):
    weight = WEIGHT_ADMIN
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

