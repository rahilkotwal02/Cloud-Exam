"""Load test for ExamCloud. Run:  locust -f locustfile.py --host http://<ALB-DNS>
Logins use bcrypt, which is CPU-heavy, so this load pushes web-server CPU up
and triggers Auto Scaling."""
import random
import string
from locust import HttpUser, task, between


def rand(n=10):
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


class Student(HttpUser):
    wait_time = between(0.5, 2)

    def on_start(self):
        self.roll_no = f"2024LT{rand(6).upper()}"
        self.email = f"load{rand()}@test.com"
        self.password = "Passw0rd!" + rand(4)
        r = self.client.post("/api/auth/register", name="register",
                             json={
                                 "name": "Load Test Candidate",
                                 "roll_no": self.roll_no,
                                 "email": self.email,
                                 "department": "Computer Science",
                                 "year_semester": "4th Year",
                                 "password": self.password,
                             })
        self.headers = {"Authorization": "Bearer " + r.json().get("token", "")}
        self.submitted = False

    @task(4)
    def list_exams(self):
        self.client.get("/api/exams", headers=self.headers, name="list exams")

    @task(3)
    def login(self):
        self.client.post("/api/auth/login", name="login (bcrypt)",
                         json={"email": self.email, "password": self.password})

    @task(2)
    def take_exam(self):
        with self.client.get("/api/exams/1", headers=self.headers, name="open exam", catch_response=True) as r:
            if r.status_code in (200, 409):
                r.success()
        if not self.submitted:
            answers = {str(i): random.choice("ABCD") for i in range(1, 6)}
            with self.client.post("/api/exams/1/submit", headers=self.headers, name="submit exam",
                                  json={"answers": answers}, catch_response=True) as r:
                if r.status_code in (200, 409):
                    r.success()
                    self.submitted = True
