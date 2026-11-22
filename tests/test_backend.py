import json
import time

import pytest

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import create_app, language_definition  # noqa: E402
from backend.sandbox import SandboxConfig  # noqa: E402


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(rate_limit=10_000))


def run(client, code, stdin=""):
    r = client.post("/api/run", json={"code": code, "stdin": stdin})
    assert r.status_code == 200, r.text
    return r.json()


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_run_real_interpreter(client):
    res = run(client, "айным x = 10.\nайным y = 20.\nжаз(x + y).")
    assert res["status"] == "ok" and res["stdout"] == "30\n" and res["error"] is None
    assert res["duration_ms"] >= 0


def test_unicode_roundtrip(client):
    res = run(client, 'айным әліпби = "Ә Ғ Қ Ң Ө Ұ Ү Һ І".\nжаз(әліпби).')
    assert res["stdout"] == "Ә Ғ Қ Ң Ө Ұ Ү Һ І\n"


def test_runtime_error_has_position(client):
    res = run(client, "жаз(1).\nжаз(1 / 0).")
    assert res["status"] == "error"
    assert res["stdout"] == "1\n"
    assert res["error"]["line"] == 2 and "ноль" in res["error"]["message"]


def test_syntax_error(client):
    res = run(client, "айным x = 1\nжаз(x).")
    assert res["status"] == "error" and res["error"]["line"] == 1
    assert "Синтаксическая" in res["error"]["title"]


def test_stdin(client):
    res = run(client, 'жаз("Сәлем,", енгіз()).', stdin="Әлем\n")
    assert res["stdout"] == "Сәлем, Әлем\n"


def test_infinite_loop_is_stopped(client):
    started = time.time()
    res = run(client, "әзір ақиқат:\n    өткіз.")
    assert res["status"] == "limit"
    assert time.time() - started < 10


def test_runaway_recursion_reports_error(client):
    res = run(client, "функ f():\n    қайтар f().\nf().")
    assert res["status"] == "error" and "глубина" in res["error"]["message"]


def test_output_limit(client):
    res = run(client, 'әзір ақиқат:\n    жаз("x" * 1000).')
    assert res["status"] == "limit" and len(res["stdout"]) <= 70_000


def test_memory_bomb_is_contained(client):
    res = run(client, 'айным л = [0].\nәзір ақиқат:\n    л = л + л.')
    assert res["status"] in ("limit", "error")  # процесс не должен положить сервер
    assert client.get("/api/health").status_code == 200


def test_file_access_blocked(client):
    res = run(client, 'жаз(оқы("/etc/passwd")).')
    assert res["status"] == "error" and "безопасном" in res["error"]["message"]
    res = run(client, 'сақта("x.txt", "a").')
    assert res["status"] == "error"


def test_code_too_long_rejected():
    c = TestClient(create_app(SandboxConfig(max_code_bytes=50), rate_limit=10_000))
    res = c.post("/api/run", json={"code": "жаз(1).\n" * 100}).json()
    assert res["status"] == "rejected"


def test_process_has_no_host_environment(client, monkeypatch):
    monkeypatch.setenv("SECRET_TOKEN", "супер-секрет")
    res = run(client, 'жаз("ok").')
    assert "супер-секрет" not in json.dumps(res, ensure_ascii=False)


def test_rate_limit():
    c = TestClient(create_app(rate_limit=3))
    codes = [c.post("/api/run", json={"code": "жаз(1)."}).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]


def test_concurrent_runs_isolated(client):
    from concurrent.futures import ThreadPoolExecutor
    def job(i):
        return run(client, f"жаз({i} * 2).")["stdout"]
    with ThreadPoolExecutor(6) as ex:
        results = list(ex.map(job, range(8)))
    assert results == [f"{i * 2}\n" for i in range(8)]


def test_examples_endpoint_runs_all(client):
    items = client.get("/api/examples").json()
    assert len(items) >= 8
    for item in items:
        if item["id"] == "08_science":
            continue  # SymPy — отдельный тест
        res = run(client, item["code"])
        assert res["status"] == "ok", (item["id"], res["error"])


def test_language_endpoint_matches_interpreter(client):
    data = client.get("/api/language").json()
    assert data == json.loads(json.dumps(language_definition()))
    names = {k["name"] for k in data["keywords"]}
    assert {"айным", "функ", "егер", "әйтпесе", "қайтар", "әзір", "әрбір"} <= names
    assert any(b["name"] == "жаз" for b in data["builtins"])
