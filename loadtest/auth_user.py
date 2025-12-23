from locust import between, task
from common import BaseHttpUser

class AuthUser(BaseHttpUser):
    weight = 5
    wait_time = between(5, 10)

    @task
    def login_logout(self):
        if not self.login_admin():
            return
        self.logout_admin()

