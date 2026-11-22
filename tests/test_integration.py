"""Сквозные тесты: исходный код -> лексер -> парсер -> AST -> интерпретатор -> вывод."""
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = sorted((ROOT / "examples").glob("*.qaz"))

try:
    import sympy  # noqa: F401
    HAVE_SYMPY = True
except ImportError:
    HAVE_SYMPY = False


def test_examples_exist():
    assert len(EXAMPLES) >= 8


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.name)
def test_example_matches_golden_output(path):
    if path.name == "08_science.qaz" and not HAVE_SYMPY:
        pytest.skip("SymPy не установлен")
    expected = path.with_suffix(".expected").read_text(encoding="utf-8")
    r = subprocess.run([sys.executable, "-m", "qaz", "run", str(path)], capture_output=True,
                       text=True, encoding="utf-8", cwd=ROOT, timeout=60)
    assert r.returncode == 0, r.stderr
    assert r.stdout == expected


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.name)
def test_example_passes_check(path):
    r = subprocess.run([sys.executable, "-m", "qaz", "check", str(path)], capture_output=True,
                       text=True, encoding="utf-8", cwd=ROOT, timeout=60)
    assert r.returncode == 0, r.stderr


def test_pipeline_stages_are_separate():
    from qaz.ast_nodes import Program
    from qaz.interpreter import Interpreter
    from qaz.lexer import tokenize
    from qaz.parser import Parser
    import io
    tokens = tokenize('жаз("бар").')
    program = Parser(tokens).parse_program()
    assert isinstance(program, Program)
    out = io.StringIO()
    Interpreter(stdout=out).run(program)
    assert out.getvalue() == "бар\n"


def test_no_python_eval_or_exec_in_interpreter():
    """Пользовательский код не исполняется через eval/exec."""
    import re
    for path in (ROOT / "qaz").rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        code = "\n".join(line for line in text.splitlines()
                         if not line.lstrip().startswith(("#", '"', "'")))
        # parse_expr в science.py разбирает проверенное выражение SymPy, а не код Qazaq
        for m in re.finditer(r"(?<![\w.])(eval|exec)\(", code):
            pytest.fail(f"{path.name}: найден вызов {m.group(1)}()")
