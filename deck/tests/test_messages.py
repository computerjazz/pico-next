"""Headless smoke tests: run with `pytest` (uses SDL's dummy video driver)."""
import os

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pygame
import pytest

from cyberdeck.config import Config
from cyberdeck.context import Context
from cyberdeck.experiences.messages import MessagesExperience
from cyberdeck.experiences.messages.api import FakeBackend
from cyberdeck.ui.theme import H, TAB_H, Theme, W


@pytest.fixture
def rig():
    pygame.init()
    screen = pygame.display.set_mode((W, H))
    config = Config(token=None, base="", fullscreen=False, start="messages")
    ctx = Context(screen=screen, theme=Theme(), config=config)
    backend = FakeBackend()
    exp = MessagesExperience(backend)
    exp.ctx = ctx                # skip setup() so no poller thread starts
    exp.store.refresh()
    yield exp, backend, ctx
    pygame.quit()


def tap(exp, pos):
    exp.handle(pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=pos, button=1))
    exp.handle(pygame.event.Event(pygame.MOUSEBUTTONUP, pos=pos, button=1))


def key(exp, k, ch=""):
    exp.handle(pygame.event.Event(pygame.KEYDOWN, key=k, unicode=ch, mod=0))


def test_unread_syncs_to_server(rig):
    exp, backend, _ = rig
    store = exp.store
    assert store.unread_count() == 3
    store.mark_read(store.messages()[0])          # newest = id 3
    assert store.unread_count() == 2              # instant, before server sync
    store.refresh()
    assert backend.msgs[2]["readAt"] is not None  # server now knows
    assert store.unread_count() == 2


def test_send_tab_opens_compose(rig):
    exp, _, ctx = rig
    exp.draw(ctx.screen)
    tap(exp, (100, TAB_H + 10 + 40))              # first recipient row
    assert exp.stack and exp.stack[-1].contact["key"] == "dad"
    exp.draw(ctx.screen)


def test_open_reply_send(rig):
    exp, backend, ctx = rig
    exp.draw(ctx.screen)
    tap(exp, (W - 40, 10))                        # Mailbox tab
    assert exp.tab == 1
    exp.draw(ctx.screen)
    tap(exp, (200, TAB_H + 30))                   # newest message
    assert len(exp.stack) == 1
    exp.draw(ctx.screen)
    tap(exp, (W - 70, 20))                        # Reply
    assert len(exp.stack) == 2
    exp.draw(ctx.screen)
    for ch in "hi":
        key(exp, getattr(pygame, f"K_{ch}"), ch)
    key(exp, pygame.K_RETURN, "\r")
    assert backend.sent == [("dad", "hi")]
    assert len(exp.stack) == 1                    # back on the message
    assert ctx.toast_text == "Sent!"


def test_badge_tracks_unread(rig):
    exp, _, _ = rig
    assert exp.badge() == "3"
    exp.store.mark_read(exp.store.messages()[0])
    assert exp.badge() == "2"
