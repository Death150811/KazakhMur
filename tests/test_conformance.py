"""Дифференциальные тесты: Python-интерпретатор и JS-движок сайта обязаны давать одинаковый результат."""
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from conformance_corpus import PROGRAMS, STDIN  # noqa: E402
from qaz.runner import execute  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")
pytestmark = pytest.mark.skipif(NODE is None, reason="Node.js не установлен")

try:
    import sympy  # noqa: F401
    HAVE_SYMPY = True
except ImportError:
    HAVE_SYMPY = False


def python_result(code: str, stdin: str = "") -> dict:
    res = execute({"code": code, "stdin": stdin, "max_depth": 150, "timeout": 10,
                   "max_steps": 3_000_000, "max_output": 65_536})
    return normalise(res)


def normalise(res: dict) -> dict:
    err = res["error"]
    if err is not None:
        err = {k: err.get(k) for k in ("title", "message", "line", "column", "hint")}
        err["trace"] = [(t["function"], t["line"]) for t in res["error"].get("trace", [])]
    return {"status": res["status"], "stdout": res["stdout"], "error": err}


def node_results_lang(items: list[dict]) -> dict:
    return node_results(items)


def node_results(items: list[dict]) -> dict:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_site.py")], check=True,
                   capture_output=True, cwd=ROOT)
    proc = subprocess.run([NODE, str(ROOT / "site" / "test" / "run_corpus.js")], input=json.dumps(items),
                          capture_output=True, text=True, encoding="utf-8", timeout=300, cwd=ROOT)
    assert proc.returncode == 0, proc.stderr
    out = {}
    for item in json.loads(proc.stdout):
        out[item["name"]] = normalise(item["result"])
    return out


def doc_blocks():
    for path in [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md"))]:
        text = path.read_text(encoding="utf-8")
        for i, m in enumerate(re.finditer(r"```qaz(?:-run)?\n(.*?)```", text, re.S)):
            yield f"doc_{path.stem}_{i}", m.group(1)


def example_programs():
    for path in sorted((ROOT / "examples").glob("*.qaz")):
        if "science" in path.stem:
            continue
        yield f"example_{path.stem}", path.read_text(encoding="utf-8")


def all_programs() -> dict[str, tuple[str, str]]:
    progs = {k: (v, STDIN.get(k, "")) for k, v in PROGRAMS.items()}
    for name, code in list(example_programs()) + list(doc_blocks()):
        progs[name] = (code, "")
    tour = json.loads((ROOT / "site" / "src" / "tour.json").read_text(encoding="utf-8"))
    for item in tour["cards"] + tour["sections"]:
        progs[f"tour_{item['id']}_{len(progs)}"] = (item["code"], "")
    book = json.loads((ROOT / "site" / "src" / "book.json").read_text(encoding="utf-8"))
    for chapter in book["chapters"]:
        if chapter["try"]:
            progs[f"book_{chapter['id']}"] = (chapter["try"]["code"], "")
    if not HAVE_SYMPY:  # без SymPy научные функции в Python-движке недоступны — такие программы не сравниваем
        progs = {n: pc for n, pc in progs.items() if not re.search(r"(шеш|туын|туынды|интегр|интеграл|сыз)\(", pc[0])}
    return progs


def test_engines_agree_on_every_program():
    progs = all_programs()
    js = node_results([{"name": n, "code": c, "stdin": s} for n, (c, s) in progs.items()])
    assert len(js) == len(progs)
    mismatches = []
    for name, (code, stdin) in progs.items():
        py = python_result(code, stdin)
        if py != js[name]:
            mismatches.append((name, py, js[name]))
    if mismatches:
        lines = [f"Расхождений: {len(mismatches)} из {len(progs)}"]
        for name, py, js_ in mismatches[:12]:
            lines.append(f"\n=== {name}")
            for key in ("status", "stdout", "error"):
                if py[key] != js_[key]:
                    lines.append(f"  {key}:\n    PY: {py[key]!r}\n    JS: {js_[key]!r}")
        pytest.fail("\n".join(lines))


def test_corpus_is_substantial():
    assert len(PROGRAMS) >= 250


# ---------------- случайные выражения ----------------
def random_expressions(seed: int, count: int) -> list[str]:
    import random
    rng = random.Random(seed)
    atoms = ["0", "1", "2", "3", "7", "10", "-1", "-5", "100", "2.5", "0.1", "-0.5", "3.0", "1e3", "0.0",
             "1e-3", "123456789", "10 ** 18", "ақиқат", "жалған", "бос", '"а"', '"қаз"', '""', "[1, 2, 3]",
             "[]", "[1.5, 2]", '{"а": 1}', "аралық(5)", "аралық(10, 0, -3)", "1e300", "7.25"]
    binops = ["+", "-", "*", "/", "//", "%", "**", "==", "!=", "<", "<=", ">", ">=", "және", "немесе",
              "ішінде", "емес ішінде", "**", "*", "+"]
    funcs = ["модуль", "дөңгелекте", "еден", "төбе", "түбір", "бүтін", "нақты", "мәтін", "ұзындық", "түр",
             "минимум", "максимум", "қосынды", "сұрып", "кері", "логика", "факториал", "тізім"]

    def expr(depth):
        r = rng.random()
        if depth <= 0 or r < 0.25:
            return rng.choice(atoms)
        if r < 0.65:
            return f"({expr(depth - 1)} {rng.choice(binops)} {expr(depth - 1)})"
        if r < 0.75:
            return f"(-{expr(depth - 1)})" if rng.random() < 0.5 else f"(емес {expr(depth - 1)})"
        if r < 0.86:
            return f"{rng.choice(funcs)}({expr(depth - 1)})"
        if r < 0.9:
            # последний бит libm зависит от платформы, поэтому результат округляем
            fn = rng.choice(["синус", "косинус", "тангенс", "логарифм"])
            return f"дөңгелекте({fn}({expr(depth - 1)}), 8)"
        if r < 0.95:
            return f"{expr(depth - 1)}[{rng.choice(['0', '1', '-1', '1:', ':2', '::-1', '5', '0:3:2'])}]"
        spec = rng.choice([".2f", ">8", "<6", "^7", "05d", ",", ".3e", "g", "x", "%", "+.1f", ".0f", "10.4", "d", "s"])
        return f'ф"{{{expr(depth - 1)}:{spec}}}"'

    return [expr(rng.randint(1, 4)) for _ in range(count)]


def test_engines_agree_on_random_expressions():
    exprs = random_expressions(20260101, 4000)
    items = []
    for chunk_start in range(0, len(exprs), 50):
        chunk = exprs[chunk_start:chunk_start + 50]
        code = "".join(f"байқа:\n    жаз({e}).\nқате е:\n    жаз(\"ERR\", е).\n" for e in chunk)
        items.append({"name": f"fuzz_{chunk_start}", "code": code, "stdin": ""})
    js = node_results(items)
    bad = []
    for item in items:
        py = python_result(item["code"])
        if py != js[item["name"]]:
            py_lines = py["stdout"].split("\n")
            js_lines = js[item["name"]]["stdout"].split("\n")
            start = int(item["name"].split("_")[1])
            if len(py_lines) != len(js_lines):
                bad.append((item["name"], "разное число строк", py["error"], js[item["name"]]["error"]))
                continue
            for i, (a, b) in enumerate(zip(py_lines, js_lines)):
                if a != b:
                    bad.append((exprs[start + i] if i < 50 else "?", a, b))
    if bad:
        pytest.fail(f"Расхождений: {len(bad)}\n" + "\n".join(str(b) for b in bad[:25]))


# ---------------- символьные функции: JS (многочлены) против SymPy ----------------
def random_polynomials(seed: int, count: int) -> list[str]:
    import random
    rng = random.Random(seed)

    def mono():
        coef = rng.choice([1, 1, 2, 3, 4, 5, 6, 7, 9, 12])
        deg = rng.choice([0, 1, 1, 2, 2, 3, 3, 4, 5])
        div = rng.choice([1, 1, 1, 2, 3, 4, 8])
        if deg == 0:
            body = str(coef)
        else:
            var = "x" if deg == 1 else f"x^{deg}"
            kind = rng.random()
            body = var if coef == 1 and kind < 0.7 else (f"{coef}*{var}" if kind < 0.85 else f"{coef}{var}")
        if div != 1:
            body += f"/{div}"
        return body

    def poly():
        n = rng.randint(1, 4)
        out = mono() if rng.random() < 0.8 else "-" + mono()
        for _ in range(n - 1):
            out += rng.choice([" + ", " - ", "+", "-"]) + mono()
        return out

    progs = []
    for _ in range(count):
        p, q = poly(), poly()
        kind = rng.randint(0, 4)
        if kind == 0:
            progs.append(f'жаз(туын("{p}")).')
        elif kind == 1:
            progs.append(f'жаз(интегр("{p}")).')
        elif kind == 2:
            progs.append(f'жаз(интегр("{p}", "x", {rng.randint(-3, 2)}, {rng.randint(3, 6)})).')
        elif kind == 3:
            progs.append(f'жаз(шеш("{p}")).')
        else:
            progs.append(f'жаз(шеш("{p} = {q}")).')
    # известные примеры
    progs += ['жаз(шеш("x^2 - 9 = 0")).', 'жаз(шеш("x^2 = 2")).', 'жаз(шеш("2*x + 4")).', 'жаз(шеш("x^3 - x")).',
              'жаз(шеш("x^2 - x - 1")).', 'жаз(шеш("6*x^2 - 5*x + 1")).', 'жаз(туын("1 - x^2")).',
              'жаз(интегр("1 - x^2")).', 'жаз(интегр("x^2", "x", 0, 3)).', 'жаз(туын("x^3 + 2*x")).',
              'жаз(шеш("y^2 = 4")).', 'жаз(туын("2x")).', 'жаз(интегр("0")).', 'жаз(туын("7")).']
    return progs


def test_engines_agree_on_polynomials():
    pytest.importorskip("sympy")
    progs = random_polynomials(777, 400)
    items = [{"name": f"poly_{i}", "stdin": "",
              "code": f"байқа:\n    {p}\nқате е:\n    жаз(\"ERR\", е).\n"} for i, p in enumerate(progs)]
    js = node_results(items)
    bad, unsupported = [], 0
    for item, prog in zip(items, progs):
        py = python_result(item["code"])
        got = js[item["name"]]
        if "в браузерной версии" in got["stdout"]:
            unsupported += 1
            continue
        if py != got:
            bad.append((prog, py["stdout"], got["stdout"]))
    assert unsupported <= len(progs) * 0.25, f"слишком много неподдерживаемых: {unsupported}"
    if bad:
        pytest.fail(f"Расхождений: {len(bad)} (неподдерживаемых: {unsupported})\n" + "\n".join(str(b) for b in bad[:20]))


# ---------------- мутанты: испорченные программы (ошибки лексера и парсера тоже должны совпасть) ----------------
MUTATION_TOKENS = ["*", "**", "жиын(", ")", "(", "[", "]", "{", "}", ".", ",", ":", "кілт =", "соңы =", "*[1]", "**{}",
                   "әрбір", "ішінде", "функ(*а): а", "жиын([1,", "|>", "?", "!", "бос", "\"", "'", "ф\"{", "}\"", "\n",
                   "    ", "егер", "әйтпесе", "лақтыр", "қайтар", "=", "+=", ";", "#"]


def mutate(src: str, rng) -> str:
    s = list(src)
    for _ in range(rng.randint(1, 4)):
        op, i = rng.random(), rng.randrange(len(s) + 1)
        if op < 0.4 and s:
            del s[min(i, len(s) - 1)]
        elif op < 0.8:
            s.insert(i, rng.choice(MUTATION_TOKENS))
        else:
            j = rng.randrange(len(s) + 1)
            s[i:i] = list(src[j:j + rng.randint(1, 12)])
    return "".join(s)


def test_engines_agree_on_mutated_programs():
    import random
    rng = random.Random(20261123)
    base = list(PROGRAMS.values())
    cases = [mutate(rng.choice(base), rng) for _ in range(700)]
    items = [{"name": f"mut_{i}", "code": c, "stdin": ""} for i, c in enumerate(cases)]
    js = node_results(items)
    bad = []
    for item in items:
        py = python_result(item["code"])
        if py != js[item["name"]]:
            bad.append((item["code"][:200], py["error"], js[item["name"]]["error"]))
        assert py["error"] is None or py["error"]["title"] != "Внутренняя ошибка", item["code"][:200]
    assert not bad, f"Расхождений: {len(bad)}\n" + "\n".join(str(b) for b in bad[:5])
