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
        self.article_font_h = self.ctx.theme.tiny.size("x")[1]
        self.max_y = 0

        padding = 5
        button_h = (H - TAB_H) / 2 - (padding * 2)

        self.scroll_up_btn = Button((W - SCROLLBAR_W - padding, H - button_h * 2 - padding * 2, SCROLLBAR_W, button_h), "^", lambda: self.scroll_up(), ctx.theme.panel, key_binding=pygame.K_UP)
        self.scroll_down_btn = Button((W - SCROLLBAR_W - padding, H - button_h - padding, SCROLLBAR_W, button_h), "v", lambda: self.scroll_down(), ctx.theme.panel, key_binding=pygame.K_DOWN)


    def on_select_result(self, article):
        self.scroll.y = 0
        self.title, text = self.wiki.article(article)
        self.lines = wrap(text, self.ctx.theme.tiny, W - self.PADDING * 2 - SCROLLBAR_W - 5)

    def article_start_y(self):
        return self.ctx.theme.font.size("x")[1] + (self.PADDING * 2)

    def scroll_down(self):
        self.scroll.y += self.article_font_h

    def scroll_up(self):
        self.scroll.y -= self.article_font_h

    result_btns = []


    def handle(self, e):
        article_start_y = self.article_start_y()
        max_scroll = max(0, self.max_y - (H - article_start_y) + self.PADDING)
        self.scroll.handle(e, max_scroll)
        self.scroll_up_btn.handle(e)
        self.scroll_down_btn.handle(e)

        for b in self.result_btns:
            b.handle(e)

        def show_article():
            self.results = self.wiki.suggest(self.query)
            self.result_btns = [Button(rect=(0, 0, 0, 0), label=result[0], on_tap=lambda r=result: self.on_select_result(r[1])) for result in self.results]
            if self.results and len(self.results):
                article = self.results[0][1]
                self.on_select_result(article)

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
        scroll_offset = self.scroll.y * -1
        line_y = article_start_y + scroll_offset
        for line in self.lines:
            if line:
                w, h = t.tiny.size(line)
                if (line_y >= article_start_y):
                    s.blit(t.tiny.render(line, True, t.accent), (self.PADDING, line_y))
                line_y += h
        self.scroll_up_btn.draw(s, t)
        self.scroll_down_btn.draw(s, t)

        results = self.results
        btn_padding = 10
        line_y += 30
        btn_h = 60
        for i, result in enumerate(results):
            label = result[0]
            w, h = t.font.size(label)
            btn = self.result_btns[i]
            if btn:
             btn.rect = pygame.Rect(self.PADDING, line_y, w + (btn_padding * 2), btn_h)
             btn.draw(s, t)
            if i < len(results) - 1:
                line_y += btn_h + 10
        self.max_y = line_y - scroll_offset





       