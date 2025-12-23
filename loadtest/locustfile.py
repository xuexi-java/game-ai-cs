"""
Locust load test for game-ai-cs

Usage:
  locust -f loadtest/locustfile.py --host=http://localhost:21101

Notes:
- BASE_PATH controls the API prefix; defaults to /api/v1.
- PLAYER_USER/PLAYER_PASS and ADMIN_USER/ADMIN_PASS can be set via env vars.
- Responses are expected to be wrapped by TransformInterceptor:
    {"success": true, "data": {...}, "timestamp": "..."}
"""

import os
import random
import string
from typing import Any, Dict, Optional, Sequence

from locust import HttpUser, between, task

BASE_PATH = os.getenv("BASE_PATH", "/api/v1")
ENV_GAME_ID = os.getenv("GAME_ID")
ENV_PLAYER_NAME = os.getenv("PLAYER_NAME")
ENV_ISSUE_TYPE_ID = os.getenv("ISSUE_TYPE_ID")
PREFERRED_GAMES = ["神曲", "弹弹堂"]
PREFERRED_ISSUE_TYPES = ["游戏玩法咨询", "好友/社交问题", "其他问题", "实名认证问题", "活动奖励问题"]
PLAYER_CREDENTIAL = {
    "username": os.getenv("PLAYER_USER", "player1"),
    "password": os.getenv("PLAYER_PASS", "player123"),
}
ADMIN_CREDENTIAL = {
    "username": os.getenv("ADMIN_USER", "admin"),
    "password": os.getenv("ADMIN_PASS", "admin123"),
}

# Accept both 200/201/204 for success
OK_POST_CODES: Sequence[int] = (200, 201, 204)


def random_text(prefix: str = "msg", n: int = 6) -> str:
    suffix = "".join(random.choices(string.ascii_letters + string.digits, k=n))
    return f"{prefix}-{suffix}"


def extract_data(res) -> Optional[Any]:
    try:
        payload = res.json()
    except Exception:
        return None
    if isinstance(payload, dict) and "data" in payload:
        return payload.get("data")
    return payload


class BaseUser(HttpUser):
    wait_time = between(1, 3)
    abstract = True
    token: Optional[str] = None
    headers: Optional[Dict[str, str]] = None

    def on_start(self):
        self.login()

    def login(self):
        raise NotImplementedError

    def record_failure(self, name: str, res):
        if self.is_throttle(res) or self.is_unauthorized(res):
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

    def is_throttle(self, res) -> bool:
        return getattr(res, "status_code", None) == 429

    def is_unauthorized(self, res) -> bool:
        return getattr(res, "status_code", None) == 401

    def get_any_issue_type_id(self, cache_attr: str) -> Optional[str]:
        # 优先使用环境变量
        if ENV_ISSUE_TYPE_ID:
            return ENV_ISSUE_TYPE_ID
        cached = getattr(self, cache_attr, None)
        if cached:
            return cached
        res = self.client.get(
            f"{BASE_PATH}/issue-types",
            headers=self.headers,
            name="common_issue_types",
        )
        if res.status_code != 200:
            if not self.is_unauthorized(res) and not self.is_throttle(res):
                self.record_failure("common_issue_types", res)
            return None
        issue_types = extract_data(res) or []
        if not isinstance(issue_types, list) or not issue_types:
            return None
        issue_type_id = None
        for name in PREFERRED_ISSUE_TYPES:
            match = next(
                (
                    item
                    for item in issue_types
                    if isinstance(item, dict) and item.get("name") == name
                ),
                None,
            )
            if match and match.get("id"):
                issue_type_id = match["id"]
                break
        if not issue_type_id:
            first = issue_types[0]
            issue_type_id = first.get("id") if isinstance(first, dict) else None
        if issue_type_id:
            setattr(self, cache_attr, issue_type_id)
        return issue_type_id

    def get_any_game_id(self, cache_attr: str) -> Optional[str]:
        # 优先使用环境变量
        if ENV_GAME_ID:
            return ENV_GAME_ID
        cached = getattr(self, cache_attr, None)
        if cached:
            return cached
        if not self.headers:
            return None
        res = self.client.get(
            f"{BASE_PATH}/games",
            headers=self.headers,
            name="common_games",
        )
        if res.status_code != 200:
            if not self.is_unauthorized(res) and not self.is_throttle(res):
                self.record_failure("common_games", res)
            return None
        games = extract_data(res) or []
        if not isinstance(games, list) or not games:
            return None
        game_id = None
        for name in PREFERRED_GAMES:
            match = next(
                (item for item in games if isinstance(item, dict) and item.get("name") == name),
                None,
            )
            if match and match.get("id"):
                game_id = match["id"]
                break
        if not game_id:
            first = games[0]
            game_id = first.get("id") if isinstance(first, dict) else None
        if game_id:
            setattr(self, cache_attr, game_id)
        return game_id


class PlayerUser(BaseUser):
    weight = 3
    player_game_id = ENV_GAME_ID  # 未配置则运行时依赖接口获取
    player_id_or_name = ENV_PLAYER_NAME or "player-demo"

    def login(self):
        res = self.client.post(
            f"{BASE_PATH}/auth/login",
            json=PLAYER_CREDENTIAL,
            name="player_login",
        )
        if res.status_code != 200:
            self.record_failure("player_login", res)
            return
        data = extract_data(res) or {}
        token = data.get("accessToken")
        if not token:
            self.record_failure("player_login_no_token", res)
            return
        self.token = token
        self.headers = {"Authorization": f"Bearer {token}"}

    def create_ticket_and_return_id(self) -> Optional[str]:
        issue_type_id = self.get_any_issue_type_id("_player_issue_type_id")
        if not issue_type_id:
            return None
        game_id = self.get_any_game_id("_player_game_id") or self.player_game_id
        if not game_id:
            return None
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
            "description": random_text("desc"),
            "issueTypeIds": [issue_type_id],
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets",
            json=payload,
            headers=self.headers,
            name="player_create_ticket_auto",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_ticket_auto", res)
            return None
        data = extract_data(res) or {}
        return data.get("id") if isinstance(data, dict) else None

    def get_random_session_id(self) -> Optional[str]:
        cached = getattr(self, "_cached_player_session", None)
        if cached:
            return cached
        res = self.client.get(
            f"{BASE_PATH}/sessions",
            headers=self.headers,
            name="player_list_sessions",
        )
        if res.status_code != 200:
            if not self.is_throttle(res):
                self.record_failure("player_list_sessions", res)
            return None
        sessions = extract_data(res) or []
        if not isinstance(sessions, list) or not sessions:
            return None
        candidate = random.choice(sessions)
        session_id = candidate.get("id") if isinstance(candidate, dict) else None
        if session_id:
            setattr(self, "_cached_player_session", session_id)
        return session_id

    def get_any_ticket_id(self) -> Optional[str]:
        res = self.client.get(
            f"{BASE_PATH}/tickets",
            headers=self.headers,
            name="player_list_tickets_for_detail",
        )
        if res.status_code != 200:
            self.record_failure("player_list_tickets_for_detail", res)
            return None
        tickets = extract_data(res) or []
        if not isinstance(tickets, list) or not tickets:
            return self.create_ticket_and_return_id()
        first = tickets[0]
        return first.get("id") if isinstance(first, dict) else None

    def create_session_and_return_id(self) -> Optional[str]:
        ticket_id = self.get_any_ticket_id()
        if not ticket_id:
            return None
        res = self.client.post(
            f"{BASE_PATH}/sessions",
            json={"ticketId": ticket_id},
            headers=self.headers,
            name="player_create_session",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_session", res)
            return None
        data = extract_data(res) or {}
        return data.get("id") if isinstance(data, dict) else None

    @task(3)
    def send_message(self):
        session_id = self.get_random_session_id() or self.create_session_and_return_id()
        if not session_id:
            return
        payload = {"text": random_text("player"), "sessionId": session_id}
        res = self.client.post(
            f"{BASE_PATH}/messages",
            json=payload,
            headers=self.headers,
            name="player_send_message",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_send_message", res)

    @task(1)
    def create_ticket(self):
        issue_type_id = self.get_any_issue_type_id("_player_issue_type_id")
        if not issue_type_id:
            return
        game_id = self.get_any_game_id("_player_game_id") or self.player_game_id
        if not game_id:
            return
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
            "description": random_text("desc"),
            "issueTypeIds": [issue_type_id],
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets",
            json=payload,
            headers=self.headers,
            name="player_create_ticket",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_create_ticket", res)

    @task(1)
    def list_sessions_task(self):
        _ = self.get_random_session_id()

    @task(1)
    def list_messages(self):
        session_id = self.get_random_session_id()
        if not session_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/messages/session/{session_id}",
            headers=self.headers,
            name="player_list_messages",
        )
        if res.status_code not in (200, 204):
            self.record_failure("player_list_messages", res)

    @task(1)
    def translate_message(self):
        session_id = self.get_random_session_id()
        if not session_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/messages/session/{session_id}",
            headers=self.headers,
            name="player_list_messages_for_translate",
        )
        if res.status_code != 200:
            return
        msgs = extract_data(res) or []
        if not isinstance(msgs, list) or not msgs:
            return
        first = msgs[0]
        msg_id = first.get("id") if isinstance(first, dict) else None
        if not msg_id:
            return
        res = self.client.post(
            f"{BASE_PATH}/messages/{msg_id}/translate",
            json={"targetLang": "en"},
            headers=self.headers,
            name="player_translate_message",
        )
        if res.status_code not in (200, 204):
            self.record_failure("player_translate_message", res)

    @task(1)
    def list_tickets(self):
        res = self.client.get(
            f"{BASE_PATH}/tickets",
            headers=self.headers,
            name="player_list_tickets",
        )
        if res.status_code != 200:
            self.record_failure("player_list_tickets", res)

    @task(1)
    def ticket_detail(self):
        ticket_id = self.get_any_ticket_id()
        if not ticket_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/tickets/{ticket_id}",
            headers=self.headers,
            name="player_ticket_detail",
        )
        if res.status_code != 200:
            self.record_failure("player_ticket_detail", res)

    @task(1)
    def dashboard_metrics(self):
        res = self.client.get(
            f"{BASE_PATH}/metrics",
            headers=self.headers,
            name="player_metrics",
        )
        if res.status_code not in (200, 204):
            self.record_failure("player_metrics", res)

    @task(1)
    def check_open_ticket(self):
        game_id = self.get_any_game_id("_player_game_id") or self.player_game_id
        if not game_id:
            return
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets/check-open",
            json=payload,
            headers=self.headers,
            name="player_check_open_ticket",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_check_open_ticket", res)

    @task(1)
    def check_open_by_issue_type(self):
        issue_type_id = self.get_any_issue_type_id("_player_issue_type_id")
        if not issue_type_id:
            return
        game_id = self.get_any_game_id("_player_game_id") or self.player_game_id
        if not game_id:
            return
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
            "issueTypeId": issue_type_id,
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets/check-open-by-issue-type",
            json=payload,
            headers=self.headers,
            name="player_check_open_by_issue_type",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_check_open_by_issue_type", res)

    @task(1)
    def query_open_tickets(self):
        game_id = self.get_any_game_id("_player_game_id") or self.player_game_id
        if not game_id:
            return
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets/query-open-tickets",
            json=payload,
            headers=self.headers,
            name="player_query_open_tickets",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("player_query_open_tickets", res)

    @task(1)
    def close_session_by_player(self):
        session_id = self.get_random_session_id()
        if not session_id:
            return
        res = self.client.patch(
            f"{BASE_PATH}/sessions/{session_id}/close-player",
            headers=self.headers,
            name="player_close_session",
        )
        if res.status_code not in (200, 204):
            self.record_failure("player_close_session", res)

    @task(1)
    def ticket_messages_by_ticket(self):
        ticket_id = self.get_any_ticket_id()
        if not ticket_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/sessions/by-ticket/{ticket_id}/messages",
            headers=self.headers,
            name="player_ticket_messages_by_ticket",
        )
        if res.status_code not in (200, 204):
            self.record_failure("player_ticket_messages_by_ticket", res)


class AdminUser(BaseUser):
    weight = 1
    player_game_id = ENV_GAME_ID  # 未配置则运行时依赖接口获取
    player_id_or_name = ENV_PLAYER_NAME or "player-demo"

    def login(self):
        res = self.client.post(
            f"{BASE_PATH}/auth/login",
            json=ADMIN_CREDENTIAL,
            name="admin_login",
        )
        if res.status_code != 200:
            self.record_failure("admin_login", res)
            return
        data = extract_data(res) or {}
        token = data.get("accessToken")
        if not token:
            self.record_failure("admin_login_no_token", res)
            return
        self.token = token
        self.headers = {"Authorization": f"Bearer {token}"}

    def create_ticket_and_return_id(self) -> Optional[str]:
        issue_type_id = self.get_any_issue_type_id("_admin_issue_type_id")
        if not issue_type_id:
            return None
        game_id = self.get_any_game_id("_admin_game_id") or self.player_game_id
        if not game_id:
            return None
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
            "description": random_text("desc"),
            "issueTypeIds": [issue_type_id],
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets",
            json=payload,
            headers=self.headers,
            name="admin_create_ticket_auto",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("admin_create_ticket_auto", res)
            return None
        data = extract_data(res) or {}
        return data.get("id") if isinstance(data, dict) else None

    def get_any_session_id(self) -> Optional[str]:
        cached = getattr(self, "_cached_admin_session", None)
        if cached:
            return cached
        res = self.client.get(
            f"{BASE_PATH}/sessions",
            headers=self.headers,
            name="admin_list_sessions",
        )
        if res.status_code != 200:
            if not self.is_throttle(res):
                self.record_failure("admin_list_sessions", res)
            return None
        sessions = extract_data(res) or []
        if not isinstance(sessions, list) or not sessions:
            return None
        first = sessions[0]
        session_id = first.get("id") if isinstance(first, dict) else None
        if session_id:
            setattr(self, "_cached_admin_session", session_id)
        return session_id

    def get_any_ticket_id(self) -> Optional[str]:
        res = self.client.get(
            f"{BASE_PATH}/tickets",
            headers=self.headers,
            name="admin_list_tickets_for_detail",
        )
        if res.status_code != 200:
            self.record_failure("admin_list_tickets_for_detail", res)
            return None
        tickets = extract_data(res) or []
        if not isinstance(tickets, list) or not tickets:
            return self.create_ticket_and_return_id()
        first = tickets[0]
        return first.get("id") if isinstance(first, dict) else None

    @task(2)
    def send_agent_message(self):
        session_id = self.get_any_session_id()
        if not session_id:
            return
        payload = {"text": random_text("agent"), "sessionId": session_id}
        res = self.client.post(
            f"{BASE_PATH}/messages/agent",
            json=payload,
            headers=self.headers,
            name="admin_send_message",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("admin_send_message", res)

    @task(1)
    def list_sessions_task(self):
        _ = self.get_any_session_id()

    @task(1)
    def list_messages(self):
        session_id = self.get_any_session_id()
        if not session_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/messages/session/{session_id}",
            headers=self.headers,
            name="admin_list_messages",
        )
        if res.status_code not in (200, 204):
            self.record_failure("admin_list_messages", res)

    @task(1)
    def list_tickets(self):
        res = self.client.get(
            f"{BASE_PATH}/tickets",
            headers=self.headers,
            name="admin_list_tickets",
        )
        if res.status_code != 200:
            self.record_failure("admin_list_tickets", res)

    @task(1)
    def ticket_detail(self):
        ticket_id = self.get_any_ticket_id()
        if not ticket_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/tickets/{ticket_id}",
            headers=self.headers,
            name="admin_ticket_detail",
        )
        if res.status_code != 200:
            self.record_failure("admin_ticket_detail", res)

    @task(1)
    def dashboard_metrics(self):
        res = self.client.get(
            f"{BASE_PATH}/metrics",
            headers=self.headers,
            name="admin_metrics",
        )
        if res.status_code not in (200, 204):
            self.record_failure("admin_metrics", res)

    @task(1)
    def admin_query_open_tickets(self):
        game_id = self.get_any_game_id("_admin_game_id") or self.player_game_id
        if not game_id:
            return
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets/query-open-tickets",
            json=payload,
            headers=self.headers,
            name="admin_query_open_tickets",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("admin_query_open_tickets", res)

    @task(1)
    def admin_check_open_ticket(self):
        game_id = self.get_any_game_id("_admin_game_id") or self.player_game_id
        if not game_id:
            return
        payload = {
            "gameId": game_id,
            "playerIdOrName": self.player_id_or_name,
        }
        res = self.client.post(
            f"{BASE_PATH}/tickets/check-open",
            json=payload,
            headers=self.headers,
            name="admin_check_open_ticket",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("admin_check_open_ticket", res)

    @task(1)
    def ticket_messages(self):
        ticket_id = self.get_any_ticket_id()
        if not ticket_id:
            return
        res = self.client.get(
            f"{BASE_PATH}/ticket-messages/{ticket_id}",
            headers=self.headers,
            name="admin_ticket_messages",
        )
        if res.status_code not in (200, 204):
            self.record_failure("admin_ticket_messages", res)

    @task(1)
    def ticket_message_reply(self):
        ticket_id = self.get_any_ticket_id()
        if not ticket_id:
            return
        res = self.client.post(
            f"{BASE_PATH}/ticket-messages/{ticket_id}/reply",
            json={"content": random_text("reply")},
            headers=self.headers,
            name="admin_ticket_message_reply",
        )
        if res.status_code not in OK_POST_CODES:
            self.record_failure("admin_ticket_message_reply", res)

    @task(1)
    def join_session(self):
        session_id = self.get_any_session_id()
        if not session_id:
            return
        res = self.client.post(
            f"{BASE_PATH}/sessions/{session_id}/join",
            headers=self.headers,
            name="admin_join_session",
        )
        if res.status_code not in (200, 204):
            self.record_failure("admin_join_session", res)

    @task(1)
    def close_session(self):
        session_id = self.get_any_session_id()
        if not session_id:
            return
        res = self.client.patch(
            f"{BASE_PATH}/sessions/{session_id}/close",
            headers=self.headers,
            name="admin_close_session",
        )
        if res.status_code not in (200, 204):
            self.record_failure("admin_close_session", res)
