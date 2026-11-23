"""Собирает сайт Qazaq.

Результат (каталог site/dist):
  * index.html    — самодостаточная страница (весь CSS, JS и движок внутри): открывается двойным кликом,
                    работает на любом статическом хостинге (GitHub Pages) и без сервера;
  * fragment.html — та же страница без <!doctype>/<html>/<head>/<body> (для публикации как Artifact);
  * engine.js     — движок для Node (тесты соответствия Python-интерпретатору).

Запуск:  python scripts/build_site.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from qaz.language import language_definition  # noqa: E402

SRC = ROOT / "site" / "src"
DIST = ROOT / "site" / "dist"


def js_safe(text: str) -> str:
    """Текст внутри <script> не должен содержать </script> и <!--."""
    return text.replace("</script", "<\\/script").replace("<!--", "<\\!--")


def engine_source() -> str:
    parts = [p.read_text(encoding="utf-8") for p in sorted((SRC / "engine").glob("[0-9]*.js"))]
    body = "\n".join(parts)
    return "function createQazaqEngine(LANG) {\n'use strict';\n" + body + "\n}\n"


def load_examples() -> list[dict]:
    items = []
    for path in sorted((ROOT / "examples").glob("*.qaz")):
        text = path.read_text(encoding="utf-8")
        first = text.splitlines()[0] if text else ""
        if first.startswith("# title:"):
            title = first[len("# title:"):].strip()
            code = "\n".join(text.splitlines()[1:]).lstrip("\n")
        else:
            title, code = path.stem, text
        items.append({"id": path.stem, "title": title, "code": code, "science": "science" in path.stem})
    return items


def build() -> dict[str, Path]:
    DIST.mkdir(parents=True, exist_ok=True)
    lang = language_definition()
    engine = engine_source()
    (DIST / "engine.js").write_text(
        engine + "\nif (typeof module !== 'undefined') module.exports = { createQazaqEngine };\n", encoding="utf-8")
    (DIST / "language.json").write_text(json.dumps(lang, ensure_ascii=False), encoding="utf-8")

    data = {
        "LANGUAGE": lang,
        "EXAMPLES": load_examples(),
        "TOUR": json.loads((SRC / "tour.json").read_text(encoding="utf-8")),
        "BOOK": json.loads((SRC / "book.json").read_text(encoding="utf-8")),
    }
    page = (SRC / "page.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    app = (SRC / "app.js").read_text(encoding="utf-8")
    fragment = (page
                .replace("/*__STYLE__*/", css)
                .replace("/*__DATA__*/", "window.QAZ_DATA = " + js_safe(json.dumps(data, ensure_ascii=False)) + ";")
                .replace("/*__ENGINE__*/", js_safe(engine))
                .replace("/*__APP__*/", js_safe(app)))
    (DIST / "fragment.html").write_text(fragment, encoding="utf-8")
    full = ("<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            "<meta name=\"description\" content=\"Qazaq — язык программирования на казахском. Онлайн-редактор запускает код прямо в браузере: без установки и без сервера.\">\n"
            "<meta name=\"theme-color\" content=\"#00afca\">\n"
            "<meta property=\"og:type\" content=\"website\">\n"
            "<meta property=\"og:title\" content=\"Qazaq — программирование на казахском\">\n"
            "<meta property=\"og:description\" content=\"Қарапайымдылық сыртында. Қуат ішінде. Пишите код по-казахски и запускайте в браузере.\">\n"
            "<meta name=\"color-scheme\" content=\"light dark\">\n"
            "</head>\n<body>\n" + fragment + "\n</body>\n</html>\n")
    (DIST / "index.html").write_text(full, encoding="utf-8")
    return {"index": DIST / "index.html", "fragment": DIST / "fragment.html", "engine": DIST / "engine.js"}


if __name__ == "__main__":
    out = build()
    for name, path in out.items():
        print(f"{name}: {path.relative_to(ROOT)} ({path.stat().st_size // 1024} КБ)")
