import pygame
from cyberdeck.ui.theme import W, H, TAB_H, SCROLLBAR_W
from cyberdeck.ui.widgets import Scroll, Button

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

        padding = 5
        button_h = (H - TAB_H) / 2 - (padding * 2)

        self.scroll_up_btn = Button((W - SCROLLBAR_W - padding, H - button_h * 2 - padding * 2, SCROLLBAR_W, button_h), "^", lambda: self.scroll_up(), ctx.theme.panel, key_binding=pygame.K_UP)
        self.scroll_down_btn = Button((W - SCROLLBAR_W - padding, H - button_h - padding, SCROLLBAR_W, button_h), "v", lambda: self.scroll_down(), ctx.theme.panel, key_binding=pygame.K_DOWN)


    def on_tap_result(self, i):
        self.title, text = self.wiki.article(self.results[i][1])
        self.lines = wrap(text, self.ctx.theme.tiny, W - self.PADDING * 2 - SCROLLBAR_W - 5)

    def article_start_y(self):
        return self.ctx.theme.font.size("x")[1] + (self.PADDING * 2)

    def scroll_down(self):
        article_font_h = self.ctx.theme.tiny.size("x")[1]
        self.scroll.y += article_font_h / 2

    def scroll_up(self):
        article_font_h = self.ctx.theme.tiny.size("x")[1]
        self.scroll.y -= article_font_h / 2


    def handle(self, e):
        article_start_y = self.article_start_y()
        article_font_h = self.ctx.theme.tiny.size("x")[1]
        article_h_px = len(self.lines) * article_font_h

        max_scroll = max(0, article_h_px - (H - article_start_y) + self.PADDING)
        self.scroll.handle(e, max_scroll)
        self.scroll_up_btn.handle(e)
        self.scroll_down_btn.handle(e)

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
        self.scroll_up_btn.draw(s, t)
        self.scroll_down_btn.draw(s, t)




       