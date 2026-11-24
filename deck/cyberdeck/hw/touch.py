"""Turns SDL finger events into the mouse-style events the screens already handle.

On the Pi the USB touch controller reaches pygame as FINGER* events (x/y normalised
0..1 over the whole sensor). The UI only understands mouse events, so the shell routes
finger events through here. `cal` maps the part of the sensor that is actually under
the glass onto the screen: (x0, y0, x1, y1) in normalised sensor coordinates."""
import pygame

FINGER_TYPES = (pygame.FINGERDOWN, pygame.FINGERMOTION, pygame.FINGERUP)
MOUSE_TYPES = (pygame.MOUSEBUTTONDOWN, pygame.MOUSEBUTTONUP, pygame.MOUSEMOTION)


class TouchTranslator:
    def __init__(self, size, cal=(0.0, 0.0, 1.0, 1.0)):
        self.w, self.h = size
        self.cal = cal
        self._finger = None   # single-touch UI: the most recent finger down wins

    def owns(self, e):
        """True for events the shell must not pass on: finger events, plus any mouse
        events SDL synthesised from touches (we handle the finger events instead)."""
        return e.type in FINGER_TYPES or (e.type in MOUSE_TYPES and getattr(e, "touch", False))

    def _pos(self, e):
        x0, y0, x1, y1 = self.cal
        nx = min(1.0, max(0.0, (e.x - x0) / (x1 - x0)))
        ny = min(1.0, max(0.0, (e.y - y0) / (y1 - y0)))
        return (round(nx * (self.w - 1)), round(ny * (self.h - 1)))

    def translate(self, e):
        """A finger event -> an equivalent mouse event, or None to drop it."""
        if e.type not in FINGER_TYPES:
            return None
        if e.type == pygame.FINGERDOWN:
            self._finger = e.finger_id
        elif e.finger_id != self._finger:
            return None
        pos = self._pos(e)
        if e.type == pygame.FINGERDOWN:
            return pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=pos, button=1, touch=True)
        if e.type == pygame.FINGERMOTION:
            return pygame.event.Event(pygame.MOUSEMOTION, pos=pos, rel=(0, 0), buttons=(1, 0, 0), touch=True)
        self._finger = None
        return pygame.event.Event(pygame.MOUSEBUTTONUP, pos=pos, button=1, touch=True)
