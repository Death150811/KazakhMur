## 3. Карта репозитория

### 3.1. Все файлы и их назначение

{{AUTO:tree}}

### 3.2. Как части проекта связаны между собой

```text
                       ┌──────────────────────────────────────────────┐
                       │  ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ О ЯЗЫКЕ (Python)      │
                       │  qaz/tokens.py        ключевые слова, синонимы│
                       │  qaz/stdlib/*.py      функции и методы (@builtin/@method)
                       │  qaz/messages_kk.json казахские сообщения      │
                       └───────┬──────────────────────┬────────────────┘
                               │ qaz/language.py       │ qaz.messages
                               │ language_definition() │
          ┌────────────────────┼───────────────────────┼───────────────────────┐
          ▼                    ▼                       ▼                       ▼
  qaz/interpreter.py   scripts/build_site.py   scripts/gen_stdlib_doc.py   scripts/gen_manual.py
  (Python-движок:      собирает сайт:          docs/STANDARD_LIBRARY.md    docs/MANUAL.md
   qaz run, REPL,      language.json,                                      docs/KAZAKH_MESSAGES_REVIEW.md
   бэкенд)             engine.js, index.html,
                       fragment.html
                               │
                               ▼
        site/src/engine/*.js ──(склеиваются в одно замыкание createQazaqEngine(LANG))
                               │
                               ▼
        site/dist/index.html = page.html + style.css + app.js + engine + DATA
                               (DATA = LANGUAGE + EXAMPLES + TOUR + BOOK, встроены как window.QAZ_DATA)
```

Ключевая идея: **язык описан данными в одном месте** (Python-реестр), а всё остальное — подсветка на сайте,
автодополнение, каталог функций, таблица слов, справочник, самопроверка JS-движка — **строится из этих данных**.
Поэтому, например, чтобы добавить встроенную функцию, нужно написать её в Python (регистрация даёт описание) и в JS
(только реализацию); при старте JS-движок **падает с ошибкой**, если какой-то функции из реестра у него нет или
не совпали имена параметров (`site/src/engine/05_api.js`, самопроверка в начале файла).

### 3.3. Что генерируется, а что пишется вручную

| Файл | Как создаётся | Тест актуальности |
|---|---|---|
| `docs/STANDARD_LIBRARY.md` | `scripts/gen_stdlib_doc.py` | `tests/test_docs.py` |
| `docs/MANUAL.md`, `docs/KAZAKH_MESSAGES_REVIEW.md` | `scripts/gen_manual.py` из `docs/manual/*.md` и кода | `tests/test_manual.py` |
| `docs/QAZAQ_BOOK.pdf` | `node scripts/make_book_pdf.js` (печать раздела «Книга») | нет (бинарник) |
| `site/dist/*` | `scripts/build_site.py` | не в git (`.gitignore`), собирается тестами |
| `qaz/messages_kk.json` | **вручную** (сначала генерировался разовым скриптом, теперь это источник) | `tests/test_messages.py` |
| `site/src/book.json`, `site/src/tour.json` | **вручную** | `tests/test_book.py`, `tests/test_conformance.py` (код тура исполняется в обоих движках) |
| `docs/SYNTAX.md`, `GRAMMAR.md`, `ERRORS.md`, `ARCHITECTURE.md`, … | **вручную** | блоки кода исполняются тестами |
