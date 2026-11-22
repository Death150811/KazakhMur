"""Фаззинг: на любом входе интерпретатор может поднять только QazaqError, но не исключение Python."""
import io
import random
from pathlib import Path

from qaz.errors import QazaqError
from qaz.interpreter import Interpreter, Limits
from qaz.lexer import Lexer
from qaz.parser import Parser
from qaz.tokens import KEYWORDS

ROOT = Path(__file__).resolve().parent.parent
PIECES = sorted(KEYWORDS) + [
    "жаз", "x", "y", "f", "сұрып", "ұзындық", "аралық", "(", ")", "[", "]", "{", "}", ",", ":", ".",
    "+", "-", "*", "/", "//", "%", "**", "==", "!=", "<", ">=", "=", "+=", "1", "0", "3.14", "1e5",
    '"а"', "'б'", '"""', 'ф"{x}"', 'ф"{', "#", "\n", "\n    ", "\n        ", " ", "  ", "\t", ";", "²",
    "٣", "😀", "́", "\\", "@", "$", "кері", "енгіз", "түбір", "талда", "тізім", "сөздік",
]


def attempt(source: str):
    out = io.StringIO()
    try:
        Parser(Lexer(source).tokenize()).parse_program()
        interp = Interpreter(stdout=out, stdin=io.StringIO("1\n2\n"), safe=True,
                             limits=Limits(max_steps=2000, max_depth=50, timeout=2, max_output=5000))
        interp.run_source(source)
    except QazaqError:
        pass  # ожидаемо


def test_random_token_soup():
    rng = random.Random(20260101)
    for _ in range(3000):
        source = " ".join(rng.choice(PIECES) for _ in range(rng.randint(1, 25)))
        attempt(source)


def test_mutated_examples():
    rng = random.Random(7)
    sources = [p.read_text(encoding="utf-8") for p in sorted((ROOT / "examples").glob("*.qaz"))
               if "science" not in p.name]
    for _ in range(1500):
        text = list(rng.choice(sources))
        for _ in range(rng.randint(1, 6)):
            op = rng.random()
            i = rng.randrange(len(text)) if text else 0
            if op < 0.4 and text:
                del text[i]
            elif op < 0.8:
                text.insert(i, rng.choice(PIECES)[:3])
            elif text:
                text[i] = rng.choice(PIECES)[0]
        attempt("".join(text))


def test_pathological_inputs():
    for source in ["(" * 3000, "[" * 3000 + "]" * 3000, "-" * 5000 + "1.", "жаз(" * 400 + ")" * 400 + ".",
                   "егер ақиқат:\n" + "".join("    " * i + "егер ақиқат:\n" for i in range(1, 80)) + "    " * 80 + "жаз(1).\n",
                   "1 + " * 3000 + "1.", '"' * 7, "ф\"" + "{" * 50, "\x00", "айным x = " + "9" * 5000 + "."]:
        attempt(source)
