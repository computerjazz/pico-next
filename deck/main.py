import os

import pygame

from cyberdeck.config import load_config
from cyberdeck.context import Context
from cyberdeck.experiences.messages import MessagesExperience
from cyberdeck.experiences.messages.api import make_backend
from cyberdeck.experiences.placeholder import Placeholder
from cyberdeck.hw.keyboard_source import KeyboardSource
from cyberdeck.hw.touch import TouchTranslator
from cyberdeck.shell import Shell
from cyberdeck.ui.theme import H, Theme, W


def main():
    config = load_config()
    if config.touch == "finger":
        os.environ.setdefault("SDL_TOUCH_MOUSE_EVENTS", "0")   # we translate finger events ourselves
    pygame.init()
    flags = pygame.SCALED | (pygame.FULLSCREEN if config.fullscreen else 0)
    screen = pygame.display.set_mode((W, H), flags)
    pygame.display.set_caption("Deck")
    ctx = Context(screen=screen, theme=Theme(), config=config)

    # Names must match config.slider_map. Placeholders stand in until each is built.
    experiences = {
        "launcher": Placeholder(ctx, "launcher", (40, 60, 90)),
        "messages": MessagesExperience(ctx, make_backend(config)),
        "games": Placeholder(ctx, "games", (90, 50, 50)),
        "wikipedia": Placeholder(ctx, "wikipedia", (50, 80, 60)),
        "music": Placeholder(ctx, "music", (80, 60, 100)),
    }
    hw = KeyboardSource() if config.hw == "keyboard" else None
    touch = TouchTranslator((W, H), config.touch_cal) if config.touch == "finger" else None
    Shell(ctx, experiences, config.slider_map, config.start, hw=hw, touch=touch).run()


if __name__ == "__main__":
    main()
