from libzim.reader import Archive
from libzim.suggestion import SuggestionSearcher
from html.parser import HTMLParser
import re

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
    def __init__(self, path):
        self.zim = Archive(path)
        self.sugg = SuggestionSearcher(self.zim)

    def suggest(self, q, n=8):
        if not q: return []
        res = self.sugg.suggest(q)
        out = []
        for p in res.get_results(0, n):
            e = self.zim.get_entry_by_path(p)
            out.append((e.title, p))
        return out

    def article(self, path):
        e = self.zim.get_entry_by_path(path)
        if e.is_redirect: e = e.get_redirect_entry()
        html = bytes(e.get_item().content).decode("utf-8", "replace")
        p = _Text()
        print(html)
        p.feed(html)
        p.close()
        return e.title, p.text()