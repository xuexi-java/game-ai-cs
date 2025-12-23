import socketio
from locust import User, between, task

class PressureWsUser(User):
    wait_time = between(0.5, 1.5)

    def on_start(self):
        self.ws_host = self.environment.host or "http://localhost:3000"
        self.sio = socketio.Client()
        try:
            self.sio.connect(self.ws_host, transports=["websocket", "polling"]) 
        except Exception:
            pass

    def on_stop(self):
        try:
            self.sio.disconnect()
        except Exception:
            pass

    @task
    def heartbeat(self):
        try:
            self.sio.emit("ping")
        except Exception:
            pass

