"""Собирает docs/MANUAL.md (большое руководство по проекту) и docs/KAZAKH_MESSAGES_REVIEW.md.

Руководство пишется вручную по главам в docs/manual/*.md. В главах можно ставить метки вида
`{{AUTO:имя}}` — скрипт заменяет их данными, вычисленными из кода (дерево файлов, таблицы функций,
числа, пример токенов и дерева, список тестов). Так справочные части не могут устареть:
tests/test_manual.py сравнивает собранный файл с закоммиченным и проверяет, что все пути из текста существуют.

Запуск:  python scripts/gen_manual.py
"""
from __future__ import annotations

import ast
import dataclasses
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from qaz.language import language_definition  # noqa: E402
from qaz.lexer import Lexer  # noqa: E402
from qaz.parser import Parser  # noqa: E402

PARTS = ROOT / "docs" / "manual"
TARGET = ROOT / "docs" / "MANUAL.md"
REVIEW = ROOT / "docs" / "KAZAKH_MESSAGES_REVIEW.md"

EXCLUDE_DIRS = {".git", "__pycache__", "node_modules", "dist", ".pytest_cache", ".venv", "qazaq.egg-info", "build"}
EXCLUDE_SUFFIX = {".pyc", ".png"}

# Краткое назначение файлов и каталогов для дерева (остальное — по имени)
PURPOSE = {
    ".github/workflows/ci.yml": "автотесты (вручную и на Pull Request); на GitHub ещё не запускался",
    ".github/workflows/pages.yml": "публикация сайта на GitHub Pages при пуше в main",
    ".gitignore": "что не попадает в git (dist, кэши, png)",
    "CHANGELOG.md": "история изменений по версиям",
    "Dockerfile": "образ для серверного режима (НЕ проверялся: не было Docker)",
    "LICENSE": "лицензия MIT",
    "README.md": "визитная карточка проекта и быстрый старт",
    "pyproject.toml": "метаданные пакета, зависимости, настройки pytest (addopts = -q)",
    "backend/app.py": "FastAPI: /api/run, /api/examples, /api/language, /api/health, раздача сайта",
    "backend/sandbox.py": "запуск программы в отдельном процессе с лимитами ОС",
    "docs/ARCHITECTURE.md": "архитектура и ключевые решения",
    "docs/DEPLOY.md": "как опубликовать сайт и пакет",
    "docs/ERRORS.md": "виды ошибок, формат, язык сообщений",
    "docs/GRAMMAR.md": "формальная грамматика (EBNF) и правило точки",
    "docs/KAZAKH_MESSAGES_REVIEW.md": "таблица казахских сообщений для проверки носителем (генерируется)",
    "docs/LANGUAGE_DESIGN.md": "оценка ключевых слов и открытые вопросы",
    "docs/MANUAL.md": "ЭТО РУКОВОДСТВО (собирается из docs/manual/*.md)",
    "docs/QAZAQ_BOOK.pdf": "PDF-версия раздела «Книга» (node scripts/make_book_pdf.js)",
    "docs/ROADMAP.md": "что сделано и что дальше",
    "docs/SECURITY.md": "модель безопасности и её границы",
    "docs/STANDARD_LIBRARY.md": "справочник функций и методов (генерируется)",
    "docs/SYNTAX.md": "синтаксис языка с исполняемыми примерами",
    "qaz/__main__.py": "python -m qaz",
    "qaz/ast_nodes.py": "узлы AST (dataclass со slots)",
    "qaz/cli.py": "команды qaz run / check / repl / version / help, флаг --lang",
    "qaz/errors.py": "иерархия ошибок и format_error",
    "qaz/interpreter.py": "исполнение AST, лимиты, вызовы, классы, исключения",
    "qaz/language.py": "описание языка как данные (для сайта, подсветки, документации)",
    "qaz/lexer.py": "лексер: текст → токены, отступы, правило точки, f-строки",
    "qaz/messages.py": "перевод сообщений об ошибках по каталогу шаблонов",
    "qaz/messages_kk.json": "каталог ru→kk для сообщений, подсказок, заголовков, подписей",
    "qaz/parser.py": "парсер рекурсивного спуска: токены → AST",
    "qaz/repl.py": "интерактивный режим",
    "qaz/runner.py": "одноразовый исполнитель для Playground (JSON на входе и выходе)",
    "qaz/runtime.py": "значения времени выполнения: Env, QFunction, QClass, QSet, repr/str/type_name",
    "qaz/stdlib/core.py": "ядро библиотеки: ввод-вывод, типы, коллекции, методы строк/списков/словарей/множеств",
    "qaz/stdlib/data.py": "статистика и линейная регрессия",
    "qaz/stdlib/io_lib.py": "файлы (недоступны в безопасном режиме)",
    "qaz/stdlib/mathlib.py": "математика и случайные числа",
    "qaz/stdlib/registry.py": "реестр: декораторы @builtin и @method, проверки аргументов",
    "qaz/stdlib/science.py": "шеш, туын, интегр, сыз (SymPy / Matplotlib, необязательные)",
    "qaz/tokens.py": "виды токенов, таблица ключевых слов и синонимов",
    "scripts/build_site.py": "собирает site/dist/index.html, fragment.html, engine.js, language.json",
    "scripts/gen_manual.py": "собирает это руководство и таблицу для проверки казахских текстов",
    "scripts/gen_stdlib_doc.py": "генерирует docs/STANDARD_LIBRARY.md",
    "scripts/make_book_pdf.js": "печатает раздел «Книга» в docs/QAZAQ_BOOK.pdf (Playwright)",
    "site/src/app.js": "всё поведение сайта (редактор, запуск, вкладки, книга, настройки)",
    "site/src/book.json": "ТЕКСТ КНИГИ: главы, словарь терминов (редактируется вручную)",
    "site/src/engine/00_messages.js": "JS-часть перевода сообщений об ошибках",
    "site/src/engine/01_lexer_parser.js": "JS-порт лексера и парсера",
    "site/src/engine/02_values.js": "значения JS-движка: QDict/QSet/QTuple/QRange, repr, равенство, форматирование",
    "site/src/engine/03_interpreter.js": "JS-порт интерпретатора (+ хук onStep для вкладки «Шаги»)",
    "site/src/engine/03b_hpmath.js": "sin/cos/tan/log/pow с корректным округлением (фиксированная точка 192 бит)",
    "site/src/engine/04_stdlib.js": "JS-порт стандартной библиотеки",
    "site/src/engine/04b_symbolic.js": "шеш/туын/интегр для многочленов без SymPy",
    "site/src/engine/05_api.js": "публичный API движка: run, check, tokens, tree, trace, translateError",
    "site/src/page.html": "каркас страницы (разметка всех разделов)",
    "site/src/style.css": "вся вёрстка и дизайн-система «Steppe press»",
    "site/src/tour.json": "карточки «О языке» и темы тура (код + тексты ru/kk)",
    "site/test/a11y.js": "аудит доступности axe-core (WCAG 2 A/AA)",
    "site/test/e2e.js": "сквозной тест сайта в настоящем браузере (Playwright)",
    "site/test/engine_api.js": "проверка API JS-движка без браузера: tokens, tree, trace, translateError",
    "site/test/perf.js": "бюджет производительности (вес, FCP, LCP, CLS, долгие задачи)",
    "site/test/run_corpus.js": "запускает корпус программ через JS-движок (для дифференциального теста)",
    "tests/conformance_corpus.py": "корпус программ для сравнения Python и JS",
    "tests/conftest.py": "общие помощники тестов: run(), run_err()",
}
TEST_PURPOSE = {
    "test_aliases.py": "оба написания слов (айным/айнымалы …)",
    "test_backend.py": "FastAPI и песочница: лимиты, параллельные запуски, секреты",
    "test_book.py": "книга: ссылки на термины, примеры, числа",
    "test_cli.py": "команды qaz, коды завершения, --lang",
    "test_conformance.py": "дифференциальный тест Python ↔ JS (корпус, примеры, документация, случайные выражения)",
    "test_docs.py": "примеры кода в документации запускаются; справочник библиотеки актуален",
    "test_fuzz.py": "фаззинг: случайный и испорченный код не роняет интерпретатор",
    "test_integration.py": "весь путь от текста до вывода; примеры = .expected; нет eval/exec",
    "test_interpreter.py": "семантика: арифметика, функции, классы, исключения, лимиты",
    "test_lexer.py": "токены, правило точки, отступы, f-строки, режим шаршы жақша",
    "test_manual.py": "руководство и таблица казахских сообщений собраны актуально; пути из текста существуют",
    "test_messages.py": "казахские сообщения: полнота каталога, одинаковый перевод в Python и JS",
    "test_parser.py": "грамматика и сообщения о синтаксических ошибках",
    "test_sets_and_star.py": "множества жиын и *остальные / **именованные аргументы",
    "test_site.py": "сборка сайта; запуск e2e, a11y и perf в браузере",
    "test_stdlib.py": "встроенные функции и методы",
    "test_unicode.py": "NFC/NFD, казахские буквы, смешение латиницы и кириллицы",
}
DIR_PURPOSE = {
    "backend": "серверная часть Playground (необязательна для сайта)",
    "docs": "документация",
    "docs/manual": "главы этого руководства (исходники MANUAL.md)",
    "examples": "примеры программ .qaz и ожидаемый вывод .expected",
    "qaz": "интерпретатор на Python (ядро языка)",
    "qaz/stdlib": "стандартная библиотека",
    "scripts": "сборка и генерация",
    "site": "сайт",
    "site/src": "исходники сайта",
    "site/src/engine": "JS-движок (склеивается в один замыкающий модуль)",
    "site/test": "тесты сайта на Node + Playwright",
    "tests": "тесты pytest",
}


def tracked_files() -> list[str]:
    out: list[str] = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = sorted(d for d in dirnames if d not in EXCLUDE_DIRS and not d.endswith(".egg-info"))
        for name in sorted(filenames):
            p = Path(dirpath) / name
            if p.suffix in EXCLUDE_SUFFIX:
                continue
            out.append(p.relative_to(ROOT).as_posix())
    for generated in ("docs/MANUAL.md", "docs/KAZAKH_MESSAGES_REVIEW.md"):  # сами создаются этим скриптом
        if generated not in out:
            out.append(generated)
    return sorted(out)


def generic_purpose(rel: str) -> str:
    """Назначение файлов, которых много: тесты и примеры."""
    name = rel.rsplit("/", 1)[-1]
    if rel.startswith("tests/test_") and name.endswith(".py"):
        return TEST_PURPOSE.get(name, "тесты (см. главу про тесты)")
    if rel.startswith("examples/") and name.endswith(".qaz"):
        return "пример программы"
    if rel.startswith("examples/") and name.endswith(".expected"):
        return "ожидаемый вывод примера (его сверяет tests/test_integration.py)"
    return ""


# ---------------- автоматические разделы ----------------
def auto_tree() -> str:
    files = tracked_files()
    lines = ["```text"]
    seen_dirs: set[str] = set()
    for rel in files:
        parts = rel.split("/")
        for depth in range(1, len(parts)):
            d = "/".join(parts[:depth])
            if d not in seen_dirs:
                seen_dirs.add(d)
                note = DIR_PURPOSE.get(d)
                lines.append(f"{'  ' * (depth - 1)}{parts[depth - 1]}/" + (f"   — {note}" if note else ""))
        note = PURPOSE.get(rel) or generic_purpose(rel)
        lines.append(f"{'  ' * (len(parts) - 1)}{parts[-1]}" + (f"   — {note}" if note else ""))
    lines.append("```")
    return "\n".join(lines)


def count_lines(patterns: list[str]) -> int:
    total = 0
    for rel in tracked_files():
        if any(re.fullmatch(p, rel) for p in patterns):
            total += len((ROOT / rel).read_text(encoding="utf-8").splitlines())
    return total


def test_function_counts() -> dict[str, int]:
    counts = {}
    for p in sorted((ROOT / "tests").glob("test_*.py")):
        tree = ast.parse(p.read_text(encoding="utf-8"))
        counts[p.name] = sum(1 for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name.startswith("test_"))
    return counts


def auto_stats() -> str:
    lang = language_definition()
    sys.path.insert(0, str(ROOT / "tests"))
    from conformance_corpus import PROGRAMS  # noqa: E402
    book = json.loads(Path(ROOT / "site/src/book.json").read_text(encoding="utf-8"))
    cat = json.loads(Path(ROOT / "qaz/messages_kk.json").read_text(encoding="utf-8"))
    tour = json.loads(Path(ROOT / "site/src/tour.json").read_text(encoding="utf-8"))
    rows = [
        ("Версия языка / пакета", lang["version"]),
        ("Ключевых слов", str(len(lang["keywords"]))),
        ("Встроенных функций (без синонимов)", str(len(lang["builtins"]))),
        ("Названий методов", str(len(lang["methods"]))),
        ("Строк Python в `qaz/` (интерпретатор)", str(count_lines([r"qaz/.*\.py"]))),
        ("Строк JS в `site/src/engine/` (JS-движок)", str(count_lines([r"site/src/engine/.*\.js"]))),
        ("Строк в `site/src/app.js`", str(count_lines([r"site/src/app\.js"]))),
        ("Строк в `site/src/style.css`", str(count_lines([r"site/src/style\.css"]))),
        ("Строк Python в `tests/`", str(count_lines([r"tests/.*\.py"]))),
        ("Тестовых функций pytest (параметризованные дают больше запусков)", str(sum(test_function_counts().values()))),
        ("Программ в корпусе сравнения Python ↔ JS (`tests/conformance_corpus.py`)", str(len(PROGRAMS))),
        ("Записей в каталоге казахских сообщений", f"{len(cat['messages'])} + {len(cat['fragments'])} фрагментов"),
        ("Глав в книге / терминов в словаре", f"{len(book['chapters'])} / {len(book['glossary'])}"),
        ("Карточек «О языке» / тем тура", f"{len(tour['cards'])} / {len(tour['sections'])}"),
    ]
    out = ["| Показатель | Значение |", "|---|---|"]
    out += [f"| {a} | {b} |" for a, b in rows]
    return "\n".join(out)


def auto_keywords() -> str:
    lang = language_definition()
    out = ["| Слово | Синонимы | Аналог | Назначение |", "|---|---|---|---|"]
    for k in lang["keywords"]:
        out.append(f"| `{k['name']}` | {', '.join('`' + a + '`' for a in k['aliases']) or '—'} | {k['equivalent']} | {k['description']} |")
    return "\n".join(out)


def auto_builtins() -> str:
    lang = language_definition()
    cats: dict[str, list[dict]] = {}
    for b in lang["builtins"]:
        cats.setdefault(b["category"], []).append(b)
    out = []
    for cat, items in cats.items():
        out.append(f"**{cat}** ({len(items)})\n")
        out.append("| Имя | Сигнатура | Что делает |")
        out.append("|---|---|---|")
        for b in items:
            alias = f" (синонимы: {', '.join('`' + a + '`' for a in b['aliases'])})" if b["aliases"] else ""
            kw = f" · именованные: {', '.join(b['kw'])}" if b.get("kw") else ""
            kwo = f" · только по имени: {', '.join(b['kwonly'])}" if b.get("kwonly") else ""
            out.append(f"| `{b['name']}`{alias} | `{b['signature']}` | {b['doc']}{kw}{kwo} |")
        out.append("")
    return "\n".join(out)


def auto_methods() -> str:
    from qaz.stdlib import METHODS
    from qaz.runtime import type_name
    out = ["| Тип | Методы |", "|---|---|"]
    names = {str: "мәтін", list: "тізім", dict: "сөздік", tuple: "кортеж"}
    for t, table in METHODS.items():
        label = names.get(t, t.__name__ if t.__name__ != "QSet" else "жиын")
        out.append(f"| {label} | " + ", ".join(f"`.{n}`" for n in sorted(table)) + " |")
    return "\n".join(out)


def ast_dump(node, indent: int = 0) -> list[str]:
    pad = "  " * indent
    if dataclasses.is_dataclass(node):
        fields = [f for f in dataclasses.fields(node) if f.name not in ("line", "col")]
        simple = [f"{f.name}={getattr(node, f.name)!r}" for f in fields
                  if not isinstance(getattr(node, f.name), (list, tuple)) and not dataclasses.is_dataclass(getattr(node, f.name))]
        lines = [f"{pad}{type(node).__name__}({', '.join(simple)})"]
        for f in fields:
            v = getattr(node, f.name)
            if dataclasses.is_dataclass(v):
                lines.append(f"{pad}  {f.name}:")
                lines += ast_dump(v, indent + 2)
            elif isinstance(v, (list, tuple)) and v:
                lines.append(f"{pad}  {f.name}:")
                for item in v:
                    lines += ast_dump(item, indent + 2) if dataclasses.is_dataclass(item) else [f"{pad}    {item!r}"]
        return lines
    return [f"{pad}{node!r}"]


def auto_trace_example() -> str:
    code = "жаз(2 + 3)."
    toks = Lexer(code).tokenize()
    tok_lines = [f"{t.kind:<6} {t.value!r:<8} строка {t.line}, столбец {t.col}" for t in toks]
    tree = Parser(Lexer(code).tokenize(), code).parse_program()
    return ("Исходный текст: `жаз(2 + 3).`\n\n**Токены** (как их выдаёт `qaz/lexer.py`):\n\n```text\n" + "\n".join(tok_lines)
            + "\n```\n\n**Дерево** (как его строит `qaz/parser.py`):\n\n```text\n" + "\n".join(ast_dump(tree)) + "\n```")


def load_book() -> dict:
    """book.json с подставленными числами — так же, как при сборке сайта (scripts/build_site.py)."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("build_site", ROOT / "scripts" / "build_site.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.load_book(language_definition())


def auto_glossary() -> str:
    book = load_book()
    out = []
    for g in sorted(book["glossary"], key=lambda g: g["term"].lower()):
        out.append(f"* **{g['term']}** — {g['short']} _Точнее:_ {g['more']}")
    return "\n".join(out)


def auto_book_chapters() -> str:
    book = load_book()
    markup = re.compile(r"[\[\]`*|]|[a-z0-9-]+\|")  # разметка книги: [[id|слово]], `код`, **жирный**
    lines = []
    for i, c in enumerate(book["chapters"]):
        lead = markup.sub("", c["lead"])
        lines.append(f"{i + 1}. **{c['title']}** — {lead}")
    return "\n".join(lines)


def slug(title: str) -> str:
    """Якорь заголовка в стиле GitHub: строчные буквы, без знаков препинания, пробелы → дефисы."""
    t = re.sub(r"[^\w\s-]", "", title.lower(), flags=re.U).strip()
    return re.sub(r"\s", "-", t)


def auto_toc() -> str:
    out = []
    for p in sorted(PARTS.glob("[0-9]*.md")):
        in_code = False
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.startswith("```"):
                in_code = not in_code
            if in_code:
                continue
            m = re.match(r"(#{1,2}) (.+)", line)
            if not m or m.group(2).startswith("Руководство по проекту") or m.group(2) in ("Оглавление", "Как читать это руководство") \
                    or m.group(2).startswith(("Что такое Qazaq", "Кто владелец")):
                continue
            indent = "" if len(m.group(1)) == 1 else "  "
            out.append(f"{indent}* [{m.group(2)}](#{slug(m.group(2))})")
    return "\n".join(out)


def auto_tests() -> str:
    counts = test_function_counts()
    out = ["| Файл | Тестовых функций |", "|---|---|"]
    out += [f"| `tests/{name}` | {n} |" for name, n in counts.items()]
    return "\n".join(out)


def auto_builtins_count() -> str:
    lang = language_definition()
    return f"{len(lang['builtins'])} функций и {len(lang['methods'])} названий методов"


def auto_kw_count() -> str:
    return f"{len(language_definition()['keywords'])} слова"


VOLATILE = {"stats", "tests", "builtins_count"}
AUTO = {
    "tree": auto_tree, "stats": auto_stats, "keywords": auto_keywords, "builtins": auto_builtins,
    "methods": auto_methods, "trace_example": auto_trace_example, "tests": auto_tests,
    "builtins_count": auto_builtins_count, "kw_count": auto_kw_count,
    "glossary": auto_glossary, "book_chapters": auto_book_chapters, "toc": auto_toc,
}


def render_manual() -> str:
    parts = sorted(PARTS.glob("[0-9]*.md"))
    text = "\n\n".join(p.read_text(encoding="utf-8").strip() for p in parts) + "\n"

    def sub(m: re.Match) -> str:
        name = m.group(1)
        if name not in AUTO:
            raise SystemExit(f"неизвестная метка AUTO:{name}")
        body = AUTO[name]()
        if name in VOLATILE:  # числа меняются при каждой правке кода: тест сравнивает файл, не глядя внутрь меток
            return f"<!-- AUTO:{name} -->\n{body}\n<!-- /AUTO:{name} -->"
        return body

    return re.sub(r"\{\{AUTO:([a-z_]+)\}\}", sub, text)


def render_review() -> str:
    cat = json.loads((ROOT / "qaz" / "messages_kk.json").read_text(encoding="utf-8"))
    out = ["# Казахские сообщения: таблица для проверки носителем языка",
           "",
           "Файл генерируется скриптом `scripts/gen_manual.py` из `qaz/messages_kk.json`. **Тексты написаны без участия "
           "носителя языка и не проверены.** Как исправлять: отредактируйте колонку «Қазақша» прямо в "
           "`qaz/messages_kk.json` (правьте только значение справа, `{имена в фигурных скобках}` оставляйте без "
           "изменений), затем выполните `python scripts/gen_manual.py` — таблица обновится, тесты проверят, что "
           "подстановки не потерялись.",
           "",
           "Отметка проверки: ☐ — не проверено, ☑ — проверено (ставьте вручную в копии таблицы; в самом файле при "
           "следующей генерации отметки сбросятся).",
           "",
           "## Заголовки ошибок", "", "| ☐ | По-русски | Қазақша |", "|---|---|---|"]
    out += [f"| ☐ | {ru} | {kk} |" for ru, kk in cat["titles"].items()]
    out += ["", "## Подписи в выводе ошибки", "", "| ☐ | Ключ | Шаблон |", "|---|---|---|"]
    out += [f"| ☐ | `{k}` | {v.strip()} |" for k, v in cat["labels"].items()]
    out += ["", f"## Сообщения и подсказки ({len(cat['messages'])})", "", "| ☐ | По-русски (шаблон) | Қазақша |", "|---|---|---|"]
    esc = lambda s: s.replace("|", "\\|")  # noqa: E731
    out += [f"| ☐ | {esc(ru)} | {esc(kk)} |" for ru, kk in cat["messages"]]
    out += ["", f"## Фрагменты внутри сообщений ({len(cat['fragments'])})", "",
            "Подставляются в места `{want}` и `{got}` («ожидалось … найдено …»).", "",
            "| ☐ | По-русски (шаблон) | Қазақша |", "|---|---|---|"]
    out += [f"| ☐ | {esc(ru)} | {esc(kk)} |" for ru, kk in cat["fragments"]]
    return "\n".join(out) + "\n"


def main() -> int:
    TARGET.write_text(render_manual(), encoding="utf-8")
    REVIEW.write_text(render_review(), encoding="utf-8")
    print(f"{TARGET.relative_to(ROOT)}: {len(TARGET.read_text(encoding='utf-8').splitlines())} строк")
    print(f"{REVIEW.relative_to(ROOT)}: {len(REVIEW.read_text(encoding='utf-8').splitlines())} строк")
    return 0


if __name__ == "__main__":
    sys.exit(main())
