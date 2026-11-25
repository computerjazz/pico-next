import time, pygame

TAP_SLOP = 10          # px of movement before it's a drag
TAP_MAX_MS = 400       # longer than this isn't a tap
MIN_CONTACT_MS = 30    # shorter than this is noise
REDOWN_MS = 50         # ignore new down right after an up
MAX_JUMP = 60          # px; bigger single-sample jumps are noise
TRIM_TAIL = 2          # drop last N samples before release

class Gesture:
    def __init__(self):
        self.down = False
        self.start = None
        self.pos = None
        self.t_down = 0
        self.t_up = 0
        self.dragging = False
        self.samples = []      # recent (x, y)
        self.velocity = 0.0    # px/s, for kinetic scroll

    def on_down(self, pos):
        now = time.monotonic() * 1000
        if now - self.t_up < REDOWN_MS:
            return
        self.down = True
        self.start = self.pos = pos
        self.t_down = now
        self.dragging = False
        self.samples = [pos]
        self.velocity = 0.0

    def on_move(self, pos):
        """Returns dy to scroll by this frame (0 if not dragging)."""
        if not self.down:
            return 0
        # reject jumps
        lx, ly = self.pos
        if abs(pos[0]-lx) > MAX_JUMP or abs(pos[1]-ly) > MAX_JUMP:
            return 0
        self.samples.append(pos)
        if not self.dragging:
            if (abs(pos[0]-self.start[0]) > TAP_SLOP or
                    abs(pos[1]-self.start[1]) > TAP_SLOP):
                self.dragging = True
                self.pos = pos
            return 0
        dy = pos[1] - self.pos[1]
        self.pos = pos
        return dy

    def on_up(self, pos):
        """Returns tap position if this was a tap, else None."""
        if not self.down:
            return None
        self.down = False
        now = time.monotonic() * 1000
        self.t_up = now
        dur = now - self.t_down
        if self.dragging or dur < MIN_CONTACT_MS or dur > TAP_MAX_MS:
            return None
        # use the *start* position for hit-testing, not the (noisy) release position
        return self.start

    def on_event(self, e, on_down=None, on_move=None, on_up=None, on_cancel=None):
        if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1:
            self.on_down(e.pos)
            if on_down:
                on_down(e.pos)
        elif e.type == pygame.MOUSEMOTION and e.buttons[0]:
            dy = self.on_move(e.pos)
            if dy and on_move:
                on_move(dy)
        elif e.type == pygame.MOUSEBUTTONUP and e.button == 1:
            tap = self.on_up(e.pos)
            if tap:
                if on_up:
                    on_up(tap)
            else:
                if on_cancel:
                    on_cancel()