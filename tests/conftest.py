import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from qaz.errors import QazaqError  # noqa: E402
from qaz.interpreter import Interpreter, Limits  # noqa: E402


def run(src: str, stdin: str = "", **kwargs) -> str:
    """Выполняет программу Qazaq и возвращает вывод."""
    out = io.StringIO()
    interp = Interpreter(stdout=out, stdin=io.StringIO(stdin), **kwargs)
    interp.run_source(src)
    return out.getvalue()


def run_err(src: str, **kwargs) -> QazaqError:
    """Выполняет программу, которая должна упасть, и возвращает ошибку."""
    with pytest.raises(QazaqError) as info:
        run(src, **kwargs)
    return info.value


@pytest.fixture
def qrun():
    return run


@pytest.fixture
def qerr():
    return run_err
