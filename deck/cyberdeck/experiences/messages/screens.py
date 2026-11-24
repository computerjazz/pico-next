"""The four Messages screens. Each gets the MessagesExperience as `host`
(host.ctx for theme/toast, host.store for data, host.push/pop to navigate)."""
import pygame

from cyberdeck.ui.theme import H, TAB_H, W, SCROLLBAR_W
from cyberdeck.ui.widgets import Scroll, fit, fmt_time, wrap, Button


class SendTab:
    ROW, GAP = 80, 10

    def __init__(self, host, ctx):
        self.host = host
        self.ctx = ctx
        self.scroll = Scroll()
        self.selected_row_idx = None

        padding = 5
        button_h = (H - TAB_H) / 2 - (padding * 2)

        self.scroll_up = Button((W - SCROLLBAR_W - padding, H - button_h * 2 - padding * 2, SCROLLBAR_W, button_h), "^", lambda: self.move_cursor("up"), ctx.theme.panel)
        self.scroll_down = Button((W - SCROLLBAR_W - padding, H - button_h - padding, SCROLLBAR_W, button_h), "v", lambda: self.move_cursor("down"), ctx.theme.panel)

    def _rows(self):
        row_margin = 20
        for i, c in enumerate(self.host.store.contacts):
            y = TAB_H + self.GAP + i * (self.ROW + self.GAP) - self.scroll.y
            yield pygame.Rect(row_margin, y, W - SCROLLBAR_W - row_margin * 2, self.ROW), c


    def move_cursor(self, direction: str):
        rows = list(self._rows())
        n = len(rows)
        if n == 0:
            self.selected_row_idx = None
        elif self.selected_row_idx is None:
            self.selected_row_idx = 0
        else:
            if direction == "up":
                self.selected_row_idx = (self.selected_row_idx - 1) % n
            else:
                self.selected_row_idx = (self.selected_row_idx + 1) % n

        row_pos = rows[self.selected_row_idx][0].y
        if row_pos < TAB_H:
            self.scroll.y = max(0, self.scroll.y - (TAB_H - row_pos))
        elif row_pos + self.ROW > H:
            self.scroll.y = min(self.scroll.y + (row_pos + self.ROW - H), len(rows) * (self.ROW + self.GAP) + self.GAP - (H - TAB_H))

    def handle(self, e):
        n = len(self.host.store.contacts)
        total = n * (self.ROW + self.GAP) + self.GAP
        tap = self.scroll.handle(e, total - (H - TAB_H))
        row_h = self.ROW + self.GAP

        if self.selected_row_idx is not None and n > 0 and e.type == pygame.KEYDOWN and e.key == pygame.K_RETURN:
            c = self.host.store.contacts[self.selected_row_idx]
            self.host.push(Compose(self.host, c))

        if self.scroll_up.handle(e) or self.scroll_down.handle(e):
            return

        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_UP:
                self.move_cursor("up")
            elif e.key == pygame.K_DOWN:
                self.move_cursor("down")

        if tap and tap[1] >= TAB_H:
            for r, c in self._rows():
                if r.collidepoint(tap):
                    self.host.push(Compose(self.host, c))
                    break

    def draw(self, s):
        t, store = self.host.ctx.theme, self.host.store
        s.set_clip(pygame.Rect(0, TAB_H, W, H - TAB_H))
        if not store.contacts:
            msg = "Loading contacts..." if store.online else "Offline - retrying..."
            s.blit(t.small.render(msg, True, t.dim), (20, TAB_H + 30))
        for i, (r, c) in enumerate(self._rows()):
            if self.selected_row_idx is None:
                self.selected_row_idx = 0
            pygame.draw.rect(s, t.blue, r, border_radius=12)
            if (i == self.selected_row_idx):
                pygame.draw.rect(s, t.accent, r, 4, border_radius=12)

            s.blit(t.font.render(c["name"], True, t.fg), (r.x + 20, r.y + 24))
        s.set_clip(None)
        self.scroll_up.draw(s, t)
        self.scroll_down.draw(s, t)

        


class MailboxTab:
    ROW = 64

    def __init__(self, host, ctx):
        self.host = host
        self.scroll = Scroll()
        self.selected_row_idx = None

        padding = 5
        button_h = (H - TAB_H) / 2 - (padding * 2)

        self.scroll_up = Button((W - SCROLLBAR_W - padding, H - button_h * 2 - padding * 2, SCROLLBAR_W, button_h), "^", lambda: self.move_cursor("up"), ctx.theme.panel)
        self.scroll_down = Button((W - SCROLLBAR_W - padding, H - button_h - padding, SCROLLBAR_W, button_h), "v", lambda: self.move_cursor("down"), ctx.theme.panel)
        self.initialize_messages()

    def move_cursor(self, direction: str):
        rows = [self._row_rect(i) for i, m in enumerate(self.host.store.messages())]
        n = len(rows)
        if n == 0:
            self.selected_row_idx = None
        elif self.selected_row_idx is None:
            self.selected_row_idx = 0
        else:
            if direction == "up":   
                self.selected_row_idx = (self.selected_row_idx - 1) % n
            else:
                self.selected_row_idx = (self.selected_row_idx + 1) % n

        row_pos = rows[self.selected_row_idx].y
        if row_pos < TAB_H:
            self.scroll.y = max(0, self.scroll.y - (TAB_H - row_pos))
        elif row_pos + self.ROW > H:
            self.scroll.y = min(self.scroll.y + (row_pos + self.ROW - H), len(rows) * (self.ROW + self.GAP) + self.GAP - (H - TAB_H))


    def handle(self, e):
        if self.scroll_up.handle(e) or self.scroll_down.handle(e):
            return
        msgs = self.host.store.messages()
        tap = self.scroll.handle(e, len(msgs) * self.ROW + 10 - (H - TAB_H))
        if tap and tap[1] >= TAB_H:
            i = (tap[1] - TAB_H - 5 + self.scroll.y) // self.ROW
            if 0 <= i < len(msgs):
                self.host.push(MessageView(self.host, msgs[i]))

        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_UP:
                self.move_cursor("up")
            elif e.key == pygame.K_DOWN:
                self.move_cursor("down")

    def initialize_messages(self):
        self.message_rects = [self._row(self.host.ctx.screen, m, i)[0] for i, m in enumerate(self.host.store.messages())]

    def _row_rect(self, i):
            y = TAB_H + 5 + i * self.ROW - self.scroll.y
            if y > H or y + self.ROW < TAB_H:
                return
            r = pygame.Rect(10, y, W - SCROLLBAR_W - 20, self.ROW - 6)
            return r

    def _row(self, s, m, i):
            t, store = self.host.ctx.theme, self.host.store

            is_selected = (self.selected_row_idx == i)
            r = self._row_rect(i)
            if not r:
                return None, m
            pygame.draw.rect(s, t.panel, r, border_radius=10)
            if is_selected:
                pygame.draw.rect(s, t.accent, r, 4, border_radius=10)
            if store.is_unread(m):
                pygame.draw.circle(s, t.accent, (r.x + 16, r.centery), 6)
            tx = r.x + 34
            when = t.tiny.render(fmt_time(m.get("createdAt", "")), True, t.dim)
            s.blit(when, (r.right - when.get_width() - 12, r.y + 8))
            name = fit(m["from"], t.small, r.right - when.get_width() - 24 - tx)
            s.blit(t.small.render(name, True, t.fg), (tx, r.y + 6))
            preview = m.get("subject") or m.get("body", "")
            s.blit(t.tiny.render(fit(preview, t.tiny, r.right - 12 - tx), True, t.dim), (tx, r.y + 34))
            return r

    def _rows(self, s):
        return [(self._row(s, m, i), m) for i, m in enumerate(self.host.store.messages())]

    def draw(self, s):
        t, store = self.host.ctx.theme, self.host.store
        msgs = store.messages()
        if len(msgs) != len(getattr(self, "message_rects", [])):
            self.initialize_messages()
        s.set_clip(pygame.Rect(0, TAB_H, W, H - TAB_H))
        if not msgs:
            msg = "No mail yet" if store.online else "Offline - retrying..."
            s.blit(t.small.render(msg, True, t.dim), (20, TAB_H + 30))
        if not self.selected_row_idx and msgs:
            self.selected_row_idx = 0
        self._rows(s)        
        s.set_clip(None)
        self.scroll_up.draw(s, t)
        self.scroll_down.draw(s, t)


class Compose:
    MAX = 500

    def __init__(self, host, contact):
        self.host = host
        self.contact = contact
        self.text = ""
        self.back_rect = pygame.Rect(0, 0, 70, TAB_H)
        self.send_rect = pygame.Rect(340, 258, 120, 50)

    def handle(self, e):
        if e.type == pygame.KEYDOWN:
            if e.key == pygame.K_ESCAPE:
                self.host.pop()
            elif e.key == pygame.K_BACKSPACE:
                self.text = self.text[:-1]
            elif e.key == pygame.K_RETURN:
                self._send()
            elif e.unicode and e.unicode.isprintable() and len(self.text) < self.MAX:
                self.text += e.unicode
        elif e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.back_rect.collidepoint(e.pos):
                self.host.pop()
            elif self.send_rect.collidepoint(e.pos):
                self._send()

    def _send(self):
        body = self.text.strip()
        if not body:
            return
        if self.host.store.send(self.contact["key"], body):
            self.host.ctx.toast("Sent!")
            self.host.pop()
        else:
            self.host.ctx.toast("Send failed")

    def draw(self, s):
        t = self.host.ctx.theme
        s.blit(t.font.render("<", True, t.accent), (22, 12))
        s.blit(t.font.render(f"To: {self.contact['name']}", True, t.accent), (60, 12))
        lines = wrap(self.text + "_", t.small, W - 40)[-7:]  # last lines that fit
        for i, line in enumerate(lines):
            s.blit(t.small.render(line, True, t.fg), (20, 60 + i * 26))
        s.blit(t.tiny.render(f"{len(self.text)}/{self.MAX}", True, t.dim), (20, 285))
        pygame.draw.rect(s, t.green if self.text.strip() else t.dim, self.send_rect, border_radius=12)
        s.blit(t.font.render("Send", True, t.fg), (self.send_rect.x + 20, self.send_rect.y + 11))

class MessageView:
    def __init__(self, host, msg):
        self.host = host
        self.msg = msg
        self.scroll = Scroll()
        self.back_rect = pygame.Rect(0, 0, 90, TAB_H)
        self.reply_rect = pygame.Rect(W - 130, 6, 120, TAB_H - 12)
        self.can_reply = bool(msg.get("key"))
        t = host.ctx.theme
        items = [(msg["from"], t.font, t.accent)]
        if msg.get("subject"):
            items += [(ln, t.small, t.fg) for ln in wrap(msg["subject"], t.small, W - 40)]
        items += [(fmt_time(msg.get("createdAt", "")), t.tiny, t.dim), ("", t.tiny, t.fg)]
        items += [(ln, t.small, t.fg) for ln in wrap(msg.get("body", ""), t.small, W - 40)]
        self.items = items
        self.total = sum(f.get_linesize() for _, f, _ in items) + 20
        host.store.mark_read(msg)

    def handle(self, e):
        if e.type == pygame.KEYDOWN and e.key == pygame.K_ESCAPE:
            self.host.pop()
            return
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            if self.back_rect.collidepoint(e.pos):
                self.host.pop()
                return
            if self.can_reply and self.reply_rect.collidepoint(e.pos):
                self.host.push(Compose(self.host, {"key": self.msg["key"], "name": self.msg["from"]}))
                return
        self.scroll.handle(e, self.total - (H - TAB_H))

    def draw(self, s):
        t = self.host.ctx.theme
        s.set_clip(pygame.Rect(0, TAB_H, W, H - TAB_H))
        y = TAB_H + 10 - self.scroll.y
        for text, font, color in self.items:
            if text:
                s.blit(font.render(text, True, color), (20, y))
            y += font.get_linesize()
        s.set_clip(None)
        pygame.draw.rect(s, t.bg, pygame.Rect(0, 0, W, TAB_H))  # top bar over scrolled text
        s.blit(t.font.render("< Back", True, t.accent), (14, 12))
        if self.can_reply:
            pygame.draw.rect(s, t.blue, self.reply_rect, border_radius=10)
            s.blit(t.small.render("Reply", True, t.fg), (self.reply_rect.x + 30, self.reply_rect.y + 8))
