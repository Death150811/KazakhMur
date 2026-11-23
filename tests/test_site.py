"""Сайт: сборка, самодостаточность и сквозная проверка в браузере (если доступен Playwright)."""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


@pytest.fixture(scope="module")
def built():
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build_site.py")], check=True, capture_output=True, cwd=ROOT)
    return ROOT / "site" / "dist"


def test_build_outputs(built):
    for name in ("index.html", "fragment.html", "engine.js", "language.json"):
        assert (built / name).exists(), name
    index = (built / "index.html").read_text(encoding="utf-8")
    fragment = (built / "fragment.html").read_text(encoding="utf-8")
    assert index.startswith("<!doctype html>")
    assert fragment.lstrip().startswith("<title>")
    assert "<!doctype" not in fragment.lower() and "<body" not in fragment.lower()
    assert len(fragment.encode("utf-8")) < 2_000_000


def test_page_is_self_contained(built):
    """Все скрипты и стили встроены; наружу идёт только запрос шрифтов Google Fonts."""
    text = (built / "fragment.html").read_text(encoding="utf-8")
    assert "<script src=" not in text
    for url in re.findall(r'(?:src|href)="(https?://[^"]+)"', text):
        assert url.startswith(("https://fonts.googleapis.com", "https://fonts.gstatic.com")), url
    assert "eval(" not in text.replace("evaluate(", "")


def test_language_json_matches_python(built):
    from qaz.language import language_definition
    data = json.loads((built / "language.json").read_text(encoding="utf-8"))
    assert data == json.loads(json.dumps(language_definition()))
    names = {k["name"] for k in data["keywords"]}
    assert {"айным", "функ", "егер"} <= names
    aliases = {a for k in data["keywords"] for a in k["aliases"]}
    assert aliases == {"айнымалы", "функция"}


def test_tour_snippets_run_in_both_engines(built):
    tour = json.loads((ROOT / "site" / "src" / "tour.json").read_text(encoding="utf-8"))
    from qaz.runner import execute
    try:
        import sympy  # noqa: F401
        have_sympy = True
    except ImportError:
        have_sympy = False
    for item in tour["cards"] + tour["sections"]:
        if not have_sympy and re.search(r"(шеш|туын|туынды|интегр|интеграл|сыз)\(", item["code"]):
            continue  # научные функции Python-движка требуют SymPy
        res = execute({"code": item["code"]})
        expected_error = item.get("expect") == "error"
        assert (res["status"] == "error") == expected_error, (item["id"], res["error"])


@pytest.mark.skipif(NODE is None, reason="Node.js не установлен")
def test_browser_end_to_end(built):
    env = dict(os.environ)
    if "NODE_PATH" not in env:
        root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True)
        if root.returncode == 0:
            env["NODE_PATH"] = root.stdout.strip()
    proc = subprocess.run([NODE, str(ROOT / "site" / "test" / "e2e.js")], capture_output=True, text=True,
                          encoding="utf-8", env=env, cwd=ROOT, timeout=280)
    if proc.returncode == 77:
        pytest.skip("Playwright недоступен")
    assert proc.returncode == 0, proc.stdout + proc.stderr


@pytest.mark.skipif(NODE is None, reason="Node.js не установлен")
def test_accessibility_audit(built):
    env = dict(os.environ)
    if "NODE_PATH" not in env:
        root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True)
        if root.returncode == 0:
            env["NODE_PATH"] = root.stdout.strip()
    proc = subprocess.run([NODE, str(ROOT / "site" / "test" / "a11y.js")], capture_output=True, text=True,
                          encoding="utf-8", env=env, cwd=ROOT, timeout=280)
    if proc.returncode == 77:
        pytest.skip("Playwright или axe-core недоступны")
    assert proc.returncode == 0, proc.stdout + proc.stderr


@pytest.mark.skipif(NODE is None, reason="Node.js не установлен")
def test_performance_budget(built):
    env = dict(os.environ)
    if "NODE_PATH" not in env:
        root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True)
        if root.returncode == 0:
            env["NODE_PATH"] = root.stdout.strip()
    proc = subprocess.run([NODE, str(ROOT / "site" / "test" / "perf.js")], capture_output=True, text=True,
                          encoding="utf-8", env=env, cwd=ROOT, timeout=280)
    if proc.returncode == 77:
        pytest.skip("Playwright недоступен")
    assert proc.returncode == 0, proc.stdout + proc.stderr


@pytest.mark.skipif(NODE is None, reason="Node.js не установлен")
def test_js_engine_api(built):
    """tokens/tree/trace/translateError — возможности JS-движка, которых нет в Python."""
    proc = subprocess.run([NODE, str(ROOT / "site" / "test" / "engine_api.js")], capture_output=True, text=True,
                          encoding="utf-8", cwd=ROOT, timeout=120)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert "ENGINE API OK" in proc.stdout
