"""Mail state + background sync. No pygame in here, so it's easy to test."""
import threading


class MailStore:
    def __init__(self, backend, poll_secs=30):
        self.backend = backend
        self.contacts = []
        self.online = False
        self._messages = []        # oldest first, as served
        self._pending = set()      # opened here, server not told yet
        self._lock = threading.RLock()
        self._wake = threading.Event()
        self._thread = None
        self._poll_secs = poll_secs

    # --- sync -------------------------------------------------------------
    def start(self):
        if self._thread is None:
            self._thread = threading.Thread(target=self._loop, daemon=True)
            self._thread.start()

    def refresh(self):
        """One sync cycle: contacts, push read marks, pull inbox. Raises on network trouble."""
        if not self.contacts:
            self.contacts = self.backend.contacts()
        with self._lock:
            ids = sorted(self._pending)
        if ids and self.backend.mark_read(ids):
            with self._lock:
                self._pending.difference_update(ids)
        msgs = self.backend.inbox()
        with self._lock:
            self._messages = msgs

    def _loop(self):
        while True:
            try:
                self.refresh()
                self.online = True
            except Exception as e:
                print("poll error:", e)
                self.online = False
            delay = self._poll_secs if (self.online and self.contacts) else 5
            self._wake.wait(delay)
            self._wake.clear()

    # --- reading ----------------------------------------------------------
    def messages(self):
        """Newest first."""
        with self._lock:
            return list(reversed(self._messages))

    def is_unread(self, msg):
        with self._lock:
            return msg.get("readAt") is None and msg["id"] not in self._pending

    def unread_count(self):
        with self._lock:
            return sum(1 for m in self._messages if self.is_unread(m))

    def mark_read(self, msg):
        with self._lock:
            if self.is_unread(msg):
                self._pending.add(msg["id"])   # reads as read immediately
                self._wake.set()               # sync to the server soon

    # --- sending ----------------------------------------------------------
    def send(self, key, body):
        """Blocking; returns True on success."""
        return self.backend.send(key, body)
