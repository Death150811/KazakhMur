"""IO: чтение и запись файлов (недоступны в безопасном режиме)."""
from __future__ import annotations

from .registry import builtin, expect_str, rt_error


@builtin("оқы", 1, 1, category="io", unsafe=True, sig="оқы(путь)", doc="Читает текстовый файл (UTF-8) целиком.")
def _read(interp, path):
    path = expect_str("оқы", path)
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        rt_error(f"Файл не найден: {path}")
    except (OSError, UnicodeDecodeError) as exc:
        rt_error(f"Не удалось прочитать файл «{path}»: {exc.__class__.__name__}")


@builtin("сақта", 2, 2, category="io", unsafe=True, sig="сақта(путь, мәтін)", doc="Записывает строку в файл (UTF-8), перезаписывая его.")
def _write(interp, path, text):
    path = expect_str("сақта", path)
    expect_str("сақта", text)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    except OSError as exc:
        rt_error(f"Не удалось записать файл «{path}»: {exc.__class__.__name__}")
