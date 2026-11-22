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
