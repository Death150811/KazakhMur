"""Интерактивный режим (REPL)."""
from __future__ import annotations

import sys

from . import __version__
from .errors import LexicalError, QazaqError, QazaqSyntaxError, format_error
from .interpreter import Interpreter
from .lexer import Lexer
from .parser import Parser

EXIT_WORDS = {"шығу", "шығу.", "exit", "exit()", "quit", "quit()", ":q"}
BANNER = ("Qazaq {v} — интерактивный режим. Выход: шығу или Ctrl+D.\n"
          "Подсказка: в одной строке точка в конце необязательна; "
          "блок (егер, функ, …) завершается пустой строкой.")


def _parse(source: str):
    return Parser(Lexer(source).tokenize()).parse_program()


def run_repl(stdin=None, stdout=None, interactive: bool | None = None) -> int:
    stdin = stdin or sys.stdin
    stdout = stdout or sys.stdout
    if interactive is None:
        interactive = hasattr(stdin, "isatty") and stdin.isatty()
    interp = Interpreter(stdout=stdout, stdin=stdin, filename="<repl>")
    if interactive:
        try:
            import readline  # noqa: F401  (история и редактирование строки)
        except ImportError:
            pass
        print(BANNER.format(v=__version__), file=stdout)

    def read(prompt: str) -> str | None:
        if interactive:
            try:
                return input(prompt)
            except EOFError:
                return None
        line = stdin.readline()
        if line == "":
            return None
        return line.rstrip("\n")

    buffer: list[str] = []
    while True:
        try:
            line = read("... " if buffer else ">>> ")
        except KeyboardInterrupt:
            print("\n(прервано)", file=stdout)
            buffer = []
            continue
        if line is None:
            if interactive:
                print(file=stdout)
            return 0
        if not buffer:
            if line.strip() in EXIT_WORDS:
                return 0
            if not line.strip():
                continue
            source = line
        else:
            if line.strip():
                buffer.append(line)
                continue
            source = "\n".join(buffer)
            buffer = []
        # Проверяем, готова ли инструкция
        program = None
        first_error: QazaqError | None = None
        try:
            program = _parse(source)
        except QazaqError as exc:
            first_error = exc
            if isinstance(exc, LexicalError) and exc.message.startswith("Скобка"):
                buffer = source.split("\n")
                continue
            try:  # в одной строке точка в конце необязательна
                program = _parse(source + "\n.")
            except QazaqError:
                program = None
        if program is None and first_error is not None:
            if source.rstrip().endswith(":") and "\n" not in source:
                buffer = [source]  # начало блока — ждём продолжение
                continue
            print(format_error(first_error, source, "<repl>"), file=stdout)
            continue
        try:
            interp.run(program, echo=True)
        except QazaqError as exc:
            print(format_error(exc, source, "<repl>"), file=stdout)
        except KeyboardInterrupt:
            print("(прервано)", file=stdout)
        stdout.flush()
