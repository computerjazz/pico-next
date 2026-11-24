"""Screen geometry and look-and-feel shared by every experience."""
import pygame

W, H = 480, 320   # logical screen size (the 3.5" panel, landscape)
TAB_H = 48        # height of the top bar / tab strip
SCROLLBAR_W = 60    # width of the scroll bar/buttons on the right side of a scrollable area


class Theme:
    bg = (20, 20, 30)
    panel = (35, 35, 50)
    fg = (255, 255, 255)
    dim = (140, 140, 160)
    accent = (180, 200, 255)
    blue = (60, 90, 160)
    green = (60, 160, 90)

    def __init__(self):
        # Fonts need pygame.font initialised, so build them here, not at import time.
        self.font = pygame.font.Font(None, 40)
        self.small = pygame.font.Font(None, 28)
        self.tiny = pygame.font.Font(None, 22)
