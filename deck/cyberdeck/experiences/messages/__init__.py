"""Messages experience: Send / Mailbox tabs with a screen stack on top."""
import pygame

from cyberdeck.experience import Experience
from cyberdeck.experiences.messages.screens import MailboxTab, SendTab
from cyberdeck.experiences.messages.store import MailStore
from cyberdeck.ui.theme import TAB_H
from cyberdeck.ui.widgets import draw_tab_bar, tab_at


class MessagesExperience(Experience):
    name = "messages"

    def __init__(self,ctx, backend):
        self.store = MailStore(backend)
        self.tabs = [SendTab(self, ctx), MailboxTab(self, ctx)]
        self.tab = 0
        self.stack = []   # pushed screens (compose, message view) above the tabs

    # --- lifecycle --------------------------------------------------------
    def setup(self, ctx):
        super().setup(ctx)
        self.store.start()   # keeps polling even while another experience is active

    def badge(self):
        n = self.store.unread_count()
        return str(n) if n else None

    # --- navigation -------------------------------------------------------
    def current(self):
        return self.stack[-1] if self.stack else self.tabs[self.tab]

    def push(self, screen):
        self.stack.append(screen)

    def pop(self):
        if self.stack:
            self.stack.pop()

    # --- events / drawing -------------------------------------------------
    def handle(self, e):
        if not self.stack:
            if e.type == pygame.MOUSEBUTTONDOWN and e.button == 1 and e.pos[1] < TAB_H:
                self.tab = tab_at(e.pos, len(self.tabs))
                return
            if e.type == pygame.KEYDOWN and e.key in (pygame.K_LEFT, pygame.K_RIGHT, pygame.K_TAB):
                self.tab = (self.tab + 1) % len(self.tabs)
                return
        self.current().handle(e)

    def draw(self, surface):
        self.current().draw(surface)
        if not self.stack:
            n = self.store.unread_count()
            labels = ["Send", f"Mailbox ({n})" if n else "Mailbox"]
            draw_tab_bar(surface, self.ctx.theme, labels, self.tab)
