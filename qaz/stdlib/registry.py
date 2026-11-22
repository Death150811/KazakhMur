"""Реестр встроенных функций и методов. Единый источник правды для интерпретатора,
документации и подсветки синтаксиса."""
from __future__ import annotations

from ..errors import QazaqRuntimeError
from ..runtime import Builtin, type_name

BUILTINS: dict[str, Builtin] = {}
METHODS: dict[type, dict[str, Builtin]] = {}
CONSTANTS: dict[str, object] = {}
CATEGORIES = ("core", "math", "data", "science", "ai", "io")


def builtin(name: str, min_args: int = 0, max_args: int | None = None, *, category: str = "core",
            sig: str = "", doc: str = "", unsafe: bool = False):
    def deco(fn):
        BUILTINS[name] = Builtin(name, fn, min_args, max_args, category, sig or f"{name}(…)",
                                 doc, unsafe)
        return fn
    return deco


def method(py_type: type, name: str, min_args: int = 0, max_args: int | None = 0, *,
           sig: str = "", doc: str = ""):
    """Метод встроенного типа. max_args не учитывает сам объект (self)."""
    def deco(fn):
        METHODS.setdefault(py_type, {})[name] = Builtin(
            name, fn, min_args, max_args, "method", sig or f".{name}(…)", doc)
        return fn
    return deco


def rt_error(msg: str, hint: str | None = None):
    raise QazaqRuntimeError(msg, hint=hint)


def is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def expect_number(fname: str, v, label: str = "сан") -> float | int:
    if not is_number(v):
        rt_error(f"«{fname}»: ожидалось число ({label}), получено {type_name(v)}")
    return v


def expect_int(fname: str, v, label: str = "бүтін сан"):
    if isinstance(v, bool) or not isinstance(v, int):
        rt_error(f"«{fname}»: ожидалось целое число ({label}), получено {type_name(v)}")
    return v


def expect_str(fname: str, v):
    if not isinstance(v, str):
        rt_error(f"«{fname}»: ожидалась строка (мәтін), получено {type_name(v)}")
    return v


def as_list(fname: str, v) -> list:
    """Любая перебираемая коллекция -> список (копия)."""
    if isinstance(v, (list, range, str)):
        return list(v)
    if isinstance(v, dict):
        return list(v.keys())
    rt_error(f"«{fname}»: ожидалась коллекция (тізім, аралық, мәтін, сөздік), "
             f"получено {type_name(v)}")


def numbers(fname: str, v) -> list:
    items = as_list(fname, v)
    for x in items:
        if not is_number(x):
            rt_error(f"«{fname}»: все элементы должны быть числами, найден {type_name(x)}")
    return items
