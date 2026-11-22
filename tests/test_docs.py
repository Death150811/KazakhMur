"""Примеры кода в документации должны быть работающими, а справочник — актуальным."""
import io
import re
import sys
from pathlib import Path

import pytest

from qaz.interpreter import Interpreter, Limits
from qaz.lexer import Lexer
from qaz.parser import Parser

ROOT = Path(__file__).resolve().parent.parent
DOCS = [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md"))]
BLOCK = re.compile(r"```(qaz-run|qaz)\n(.*?)```", re.S)


def blocks():
    for path in DOCS:
        text = path.read_text(encoding="utf-8")
        for i, m in enumerate(BLOCK.finditer(text)):
            yield pytest.param(path.name, m.group(1), m.group(2), id=f"{path.name}#{i}")


@pytest.mark.parametrize("name,kind,code", list(blocks()))
def test_doc_code_blocks(name, kind, code):
    Parser(Lexer(code).tokenize()).parse_program()  # синтаксис корректен
    if kind == "qaz-run":
        out = io.StringIO()
        Interpreter(stdout=out, stdin=io.StringIO(""), limits=Limits(max_steps=1_000_000, timeout=10),
                    safe=True).run_source(code)


def test_there_are_runnable_doc_examples():
    assert sum(1 for _ in blocks()) >= 12


def test_stdlib_reference_is_up_to_date():
    sys.path.insert(0, str(ROOT / "scripts"))
    import gen_stdlib_doc
    assert gen_stdlib_doc.TARGET.read_text(encoding="utf-8") == gen_stdlib_doc.render(), \
        "docs/STANDARD_LIBRARY.md устарел: python scripts/gen_stdlib_doc.py"


def test_every_builtin_is_documented():
    from qaz.stdlib import BUILTINS
    text = (ROOT / "docs" / "STANDARD_LIBRARY.md").read_text(encoding="utf-8")
    for name in BUILTINS:
        assert f"`{name}(" in text or f"`{name}`" in text, name
