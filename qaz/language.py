"""Описание языка в виде данных: ключевые слова, синонимы, встроенные функции.

Единый источник правды для подсветки синтаксиса, автодополнения, документации и сайта.
"""
from __future__ import annotations

from . import __version__
from .stdlib import ALIASES, BUILTINS, CONSTANTS, METHODS
from .tokens import KEYWORD_ALIASES, KEYWORD_INFO


def language_definition() -> dict:
    """Единый источник правды о языке: подсветка, автодополнение, документация, сайт."""
    kw_aliases: dict[str, list[str]] = {}
    for alias_name, main in KEYWORD_ALIASES.items():
        kw_aliases.setdefault(main, []).append(alias_name)
    fn_aliases: dict[str, list[str]] = {}
    for alias_name, main in ALIASES.items():
        fn_aliases.setdefault(main, []).append(alias_name)
    return {
        "version": __version__,
        "keywords": [{"name": k, "aliases": kw_aliases.get(k, []), "equivalent": v[0],
                      "description": v[1]} for k, v in KEYWORD_INFO.items()],
        "builtins": [{"name": b.name, "aliases": fn_aliases.get(b.name, []), "category": b.category,
                      "signature": b.sig, "doc": b.doc, "unsafe": b.unsafe}
                     for name, b in BUILTINS.items() if name == b.name],
        "constants": sorted(CONSTANTS),
        "methods": sorted({name for table in METHODS.values() for name in table}),
        "literals": ["ақиқат", "жалған", "бос"],
    }
