"""Small reusable UI helpers: text layout, scrolling, tab bar."""
from datetime import datetime

import pygame

from cyberdeck.ui.theme import TAB_H, W


def wrap(text, font, width):
    """Word-wrap text to a pixel width; returns a list of lines."""
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
    """Truncate to one line that fits the width, adding '...' if cut."""
    text = text.replace("\n", " ")
    if font.size(text)[0] <= width:
        return text
    while text and font.size(text + "...")[0] > width:
        text = text[:-1]
    return text + "..."


def fmt_time(iso):
    """ISO timestamp from the API -> local 'Nov 23 9:40 PM'."""
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone()
        return dt.strftime("%b %-d %-I:%M %p")
    except Exception:
        return ""


class Scroll:
    """Drag / wheel scrolling. handle() returns the tap position on a tap, else None."""

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


def tab_at(pos, count):
    """Which tab a tap on the tab bar landed on."""
    return min(count - 1, pos[0] * count // W)


def draw_tab_bar(surface, theme, labels, active):
    n = len(labels)
    for i, label in enumerate(labels):
        r = pygame.Rect(i * W // n, 0, W // n, TAB_H)
        pygame.draw.rect(surface, theme.blue if i == active else theme.panel, r)
        surf = theme.small.render(label, True, theme.fg)
        surface.blit(surf, (r.centerx - surf.get_width() // 2, r.centery - surf.get_height() // 2))

class Button:
    """A rect, a label, and a tap handler. Fires only if the press AND the release
    both land inside the rect, so dragging a finger off the button cancels the tap."""

    def __init__(self, rect, label, on_tap, color=None, stroke_width=0, stroke_color=None, border_radius=12):
        self.rect = pygame.Rect(rect)
        self.label = label
        self.on_tap = on_tap
        self.color = color      # None = theme.blue
        self.armed = False      # press started inside
        self.inside = False     # pointer currently inside
        self.stroke_width = stroke_width;
        self.stroke_color = stroke_color;
        self.border_radius = border_radius;

    def handle(self, e):
        """Feed every pygame event; returns True if the button used it."""
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and self.rect.collidepoint(e.pos):
            self.armed = self.inside = True
            return True
        if e.type == pygame.MOUSEMOTION and self.armed:
            self.inside = self.rect.collidepoint(e.pos)
            return True
        if e.type == pygame.MOUSEBUTTONUP and e.button == 1 and self.armed:
            fire = self.rect.collidepoint(e.pos)
            self.armed = self.inside = False
            if fire:
                self.on_tap()
            return True
        return False

    def draw(self, surface, theme):
        base = self.color or theme.blue
        shown = tuple(max(0, c - 35) for c in base) if (self.armed and self.inside) else base
        pygame.draw.rect(surface, shown, self.rect, border_radius=self.border_radius)
        text = theme.font.render(self.label, True, theme.fg)
        surface.blit(text, text.get_rect(center=self.rect.center))
        if self.stroke_width and self.stroke_color:
            pygame.draw.rect(surface, self.stroke_color, self.rect, self.stroke_width, border_radius=self.border_radius)
