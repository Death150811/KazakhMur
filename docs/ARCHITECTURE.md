# Архитектура

```text
Исходный код .qaz
      │
      ▼
  Лексер            qaz/lexer.py        текст → токены (с позицией), отступы, правила точки
      │
      ▼
  Парсер            qaz/parser.py       токены → AST, рекурсивный спуск, проверки структуры
      │
      ▼
  AST               qaz/ast_nodes.py    типизированные узлы (dataclass)
      │
      ▼
  Интерпретатор     qaz/interpreter.py  обход AST, области видимости, управление потоком, лимиты
      │
      ▼
  Среда исполнения  qaz/runtime.py      значения, окружения, преобразование в текст
      │
      ▼
  Стандартная       qaz/stdlib/         реестр встроенных функций и методов
  библиотека
```

Пользовательский код **никогда** не исполняется через `eval`/`exec`: интерпретатор собственной
моделью выполняет узлы AST (это проверяет `tests/test_integration.py`).

## Модули

| Файл | Ответственность |
|---|---|
| `qaz/tokens.py` | виды токенов, таблица ключевых слов с пояснениями |
| `qaz/lexer.py` | токенизация, NFC, отступы, правило точки, форматные строки |
| `qaz/ast_nodes.py` | узлы AST |
| `qaz/parser.py` | грамматика ([GRAMMAR.md](GRAMMAR.md)), сообщения об ошибках, статические проверки |
| `qaz/interpreter.py` | исполнение, лимиты (шаги, время, глубина, вывод), вызовы, классы, исключения |
| `qaz/runtime.py` | `Env`, `QFunction`, `QClass`, `QInstance`, `Builtin`, `to_str`/`to_repr`, `type_name` |
| `qaz/errors.py` | иерархия ошибок и форматирование |
| `qaz/stdlib/registry.py` | декораторы `@builtin`, `@method`, проверки аргументов |
| `qaz/stdlib/core.py` | Core: ввод-вывод, типы, коллекции, методы строк/списков/словарей |
| `qaz/stdlib/mathlib.py` | Math: математика, случайные числа |
| `qaz/stdlib/data.py` | Data и AI: статистика, линейная регрессия |
| `qaz/stdlib/science.py` | Science: SymPy/Matplotlib (необязательные зависимости) |
| `qaz/stdlib/io_lib.py` | IO: файлы (отключены в безопасном режиме) |
| `qaz/cli.py`, `qaz/repl.py` | командная строка и интерактивный режим |
| `qaz/runner.py` | одноразовый исполнитель для Playground (JSON на входе и выходе) |
| `backend/app.py` | FastAPI: `/api/run`, `/api/examples`, `/api/language`, `/api/health`, раздача фронтенда |
| `backend/sandbox.py` | запуск `qaz.runner` в отдельном процессе с лимитами ОС |
| `frontend/` | React + TypeScript + Monaco Editor |

## Ключевые проектные решения

* **Модель исполнения.** Обход AST; значения Qazaq — обычные значения Python (`int`, `float`, `str`,
  `bool`, `None`, `list`, `dict`, `range`) плюс собственные классы для функций, классов и объектов.
  Это даёт простоту и скорость разработки; производительность — как у интерпретатора на Python
  (порядка сотен тысяч простых инструкций в секунду).
* **Управление потоком.** `қайтар`/`тоқта`/`жалғас` реализованы внутренними исключениями, которые не
  могут выйти за пределы функции или цикла (проверяется на этапе разбора).
* **Позиции ошибок.** Каждый узел AST хранит строку и столбец. Исключение без позиции получает её у
  ближайшего узла при всплытии, поэтому встроенные функции не заботятся о позициях.
* **Лимиты исполнения.** `Limits(max_steps, max_depth, timeout, max_output)`; превышение — `ResourceLimitError`,
  которую нельзя поймать из программы.
* **Единый источник правды.** Ключевые слова (`tokens.py`) и функции (`stdlib/registry.py`) — единственные
  таблицы. Из них генерируются: подсветка и автодополнение в редакторе (`scripts/gen_language_def.py`),
  справочник [STANDARD_LIBRARY.md](STANDARD_LIBRARY.md) (`scripts/gen_stdlib_doc.py`). Тесты проверяют,
  что сгенерированные файлы актуальны.
* **Зависимости.** Ядро и CLI не требуют сторонних пакетов. SymPy и Matplotlib — только для
  `шеш`/`туын`/`интегр`/`сыз` (`pip install "qazaq[science]"`).

## Как добавить встроенную функцию

```python
from qaz.stdlib.registry import builtin, expect_number

@builtin("квадрат", 1, 1, category="math", sig="квадрат(x)", doc="Квадрат числа.")
def _square(interp, x):
    x = expect_number("квадрат", x)
    return x * x
```

После этого: добавьте тест в `tests/test_stdlib.py` и запустите
`python scripts/gen_language_def.py && python scripts/gen_stdlib_doc.py`.

## Поток данных Playground

```text
Браузер (Monaco) ── POST /api/run {code, stdin} ──► FastAPI (backend/app.py)
                                                       │ лимит запросов, проверка размера
                                                       ▼
                                          backend/sandbox.py: отдельный процесс
                                          python -m qaz.runner  (rlimit, пустое окружение, tmp-каталог)
                                                       │ JSON {status, stdout, error, steps}
                                                       ▼
Браузер ◄── результат, ошибка с позицией ──────────────┘
```
