"""Подсветка синтаксиса во фронтенде должна соответствовать реальному языку."""
import json
import re
import sys
from pathlib import Path

import pytest

pytest.importorskip("fastapi")

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import gen_language_def  # noqa: E402


def test_generated_language_file_is_up_to_date():
    current = gen_language_def.TARGET.read_text(encoding="utf-8")
    assert current == gen_language_def.render(), \
        "language.generated.json устарел: запустите python scripts/gen_language_def.py"


def test_every_keyword_and_builtin_is_in_generated_file():
    from qaz.stdlib import BUILTINS
    from qaz.tokens import KEYWORDS
    data = json.loads(gen_language_def.TARGET.read_text(encoding="utf-8"))
    from qaz.tokens import KEYWORD_ALIASES
    assert {k["name"] for k in data["keywords"]} | set(KEYWORD_ALIASES) == set(KEYWORDS)
    from qaz.stdlib import ALIASES
    assert {b["name"] for b in data["builtins"]} | set(ALIASES) == set(BUILTINS)


def test_monarch_grammar_uses_lexer_rules():
    """Правила точки в подсветке совпадают с правилами лексера."""
    text = (ROOT / "frontend" / "src" / "editor" / "qazaqLanguage.ts").read_text(encoding="utf-8")
    assert "terminator" in text and "(?=\\s|$|#)" in text  # точка-завершитель
    assert re.search(r"member", text)                        # точка доступа к члену
