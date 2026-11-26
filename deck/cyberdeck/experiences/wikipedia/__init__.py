"""Wikipedia experience: search with a screen stack on top."""

from cyberdeck.experience import Experience
from cyberdeck.experiences.wikipedia.screens import WikipediaSearch
from cyberdeck.experiences.wikipedia.backend import WikiBackend

from pathlib import Path

HERE = Path(__file__).resolve().parent
ZIM_PATH = HERE / "data" / "wikipedia_en-simple_all_mini_2026-09.zim"

class WikipediaExperience(Experience):
    name = "wikipedia"

    def __init__(self, ctx):
        self.stack = [] 
        self.base = WikipediaSearch(ctx, wiki=WikiBackend(path=ZIM_PATH))

    # --- lifecycle --------------------------------------------------------
    def setup(self, ctx):
        super().setup(ctx)


    # --- navigation -------------------------------------------------------
    def current(self):
        return self.stack[-1] if self.stack else self.base

    def push(self, screen):
        self.stack.append(screen)

    def pop(self):
        if self.stack:
            self.stack.pop()

    # --- events / drawing -------------------------------------------------
    def handle(self, e):
        self.current().handle(e)

    def draw(self, surface):
        self.current().draw(surface)
