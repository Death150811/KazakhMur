"""Собирает ZIP-архив «всё о проекте Qazaq»: руководства, сайт, код с историей git, ссылки, стартовый промпт для следующего ИИ.

Архив нужен, чтобы можно было удалить чат и ничего не потерять. Секретов в нём нет (в проекте их нет).

Запуск (из корня репозитория, после `python scripts/build_site.py` и генерации руководства):
    python scripts/make_archive.py                       # → archive_out/qazaq-full-archive.zip
    python scripts/make_archive.py --dialog путь/к/журналу.jsonl   # добавить читаемую запись диалога (по желанию)
"""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "archive_out"

REPO_URL = "https://github.com/Death150811/KazakhMur"
BRANCH = "claude/qazaq-lang"
SITE_URL = "https://claude.ai/artifact/SXdTbbowEAk2mDLHuC1hKL"
MANUAL_URL = "https://claude.ai/artifact/2C4o7stK78o43Yyxg85MaN"
SESSION_URL = "https://claude.ai/code/session_012pk349xfd92kcaSpqxY4kf"


def sh(*cmd: str) -> str:
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout.strip()


def facts() -> dict:
    sys.path.insert(0, str(ROOT))
    from qaz.language import language_definition  # noqa: E402
    lang = language_definition()
    return {
        "commit": sh("git", "rev-parse", "HEAD"),
        "short": sh("git", "rev-parse", "--short", "HEAD"),
        "commits": sh("git", "rev-list", "--count", "HEAD"),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "version": lang["version"],
        "keywords": len(lang["keywords"]),
        "builtins": len(lang["builtins"]),
        "methods": len(lang["methods"]),
    }


def full_html(fragment_path: Path, title: str) -> str:
    body = fragment_path.read_text(encoding="utf-8")
    return ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
            f'<title>{title}</title>\n</head>\n<body style="margin:0">\n{body}\n</body>\n</html>\n')


def ledger_from_manual() -> str:
    text = (ROOT / "docs" / "MANUAL.md").read_text(encoding="utf-8")
    m = re.search(r"^## 13б\..*?(?=^## 14\.)", text, re.S | re.M)
    return m.group(0) if m else "(глава 13б не найдена в docs/MANUAL.md)"


def dialog_log(jsonl: Path) -> str:
    """Читаемая запись диалога: все сообщения владельца дословно и все длинные отчёты ассистента."""
    out = ["# Запись диалога (владелец ↔ Claude)", "",
           "Собрана автоматически из журнала сессии. Сообщения владельца приведены **дословно**; из ответов ассистента оставлены "
           "только содержательные отчёты и объяснения (короткие служебные реплики и вызовы инструментов опущены). "
           "Системные уведомления и сообщения вспомогательных агентов не включены.", ""]
    n_user = n_asst = 0
    for line in jsonl.read_text(encoding="utf-8").splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        msg = d.get("message") or {}
        ts = (d.get("timestamp") or "")[:16].replace("T", " ")
        if d.get("type") == "user" and (d.get("origin") or {}).get("kind") == "human":
            c = msg.get("content")
            text = c if isinstance(c, str) else "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
            text = text.strip()
            if not text or text.startswith("<system-reminder>"):
                continue
            n_user += 1
            out += [f"## Владелец · {ts} UTC · сообщение {n_user}", "", text, ""]
        elif d.get("type") == "assistant" and isinstance(msg.get("content"), list):
            for b in msg["content"]:
                if b.get("type") == "text" and len(b.get("text", "")) >= 600:
                    n_asst += 1
                    out += [f"## Claude · {ts} UTC · отчёт {n_asst}", "", b["text"].strip(), ""]
    out.insert(2, f"Сообщений владельца: {n_user}; отчётов ассистента: {n_asst}.\n")
    return "\n".join(out) + "\n"


START_PROMPT = """# Стартовый промпт для следующего ИИ-агента

Скопируйте всё ниже линии в первое сообщение новому агенту (Claude Code или другому ИИ с доступом к терминалу), приложив архив
или дав ссылку на репозиторий.

---

Ты продолжаешь разработку проекта **Qazaq** — языка программирования на казахском (расширение `.qaz`, инструкция заканчивается точкой,
блоки отступами; девиз «Қарапайымдылық сыртында. Қуат ішінде.»). Проект уже работает: интерпретатор на Python (`qaz/`), его точная копия
на JavaScript для браузера (`site/src/engine/`), сайт с онлайн-редактором и встроенной «Книгой», командная строка, тесты (≈ 310),
подробная документация.

**Владелец проекта** общается по-русски и не программист. Все отчёты, документация, комментарии и сообщения коммитов — по-русски, простыми словами.
Формат отчёта после крупного этапа: «Что сделано / Что теперь работает / Что проверено / Что пока не реализовано / Что дальше».
Не перекладывай на владельца техническую работу; вопросы задавай только о философии языка, его поведении и направлении продукта.
Не утверждай, что что-то работает, пока не запустил. Честно перечисляй непроверенное.

**Что прочитать первым (в таком порядке):**
1. `01_manuals/MANUAL.md` (или `MANUAL.pdf`, или `MANUAL_web.html`) — главы 1–3 (состояние, команды, карта репозитория), затем 11 (рецепты) и 15 (долги и план).
   Остальное — по необходимости. Глава 13б — журнал всех просьб владельца и аудит выполнения.
2. `docs/ROADMAP.md` и `CHANGELOG.md` в репозитории.

**Где код:** папка `04_code/qazaq-source/` (рабочая копия на момент архива) и `04_code/qazaq.bundle` (весь git со всей историей:
`git clone 04_code/qazaq.bundle qazaq`). Рабочая ветка — `claude/qazaq-lang`. Онлайн: {repo_url} (ветка `{branch}`).

**Жёсткие правила:**
* Не пушь в `main`, не создавай Pull Request, не включай GitHub Pages и не публикуй серверный Playground в интернет без прямого разрешения владельца.
* Любое изменение поведения языка или библиотеки делай **в обоих движках сразу** (Python и JS) и добавляй программы в `tests/conformance_corpus.py`
  (дифференциальный тест сравнивает движки дословно).
* Тесты не отключать. Перед коммитом: `export NODE_PATH="$(npm root -g)"; python3 -m pytest` (код возврата 0), после правок сайта — `python3 scripts/build_site.py`,
  `node site/test/e2e.js`, `a11y.js`, `perf.js`. После правок глав руководства — `python3 scripts/gen_manual.py`.
* Казахские тексты (сообщения об ошибках, интерфейс) написаны без носителя языка — **не называй их проверенными**.

**Первые шаги:**
1. Распакуй/клонируй код, установи: `pip install -e ".[dev,science,server]"`; для тестов сайта нужны Node 22, Playwright (Chromium) и глобальный `axe-core`.
2. Запусти тесты (должны быть зелёными), открой `site/dist/index.html` после `python3 scripts/build_site.py`.
3. Спроси у владельца (или посмотри в главе 15.4 руководства) накопившиеся решения: слить ли в `main`/PR; публиковать ли сервер; модули и импорт;
   проверка казахских текстов. Пока ответа нет — работай по приоритетам главы 15.2.
"""


README_TMPL = """# Qazaq — полный архив проекта

Собран: {date}. Версия языка: {version}. Коммит: `{short}` (всего коммитов: {commits}). Рабочая ветка: `{branch}`.

Этот архив нужен, чтобы **спокойно удалить чат**: здесь всё, что накоплено за работу над проектом — руководства, сайт, весь код с историей,
ссылки, журнал ваших просьб, запись диалога и готовый стартовый промпт для следующего ИИ-агента. Внутри нет паролей и токенов.

## Что где лежит

```text
qazaq-full-archive/
├── 00_README_FIRST.md              ← вы здесь
├── CHECKSUMS.sha256                контрольные суммы файлов архива
├── 01_manuals/                     РУКОВОДСТВА
│   ├── MANUAL.md                   большое руководство (читать в любом текстовом/Markdown-просмотрщике)
│   ├── MANUAL.pdf                  то же самое в PDF (удобно на телефоне)
│   ├── MANUAL_web.html             то же самое одной веб-страницей с оглавлением (открыть двойным кликом)
│   ├── QAZAQ_BOOK.pdf              «Книга»: как устроен язык простыми словами (для объяснения другим)
│   └── KAZAKH_MESSAGES_REVIEW.md   таблица казахских сообщений для проверки носителем языка
├── 02_for_next_ai/                 ДЛЯ СЛЕДУЮЩЕГО ИИ-АГЕНТА
│   ├── START_PROMPT.md             готовый промпт для вставки новому агенту
│   ├── STATE_AND_LINKS.md          состояние проекта и все ссылки (кратко)
│   └── OWNER_REQUESTS_AND_AUDIT.md журнал всех ваших просьб и проверка выполнения
├── 03_site/
│   └── index.html                  готовый сайт Qazaq одним файлом: открыть двойным кликом, работает без интернета и сервера
├── 04_code/
│   ├── qazaq-source/               весь код проекта (рабочая копия)
│   └── qazaq.bundle                весь git-репозиторий со всей историей: `git clone qazaq.bundle qazaq`
├── 05_links_and_research/
│   └── LINKS.md                    ссылки: репозиторий, сайт, руководство, источники исследования, аналоги
└── 06_dialog_log/
    └── DIALOG_LOG.md               запись диалога: ваши сообщения дословно и отчёты Claude
```

## С чего начать (5 минут)

* **Хотите понять проект сами** — откройте `01_manuals/MANUAL.pdf` (или `MANUAL_web.html`), прочтите «Как читать это руководство», затем часть IV (главы 13–14) —
  там пошаговая история создания и объяснение «на пальцах».
* **Хотите посмотреть язык вживую** — откройте `03_site/index.html` в браузере.
* **Хотите передать проект другому ИИ-агенту** — дайте ему `02_for_next_ai/START_PROMPT.md` и весь архив (или только `04_code/` и `01_manuals/`).
* **Хотите восстановить репозиторий** — `git clone 04_code/qazaq.bundle qazaq && cd qazaq && git checkout {branch}`.

## Что живёт отдельно от этого архива (онлайн) и что может пропасть

| Что | Где | Замечание |
|---|---|---|
| Репозиторий | {repo_url} (ветка `{branch}`) | живёт на GitHub независимо от чата; копия со всей историей — `04_code/qazaq.bundle` |
| Сайт (приватная страница claude.ai) | {site_url} | может быть связан с вашим аккаунтом/чатом; **копия сайта — `03_site/index.html`** |
| Руководство (приватная страница) | {manual_url} | **копия — `01_manuals/MANUAL_web.html`** |
| Сессия, в которой всё делалось | {session_url} | исчезнет вместе с чатом; её содержание сохранено в `06_dialog_log/` и в руководстве |

## Важное: что НЕ готово (честно)

Казахские тексты не проверены носителем языка; нет модулей и импорта; `Dockerfile` и CI-файл не запускались; Firefox и Safari не проверялись; ветка `main` не создана
и Pull Request не открыт (ждёт вашего прямого «да»); GitHub Pages не включён (это можете сделать только вы). Полный список — `01_manuals/MANUAL.md`, глава 1.4.

## Три вопроса, которые стоит решить

1. Создавать ли `main` и открывать ли Pull Request (написать новому агенту: «да, создай main и открой PR»).
2. Кто проверит казахские тексты (`01_manuals/KAZAKH_MESSAGES_REVIEW.md`).
3. Нужны ли модули и импорт, и публиковать ли серверный Playground.
"""


LINKS_TMPL = """# Ссылки и источники

## Проект

| Что | Адрес |
|---|---|
| Репозиторий на GitHub | {repo_url} |
| Рабочая ветка | `{branch}` ({repo_url}/tree/{branch}) |
| Сайт Qazaq (приватная страница claude.ai) | {site_url} |
| Руководство (приватная страница claude.ai) | {manual_url} |
| Сессия Claude Code (исчезнет вместе с чатом) | {session_url} |
| Лицензия | MIT (файл `LICENSE` в репозитории) |

Ветка `main` на GitHub **не создана** (ждёт разрешения владельца). Ветка `claude/push-check` — проверочная, ненужная.

## Исследование (2026-11-24): идеи интерпретаторов и аналоги

Подробности и выводы — `01_manuals/MANUAL.md`, глава 13в.

* Crafting Interpreters (эталон): https://craftinginterpreters.com/contents.html · https://craftinginterpreters.com/resolving-and-binding.html · https://craftinginterpreters.com/a-tree-walk-interpreter.html
* Learnable Programming (Брет Виктор): https://worrydream.com/LearnableProgramming · https://oleb.net/blog/2012/09/learnable-programming/ · https://maggieappleton.com/learnable-programming/ · Choc: https://www.newline.co/choc
* Python Tutor: https://pythontutor.com/ · https://pg.ucsd.edu/publications/Online-Python-Tutor-web-based-program-visualization_SIGCSE-2013.pdf · https://pythontutor.com/articles/python-visualizer.html
* Всезнающая отладка: https://arxiv.org/pdf/cs/0310016 · https://ssw.jku.at/General/Staff/Weninger/Papers/Weninger_DEBT_26_Preprint.pdf
* Hazel (живое программирование): https://hazelgrove.github.io · https://ar5iv.labs.arxiv.org/html/1805.00155
* Hedy (постепенный язык, локализуемые слова): https://hedy.org/ · https://hedy.org/research/Design_Implementation_and_evaluation_of_the_Hedy_programming_language_2022.pdf · https://github.com/hedyorg/hedy/discussions/776
* Другие языки на казахском: Qurt https://github.com/qurt-lang/qurtc · школьник из Костаная https://24.kz/ru/news/social/680221-yazyk-programmirovaniya-na-kazakhskom-razrabotal-shkolnik-iz-kostanaya · Astanahub https://astanahub.com/en/blog/statia-1-otkrovenie-v-odnom-slove-kak-rodilas-ideia-iap

Примечание: страницы я читал по выдержкам поиска и README; сайт Qurt (`qurt.tech`) в среде не открылся.
"""


STATE_TMPL = """# Состояние проекта и ссылки (кратко)

Снимок на {date}. Подробности — `01_manuals/MANUAL.md`, главы 1–3.

* Версия: {version}; коммит `{commit}` ветки `{branch}`; коммитов: {commits}.
* Язык: {keywords} ключевых слов, {builtins} встроенных функций, {methods} названий методов.
* Движки: Python (`qaz/`) и JavaScript (`site/src/engine/`) — дословно совпадают на корпусе программ (дифференциальные тесты).
* Тесты: `export NODE_PATH="$(npm root -g)"; python3 -m pytest` — все зелёные на момент сборки архива (≈ 310 запусков).
* Сайт: {site_url} (копия `03_site/index.html`). Руководство: {manual_url} (копия `01_manuals/`).

## Ждёт решения владельца
1. Создать `main` и открыть PR? (не делать без прямого «да»; GitHub Pages включает владелец.)
2. Проверка казахских текстов носителем (`01_manuals/KAZAKH_MESSAGES_REVIEW.md`).
3. Модули/импорт; публикация серверного Playground (нужен контейнер); названия новых методов строк (`сандық`, `әріптік`, `толтыр`, `жолдар`, `топта` — предложены исполнителем).
4. Отзыв о сайте (шрифт, анимации, плотность) — владелец ещё не тестировал.

## Что не проверялось
Firefox, Safari, Python 3.10, Lighthouse, `Dockerfile`, CI-файл на GitHub, работа сайта внутри claude.ai.
"""


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    h.update(p.read_bytes())
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dialog", type=Path, help="журнал сессии (.jsonl) для читаемой записи диалога")
    ap.add_argument("--out", type=Path, default=OUT_DIR / "qazaq-full-archive.zip")
    args = ap.parse_args()

    f = facts()
    f.update(branch=BRANCH, repo_url=REPO_URL, site_url=SITE_URL, manual_url=MANUAL_URL, session_url=SESSION_URL)
    for needed in ("docs/MANUAL.md", "docs/MANUAL.pdf", "docs/QAZAQ_BOOK.pdf", "site/dist/index.html", "site/dist/manual.html"):
        if not (ROOT / needed).exists():
            raise SystemExit(f"нет {needed}: сначала python scripts/build_site.py, gen_manual.py, make_manual_html.py")

    with tempfile.TemporaryDirectory() as tmp:
        top = Path(tmp) / "qazaq-full-archive"
        for d in ("01_manuals", "02_for_next_ai", "03_site", "04_code", "05_links_and_research", "06_dialog_log"):
            (top / d).mkdir(parents=True)
        (top / "00_README_FIRST.md").write_text(README_TMPL.format(**f), encoding="utf-8")
        m = top / "01_manuals"
        shutil.copy(ROOT / "docs/MANUAL.md", m / "MANUAL.md")
        shutil.copy(ROOT / "docs/MANUAL.pdf", m / "MANUAL.pdf")
        shutil.copy(ROOT / "docs/QAZAQ_BOOK.pdf", m / "QAZAQ_BOOK.pdf")
        shutil.copy(ROOT / "docs/KAZAKH_MESSAGES_REVIEW.md", m / "KAZAKH_MESSAGES_REVIEW.md")
        (m / "MANUAL_web.html").write_text(full_html(ROOT / "site/dist/manual.html", "Руководство по Qazaq"), encoding="utf-8")
        n = top / "02_for_next_ai"
        (n / "START_PROMPT.md").write_text(START_PROMPT.format(**f), encoding="utf-8")
        (n / "STATE_AND_LINKS.md").write_text(STATE_TMPL.format(**f), encoding="utf-8")
        (n / "OWNER_REQUESTS_AND_AUDIT.md").write_text(ledger_from_manual(), encoding="utf-8")
        shutil.copy(ROOT / "site/dist/index.html", top / "03_site" / "index.html")
        (top / "05_links_and_research" / "LINKS.md").write_text(LINKS_TMPL.format(**f), encoding="utf-8")
        if args.dialog and args.dialog.exists():
            (top / "06_dialog_log" / "DIALOG_LOG.md").write_text(dialog_log(args.dialog), encoding="utf-8")
        else:
            (top / "06_dialog_log" / "DIALOG_LOG.md").write_text("Запись диалога не прикладывалась. Хронология — в 01_manuals/MANUAL.md, главы 13–13б.\n", encoding="utf-8")
        # код: рабочая копия из git (только отслеживаемые файлы) и полный bundle с историей
        src = top / "04_code" / "qazaq-source"
        src.mkdir()
        tar_bytes = subprocess.run(["git", "archive", "--format=tar", "HEAD"], cwd=ROOT, capture_output=True, check=True).stdout
        with tarfile.open(fileobj=io.BytesIO(tar_bytes)) as tf:
            try:
                tf.extractall(src, filter="data")
            except TypeError:  # Python < 3.11.4 без параметра filter
                tf.extractall(src)
        subprocess.run(["git", "bundle", "create", str(top / "04_code" / "qazaq.bundle"), "--all"], cwd=ROOT, check=True, capture_output=True)
        # контрольные суммы
        sums = [f"{sha256(p)}  {p.relative_to(top).as_posix()}" for p in sorted(top.rglob("*")) if p.is_file()]
        (top / "CHECKSUMS.sha256").write_text("\n".join(sums) + "\n", encoding="utf-8")
        args.out.parent.mkdir(parents=True, exist_ok=True)
        if args.out.exists():
            args.out.unlink()
        with zipfile.ZipFile(args.out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for p in sorted(top.rglob("*")):
                if p.is_file():
                    z.write(p, p.relative_to(Path(tmp)).as_posix())
    print(f"{args.out}: {args.out.stat().st_size // 1024} КБ")
    return 0


if __name__ == "__main__":
    sys.exit(main())
