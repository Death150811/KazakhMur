"""Превращает docs/MANUAL.md в одну читаемую HTML-страницу: site/dist/manual.html (без обёртки <html>/<body>,
как fragment.html: её можно опубликовать как Artifact или вставить в любую страницу).

Нужен пакет `markdown` (pip install markdown). Запуск:  python scripts/make_manual_html.py
"""
from __future__ import annotations

import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import markdown  # noqa: E402

from gen_manual import slug  # noqa: E402

SOURCE = ROOT / "docs" / "MANUAL.md"
TARGET = ROOT / "site" / "dist" / "manual.html"

CSS = """
:root {
  --bg: #eef4f6; --paper: #ffffff; --paper-2: #e2edf1; --ink: #0a1b2a; --ink-2: #33495c; --ink-3: #53677a;
  --line: #c3d5dc; --sky: #006276; --gold: #fec50c; --gold-ink: #2a1f00; --code-bg: #0a1b2a; --code-ink: #e6eef5;
  --code-inline: #dbe9ee; --shade: rgba(10, 27, 42, 0.18);
  --sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
  --display: 'Rubik', 'Inter', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
  --mono: 'JetBrains Mono', 'DejaVu Sans Mono', Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #061018; --paper: #0c1b28; --paper-2: #10253a; --ink: #eaf2f7; --ink-2: #a9bccb; --ink-3: #8aa3b5;
    --line: #234558; --sky: #43d3ee; --code-bg: #08141f; --code-ink: #e6eef5; --code-inline: #15304a; --shade: rgba(0, 0, 0, 0.5);
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #061018; --paper: #0c1b28; --paper-2: #10253a; --ink: #eaf2f7; --ink-2: #a9bccb; --ink-3: #8aa3b5;
  --line: #234558; --sky: #43d3ee; --code-bg: #08141f; --code-ink: #e6eef5; --code-inline: #15304a; --shade: rgba(0, 0, 0, 0.5);
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font-family: var(--sans); font-size: 16px; line-height: 1.65; }
.wrap { display: grid; grid-template-columns: 260px minmax(0, 46rem); gap: 48px; justify-content: center;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 80px; }
.side { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow: auto; font-size: 14px; line-height: 1.35; padding-right: 8px; }
.side-title { margin: 0 0 10px; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 800; color: var(--ink-3); }
.side ol, .side ul { list-style: none; margin: 0; padding: 0; }
.side li.part { margin: 14px 0 4px; font-weight: 800; color: var(--ink); }
.side a { display: block; padding: 4px 6px; border-radius: 6px; color: var(--ink-2); text-decoration: none; }
.side a:hover { background: var(--paper-2); color: var(--ink); }
.side li.part a { color: var(--ink); font-family: var(--display); }
main { min-width: 0; }
main h1 { font-family: var(--display); font-size: clamp(1.7rem, 4vw, 2.5rem); line-height: 1.1; letter-spacing: -0.02em; margin: 2.2em 0 0.6em; text-wrap: balance;
  padding: 12px 16px; background: var(--gold); color: var(--gold-ink); border-radius: 4px; box-shadow: 5px 5px 0 var(--shade); }
main h1:first-child { margin-top: 0; }
main h2 { font-family: var(--display); font-size: clamp(1.35rem, 3vw, 1.8rem); line-height: 1.2; margin: 2.4em 0 0.5em; padding-top: 0.6em; border-top: 2px solid var(--line); text-wrap: balance; scroll-margin-top: 12px; }
main h3 { font-family: var(--display); font-size: 1.2rem; margin: 1.9em 0 0.4em; scroll-margin-top: 12px; }
main h4 { font-size: 1.02rem; margin: 1.5em 0 0.3em; }
main p, main li { overflow-wrap: break-word; }
main p { margin: 0.8em 0; }
main ul, main ol { padding-left: 1.4em; }
main li { margin: 0.3em 0; }
main a { color: var(--sky); text-underline-offset: 2px; }
main blockquote { margin: 1em 0; padding: 0.4em 1em; border-left: 6px solid var(--gold); background: var(--paper); border-radius: 0 8px 8px 0; color: var(--ink-2); }
main code { font-family: var(--mono); font-size: 0.88em; padding: 1px 5px; border-radius: 4px; background: var(--code-inline); overflow-wrap: anywhere; }
main pre { margin: 1em 0; padding: 14px 16px; background: var(--code-bg); color: var(--code-ink); border-radius: 10px; overflow-x: auto; font-size: 13px; line-height: 1.55; }
main pre code { padding: 0; background: none; font-size: inherit; color: inherit; overflow-wrap: normal; }
.tw { margin: 1em 0; overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); }
main table { border-collapse: collapse; width: 100%; font-size: 14.5px; line-height: 1.45; }
main th, main td { padding: 8px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); min-width: 7rem; }
main th { background: var(--paper-2); font-size: 12.5px; letter-spacing: 0.04em; position: sticky; top: 0; }
main tr:last-child td { border-bottom: 0; }
main hr { border: 0; border-top: 2px solid var(--line); margin: 2em 0; }
:focus-visible { outline: 3px solid var(--gold); outline-offset: 2px; }
.toc-mobile { display: none; }
@media print {
  @page { size: A4; margin: 14mm 12mm; }
  :root, :root[data-theme="dark"] { --bg: #fff; --paper: #fff; --paper-2: #eef3f5; --ink: #111; --ink-2: #222; --ink-3: #444; --line: #aab; --sky: #0b4f6c;
    --code-bg: #f3f6f8; --code-ink: #0a1b2a; --code-inline: #eef2f4; --shade: transparent; color-scheme: light; }
  .side, .toc-mobile { display: none !important; }
  .wrap { display: block; padding: 0; }
  main h1 { break-before: page; box-shadow: none; border: 2px solid #111; background: #fff; color: #111; }
  main h1:first-child { break-before: auto; }
  main h2, main h3 { break-after: avoid; }
  main pre { white-space: pre-wrap; overflow-wrap: anywhere; border: 1px solid #889; font-size: 9.5px; break-inside: avoid; }
  .tw { overflow: visible; break-inside: auto; }
  main table { font-size: 10px; }
  main th { position: static; }
  main tr { break-inside: avoid; }
  main a { color: inherit; text-decoration: none; }
}
@media (max-width: 900px) {
  .wrap { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .side { display: none; }
  .toc-mobile { display: block; margin-bottom: 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--paper); }
  .toc-mobile summary { cursor: pointer; font-weight: 700; }
  .toc-mobile ol { list-style: none; padding: 0; margin: 8px 0 0; font-size: 14.5px; }
  .toc-mobile a { display: block; padding: 5px 0; color: var(--sky); text-decoration: none; }
}
"""


def build() -> str:
    md = markdown.Markdown(
        extensions=["tables", "fenced_code", "toc", "sane_lists"],
        extension_configs={"toc": {"slugify": lambda value, sep: slug(value), "toc_depth": "1-2"}},
    )
    body = md.convert(SOURCE.read_text(encoding="utf-8"))
    body = re.sub(r"<table>", '<div class="tw"><table>', body)
    body = body.replace("</table>", "</table></div>")

    def nav_items() -> str:
        """Части (h1) и главы (h2); заголовок документа и его вводные разделы в боковое оглавление не попадают."""
        out = []
        for top in md.toc_tokens:
            if top["name"].startswith("Руководство по проекту"):
                continue
            out.append(f'<li class="part"><a href="#{top["id"]}">{html.escape(top["name"])}</a></li>')
            for child in top.get("children", []):
                out.append(f'<li><a href="#{child["id"]}">{html.escape(child["name"])}</a></li>')
        return "\n".join(out)

    side_items = nav_items()
    title = "Руководство по Qazaq"
    return (f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>{CSS}</style>\n'
            f'<div class="wrap">\n<nav class="side" aria-label="Оглавление"><p class="side-title">Оглавление</p><ul>{side_items}</ul></nav>\n'
            f'<main>\n<details class="toc-mobile"><summary>Оглавление</summary><ol>{side_items}</ol></details>\n{body}\n</main>\n</div>\n')


def main() -> int:
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(build(), encoding="utf-8")
    print(f"{TARGET.relative_to(ROOT)}: {TARGET.stat().st_size // 1024} КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
