"""Казахские сообщения об ошибках: полнота каталога, одинаковый перевод в Python и JS, CLI."""
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from test_conformance import NODE, all_programs, python_result  # noqa: E402
from qaz import messages  # noqa: E402
from qaz.errors import LexicalError, QazaqRuntimeError, format_error  # noqa: E402
from qaz.runner import execute  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PH = re.compile(r"\{([a-z][a-z0-9_]*)\}")
ERROR_CLASSES = {"QazaqError", "LexicalError", "QazaqSyntaxError", "QazaqRuntimeError", "ResourceLimitError",
                 "self.error", "rt_error"}


MARK = "\x00"


def sample(template: str) -> str:
    """Подставляет вместо подставляемых выражений заглушку Z, как это сделала бы реальная ошибка."""
    return template.replace(MARK, "Z").replace("<?>", "Z")


def template_of(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, ast.JoinedStr):
        s = ""
        for v in node.values:
            s += v.value if isinstance(v, ast.Constant) else MARK
        return [s]
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        left, right = template_of(node.left), template_of(node.right)
        if left and right:
            return [a + b for a in left for b in right]
        return [left[0] + MARK] if left else None
    if isinstance(node, ast.IfExp):
        return (template_of(node.body) or []) + (template_of(node.orelse) or [])
    return None


def error_sites():
    """Все (файл, строка, 'message'|'hint', шаблон) в исходниках интерпретатора и стандартной библиотеки."""
    sites = []
    for path in sorted((ROOT / "qaz").rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for n in ast.walk(tree):
            if not isinstance(n, ast.Call):
                continue
            name = ast.unparse(n.func)
            if name.split(".")[-1] not in {c.split(".")[-1] for c in ERROR_CLASSES} and name not in ERROR_CLASSES:
                continue
            if n.args:
                for t in template_of(n.args[0]) or []:
                    sites.append((path.name, n.lineno, "message", t))
            for kw in n.keywords:
                if kw.arg == "hint":
                    for t in template_of(kw.value) or []:
                        sites.append((path.name, n.lineno, "hint", t))
    return sites


def what_fragments():
    """Подписи «что ожидалось» из self.expect(..., what=...)."""
    tree = ast.parse((ROOT / "qaz" / "parser.py").read_text(encoding="utf-8"))
    out = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Call) and ast.unparse(n.func) == "self.expect":
            for kw in n.keywords:
                if kw.arg == "what" and isinstance(kw.value, ast.Constant):
                    out.add(kw.value.value)
    return sorted(out)


def test_every_error_site_is_translated():
    sites = error_sites()
    assert len(sites) > 150, "парсер исходников нашёл слишком мало мест, где создаются ошибки"
    missing = []
    for fname, line, kind, template in sites:
        text = sample(template)
        if text.strip() in ("Z", "ZZ"):  # пользовательский текст целиком
            continue
        if text.startswith("«Z»: Z: Z"):  # исключение Python внутри встроенной функции — технический текст
            continue
        if not any(p.fullmatch(text) for p, _ in messages._rules()[0]):
            missing.append(f"{fname}:{line} [{kind}] {template.replace(MARK, '{…выражение…}')}")
    assert not missing, "нет перевода:\n" + "\n".join(missing)


def test_every_expectation_phrase_is_translated():
    identity = {"']'", "')'"}  # только знаки препинания — переводить нечего
    phrases = what_fragments()
    assert len(phrases) >= 25
    for w in phrases:
        out = messages.translate(f"Ожидалось {w}, найдено «x»")
        assert out.endswith("күтілді, «x» табылды"), (w, out)
        if w not in identity:
            assert w not in out, f"фраза не переведена: {w}"
    for descr in ("конец файла", "конец строки", "лишний отступ", "конец блока", "точка '.'", "строка",
                  "ключевое слово «егер»"):
        out = messages.translate(f"Ожидалось выражение, найдено {descr}")
        assert out.startswith("Өрнек күтілді, ") and descr not in out, out


def test_no_rule_is_shadowed_by_an_earlier_rule():
    cat = messages.catalog()
    messages_rules = messages._rules()[0]
    for i, (ru, _kk) in enumerate(cat["messages"]):
        text = PH.sub("Z", ru)
        first = next(j for j, (pattern, _) in enumerate(messages_rules) if pattern.fullmatch(text))
        assert first == i, f"правило {i} «{ru}» перекрыто правилом {first} «{cat['messages'][first][0]}»"


def test_catalog_placeholders_agree():
    cat = messages.catalog()
    for group in ("messages", "fragments"):
        for ru, kk in cat[group]:
            assert set(PH.findall(kk)) <= set(PH.findall(ru)), (ru, kk)
    for ru in cat["titles"]:
        assert cat["titles"][ru].strip()
    for key in ("file", "line", "column", "called", "called_at", "called_unknown", "skipped", "hint"):
        assert key in cat["labels"]


def test_translation_examples():
    t = messages.translate
    assert t("Переменная «x» не объявлена") == "«x» айнымалысы жарияланбаған"
    assert t("Индекс 5 вне диапазона (длина 2)") == "5 индексі ауқымнан тыс (ұзындығы 2)"
    assert t("Ожидалось двоеточие ':' после условия, найдено конец строки") == \
        "шарттан кейін қос нүкте ':' күтілді, жол соңы табылды"
    assert t("«f» ожидает аргументов: не менее 2, получено: 1") == "«f» функциясы кемінде 2 аргумент күтеді, 1 берілді"
    assert t("«f» ожидает аргументов: от 1 до 3, получено: 0") == "«f» функциясы 1 мен 3 аралығында аргумент күтеді, 0 берілді"
    assert t("Ожидалось имя параметра после '*', найдено «)»") == "'*' белгісінен кейінгі параметр аты күтілді, «)» табылды"
    assert t("Совсем неизвестный текст") == "Совсем неизвестный текст"
    assert t(None) is None
    assert t("Переменная «x» не объявлена", "ru") == "Переменная «x» не объявлена"
    assert messages.translate_title("Ошибка выполнения") == "Орындау қатесі"


def test_format_error_in_kazakh_has_no_russian_labels():
    err = QazaqRuntimeError("Деление", 3, 5, hint="Проверьте делитель перед делением.")
    err.trace = [("f", 7)]
    text = format_error(err, "a\nb\nc = 1 / 0.\n", "x.qaz", "kk")
    for word in ("строка", "столбец", "Подсказка", "функция f", "вызвана", "файл x.qaz, строка"):
        assert word not in text, text
    assert "жол 3" in text and "баған 5" in text and "Кеңес:" in text and "f() функциясы 7-жолда шақырылды" in text
    assert "строка 3" in format_error(err, None, "x.qaz")  # по умолчанию русский


def test_runner_lang_switch():
    code = "жаз(1 / 0)."
    ru = execute({"code": code})
    kk = execute({"code": code, "lang": "kk"})
    assert ru["error"]["title"] == "Ошибка выполнения"
    assert kk["error"]["title"] == "Орындау қатесі"
    assert kk["error"]["message"] == "Нөлге бөлу: нөлге бөлуге болмайды"
    assert kk["error"]["hint"] == "Бөлер алдында бөлгішті тексеріңіз."
    assert kk["status"] == ru["status"] == "error"


def test_program_sees_russian_message_regardless_of_language():
    # перевод — только про показ: программа внутри байқа/қате видит один и тот же текст
    code = "байқа:\n    жаз(1 / 0).\nқате е:\n    жаз(е).\n"
    assert execute({"code": code})["stdout"] == execute({"code": code, "lang": "kk"})["stdout"]


def run_cli(*args, env=None):
    import os
    e = dict(os.environ)
    e.pop("QAZAQ_LANG", None)
    e.update(env or {})
    return subprocess.run([sys.executable, "-m", "qaz", *args], capture_output=True, text=True,
                          encoding="utf-8", cwd=ROOT, env=e)


def test_cli_lang_flag_and_env(tmp_path):
    f = tmp_path / "a.qaz"
    f.write_text("жаз(1 / 0).\n", encoding="utf-8")
    assert "Ошибка выполнения" in run_cli("run", str(f)).stderr
    assert "Орындау қатесі" in run_cli("run", str(f), "--lang", "kk").stderr
    assert "Орындау қатесі" in run_cli("run", str(f), env={"QAZAQ_LANG": "kk"}).stderr
    assert "Ошибка выполнения" in run_cli("run", str(f), env={"QAZAQ_LANG": "xx"}).stderr
    bad = tmp_path / "b.qaz"
    bad.write_text("жаз(1 +).\n", encoding="utf-8")
    assert "Синтаксистік қате" in run_cli("check", str(bad), "--lang", "kk").stderr


@pytest.mark.skipif(NODE is None, reason="Node.js не установлен")
def test_python_and_js_translate_identically():
    from test_conformance import node_results_lang
    progs = {n: pc for n, pc in all_programs().items()}
    js = node_results_lang([{"name": n, "code": c, "stdin": s, "lang": "kk"} for n, (c, s) in progs.items()])
    mismatches = []
    errors = 0
    for name, (code, stdin) in progs.items():
        res = execute({"code": code, "stdin": stdin, "lang": "kk", "max_depth": 150, "timeout": 10,
                       "max_steps": 3_000_000, "max_output": 65_536})
        from test_conformance import normalise
        py = normalise(res)
        errors += py["error"] is not None
        if py != js[name]:
            mismatches.append((name, py["error"], js[name]["error"]))
    assert errors >= 100, "в корпусе слишком мало программ с ошибками"
    assert not mismatches, mismatches[:5]
