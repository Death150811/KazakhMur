"""FastAPI-бэкенд Playground. Запускает программы настоящим интерпретатором Qazaq."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from qaz import __version__
from qaz.stdlib import BUILTINS, CONSTANTS, METHODS
from qaz.tokens import KEYWORD_INFO

from .sandbox import Sandbox, SandboxConfig

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES_DIR = ROOT / "examples"
FRONTEND_DIST = ROOT / "frontend" / "dist"

RATE_LIMIT = 30          # запусков
RATE_WINDOW = 60.0       # секунд


class RunRequest(BaseModel):
    code: str = Field(..., max_length=100_000)
    stdin: str = Field("", max_length=20_000)


def create_app(config: SandboxConfig | None = None, rate_limit: int = RATE_LIMIT) -> FastAPI:
    app = FastAPI(title="Qazaq Playground", version=__version__)
    sandbox = Sandbox(config)
    hits: dict[str, deque] = defaultdict(deque)

    def client_id(request: Request) -> str:
        return request.client.host if request.client else "unknown"

    def check_rate(request: Request) -> None:
        now = time.monotonic()
        q = hits[client_id(request)]
        while q and now - q[0] > RATE_WINDOW:
            q.popleft()
        if len(q) >= rate_limit:
            raise HTTPException(status_code=429, detail="Слишком много запусков. Подождите минуту.")
        q.append(now)
        if len(hits) > 10_000:  # защита от разрастания таблицы
            hits.clear()

    @app.get("/api/health")
    def health():
        return {"status": "ok", "version": __version__}

    @app.post("/api/run")
    async def run_code(req: RunRequest, request: Request):
        check_rate(request)
        started = time.perf_counter()
        result = await sandbox.run(req.code, req.stdin)
        result["duration_ms"] = round((time.perf_counter() - started) * 1000)
        return result

    @app.get("/api/examples")
    def examples():
        items = []
        for path in sorted(EXAMPLES_DIR.glob("*.qaz")):
            text = path.read_text(encoding="utf-8")
            first = text.splitlines()[0] if text else ""
            title = first[len("# title:"):].strip() if first.startswith("# title:") else path.stem
            body = "\n".join(text.splitlines()[1:]).lstrip("\n") if first.startswith("# title:") else text
            items.append({"id": path.stem, "title": title, "code": body})
        return items

    @app.get("/api/language")
    def language():
        """Единый источник правды для подсветки синтаксиса и документации."""
        return language_definition()

    if (FRONTEND_DIST / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}")
        def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(status_code=404)
            target = (FRONTEND_DIST / path).resolve()
            if path and FRONTEND_DIST in target.parents and target.is_file():
                return FileResponse(target)
            return FileResponse(FRONTEND_DIST / "index.html")

    @app.exception_handler(HTTPException)
    async def http_exc(request: Request, exc: HTTPException):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    return app


def language_definition() -> dict:
    return {
        "version": __version__,
        "keywords": [{"name": k, "equivalent": v[0], "description": v[1]}
                     for k, v in KEYWORD_INFO.items()],
        "builtins": [{"name": b.name, "category": b.category, "signature": b.sig, "doc": b.doc,
                      "unsafe": b.unsafe} for b in BUILTINS.values()],
        "constants": sorted(CONSTANTS),
        "methods": sorted({name for table in METHODS.values() for name in table}),
        "literals": ["ақиқат", "жалған", "бос"],
    }


app = create_app()
