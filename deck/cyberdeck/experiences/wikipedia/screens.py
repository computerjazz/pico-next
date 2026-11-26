import pygame
from cyberdeck.ui.theme import W, H, TAB_H
from cyberdeck.ui.widgets import Scroll

def wrap(text, font, width):
    lines = []
    for para in text.split("\n"):
        line = ""
        for w in para.split():
            test = f"{line} {w}".strip()
            if font.size(test)[0] > width:
                lines.append(line); line = w
            else:
                line = test
        lines.append(line)
    return lines


class WikipediaSearch():

    PADDING = 20

    def __init__(self, ctx, wiki):
        self.ctx = ctx
        self.wiki = wiki
        self.query, self.results = "", []
        self.title, self.lines = None, []
        self.scroll = Scroll()


    def on_tap_result(self, i):
        self.title, text = self.wiki.article(self.results[i][1])
        print(text)
        self.lines = wrap(text, self.ctx.theme.tiny, W - self.PADDING * 2)

    def article_start_y(self):
        return self.ctx.theme.font.size("x")[1] + (self.PADDING * 2)

    def handle(self, e):
        article_start_y = self.article_start_y()
        article_font_h = self.ctx.theme.tiny.size("x")[1]
        article_h_px = len(self.lines) * article_font_h

        max_scroll = max(0, article_h_px - (H - article_start_y) + self.PADDING)
        print(H, len(self.lines), article_h_px, max_scroll, self.ctx.theme.tiny.size("x"))
        self.scroll.handle(e, max_scroll)

        def show_article():
            self.results = self.wiki.suggest(self.query)
            if self.results and len(self.results):
                self.on_tap_result(0)

        if e.type == pygame.KEYDOWN:
            if e.unicode and e.unicode.isprintable():
                self.query += e.unicode
                show_article()
            elif e.key == pygame.K_BACKSPACE:
                self.query = self.query[:-1]
                show_article()
            elif e.key == pygame.K_DOWN:
                self.scroll.y += article_font_h / 2
            elif e.key == pygame.K_UP:
                self.scroll.y -= article_font_h / 2



    def draw(self, s):
        t = self.ctx.theme
        query_text = f"{self.query}_"
        article_start_y = self.article_start_y()

        s.blit(t.font.render(query_text, True, t.green), (self.PADDING, self.PADDING))
        for i, line in enumerate(self.lines):
            article_text_h = self.ctx.theme.tiny.size("x")[1]
            line_y = article_start_y + i * article_text_h - self.scroll.y
            if (line_y < article_start_y):
                continue
            s.blit(t.tiny.render(line, True, t.accent), (self.PADDING, line_y))




       