"""Stand-in for an experience that isn't built yet (launcher, games, ...)."""
from cyberdeck.experience import Experience
from cyberdeck.ui.theme import W
from cyberdeck.wifi_tile import run as open_wifi
from cyberdeck.ui.widgets import Button


class Placeholder(Experience):
    def __init__(self, name, color):
        self.name = name
        self.color = color
        self.button = Button(((W - 200) // 2, 200, 200, 60), "WiFi", self._tapped)

    def _tapped(self):
        open_wifi(self.ctx.screen)


    def handle(self, e):
        self.button.handle(e)

    def draw(self, screen):
        t = self.ctx.theme
        screen.fill(self.color)
        title = t.font.render(self.name.title(), True, t.fg)
        screen.blit(title, ((W - title.get_width()) // 2, 110))
        lid = "Lid open" if self.ctx.lid_open else "Lid closed (tablet mode)"
        sub = t.small.render(lid, True, t.fg)
        screen.blit(sub, ((W - sub.get_width()) // 2, 160))
        self.button.draw(screen, t)
