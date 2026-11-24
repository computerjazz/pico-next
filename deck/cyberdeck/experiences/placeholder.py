"""Stand-in for an experience that isn't built yet (launcher, games, ...)."""
from cyberdeck.experience import Experience
from cyberdeck.ui.theme import W
from cyberdeck.wifi_tile import WifiTile
from cyberdeck.ui.widgets import Button


class Placeholder(Experience):
    def __init__(self, ctx, name, color):
        self.name = name
        self.color = color
        self.ctx = ctx
        self.button = Button(((W - 200) // 2, 200, 200, 60), "WiFi", self._tapped)
        self.tile = WifiTile(self.ctx.screen)
        self.tile_active = False


    def _tapped(self):
        self.tile.quit = False
        self.tile_active = True


    def handle(self, e):
        if self.tile_active:
            self.tile.handle(e)
            if self.tile.quit:
                self.tile_active = False
            return
        self.button.handle(e)

    def draw(self, screen):
        if self.tile_active:
            self.tile.update()
            self.tile.draw()
            return
        t = self.ctx.theme
        screen.fill(self.color)
        title = t.font.render(self.name.title(), True, t.fg)
        screen.blit(title, ((W - title.get_width()) // 2, 110))
        lid = "Lid open" if self.ctx.lid_open else "Lid closed (tablet mode)"
        sub = t.small.render(lid, True, t.fg)
        screen.blit(sub, ((W - sub.get_width()) // 2, 160))
        self.button.draw(screen, t)
