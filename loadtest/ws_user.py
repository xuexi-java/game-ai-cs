import random
import socketio
import gevent
from locust import User, between, task, events

class WsUser(User):
    weight = 15
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

        # 建立一次连接，维持长连接
        try:
            self.sio.connect(self.ws_host, transports=["websocket", "polling"]) 
        except Exception as e:
            events.request.fire(request_type="WS", name="ws_connect_fail", response_time=0, response_length=0, exception=e)

    def on_stop(self):
        try:
            self.sio.disconnect()
        except Exception:
            pass

    # 仅心跳保活，不做反复连接/断开
    @task
    def heartbeat(self):
        try:
            self.sio.emit("ping")
        except Exception as e:
            events.request.fire(request_type="WS", name="ws_heartbeat_fail", response_time=0, response_length=0, exception=e)
