"""Книга на сайте: ссылки на термины, примеры кода, словарь."""
import json
import re
from pathlib import Path

from qaz.runner import execute

ROOT = Path(__file__).resolve().parent.parent
BOOK = json.loads((ROOT / "site" / "src" / "book.json").read_text(encoding="utf-8"))
MARK = re.compile(r"\[\[([a-z0-9-]+)\|(.+?)\]\]")


def all_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for v in node.values():
            yield from all_strings(v)
    elif isinstance(node, list):
        for v in node:
            yield from all_strings(v)


def test_ids_are_unique_and_chapters_exist():
    chapters = [c["id"] for c in BOOK["chapters"]]
    terms = [g["id"] for g in BOOK["glossary"]]
    assert len(chapters) == len(set(chapters)) and len(terms) == len(set(terms))
    assert len(chapters) >= 12 and len(terms) >= 60
    for g in BOOK["glossary"]:
        assert g["chapter"] in chapters, g["id"]
        assert g["short"].strip() and g["more"].strip() and g["term"].strip()


def test_every_term_reference_exists():
    ids = {g["id"] for g in BOOK["glossary"]}
    seen = set()
    for text in all_strings(BOOK):
        for m in MARK.finditer(text):
            assert m.group(1) in ids, f"неизвестный термин {m.group(1)}"
            seen.add(m.group(1))
    assert len(seen) >= 60, "в тексте слишком мало терминов"


def test_book_code_examples_run():
    for chapter in BOOK["chapters"]:
        example = chapter["try"]
        if not example:
            continue
        res = execute({"code": example["code"], "timeout": 10, "max_steps": 300000})
        if chapter["id"] == "safety":
            assert res["status"] == "limit", "пример про лимиты должен упираться в лимит"
        else:
            assert res["status"] == "ok", (chapter["id"], res["error"])
            assert res["stdout"].strip(), chapter["id"]


def test_every_chapter_has_three_levels_and_questions():
    for c in BOOK["chapters"]:
        assert c["kid"].strip() and c["body"] and c["here"].strip() and c["lead"].strip(), c["id"]
        assert len(c["check"]) >= 3, c["id"]


def test_book_numbers_match_the_project():
    # числа в тексте книги не должны разойтись с реальностью
    from qaz.language import language_definition
    lang = language_definition()
    text = "\n".join(all_strings(BOOK))
    assert f"{len(lang['builtins'])} функции и {len(lang['methods'])} метода" in text or \
        f"{len(lang['builtins'])} функций и {len(lang['methods'])} методов" in text or \
        f"{len(lang['builtins'])} функции" in text
    assert len(lang["keywords"]) == 22
