import os
import threading
import time
from datetime import datetime

import pygame
import requests
from dotenv import load_dotenv

load_dotenv()

W, H = 480, 320
TAB_H = 48
BG = (20, 20, 30)
PANEL = (35, 35, 50)
FG = (255, 255, 255)
DIM = (140, 140, 160)
ACCENT = (180, 200, 255)
BLUE = (60, 90, 160)
GREEN = (60, 160, 90)

# ---------- backends ----------

class FakeBackend:
    MSGS = [
        {"id": 1, "key": "dad", "from": "Dad", "subject": "Dinner",
         "body": "Hi sweetie! Dinner is at 6 tonight.", "createdAt": "2026-11-22T20:10:00Z"},
        {"id": 2, "key": "mom", "from": "Mom", "subject": "",
         "body": "Love you! See you after school.", "createdAt": "2026-11-23T01:30:00Z"},
        {"id": 3, "key": "dad", "from": "Dad", "subject": "Re: Message from L&M",
         "body": ("This is a longer message to test scrolling. " * 12).strip(),
         "createdAt": "2026-11-23T05:40:00Z"},
    ]

    def contacts(self):
        return [{"key": "dad", "name": "Dad"}, {"key": "mom", "name": "Mom"}]

    def send(self, to_key, body):
        print(f"SEND to={to_key} body={body!r}")
        return True

    def inbox(self):
        return [dict(m) for m in self.MSGS]


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

# ---------- helpers ----------

def wrap(text, font, width):
    lines = []
    for para in text.split("\n"):
        line = ""
        for word in para.split(" "):
            test = f"{line} {word}" if line else word
            if font.size(test)[0] <= width:
                line = test
            else:
                if line:
                    lines.append(line)
                line = word
        lines.append(line)
    return lines


def fit(text, font, width):
    text = text.replace("\n", " ")
    if font.size(text)[0] <= width:
        return text
    while text and font.size(text + "...")[0] > width:
        text = text[:-1]
    return text + "..."


def fmt_time(iso):
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()
        return dt.strftime("%b %-d %-I:%M %p")
    except Exception:
        return ""


class Scroll:
    """Drag / wheel scrolling. handle() returns the tap position on a tap."""

    def __init__(self):
        self.y = 0
        self.down = None
        self.start_y = 0
        self.moved = False

    def handle(self, e, max_scroll):
        max_scroll = max(0, max_scroll)
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            self.down, self.start_y, self.moved = e.pos, self.y, False
        elif e.type == pygame.MOUSEMOTION and self.down:
            dy = e.pos[1] - self.down[1]
            if abs(dy) > 8:
                self.moved = True
            if self.moved:
                self.y = self.start_y - dy
        elif e.type == pygame.MOUSEBUTTONUP and e.button == 1 and self.down:
            tap = None if self.moved else e.pos
            self.down = None
            self.y = max(0, min(max_scroll, self.y))
            return tap
        elif e.type == pygame.MOUSEWHEEL:
            self.y -= e.y * 30
        self.y = max(0, min(max_scroll, self.y))
        return None


# ---------- tabs ----------

class SendTab:
    ROW, GAP = 80, 10

    def __init__(self):
        self.scroll = Scroll()

    def rows(self, app):
        for i, c in enumerate(app.contacts):
            y = TAB_H + self.GAP + i * (self.ROW + self.GAP) - self.scroll.y
            yield pygame.Rect(20, y, 440, self.ROW), c

    def handle(self, e, app):
        total = len(app.contacts) * (self.ROW + self.GAP) + self.GAP
        tap = self.scroll.handle(e, total - (H - TAB_H))
        if tap and tap[1] >= TAB_H:
            for r, c in self.rows(app):
                if r.collidepoint(tap):
                    app.push(Compose(c))
                    break

    def draw(self, s, app):
        s.set_clip(pygame.Rect(0, TAB_H, W, H - TAB_H))
        if not app.contacts:
            msg = "Loading contacts..." if app.online else "Offline - retrying..."
            s.blit(app.small.render(msg, True, DIM), (20, TAB_H + 30))
        for r, c in self.rows(app):
            pygame.draw.rect(s, BLUE, r, border_radius=12)
            s.blit(app.font.render(c["name"], True, FG), (r.x + 20, r.y + 24))
        s.set_clip(None)


class MailboxTab:
    ROW = 64

    def __init__(self):
        self.scroll = Scroll()

    def messages(self, app):
        with app.lock:
            return list(reversed(app.messages))  # newest first

    def handle(self, e, app):
        msgs = self.messages(app)
        tap = self.scroll.handle(e, len(msgs) * self.ROW + 10 - (H - TAB_H))
        if tap and tap[1] >= TAB_H:
            i = (tap[1] - TAB_H - 5 + self.scroll.y) // self.ROW
            if 0 <= i < len(msgs):
                app.push(MessageView(app, msgs[i]))

    def draw(self, s, app):
        msgs = self.messages(app)
        s.set_clip(pygame.Rect(0, TAB_H, W, H - TAB_H))
        if not msgs:
            msg = "No mail yet" if app.online else "Offline - retrying..."
            s.blit(app.small.render(msg, True, DIM), (20, TAB_H + 30))
        for i, m in enumerate(msgs):
            y = TAB_H + 5 + i * self.ROW - self.scroll.y
            if y > H or y + self.ROW < TAB_H:
                continue
            r = pygame.Rect(10, y, W - 20, self.ROW - 6)
            pygame.draw.rect(s, PANEL, r, border_radius=10)
            if app.is_unread(m):                
                pygame.draw.circle(s, ACCENT, (r.x + 16, r.centery), 6)
            tx = r.x + 34
            when = fmt_time(m.get("createdAt", ""))
            wsurf = app.tiny.render(when, True, DIM)
            s.blit(wsurf, (r.right - wsurf.get_width() - 12, r.y + 8))
            name = fit(m["from"], app.small, r.right - wsurf.get_width() - 24 - tx)
            s.blit(app.small.render(name, True, FG), (tx, r.y + 6))
            preview = m.get("subject") or m.get("body", "")
            s.blit(app.tiny.render(fit(preview, app.tiny, r.right - 12 - tx), True, DIM), (tx, r.y + 34))
        s.set_clip(None)


# ---------- pushed screens ----------

class Compose:
    MAX = 500

    def __init__(self, contact):
        self.contact = contact
        self.text = ""
        self.back_rect = pygame.Rect(0, 0, 70, TAB_H)
        self.send_rect = pygame.Rect(340, 258, 120, 50)

    def handle(self, e, app):
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_ESCAPE:
                app.pop()
            elif e.key == pygame.K_BACKSPACE:
                self.text = self.text[:-1]
            elif e.key == pygame.K_RETURN:
                self.send(app)
            elif e.unicode and e.unicode.isprintable() and len(self.text) < self.MAX:
                self.text += e.unicode
        elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.back_rect.collidepoint(e.pos):
                app.pop()
            elif self.send_rect.collidepoint(e.pos):
                self.send(app)

    def send(self, app):
        body = self.text.strip()
        if not body:
            return
        if app.backend.send(self.contact["key"], body):
            app.toast("Sent!")
            app.pop()
        else:
            app.toast("Send failed")

    def draw(self, s, app):
        s.blit(app.font.render("<", True, ACCENT), (22, 12))
        s.blit(app.font.render(f"To: {self.contact['name']}", True, ACCENT), (60, 12))
        lines = wrap(self.text + "_", app.small, W - 40)[-7:]  # show the last lines that fit
        for i, line in enumerate(lines):
            s.blit(app.small.render(line, True, FG), (20, 60 + i * 26))
        s.blit(app.tiny.render(f"{len(self.text)}/{self.MAX}", True, DIM), (20, 285))
        pygame.draw.rect(s, GREEN, self.send_rect, border_radius=12)
        s.blit(app.font.render("Send", True, FG), (self.send_rect.x + 20, self.send_rect.y + 11))


class MessageView:
    def __init__(self, app, msg):
        self.msg = msg
        self.scroll = Scroll()
        self.back_rect = pygame.Rect(0, 0, 90, TAB_H)
        self.reply_rect = pygame.Rect(W - 130, 6, 120, TAB_H - 12)
        self.can_reply = bool(msg.get("key"))
        items = [(msg["from"], app.font, ACCENT)]
        if msg.get("subject"):
            items += [(ln, app.small, FG) for ln in wrap(msg["subject"], app.small, W - 40)]
        items += [(fmt_time(msg.get("createdAt", "")), app.tiny, DIM), ("", app.tiny, FG)]
        items += [(ln, app.small, FG) for ln in wrap(msg.get("body", ""), app.small, W - 40)]
        self.items = items
        self.total = sum(f.get_linesize() for _, f, _ in items) + 20
        app.mark_read(msg)

    def handle(self, e, app):
        if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
            app.pop()
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.back_rect.collidepoint(e.pos):
                app.pop()
                return
            if self.can_reply and self.reply_rect.collidepoint(e.pos):
                app.push(Compose({"key": self.msg["key"], "name": self.msg["from"]}))
                return
        self.scroll.handle(e, self.total - (H - TAB_H))

    def draw(self, s, app):
        s.set_clip(pygame.Rect(0, TAB_H, W, H - TAB_H))
        y = TAB_H + 10 - self.scroll.y
        for text, font, color in self.items:
            if text:
                s.blit(font.render(text, True, color), (20, y))
            y += font.get_linesize()
        s.set_clip(None)
        pygame.draw.rect(s, BG, pygame.Rect(0, 0, W, TAB_H))  # top bar over scrolled text
        s.blit(app.font.render("< Back", True, ACCENT), (14, 12))
        if self.can_reply:
            pygame.draw.rect(s, BLUE, self.reply_rect, border_radius=10)
            s.blit(app.small.render("Reply", True, FG), (self.reply_rect.x + 30, self.reply_rect.y + 8))


# ---------- app ----------

class App:
    def __init__(self, backend):
        pygame.init()
        self.screen = pygame.display.set_mode((W, H), pygame.SCALED)
        pygame.display.set_caption("Deck")
        self.font = pygame.font.Font(None, 40)
        self.small = pygame.font.Font(None, 28)
        self.tiny = pygame.font.Font(None, 22)
        self.backend = backend
        self.contacts = []
        self.messages = []
        self.lock = threading.Lock()
        self.online = False
        self.tabs = [SendTab(), MailboxTab()]
        self.tab = 0
        self.stack = []
        self.toast_text, self.toast_until = "", 0
        self.pending = set()  # opened here, server not confirmed yet

    # navigation
    def current(self):
        return self.stack[-1] if self.stack else self.tabs[self.tab]

    def push(self, s):
        self.stack.append(s)

    def pop(self):
        if self.stack:
            self.stack.pop()

    def toast(self, text, secs=2.0):
        self.toast_text, self.toast_until = text, time.time() + secs

    def poll_loop(self):
        while True:
            try:
                if not self.contacts:
                    self.contacts = self.backend.contacts()
                ids = list(self.pending)
                if ids and self.backend.mark_read(ids):
                    self.pending.difference_update(ids)
                msgs = self.backend.inbox()
                with self.lock:
                    self.messages = msgs
                self.online = True
            except Exception as e:
                print("poll error:", e)
                self.online = False
            time.sleep(30 if (self.online and self.contacts) else 5)

    # drawing
    def draw_tabs(self):
        n = self.unread()
        labels = ["Send", f"Mailbox ({n})" if n else "Mailbox"]
        for i, label in enumerate(labels):
            r = pygame.Rect(i * (W // 2), 0, W // 2, TAB_H)
            pygame.draw.rect(self.screen, BLUE if i == self.tab else PANEL, r)
            surf = self.small.render(label, True, FG)
            self.screen.blit(surf, (r.centerx - surf.get_width() // 2, r.centery - surf.get_height() // 2))

    def draw_toast(self):
        if time.time() < self.toast_until:
            surf = self.small.render(self.toast_text, True, FG)
            r = pygame.Rect(0, 0, surf.get_width() + 30, 38)
            r.midbottom = (W // 2, H - 10)
            pygame.draw.rect(self.screen, (0, 0, 0), r, border_radius=10)
            self.screen.blit(surf, (r.x + 15, r.y + 6))

    def run(self):
        threading.Thread(target=self.poll_loop, daemon=True).start()
        clock = pygame.time.Clock()
        while True:
            for e in pygame.event.get():
                if e.type == pygame.QUIT:
                    return
                if not self.stack:
                    if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and e.pos[1] < TAB_H:
                        self.tab = 0 if e.pos[0] < W // 2 else 1
                        continue
                    if e.type == pygame.KEYDOWN and e.key in (pygame.K_LEFT, pygame.K_RIGHT, pygame.K_TAB):
                        self.tab = 1 - self.tab
                        continue
                self.current().handle(e, self)
            self.screen.fill(BG)
            self.current().draw(self.screen, self)
            if not self.stack:
                self.draw_tabs()
            self.draw_toast()
            pygame.display.flip()
            clock.tick(30)

    def is_unread(self, m):
        return m.get("readAt") is None and m["id"] not in self.pending

    def unread(self):
        with self.lock:
            return sum(1 for m in self.messages if self.is_unread(m))

    def mark_read(self, msg):
        if self.is_unread(msg):
            self.pending.add(msg["id"])  # shows as read immediately; the poller syncs it


if __name__ == "__main__":
    token = os.environ.get("DECK_TOKEN")
    if token:
        base = os.environ.get("DECK_BASE", "https://picopi.cc/api/deck")
        backend = RealBackend(base, token)
    else:
        backend = FakeBackend()
    App(backend).run()