"""Руководство docs/MANUAL.md и таблица казахских сообщений собраны из актуальных данных, а пути в тексте существуют."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

import gen_manual  # noqa: E402

PATH_PREFIXES = ("qaz/", "site/", "docs/", "tests/", "scripts/", "backend/", "examples/")


def mask_volatile(text: str) -> str:
    """Разделы с числами (меняются при любой правке) не сравниваем."""
    return re.sub(r"<!-- AUTO:(\w+) -->.*?<!-- /AUTO:\1 -->", r"<!-- AUTO:\1 -->", text, flags=re.S)


def test_manual_is_up_to_date():
    assert gen_manual.TARGET.exists(), "нет docs/MANUAL.md: python scripts/gen_manual.py"
    committed = mask_volatile(gen_manual.TARGET.read_text(encoding="utf-8"))
    fresh = mask_volatile(gen_manual.render_manual())
    assert committed == fresh, "docs/MANUAL.md устарел: python scripts/gen_manual.py (правьте главы в docs/manual/, не MANUAL.md)"


def test_review_table_is_up_to_date():
    assert gen_manual.REVIEW.read_text(encoding="utf-8") == gen_manual.render_review(), \
        "docs/KAZAKH_MESSAGES_REVIEW.md устарел: python scripts/gen_manual.py"


def test_manual_is_substantial_and_complete():
    text = gen_manual.TARGET.read_text(encoding="utf-8")
    assert len(text) > 120_000, "руководство стало подозрительно коротким"
    for n in range(1, 17):
        assert re.search(rf"^## {n}\. ", text, re.M), f"нет главы {n}"
    assert "Приложение А" in text and "Приложение Г" in text
    assert "{{AUTO:" not in text, "осталась неподставленная метка"


def test_paths_mentioned_in_the_manual_exist():
    text = gen_manual.TARGET.read_text(encoding="utf-8")
    text = re.sub(r"```.*?```", "", text, flags=re.S)  # блоки кода и дерево — не проверяем
    missing = []
    for m in re.finditer(r"`([^`\n]+)`", text):
        token = m.group(1).strip()
        if not token.startswith(PATH_PREFIXES):
            continue
        if any(c in token for c in "*{}<>…") or "NN" in token or "xxx" in token or "site/dist/" in token:
            continue
        path = re.split(r"::|:\s| \(|\(", token)[0].rstrip(".,;:")
        if not (ROOT / path).exists():
            missing.append(path)
    assert not missing, "в руководстве упомянуты несуществующие пути:\n" + "\n".join(sorted(set(missing)))


def test_every_documented_file_still_exists():
    absent = [p for p in gen_manual.PURPOSE if not (ROOT / p).exists() and "dist/" not in p]
    assert not absent, f"в scripts/gen_manual.py описаны несуществующие файлы: {absent}"
