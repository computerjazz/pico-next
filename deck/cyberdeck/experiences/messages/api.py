"""Backends for the Messages experience: a fake one for dev, a real one for picopi.cc."""
import requests


class FakeBackend:
    MSGS = [
        {"id": 1, "key": "dad", "from": "Dad", "subject": "Dinner",
         "body": "Hi sweetie! Dinner is at 6 tonight.",
         "createdAt": "2026-11-22T20:10:00Z", "readAt": None},
        {"id": 2, "key": "mom", "from": "Mom", "subject": "",
         "body": "Love you! See you after school.",
         "createdAt": "2026-11-23T01:30:00Z", "readAt": None},
        {"id": 3, "key": "dad", "from": "Dad", "subject": "Re: Message from L&M",
         "body": ("This is a longer message to test scrolling. " * 12).strip(),
         "createdAt": "2026-11-23T05:40:00Z", "readAt": None},
    ]

    def __init__(self):
        self.msgs = [dict(m) for m in self.MSGS]  # per-instance copy
        self.sent = []

    def contacts(self):
        return [{"key": "dad", "name": "Dad"}, {"key": "mom", "name": "Mom"}]

    def send(self, to_key, body):
        self.sent.append((to_key, body))
        print(f"SEND to={to_key} body={body!r}")
        return True

    def inbox(self):
        return [dict(m) for m in self.msgs]

    def mark_read(self, ids):
        for m in self.msgs:
            if m["id"] in ids and m["readAt"] is None:
                m["readAt"] = "2026-11-23T06:00:00Z"
        return True


class RealBackend:
    def __init__(self, base, token):
        self.base = base.rstrip("/")
        self.headers = {"authorization": f"Bearer {token}"}

    def contacts(self):
        r = requests.get(f"{self.base}/contacts", headers=self.headers, timeout=10)
        r.raise_for_status()
        return r.json()["contacts"]

    def send(self, to_key, body):
        try:
            r = requests.post(f"{self.base}/send", headers=self.headers,
                              json={"to": to_key, "body": body}, timeout=10)
        except requests.RequestException as e:
            print("send error:", e)
            return False
        if r.status_code != 200:
            print("send failed:", r.status_code, r.text[:200])
        return r.status_code == 200

    def inbox(self):
        r = requests.get(f"{self.base}/inbox", headers=self.headers, timeout=10)
        r.raise_for_status()
        return r.json()["messages"]

    def mark_read(self, ids):
        try:
            r = requests.post(f"{self.base}/read", headers=self.headers,
                              json={"ids": ids}, timeout=10)
            return r.status_code == 200
        except requests.RequestException as e:
            print("mark_read error:", e)
            return False


def make_backend(config):
    if config.token:
        return RealBackend(config.base, config.token)
    return FakeBackend()
