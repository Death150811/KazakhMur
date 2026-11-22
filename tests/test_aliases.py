"""Полные написания принимаются наравне с краткими."""
import pytest

from conftest import run
from qaz.lexer import tokenize

try:
    import sympy  # noqa: F401
    HAVE_SYMPY = True
except ImportError:
    HAVE_SYMPY = False


def test_keyword_aliases_become_canonical_tokens():
    assert tokenize("айнымалы")[0].value == "айным"
    assert tokenize("функция")[0].value == "функ"
    assert tokenize("айным")[0].value == "айным"


def test_both_spellings_behave_identically():
    short = "айным x = 5.\nфунк f(a):\n    қайтар a * 2.\nжаз(f(x))."
    full = "айнымалы x = 5.\nфункция f(a):\n    қайтар a * 2.\nжаз(f(x))."
    assert run(short) == run(full) == "10\n"


def test_mixed_spellings_in_one_program():
    src = "айнымалы а = 1.\nайным б = 2.\nфункция қос(x):\n    қайтар x + а.\nфунк үш(x):\n    қайтар қос(x) + б.\nжаз(үш(0))."
    assert run(src) == "3\n"


def test_alias_in_class_and_nfd():
    src = "сынып A:\n    функция жасау(өзі):\n        өзі.v = 1.\nжаз(A().v)."
    assert run(src) == "1\n"


def test_aliases_are_reserved_words():
    from qaz.errors import QazaqSyntaxError
    with pytest.raises(QazaqSyntaxError):
        run("айным функция = 1.")


@pytest.mark.skipif(not HAVE_SYMPY, reason="SymPy не установлен")
def test_builtin_aliases():
    assert run('жаз(туын("x^2"), туынды("x^2")).') == "2*x 2*x\n"
    assert run('жаз(интегр("x"), интеграл("x")).') == "x^2/2 x^2/2\n"


def test_builtin_aliases_registered_to_same_function():
    from qaz.stdlib import ALIASES, BUILTINS
    assert ALIASES == {"туынды": "туын", "интеграл": "интегр"}
    assert BUILTINS["туынды"] is BUILTINS["туын"]
