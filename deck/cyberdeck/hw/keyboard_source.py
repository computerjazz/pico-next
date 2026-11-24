"""Mac dev stand-in for the Pico: Option+1..5 = slider, Option+L = toggle the lid.

Option (Alt) is the modifier so plain number keys still type normally in Compose.
On the Pi this gets replaced by an evdev source that emits the same events."""
import pygame

from cyberdeck.events import LidChanged, SliderChanged

SLIDER_KEYS = {pygame.K_1: 0, pygame.K_2: 1, pygame.K_3: 2, pygame.K_4: 3, pygame.K_5: 4}
LID_KEY = pygame.K_l


class KeyboardSource:
    def __init__(self):
        self._events = []
        self._lid_open = True

    def consume(self, e):
        """Offer a raw pygame event. Returns True if it was an emulated hardware key."""
        if e.type != pygame.KEYDOWN or not (e.mod & pygame.KMOD_ALT):
            return False
        if e.key in SLIDER_KEYS:
            self._events.append(SliderChanged(SLIDER_KEYS[e.key]))
            return True
        if e.key == LID_KEY:
            self._lid_open = not self._lid_open
            self._events.append(LidChanged(self._lid_open))
            return True
        return False

    def drain(self):
        events, self._events = self._events, []
        return events
