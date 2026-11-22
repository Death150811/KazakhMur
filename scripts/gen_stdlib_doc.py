"""Генерирует docs/STANDARD_LIBRARY.md из реестра встроенных функций (qaz.stdlib).

Запуск:  python scripts/gen_stdlib_doc.py
Тест tests/test_docs.py проверяет, что файл актуален.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from qaz.runtime import type_name  # noqa: E402,F401
from qaz.stdlib import BUILTINS, CONSTANTS, METHODS  # noqa: E402

TARGET = ROOT / "docs" / "STANDARD_LIBRARY.md"

CATEGORY_TITLES = {
    "core": ("Core", "Доступны всегда, без зависимостей."),
    "math": ("Math", "Математика и случайные числа. Без зависимостей."),
    "data": ("Data", "Анализ данных. Без зависимостей."),
    "ai": ("AI", "Простая линейная регрессия на чистом Python. Это не нейросети: "
                 "scikit-learn и PyTorch пока не подключены."),
    "science": ("Science", "Символьная математика (SymPy) и графики (Matplotlib). "
                           "Необязательные зависимости: `pip install \"qazaq[science]\"`."),
    "io": ("IO", "Файлы. Недоступны в безопасном режиме (Playground)."),
}
TYPE_TITLES = {str: "мәтін (строка)", list: "тізім (список)", dict: "сөздік (словарь)"}


def render() -> str:
    lines = [
        "# Стандартная библиотека Qazaq",
        "",
        "> Файл создаётся автоматически из реестра функций (`python scripts/gen_stdlib_doc.py`). "
        "Не редактируйте его вручную.",
        "",
        "Все функции ниже **реализованы и покрыты тестами** (`tests/test_stdlib.py`). "
        "Любое имя можно перекрыть своей переменной (`айным жаз = 5.`), но присваивание без `айным` "
        "встроенному имени запрещено.",
        "",
    ]
    for cat, (title, note) in CATEGORY_TITLES.items():
        items = [b for b in BUILTINS.values() if b.category == cat]
        if not items:
            continue
        lines += [f"## {title}", "", note, "", "| Вызов | Описание |", "|---|---|"]
        for b in items:
            flag = " *(недоступна в безопасном режиме)*" if b.unsafe else ""
            lines.append(f"| `{b.sig.replace(chr(124), chr(92) + chr(124))}` | {b.doc}{flag} |")
        lines.append("")
    lines += ["## Константы", ""]
    lines += [f"- `{name}` = {value!r}" for name, value in sorted(CONSTANTS.items())]
    lines.append("")
    lines += ["## Методы встроенных типов", "",
              "Вызываются через точку: `значение.метод(аргументы)`.", ""]
    for py_type, title in TYPE_TITLES.items():
        table = METHODS.get(py_type, {})
        lines += [f"### {title}", "", "| Метод | Описание |", "|---|---|"]
        for m in table.values():
            lines.append(f"| `{m.sig}` | {m.doc} |")
        lines.append("")
    lines += [
        "## Соглашения",
        "",
        "- Ошибки в аргументах — это `ошибка выполнения` с точной позицией; её можно поймать "
        "через `байқа` / `қате`.",
        "- Функции не изменяют переданные коллекции, кроме методов с глаголами-мутаторами "
        "(`.қос`, `.өшір`, `.шығар`, `.босат`, `.ұзарт`, `.кірістір`, `.жаңарт`).",
        "- Логика/округление: `дөңгелекте` округляет «по-школьному» (0.5 → вверх, от нуля).",
        "",
    ]
    return "\n".join(lines)


if __name__ == "__main__":
    TARGET.write_text(render(), encoding="utf-8")
    print(f"записано: {TARGET.relative_to(ROOT)}")
