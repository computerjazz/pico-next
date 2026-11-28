"""Wikipedia experience: search with a screen stack on top."""

from cyberdeck.experience import Experience
from cyberdeck.experiences.wikipedia.screens import WikipediaSearch
from cyberdeck.experiences.wikipedia.backend import WikiBackend

from pathlib import Path

HERE = Path(__file__).resolve().parent
ZIM_PATH_SIMPLE = HERE / "data" / "wikipedia_en-simple_all_mini_2026-09.zim"
# ZIM_PATH_SCHOOL = HERE / "data" / "wikipedia_en_for_schools_maxi_2023-09.zim"
ALLOW_PATH = HERE / "data" / "allowlist.txt"
class WikipediaExperience(Experience):
    name = "wikipedia"

    def __init__(self, ctx):
        self.stack = [] 
        self.base = WikipediaSearch(ctx, wiki=WikiBackend(path=ZIM_PATH_SIMPLE, allow_path=ALLOW_PATH))

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
