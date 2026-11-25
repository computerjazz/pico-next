"""Stand-in for an experience that isn't built yet (launcher, games, ...)."""
from cyberdeck.experience import Experience
from cyberdeck.ui.theme import W
from cyberdeck.wifi_tile import WifiTile
from cyberdeck.ui.widgets import Button
import pygame


class Placeholder(Experience):
    def __init__(self, ctx, name, color):
        self.name = name
        self.color = color
        self.ctx = ctx
        quit_btn_w = 100
        quit_btn_margin = 5
        self.wifi_button = Button(((W - 200) // 2, 200, 200, 60), "WiFi", self._tapped)
        self.quit_button = Button((W - quit_btn_w - quit_btn_margin, quit_btn_margin, quit_btn_w, 60), "Quit", self._on_quit)
        self.wifi_tile = WifiTile(self.ctx.screen)
        self.wifi_tile_active = False


    def _tapped(self):
        self.wifi_tile.quit = False
        self.wifi_tile_active = True

    def _on_quit(self):
        pygame.event.post(pygame.event.Event(pygame.QUIT))

    def handle(self, e):
        if self.wifi_tile_active:
            self.wifi_tile.handle(e)
            if self.wifi_tile.quit:
                self.wifi_tile_active = False
            return
        self.wifi_button.handle(e)
        self.quit_button.handle(e)

    def draw(self, screen):
        if self.wifi_tile_active:
            self.wifi_tile.update()
            self.wifi_tile.draw()
            return
        t = self.ctx.theme
        screen.fill(self.color)
        title = t.font.render(self.name.title(), True, t.fg)
        screen.blit(title, ((W - title.get_width()) // 2, 110))
        lid = "Lid open" if self.ctx.lid_open else "Lid closed (tablet mode)"
        sub = t.small.render(lid, True, t.fg)
        screen.blit(sub, ((W - sub.get_width()) // 2, 160))
        self.wifi_button.draw(screen, t)
        self.quit_button.draw(screen, t)
