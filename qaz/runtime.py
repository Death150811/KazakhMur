"""Среда исполнения: значения, окружения, преобразование в текст."""
from __future__ import annotations

import difflib
from dataclasses import dataclass, field
from typing import Callable

from .errors import QazaqRuntimeError


class Env:
    """Окружение (область видимости). Цепочка parent даёт лексическую видимость."""
    __slots__ = ("vars", "parent", "readonly")

    def __init__(self, parent: "Env | None" = None, readonly: bool = False):
        self.vars: dict[str, object] = {}
        self.parent = parent
        self.readonly = readonly

    def lookup(self, name: str):
        env = self
        while env is not None:
            if name in env.vars:
                return env.vars[name]
            env = env.parent
        raise KeyError(name)

    def declare(self, name: str, value) -> None:
        self.vars[name] = value

    def assign(self, name: str, value) -> bool:
        """Меняет ближайшую объявленную переменную. False, если такой нет."""
        env = self
        while env is not None:
            if name in env.vars:
                if env.readonly:
                    raise QazaqRuntimeError(
                        f"«{name}» — встроенное имя, его нельзя изменить присваиванием",
                        hint="Объявите свою переменную: айным " + name + " = ….")
                env.vars[name] = value
                return True
            env = env.parent
        return False

    def visible_names(self) -> list[str]:
        names: list[str] = []
        env = self
        while env is not None:
            names.extend(env.vars)
            env = env.parent
        return names


@dataclass(eq=False)
class QFunction:
    name: str
    params: list
    body: list
    closure: Env

    @property
    def min_args(self) -> int:
        return sum(1 for p in self.params if p.default is None)


@dataclass(eq=False)
class Builtin:
    name: str
    fn: Callable
    min_args: int = 0
    max_args: int | None = 0
    category: str = "core"
    sig: str = ""
    doc: str = ""
    unsafe: bool = False  # недоступна в безопасном режиме (Playground)


@dataclass(eq=False)
class BoundBuiltin:
    """Метод встроенного типа, привязанный к значению: "abc".жоғары"""
    name: str
    fn: Callable
    receiver: object
    min_args: int = 0
    max_args: int | None = 0


@dataclass(eq=False)
class QClass:
    name: str
    base: "QClass | None"
    members: dict = field(default_factory=dict)  # функции и поля класса

    def find(self, name: str):
        cls = self
        while cls is not None:
            if name in cls.members:
                return cls.members[name]
            cls = cls.base
        raise KeyError(name)


@dataclass(eq=False)
class QInstance:
    cls: QClass
    fields: dict = field(default_factory=dict)


@dataclass(eq=False)
class BoundMethod:
    func: QFunction
    receiver: QInstance


FUNCTION_TYPES = (QFunction, Builtin, BoundBuiltin, BoundMethod)


def type_name(v) -> str:
    if v is None:
        return "бос"
    if isinstance(v, bool):
        return "логика"
    if isinstance(v, int):
        return "бүтін"
    if isinstance(v, float):
        return "нақты"
    if isinstance(v, str):
        return "мәтін"
    if isinstance(v, list):
        return "тізім"
    if isinstance(v, dict):
        return "сөздік"
    if isinstance(v, range):
        return "аралық"
    if isinstance(v, FUNCTION_TYPES):
        return "функция"
    if isinstance(v, QClass):
        return "сынып"
    if isinstance(v, QInstance):
        return v.cls.name
    return type(v).__name__


def _quote(s: str) -> str:
    out = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t")
    return f'"{out}"'


def to_repr(v, _seen: set | None = None, _depth: int = 0) -> str:
    """Представление значения «как в коде»: строки в кавычках."""
    if isinstance(v, str):
        return _quote(v)
    if isinstance(v, (list, dict)):
        seen = _seen if _seen is not None else set()
        if id(v) in seen or _depth > 20:
            return "[…]" if isinstance(v, list) else "{…}"
        seen.add(id(v))
        try:
            if isinstance(v, list):
                return "[" + ", ".join(to_repr(x, seen, _depth + 1) for x in v) + "]"
            return "{" + ", ".join(f"{to_repr(k, seen, _depth + 1)}: {to_repr(x, seen, _depth + 1)}"
                                   for k, x in v.items()) + "}"
        finally:
            seen.discard(id(v))
    return to_str(v)


def to_str(v) -> str:
    if v is None:
        return "бос"
    if v is True:
        return "ақиқат"
    if v is False:
        return "жалған"
    if isinstance(v, str):
        return v
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (list, dict)):
        return to_repr(v)
    if isinstance(v, range):
        if v.step == 1:
            return f"аралық({v.start}, {v.stop})"
        return f"аралық({v.start}, {v.stop}, {v.step})"
    if isinstance(v, QFunction):
        return f"<функция {v.name}>"
    if isinstance(v, (Builtin, BoundBuiltin)):
        return f"<ішкі функция {v.name}>"
    if isinstance(v, BoundMethod):
        return f"<әдіс {v.func.name}>"
    if isinstance(v, QClass):
        return f"<сынып {v.name}>"
    if isinstance(v, QInstance):
        return f"<{v.cls.name} нысаны>"
    return str(v)


def suggest(name: str, candidates: list[str]) -> str | None:
    match = difflib.get_close_matches(name, candidates, n=1, cutoff=0.7)
    return match[0] if match else None


def truthy(v) -> bool:
    return bool(v)
