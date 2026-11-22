"""Изолированное выполнение программ Qazaq для Playground.

Каждый запуск — отдельный процесс Python (`python -m qaz.runner`) c:
  * лимитом процессорного времени и стенных часов,
  * лимитом памяти (RLIMIT_AS) и размера создаваемых файлов (RLIMIT_FSIZE=0),
  * запретом создавать новые процессы (RLIMIT_NPROC) — где поддерживается,
  * пустым окружением и временным каталогом как рабочей директорией,
  * безопасным режимом интерпретатора (нет файлов, нет графиков).

ВАЖНО: это не замена контейнерной изоляции. Сетевой доступ на уровне ОС не отключается
(в интерпретаторе Qazaq нет сетевых функций, но защита «в глубину» — задача Docker/gVisor).
См. docs/SECURITY.md.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path

try:
    import resource
except ImportError:  # Windows
    resource = None  # type: ignore

PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)


@dataclass
class SandboxConfig:
    max_code_bytes: int = 20_000
    max_stdin_bytes: int = 5_000
    wall_timeout: float = 5.0        # жёсткий лимит процесса, секунды
    interp_timeout: float = 3.0      # лимит самого интерпретатора, секунды
    cpu_seconds: int = 6
    memory_bytes: int = 768 * 1024 * 1024
    max_output_chars: int = 65_536
    max_steps: int = 3_000_000
    max_depth: int = 300
    max_concurrent: int = 4
    queue_timeout: float = 10.0      # сколько ждать свободного слота, секунды
    extra_env: dict = field(default_factory=dict)


def _limiter(cfg: SandboxConfig):
    def apply():  # выполняется в дочернем процессе перед запуском
        if resource is None:
            return
        os.setsid()
        resource.setrlimit(resource.RLIMIT_CPU, (cfg.cpu_seconds, cfg.cpu_seconds + 1))
        resource.setrlimit(resource.RLIMIT_AS, (cfg.memory_bytes, cfg.memory_bytes))
        resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        try:
            resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
        except (ValueError, OSError):
            pass
    return apply


class Sandbox:
    def __init__(self, cfg: SandboxConfig | None = None):
        self.cfg = cfg or SandboxConfig()
        # потоковый семафор не привязан к циклу событий — безопасно при любом числе циклов
        self._slots = threading.Semaphore(self.cfg.max_concurrent)

    async def _acquire(self) -> bool:
        deadline = asyncio.get_running_loop().time() + self.cfg.queue_timeout
        while not self._slots.acquire(blocking=False):
            if asyncio.get_running_loop().time() > deadline:
                return False
            await asyncio.sleep(0.02)
        return True

    def validate(self, code: str, stdin: str) -> str | None:
        if len(code.encode("utf-8")) > self.cfg.max_code_bytes:
            return f"Код слишком длинный (максимум {self.cfg.max_code_bytes} байт)"
        if len(stdin.encode("utf-8")) > self.cfg.max_stdin_bytes:
            return f"Ввод слишком длинный (максимум {self.cfg.max_stdin_bytes} байт)"
        return None

    async def run(self, code: str, stdin: str = "") -> dict:
        cfg = self.cfg
        problem = self.validate(code, stdin)
        if problem:
            return _failure("rejected", problem)
        payload = json.dumps({
            "code": code, "stdin": stdin, "timeout": cfg.interp_timeout,
            "max_steps": cfg.max_steps, "max_output": cfg.max_output_chars,
            "max_depth": cfg.max_depth,
        }).encode("utf-8")
        env = {"PYTHONPATH": PROJECT_ROOT, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1",
               "LANG": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1", **cfg.extra_env}
        if not await self._acquire():
            return _failure("busy", "Сервер занят, попробуйте ещё раз через несколько секунд")
        try:
            with tempfile.TemporaryDirectory(prefix="qaz-run-") as workdir:
                try:
                    proc = await asyncio.create_subprocess_exec(
                        sys.executable, "-s", "-m", "qaz.runner",
                        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE, cwd=workdir, env=env,
                        preexec_fn=_limiter(cfg) if resource else None)
                except OSError:
                    return _failure("internal", "Не удалось запустить исполнитель")
                try:
                    out, err = await asyncio.wait_for(proc.communicate(payload),
                                                      timeout=cfg.wall_timeout)
                except asyncio.TimeoutError:
                    _kill(proc)
                    await proc.wait()
                    return _failure("limit", f"Превышено время исполнения ({cfg.wall_timeout:g} с)")
        finally:
            self._slots.release()
        if proc.returncode != 0 or not out:
            code_ = proc.returncode
            if code_ is not None and code_ < 0:
                return _failure("limit", "Программа остановлена системой "
                                         "(превышен лимит памяти или процессорного времени)")
            return _failure("internal", "Внутренняя ошибка исполнителя")
        try:
            result = json.loads(out.decode("utf-8"))
        except ValueError:
            return _failure("internal", "Исполнитель вернул некорректный ответ")
        return result


def _kill(proc) -> None:
    try:
        os.killpg(proc.pid, 9)
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass


def _failure(status: str, message: str) -> dict:
    return {"status": status, "stdout": "", "steps": 0, "error": {
        "title": {"limit": "Превышен лимит", "rejected": "Ошибка запроса",
                  "busy": "Сервер занят"}.get(status, "Внутренняя ошибка"),
        "message": message, "line": None, "column": None, "hint": None}}
