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
    touch: str = "mouse"   # "mouse" = native mouse events (Mac); "finger" = Pi touchscreen
    touch_cal: tuple = (0.0, 0.0, 1.0, 1.0)  # sensor area under the glass, normalised


def _parse_cal(raw):
    default = (0.0, 0.0, 1.0, 1.0)
    if not raw:
        return default
    try:
        x0, y0, x1, y1 = (float(v) for v in raw.split(","))
        if x1 > x0 and y1 > y0:
            return (x0, y0, x1, y1)
    except ValueError:
        pass
    print("ignoring bad DECK_TOUCH_CAL (want x0,y0,x1,y1 with x1>x0, y1>y0)")
    return default


def load_config():
    load_dotenv()
    return Config(
        token=os.environ.get("DECK_TOKEN") or None,
        base=os.environ.get("DECK_BASE", "https://picopi.cc/api/deck"),
        fullscreen=os.environ.get("DECK_FULLSCREEN") == "1",
        start=os.environ.get("DECK_START", "messages"),
        hw=os.environ.get("DECK_HW", "keyboard"),
        touch=os.environ.get("DECK_TOUCH", "mouse"),
        touch_cal=_parse_cal(os.environ.get("DECK_TOUCH_CAL")),
    )
