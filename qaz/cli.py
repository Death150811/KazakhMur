"""Командная строка: qaz run | check | repl | version | help."""
from __future__ import annotations

import argparse
import sys

from . import __version__
from .errors import QazaqError, format_error
from .interpreter import Interpreter, Limits
from .lexer import Lexer
from .parser import Parser

HELP_RU = """\
Qazaq — язык программирования на казахском языке (версия {version})

Использование:
  qaz run ФАЙЛ.qaz       выполнить программу
  qaz check ФАЙЛ.qaz     проверить синтаксис, не выполняя программу
  qaz repl               интерактивный режим
  qaz version            показать версию
  qaz help               эта справка

Параметры run:
  --safe                 безопасный режим (без файлов и графиков)
  --max-steps N          остановить программу после N шагов
  --timeout СЕК          остановить программу через СЕК секунд

Без установки пакета: python -m qaz run ФАЙЛ.qaz
"""


def _setup_stdio() -> None:
    for stream in (sys.stdout, sys.stderr, sys.stdin):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _read_file(path: str) -> str | None:
    try:
        with open(path, encoding="utf-8-sig") as f:
            return f.read()
    except FileNotFoundError:
        print(f"Файл не найден: {path}", file=sys.stderr)
    except UnicodeDecodeError:
        print(f"Файл «{path}» не в кодировке UTF-8", file=sys.stderr)
    except OSError as exc:
        print(f"Не удалось прочитать «{path}»: {exc.strerror}", file=sys.stderr)
    return None


def cmd_run(args) -> int:
    source = _read_file(args.file)
    if source is None:
        return 2
    limits = Limits(max_steps=args.max_steps, timeout=args.timeout)
    interp = Interpreter(safe=args.safe, limits=limits, filename=args.file)
    try:
        interp.run_source(source)
    except QazaqError as exc:
        sys.stdout.flush()
        print(format_error(exc, source, args.file), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nПрервано пользователем", file=sys.stderr)
        return 130
    except BrokenPipeError:
        # читатель закрыл канал (например, `| head`): тихо завершаемся
        import os
        try:
            sys.stdout = open(os.devnull, "w")
        except OSError:
            pass
        return 0
    return 0


def cmd_check(args) -> int:
    source = _read_file(args.file)
    if source is None:
        return 2
    try:
        Parser(Lexer(source).tokenize()).parse_program()
    except QazaqError as exc:
        print(format_error(exc, source, args.file), file=sys.stderr)
        return 1
    print(f"{args.file}: синтаксис корректен")
    return 0


def cmd_repl(args) -> int:
    from .repl import run_repl
    return run_repl()


def cmd_version(args) -> int:
    print(f"Qazaq {__version__}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="qaz", add_help=False)
    sub = p.add_subparsers(dest="command")
    r = sub.add_parser("run", add_help=False)
    r.add_argument("file")
    r.add_argument("--safe", action="store_true")
    r.add_argument("--max-steps", type=int, default=None)
    r.add_argument("--timeout", type=float, default=None)
    r.set_defaults(func=cmd_run)
    c = sub.add_parser("check", add_help=False)
    c.add_argument("file")
    c.set_defaults(func=cmd_check)
    sub.add_parser("repl", add_help=False).set_defaults(func=cmd_repl)
    sub.add_parser("version", add_help=False).set_defaults(func=cmd_version)
    sub.add_parser("help", add_help=False).set_defaults(func=lambda a: _print_help())
    return p


def _print_help() -> int:
    print(HELP_RU.format(version=__version__))
    return 0


def main(argv: list[str] | None = None) -> int:
    _setup_stdio()
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        return _print_help()
    if argv[0] in ("-V", "--version"):
        argv = ["version"]
    if argv[0].endswith(".qaz"):  # сокращение: qaz файл.qaz
        argv = ["run"] + argv
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit:
        print("Неверные параметры. Справка: qaz help", file=sys.stderr)
        return 2
    if not getattr(args, "func", None):
        print(f"Неизвестная команда «{argv[0]}». Справка: qaz help", file=sys.stderr)
        return 2
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
