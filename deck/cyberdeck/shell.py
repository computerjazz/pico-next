"""The shell owns the loop, switches experiences, and draws overlays."""
import time

import pygame

from cyberdeck.events import LidChanged, SliderChanged
from cyberdeck.ui.theme import H, W


class Shell:
    def __init__(self, ctx, experiences, slider_map, start, hw=None, touch=None):
        self.ctx = ctx
        self.experiences = experiences   # name -> Experience
        self.slider_map = slider_map     # slider index -> name
        self.start = start
        self.hw = hw                     # anything with drain() -> list of events
        self.touch = touch               # TouchTranslator for finger-event touchscreens
        self.active = None

    def switch(self, name):
        nxt = self.experiences.get(name)
        if nxt is None or nxt is self.active:
            return
        if self.active:
            self.active.on_exit()
        self.active = nxt
        nxt.on_enter()

    def _handle_hardware(self):
        if not self.hw:
            return
        for ev in self.hw.drain():
            if isinstance(ev, SliderChanged):
                name = self.slider_map.get(ev.index)
                if name in self.experiences:
                    self.switch(name)
                    self.ctx.toast(f"Slider {ev.index + 1}: {name}", 1.2)
            elif isinstance(ev, LidChanged):
                self.ctx.lid_open = ev.open
                self.active.on_lid(ev.open)
                self.ctx.toast("Lid open" if ev.open else "Lid closed", 1.2)

    def _draw_overlays(self):
        ctx, t = self.ctx, self.ctx.theme
        if time.monotonic() < ctx.toast_until:
            surf = t.small.render(ctx.toast_text, True, t.fg)
            r = pygame.Rect(0, 0, surf.get_width() + 30, 38)
            r.midbottom = (W // 2, H - 10)
            pygame.draw.rect(ctx.screen, (0, 0, 0), r, border_radius=10)
            ctx.screen.blit(surf, (r.x + 15, r.y + 6))

    def run(self):
        for exp in self.experiences.values():
            exp.setup(self.ctx)
        self.switch(self.start)
        clock = pygame.time.Clock()
        try:
            while True:
                dt = clock.tick(30) / 1000
                self._handle_hardware()
                for e in pygame.event.get():
                    if e.type == pygame.QUIT:
                        return
                    if self.touch and self.touch.owns(e):
                        translated = self.touch.translate(e)
                        if translated:
                            self.active.handle(translated)
                        continue
                    if self.hw and self.hw.consume(e):
                        continue   # an emulated slider/lid key, not for the experience
                    self.active.handle(e)
                self.active.update(dt)
                self.ctx.screen.fill(self.ctx.theme.bg)
                self.active.draw(self.ctx.screen)
                self._draw_overlays()
                pygame.display.flip()
        finally:
            if self.active:
                self.active.on_exit()
