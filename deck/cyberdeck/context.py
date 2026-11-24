"""Shared services handed to every experience."""
import time
from dataclasses import dataclass

import pygame

from cyberdeck.config import Config
from cyberdeck.ui.theme import Theme


@dataclass
class Context:
    screen: pygame.Surface
    theme: Theme
    config: Config
    lid_open: bool = True
    toast_text: str = ""
    toast_until: float = 0.0

    def toast(self, text, secs=2.0):
        self.toast_text = text
        self.toast_until = time.monotonic() + secs
