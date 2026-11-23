"""Изолированный запуск одной программы в безопасном режиме.

Вызывается бэкендом Playground как отдельный процесс:  python -m qaz.runner
Вход (stdin):  JSON {"code": "...", "stdin": "...", "timeout": 3.0, "max_steps": 3000000,
                      "max_output": 65536, "max_depth": 300,
                      "lang": "ru"|"kk"  (язык сообщений об ошибках)}
Выход (stdout): JSON {"status": "ok|error|limit", "stdout": "...", "error": {...}|null}
"""
from __future__ import annotations

import io
import json
import sys

from .errors import QazaqError, ResourceLimitError
from .interpreter import Interpreter, Limits
from .messages import translate_error


def execute(payload: dict) -> dict:
    code = payload.get("code", "")
    limits = Limits(
        max_steps=payload.get("max_steps", 3_000_000),
        max_depth=payload.get("max_depth", 300),
        timeout=payload.get("timeout", 3.0),
        max_output=payload.get("max_output", 65_536),
    )
    out = io.StringIO()
    interp = Interpreter(stdout=out, stdin=io.StringIO(payload.get("stdin", "")), safe=True,
                         limits=limits, filename="main.qaz")
    status, error = "ok", None
    try:
        interp.run_source(code)
    except ResourceLimitError as exc:
        status, error = "limit", exc.to_dict()
    except QazaqError as exc:
        status, error = "error", exc.to_dict()
        error["trace"] = [{"function": n, "line": l} for n, l in exc.trace[:10]]
    except MemoryError:
        status, error = "limit", {"title": "Превышен лимит", "message": "Не хватило памяти",
                                  "line": None, "column": None, "hint": None}
    if payload.get("lang") == "kk":
        error = translate_error(error)
    return {"status": status, "stdout": out.getvalue(), "error": error, "steps": interp.steps}


def main() -> int:
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        sys.stdout.write(json.dumps({"status": "error", "stdout": "", "error": {
            "title": "Ошибка запроса", "message": "Некорректный вход", "line": None,
            "column": None, "hint": None}}))
        return 0
    result = execute(payload)
    sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
