"""Ошибки Qazaq и их красивый вывод."""
from __future__ import annotations


class QazaqError(Exception):
    """Базовая ошибка языка Qazaq. Всегда несёт позицию в исходном коде."""

    title = "Ошибка"
    catchable = True  # можно ли поймать конструкцией байқа/қате

    def __init__(self, message: str, line: int | None = None, col: int | None = None,
                 hint: str | None = None):
        super().__init__(message)
        self.message = message
        self.line = line
        self.col = col
        self.hint = hint
        self.trace: list[tuple[str, int | None]] = []  # (имя функции, строка вызова)
        self.filename: str | None = None

    def to_dict(self) -> dict:
        return {
            "type": type(self).__name__,
            "title": self.title,
            "message": self.message,
            "line": self.line,
            "column": self.col,
            "hint": self.hint,
        }


class LexicalError(QazaqError):
    title = "Лексическая ошибка"
    catchable = False


class QazaqSyntaxError(QazaqError):
    title = "Синтаксическая ошибка"
    catchable = False


class QazaqRuntimeError(QazaqError):
    title = "Ошибка выполнения"


class ResourceLimitError(QazaqError):
    """Превышен лимит времени, шагов, вывода. Поймать нельзя."""
    title = "Превышен лимит"
    catchable = False


def format_error(err: QazaqError, source: str | None = None, filename: str | None = None) -> str:
    """Человекочитаемое сообщение об ошибке со строкой кода и указателем."""
    filename = filename or err.filename
    lines = [f"{err.title}: {err.message}"]
    if err.line is not None:
        where = f"  файл {filename}, " if filename else "  "
        where += f"строка {err.line}"
        if err.col is not None:
            where += f", столбец {err.col}"
        lines.append(where)
        if source is not None:
            src_lines = source.replace("\r\n", "\n").split("\n")
            if 1 <= err.line <= len(src_lines):
                text = src_lines[err.line - 1]
                num = str(err.line)
                lines.append(f"  {num} | {text}")
                if err.col is not None:
                    lines.append("  " + " " * len(num) + " | " + " " * max(err.col - 1, 0) + "^")
    trace = err.trace
    if len(trace) > 8:  # длинные цепочки рекурсии сокращаем
        skipped = len(trace) - 6
        trace = trace[:3] + [(f"… ещё {skipped} вызовов …", None)] + trace[-3:]
    for name, line in trace:
        if name.startswith("…"):
            lines.append(f"  {name}")
            continue
        loc = f"на строке {line}" if line is not None else "(строка неизвестна)"
        lines.append(f"  функция {name}() вызвана {loc}")
    if err.hint:
        lines.append(f"  Подсказка: {err.hint}")
    return "\n".join(lines)
