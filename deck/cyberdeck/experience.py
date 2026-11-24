"""Base class every experience (Messages, launcher, ...) implements."""


class Experience:
    name = "base"

    def setup(self, ctx):
        """Called once at startup. Start background services here."""
        self.ctx = ctx

    def on_enter(self):
        """The slider switched to this experience."""

    def on_exit(self):
        """The slider switched away (or the app is quitting)."""

    def on_lid(self, is_open):
        """Lid opened/closed. Tablet-mode behavior goes here."""

    def handle(self, event):
        """A pygame touch/keyboard event."""

    def update(self, dt):
        """Per-frame logic; dt is seconds since the last frame."""

    def draw(self, surface):
        """Draw onto the (already cleared) screen."""

    def badge(self):
        """Short text for a status bar or launcher tile (e.g. unread count), or None."""
        return None
