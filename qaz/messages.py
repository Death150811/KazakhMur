"""Перевод сообщений об ошибках на казахский.

Принцип: интерпретатор всегда формирует сообщение на русском (так проще тестировать и ловить
ошибки в программе через «байқа»). Перевод делается только в момент показа ошибки — по каталогу
шаблонов `messages_kk.json`. Тот же каталог и тот же алгоритм сопоставления использует JS-движок
сайта, поэтому оба движка показывают одинаковый текст (это проверяют тесты).

Шаблон — это текст с местами для подстановки `{имя}`. Сообщение переводится, только если оно
целиком совпало с шаблоном; иначе остаётся как есть (так что непереведённое сообщение не ломается).
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

LANGS = ("ru", "kk")
_PLACEHOLDER = re.compile(r"\{([a-z][a-z0-9_]*)\}")
# Подставляемые значения с этими именами сами могут быть описаниями на русском («конец файла») —
# их переводим отдельным списком фрагментов.
_FRAGMENT_NAMES = ("want", "got")


@lru_cache(maxsize=1)
def catalog() -> dict:
    return json.loads(Path(__file__).with_name("messages_kk.json").read_text(encoding="utf-8"))


def _compile(rules: list[list[str]]) -> list[tuple[re.Pattern, str]]:
    compiled = []
    for ru, kk in rules:
        pos, parts = 0, []
        for m in _PLACEHOLDER.finditer(ru):
            parts.append(re.escape(ru[pos:m.start()]))
            parts.append(f"(?P<{m.group(1)}>[\\s\\S]+?)")
            pos = m.end()
        parts.append(re.escape(ru[pos:]))
        compiled.append((re.compile("".join(parts)), kk))
    return compiled


@lru_cache(maxsize=1)
def _rules() -> tuple[list, list]:
    cat = catalog()
    return _compile(cat["messages"]), _compile(cat["fragments"])


def _apply(text: str, rules: list, fragments: list | None) -> str:
    for pattern, kk in rules:
        m = pattern.fullmatch(text)
        if not m:
            continue
        values = m.groupdict()
        if fragments is not None:
            for name in _FRAGMENT_NAMES:
                if name in values:
                    values[name] = _apply(values[name], fragments, None)
        return _PLACEHOLDER.sub(lambda ph: values.get(ph.group(1), ph.group(0)), kk)
    return text


def translate(text: str | None, lang: str = "kk") -> str | None:
    """Переводит одно сообщение или подсказку. Для lang='ru' и неизвестных текстов — без изменений."""
    if text is None or lang != "kk":
        return text
    messages, fragments = _rules()
    return _apply(text, messages, fragments)


def translate_title(title: str, lang: str = "kk") -> str:
    if lang != "kk":
        return title
    return catalog()["titles"].get(title, title)


def translate_error(error: dict | None, lang: str = "kk") -> dict | None:
    """Копия словаря ошибки (to_dict) с переведёнными title, message и hint."""
    if error is None or lang != "kk":
        return error
    out = dict(error)
    out["title"] = translate_title(error.get("title", ""), lang)
    out["message"] = translate(error.get("message"), lang)
    out["hint"] = translate(error.get("hint"), lang)
    return out


def label(key: str, lang: str = "ru") -> str:
    """Подписи, которые использует format_error."""
    if lang == "kk":
        return catalog()["labels"][key]
    return {
        "file": "файл", "line": "строка", "column": "столбец", "hint": "Подсказка",
        "called": "  функция {name}() вызвана {where}", "called_at": "на строке {line}",
        "called_unknown": "(строка неизвестна)", "skipped": "… ещё {n} вызовов …",
    }[key]
