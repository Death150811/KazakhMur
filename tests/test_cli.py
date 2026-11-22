import io
import subprocess
import sys
from pathlib import Path

from qaz.repl import run_repl

ROOT = Path(__file__).resolve().parent.parent


def qaz(*args, stdin=None):
    return subprocess.run([sys.executable, "-m", "qaz", *args], capture_output=True, text=True,
                          encoding="utf-8", input=stdin, cwd=ROOT, timeout=60)


def test_version_and_help():
    r = qaz("version")
    assert r.returncode == 0 and r.stdout.startswith("Qazaq ")
    for args in (["help"], [], ["--help"]):
        r = qaz(*args)
        assert r.returncode == 0 and "qaz run" in r.stdout and "qaz repl" in r.stdout


def test_run_file(tmp_path):
    f = tmp_path / "main.qaz"
    f.write_text('жаз("Сәлем,", 1 + 2).\n', encoding="utf-8")
    r = qaz("run", str(f))
    assert r.returncode == 0 and r.stdout == "Сәлем, 3\n" and r.stderr == ""
    assert qaz(str(f)).stdout == "Сәлем, 3\n"  # сокращённая форма


def test_run_error_exit_code_and_message(tmp_path):
    f = tmp_path / "main.qaz"
    f.write_text("айным x = 1.\nжаз(x / 0).\n", encoding="utf-8")
    r = qaz("run", str(f))
    assert r.returncode == 1
    assert "строка 2" in r.stderr and "^" in r.stderr and "ноль" in r.stderr


def test_syntax_error_reports_line_and_column(tmp_path):
    f = tmp_path / "bad.qaz"
    f.write_text("айным x = 1\nжаз(x).\n", encoding="utf-8")
    r = qaz("run", str(f))
    assert r.returncode == 1 and "Синтаксическая ошибка" in r.stderr
    assert "строка 1, столбец 12" in r.stderr and "точкой" in r.stderr


def test_missing_file():
    r = qaz("run", "/нет/такого.qaz")
    assert r.returncode == 2 and "не найден" in r.stderr


def test_check(tmp_path):
    good = tmp_path / "g.qaz"
    good.write_text("жаз(1).\n", encoding="utf-8")
    bad = tmp_path / "b.qaz"
    bad.write_text("егер x\n    жаз(1).\n", encoding="utf-8")
    assert qaz("check", str(good)).returncode == 0
    r = qaz("check", str(bad))
    assert r.returncode == 1 and "двоеточие" in r.stderr
    # check не исполняет программу
    side = tmp_path / "s.qaz"
    side.write_text('жаз("не должно печататься").\n', encoding="utf-8")
    assert qaz("check", str(side)).stdout.count("не должно") == 0


def test_run_limits_flags(tmp_path):
    f = tmp_path / "loop.qaz"
    f.write_text("әзір ақиқат:\n    өткіз.\n", encoding="utf-8")
    r = qaz("run", "--max-steps", "5000", str(f))
    assert r.returncode == 1 and "лимит" in r.stderr
    r = qaz("run", "--timeout", "0.3", str(f))
    assert r.returncode == 1 and "время" in r.stderr


def test_unknown_command():
    assert qaz("бар").returncode == 2


def test_stdin_input(tmp_path):
    f = tmp_path / "i.qaz"
    f.write_text('айным а = енгіз().\nжаз(ф"Сәлем, {а}!").\n', encoding="utf-8")
    assert qaz("run", str(f), stdin="Айдана\n").stdout == "Сәлем, Айдана!\n"


# ---------- REPL ----------
def repl(text):
    out = io.StringIO()
    run_repl(stdin=io.StringIO(text), stdout=out, interactive=False)
    return out.getvalue()


def test_repl_state_and_echo():
    out = repl('айным a = 2\na * 21\nжаз("сәлем")\n')
    assert out == "42\nсәлем\n" or out.splitlines()[-2:] == ["42", "сәлем"]
    assert "42" in out and "сәлем" in out


def test_repl_multiline_block():
    out = repl("функ f(x):\n    қайтар x + 1.\n\nf(41)\n")
    assert "42" in out


def test_repl_bracket_continuation():
    assert "6" in repl("жаз(1 +\n2 +\n3\n)\n\n").splitlines()


def test_repl_error_does_not_exit():
    out = repl("1 / 0\nжаз(\"тірі\")\n")
    assert "ноль" in out and "тірі" in out


def test_repl_syntax_error_and_exit_word():
    out = repl("жаз(\nшығу\n")  # открытая скобка + слово выхода — внутри незавершённой инструкции
    assert isinstance(out, str)
    out = repl("егер\nжаз(5)\nшығу\nжаз(6)\n")
    assert "Синтаксическая ошибка" in out and "5" in out and "6" not in out.replace("столбец 6", "")


def test_repl_subprocess():
    r = qaz("repl", stdin="1 + 1\nшығу\n")
    assert r.returncode == 0 and "2" in r.stdout
