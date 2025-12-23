import os
import random
import string
from typing import Any, Dict, Optional, Sequence

from locust import HttpUser

BASE_PATH = os.getenv("BASE_PATH", "/api/v1")
ENV_GAME_ID = os.getenv("GAME_ID")
ENV_PLAYER_NAME = os.getenv("PLAYER_NAME")
ENV_ISSUE_TYPE_ID = os.getenv("ISSUE_TYPE_ID")
ADMIN_CREDENTIAL = {
    "username": os.getenv("ADMIN_USER", "admin"),
    "password": os.getenv("ADMIN_PASS", "admin123"),
}

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
        sc = getattr(res, "status_code", None)
        if sc in (401, 429):
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

