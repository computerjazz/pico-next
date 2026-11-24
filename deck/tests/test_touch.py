import os

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")

import pygame
import pytest

from cyberdeck.config import Config, _parse_cal
from cyberdeck.context import Context
from cyberdeck.experiences.messages import MessagesExperience
from cyberdeck.experiences.messages.api import FakeBackend
from cyberdeck.hw.touch import TouchTranslator
from cyberdeck.shell import Shell
from cyberdeck.ui.theme import H, Theme, W


def finger(kind, x, y, fid=1):
    return pygame.event.Event(kind, x=x, y=y, dx=0, dy=0, finger_id=fid, touch_id=1, pressure=1.0)


@pytest.fixture
def pg():
    pygame.init()
    pygame.display.set_mode((W, H))
    yield
    pygame.quit()


def test_identity_mapping(pg):
    t = TouchTranslator((W, H))
    down = t.translate(finger(pygame.FINGERDOWN, 0.0, 0.0))
    assert (down.type, down.pos, down.button) == (pygame.MOUSEBUTTONDOWN, (0, 0), 1)
    up = t.translate(finger(pygame.FINGERUP, 1.0, 1.0))
    assert (up.type, up.pos) == (pygame.MOUSEBUTTONUP, (W - 1, H - 1))


def test_calibration_maps_glass_area_to_screen(pg):
    t = TouchTranslator((W, H), (0.1, 0.2, 0.9, 0.8))
    assert t.translate(finger(pygame.FINGERDOWN, 0.1, 0.2)).pos == (0, 0)
    assert t.translate(finger(pygame.FINGERMOTION, 0.9, 0.8)).pos == (W - 1, H - 1)
    cx, cy = t.translate(finger(pygame.FINGERMOTION, 0.5, 0.5)).pos
    assert abs(cx - (W - 1) / 2) <= 1 and abs(cy - (H - 1) / 2) <= 1     # float rounding
    assert t.translate(finger(pygame.FINGERMOTION, 0.0, 1.0)).pos == (0, H - 1)   # clamped


def test_other_fingers_ignored_and_synth_mouse_dropped(pg):
    t = TouchTranslator((W, H))
    t.translate(finger(pygame.FINGERDOWN, 0.5, 0.5, fid=1))
    assert t.translate(finger(pygame.FINGERMOTION, 0.2, 0.2, fid=2)) is None
    synth = pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=(5, 5), button=1, touch=True)
    real = pygame.event.Event(pygame.MOUSEBUTTONDOWN, pos=(5, 5), button=1)
    assert t.owns(synth) is True      # SDL's own touch->mouse copy is dropped
    assert t.owns(real) is False      # a real USB mouse still works


def test_shell_routes_finger_taps_to_the_ui(pg):
    ctx = Context(screen=pygame.display.get_surface(), theme=Theme(),
                  config=Config(token=None, base="", fullscreen=False, start="messages"))
    exp = MessagesExperience(FakeBackend())
    shell = Shell(ctx, {"messages": exp}, {}, "messages", touch=TouchTranslator((W, H)))
    pygame.event.clear()
    nx, ny = 400 / (W - 1), 10 / (H - 1)          # the Mailbox tab
    pygame.event.post(finger(pygame.FINGERDOWN, nx, ny))
    pygame.event.post(finger(pygame.FINGERUP, nx, ny))
    pygame.event.post(pygame.event.Event(pygame.QUIT))
    shell.run()
    assert exp.tab == 1


def test_parse_cal():
    assert _parse_cal("0.09,0.13,0.93,0.90") == (0.09, 0.13, 0.93, 0.90)
    assert _parse_cal("") == (0.0, 0.0, 1.0, 1.0)
    assert _parse_cal("1,1,0,0") == (0.0, 0.0, 1.0, 1.0)      # backwards range rejected
    assert _parse_cal("nonsense") == (0.0, 0.0, 1.0, 1.0)
