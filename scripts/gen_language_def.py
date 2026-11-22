"""Генерирует frontend/src/editor/language.generated.json из реальных таблиц интерпретатора.

Подсветка синтаксиса и документация Playground берут ключевые слова и встроенные функции
отсюда, поэтому не могут разойтись с языком. Запуск:  python scripts/gen_language_def.py
Тест tests/test_frontend_sync.py проверяет, что файл актуален.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from qaz.language import language_definition  # noqa: E402

TARGET = ROOT / "frontend" / "src" / "editor" / "language.generated.json"


def render() -> str:
    return json.dumps(language_definition(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    TARGET.write_text(render(), encoding="utf-8")
    print(f"записано: {TARGET.relative_to(ROOT)}")
