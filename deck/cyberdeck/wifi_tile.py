#!/usr/bin/env python3
"""Wi-Fi picker screen for the cyberdeck launcher (480x320, touch/mouse + keyboard).

Launcher usage:
    import wifi_tile
    wifi_tile.run(screen)      # blocks until the user taps Back

Standalone test (also works on a Mac, with fake networks since there's no nmcli):
    python wifi_tile.py

Needs NetworkManager (Pi OS Bookworm or newer). nmcli saves every network you
join, so it reconnects automatically next time it's in range.
"""
import shutil
import subprocess
import threading

import pygame

W, H = 480, 320
BG, PANEL, FG, DIM = (18, 18, 26), (40, 40, 58), (235, 235, 245), (120, 120, 145)
ACCENT, GOOD, BAD = (255, 120, 200), (50, 130, 90), (170, 60, 60)
HAVE_NM = shutil.which("nmcli") is not None


# ---------------------------------------------------------------- nmcli layer
def run_cmd(cmd, timeout=30):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout + r.stderr).strip()
    except Exception as e:  # timeout, missing binary, ...
        return 1, str(e)


def scan():
    """Return (networks, known_ssids). network = (ssid, signal 0-100, secured, active)."""
    if not HAVE_NM:  # dev mode on the Mac
        import time
        time.sleep(1)
        return ([("Demo Home", 80, True, True), ("Neighbor", 55, True, False),
                 ("CoffeeShop", 30, False, False)], {"Demo Home"})

    run_cmd(["nmcli", "dev", "wifi", "rescan"], 10)  # may refuse if scanned recently; fine
    _, out = run_cmd(["nmcli", "-t", "-e", "no", "-f",
                      "ACTIVE,SSID,SIGNAL,SECURITY", "dev", "wifi", "list"])
    best = {}
    for line in out.splitlines():
        try:
            active, rest = line.split(":", 1)
            ssid, sig, sec = rest.rsplit(":", 2)
            sig = int(sig)
        except ValueError:
            continue
        if not ssid:  # hidden network, not supported here
            continue
        secured = sec.strip() not in ("", "--")
        prev = best.get(ssid)
        is_active = active == "yes" or bool(prev and prev[3])
        strongest = max(sig, prev[1]) if prev else sig
        best[ssid] = (ssid, strongest, secured, is_active)

    _, out = run_cmd(["nmcli", "-t", "-e", "no", "-f", "NAME,TYPE", "con", "show"])
    known = {l.rsplit(":", 1)[0] for l in out.splitlines()
             if l.rsplit(":", 1)[-1] in ("802-11-wireless", "wifi")}
    nets = sorted(best.values(), key=lambda n: (not n[3], -n[1]))  # active first, then strongest
    return nets, known


def connect(ssid, password, known):
    """Return (ok, message)."""
    if not HAVE_NM:
        import time
        time.sleep(1.5)
        return True, "demo mode"
    if known:
        rc, out = run_cmd(["nmcli", "con", "up", "id", ssid], 45)
    elif password:
        rc, out = run_cmd(["nmcli", "dev", "wifi", "connect", ssid, "password", password], 45)
    else:
        rc, out = run_cmd(["nmcli", "dev", "wifi", "connect", ssid], 45)
    if rc != 0 and not known:
        run_cmd(["nmcli", "con", "delete", "id", ssid])  # don't keep a profile with a bad password
    return rc == 0, out


def forget(ssid):
    if HAVE_NM:
        run_cmd(["nmcli", "con", "delete", "id", ssid])


class Job:
    """Run a blocking function in a thread so the UI keeps drawing."""
    def __init__(self, fn):
        self.done, self.result = False, None
        threading.Thread(target=self._go, args=(fn,), daemon=True).start()

    def _go(self, fn):
        self.result = fn()
        self.done = True


# ------------------------------------------------------------------------ UI
LAYERS = {
    "abc": ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"],
    "ABC": ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
    "sym": ["1234567890", "!@#$%^&*()", "-_=+.,/?:;", "'\"~`[]{}<>"],
}


class WifiTile:
    ROW_H, VISIBLE = 44, 5

    def __init__(self, screen):
        self.screen = screen
        self.big = pygame.font.Font(None, 30)
        self.small = pygame.font.Font(None, 22)
        self.buttons = []  # (rect, callback), rebuilt every frame
        self.nets, self.known, self.top = [], set(), 0
        self.ssid, self.pw, self.layer, self.show_pw = "", "", "abc", False
        self.was_known, self.ok, self.msg = False, False, ""
        self.quit = False
        self.rescan()

    # ---- state transitions
    def rescan(self):
        self.state, self.job = "scanning", Job(scan)

    def pick(self, net):
        self.ssid = net[0]
        self.pw, self.layer, self.show_pw = "", "abc", False
        if net[0] in self.known or not net[2]:  # saved or open: no password needed
            self.start_connect()
        else:
            self.state = "password"

    def start_connect(self):
        self.was_known = self.ssid in self.known
        ssid, pw, known = self.ssid, self.pw, self.was_known
        self.state, self.job = "connecting", Job(lambda: connect(ssid, pw, known))

    def do_forget(self):
        forget(self.ssid)
        self.rescan()

    def scroll(self, d):
        self.top = max(0, min(max(0, len(self.nets) - self.VISIBLE), self.top + d))

    # ---- input
    def handle(self, e):
        is_mousedown = e.type == pygame.MOUSEBUTTONDOWN and e.button == 1
        is_fingerdown = e.type == pygame.FINGERDOWN
        if is_mousedown or is_fingerdown:
            for rect, cb in reversed(self.buttons):
                if rect.collidepoint(e.pos):
                    cb()
                    break
        elif e.type == pygame.KEYDOWN and self.state == "password":  # the toy's real keys via Pico HID
            if e.key == pygame.K_RETURN:
                self.start_connect()
            elif e.key == pygame.K_BACKSPACE:
                self.pw = self.pw[:-1]
            elif e.key == pygame.K_ESCAPE:
                self.rescan()
            elif e.unicode and e.unicode.isprintable():
                self.pw += e.unicode

    def update(self):
        if not self.job.done:
            return
        if self.state == "scanning":
            self.nets, self.known = self.job.result
            self.top, self.state = 0, "list"
        elif self.state == "connecting":
            self.ok, self.msg = self.job.result
            self.state = "result"
        self.job.done = False

    # ---- drawing helpers
    def text(self, s, pos, font=None, color=FG, center=False):
        img = (font or self.small).render(s, True, color)
        r = img.get_rect(center=pos) if center else img.get_rect(topleft=pos)
        self.screen.blit(img, r)

    def button(self, rect, label, cb, color=PANEL):
        rect = pygame.Rect(rect)
        pygame.draw.rect(self.screen, color, rect, border_radius=8)
        if label:
            self.text(label, rect.center, self.small, center=True)
        self.buttons.append((rect, cb))

    def draw(self):
        self.screen.fill(BG)
        self.buttons = []
        getattr(self, "draw_" + self.state)()

    # ---- screens
    def draw_scanning(self):
        self.text("Looking for networks...", (W // 2, H // 2), self.big, center=True)

    def draw_connecting(self):
        self.text("Connecting to", (W // 2, H // 2 - 22), self.small, DIM, center=True)
        self.text(self.ssid, (W // 2, H // 2 + 8), self.big, center=True)

    def draw_list(self):
        self.text("Wi-Fi", (12, 10), self.big)
        self.button((W - 100, 4, 92, 30), "Rescan", self.rescan)
        if not self.nets:
            self.text("No networks found", (W // 2, H // 2), self.small, DIM, center=True)
        for i, net in enumerate(self.nets[self.top:self.top + self.VISIBLE]):
            ssid, sig, secured, active = net
            r = pygame.Rect(8, 40 + i * self.ROW_H, W - 16, self.ROW_H - 4)
            self.button(r, "", lambda n=net: self.pick(n), GOOD if active else PANEL)
            self.text(ssid[:26], (r.x + 12, r.y + 12), self.big)
            tag = "connected" if active else ("saved" if ssid in self.known
                                              else ("secured" if secured else "open"))
            self.text(tag, (r.right - 150, r.y + 14), self.small, DIM if not active else FG)
            for b in range(4):  # signal bars
                h = 6 + b * 5
                col = ACCENT if sig >= b * 25 + 10 else (70, 70, 90)
                pygame.draw.rect(self.screen, col, (r.right - 44 + b * 9, r.bottom - 10 - h, 6, h))
        self.button((8, 268, 100, 44), "Up", lambda: self.scroll(-self.VISIBLE))
        self.button((116, 268, 100, 44), "Down", lambda: self.scroll(self.VISIBLE))
        self.button((W - 108, 268, 100, 44), "Back", lambda: setattr(self, "quit", True))

    def draw_password(self):
        self.text("Password for " + self.ssid[:24], (12, 10), self.small, DIM)
        self.button((W - 90, 4, 80, 26), "Cancel", self.rescan)
        field = pygame.Rect(8, 34, W - 16, 36)
        self.button(field, "", lambda: setattr(self, "show_pw", not self.show_pw), BG)
        pygame.draw.rect(self.screen, ACCENT, field, 2, border_radius=8)
        shown = self.pw if self.show_pw else "*" * len(self.pw)
        self.text(shown[-30:] + "_", (field.x + 10, field.y + 9), self.big)

        kw, kh, gap = 43, 44, 3
        for row_i, row in enumerate(LAYERS[self.layer]):
            x0 = (W - (len(row) * kw + (len(row) - 1) * gap)) // 2
            for col_i, ch in enumerate(row):
                rect = (x0 + col_i * (kw + gap), 78 + row_i * (kh + 4), kw, kh)
                self.button(rect, ch, lambda c=ch: setattr(self, "pw", self.pw + c))
        y = 78 + 4 * (kh + 4)
        shift = "abc" if self.layer == "ABC" else "ABC"
        self.button((12, y, 64, kh), "Aa", lambda: setattr(self, "layer", shift))
        sym_label, sym_target = ("abc", "abc") if self.layer == "sym" else ("123", "sym")
        self.button((82, y, 64, kh), sym_label, lambda: setattr(self, "layer", sym_target))
        self.button((152, y, 160, kh), "space", lambda: setattr(self, "pw", self.pw + " "))
        self.button((318, y, 64, kh), "<-", lambda: setattr(self, "pw", self.pw[:-1]))
        self.button((388, y, 80, kh), "OK", self.start_connect, GOOD)

    def draw_result(self):
        head = ("Connected to " if self.ok else "Couldn't join ") + self.ssid
        self.text(head[:30], (W // 2, 90), self.big, GOOD if self.ok else BAD, center=True)
        if not self.ok:
            hint = "Wrong password?" if "secrets" in self.msg.lower() or "password" in self.msg.lower() else ""
            self.text(hint, (W // 2, 125), self.small, DIM, center=True)
            self.text(self.msg.splitlines()[-1][:55] if self.msg else "", (W // 2, 150),
                      self.small, DIM, center=True)
        self.button((W // 2 - 110, 200, 100, 50), "OK", self.rescan)
        if not self.ok and self.was_known:
            self.button((W // 2 + 10, 200, 100, 50), "Forget", self.do_forget, BAD)

