from libzim.reader import Archive
from libzim.suggestion import SuggestionSearcher
from html.parser import HTMLParser
import re
from pathlib import Path

class _Text(HTMLParser):
    SKIP_TAGS = {"head", "script", "style", "h1", "table", "figure"}
    SKIP_CLASSES = {"reference", "references", "catlinks", "zim-footer", "hatnote"}
    BLOCK = {"p", "div", "li", "h2", "h3", "h4", "h5", "h6"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "source", "track", "wbr"}  # no closing tags

    def __init__(self):
        super().__init__()
        self.out = []
        self.open_tags = []  # (tag, starts_skipped_section)
        self.skip = 0

    def handle_starttag(self, t, attrs):
        if t in self.VOID:
            if t == "br" and not self.skip:
                self.out.append("\n")
            return

        classes = set((dict(attrs).get("class") or "").split())
        hide = t in self.SKIP_TAGS or bool(classes & self.SKIP_CLASSES)
        self.open_tags.append((t, hide))
        self.skip += hide

    def handle_endtag(self, t):
        if not any(tag == t for tag, _ in self.open_tags):
            return  # stray closing tag

        while True:
            tag, hide = self.open_tags.pop()
            self.skip -= hide
            if tag == t:
                break

        if t in self.BLOCK and not self.skip:
            self.out.append("\n")

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)

    def text(self):
        s = "".join(self.out).replace("\xa0", " ")
        s = re.sub(r"[^\S\n]+", " ", s)
        s = re.sub(r" ?\n ?", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        return s.strip()

class WikiBackend:
    def __init__(self, path, allow_path, deny_path=None):
        self.zim = Archive(path)
        self.sugg = SuggestionSearcher(self.zim)
        self.allow = self._load(allow_path)
        self.deny = self._load(deny_path) if deny_path else set()

    @staticmethod
    def _load(p):
        if not p or not Path(p).exists():
            return set()
        return {l for l in Path(p).read_text(encoding="utf-8").splitlines() if l}

    def _resolve(self, path):
        """Entry for path with redirects followed, or None if missing."""
        try:
            e = self.zim.get_entry_by_path(path)
            if e.is_redirect:
                e = e.get_redirect_entry()
            return e
        except KeyError:
            return None

    def _allowed(self, e):
        return e is not None and e.path in self.allow and e.path not in self.deny

    def suggest(self, q, n=3):
        if not q:
            return []
        out, seen = [], set()
        # over-fetch, because many raw suggestions get filtered out
        for p in self.sugg.suggest(q).get_results(0, 60):
            e = self._resolve(p)
            if self._allowed(e) and e.path not in seen:
                seen.add(e.path)
                out.append((e.title, e.path))
                if len(out) >= n:
                    break
        return out

    def article(self, path):
        e = self._resolve(path)
        if not self._allowed(e):
            return None            # callers must handle this
        html = bytes(e.get_item().content).decode("utf-8", "replace")
        p = _Text()
        p.feed(html)
        p.close()
        return e.title, p.text()