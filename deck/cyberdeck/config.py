"""Settings from the environment / .env, plus the slider-to-experience map."""
import os
from dataclasses import dataclass, field

from dotenv import load_dotenv

# Slider position (0 = leftmost) -> experience name. Names with no registered
# experience yet are ignored by the shell.
DEFAULT_SLIDER_MAP = {0: "launcher", 1: "messages", 2: "games", 3: "wikipedia", 4: "music"}


@dataclass(frozen=True)
class Config:
    token: str | None
    base: str
    fullscreen: bool
    start: str
    slider_map: dict = field(default_factory=lambda: dict(DEFAULT_SLIDER_MAP))
    hw: str = "keyboard"   # "keyboard" = Mac emulation; "none" = no hardware events


def load_config():
    load_dotenv()
    return Config(
        token=os.environ.get("DECK_TOKEN") or None,
        base=os.environ.get("DECK_BASE", "https://picopi.cc/api/deck"),
        fullscreen=os.environ.get("DECK_FULLSCREEN") == "1",
        start=os.environ.get("DECK_START", "messages"),
        hw=os.environ.get("DECK_HW", "keyboard"),
    )
