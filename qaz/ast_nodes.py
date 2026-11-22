"""Узлы абстрактного синтаксического дерева (AST) Qazaq."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class Node:
    line: int = field(default=0, kw_only=True)
    col: int = field(default=0, kw_only=True)


# ---------------- выражения ----------------
@dataclass(slots=True)
class Literal(Node):
    value: object  # int | float | str | bool | None


@dataclass(slots=True)
class FString(Node):
    parts: list  # str | tuple[Node, str | None]


@dataclass(slots=True)
class Name(Node):
    name: str


@dataclass(slots=True)
class ListLit(Node):
    items: list


@dataclass(slots=True)
class DictLit(Node):
    pairs: list  # [(ключ, значение)]


@dataclass(slots=True)
class Unary(Node):
    op: str  # '-', '+', 'емес'
    operand: Node


@dataclass(slots=True)
class Binary(Node):
    op: str
    left: Node
    right: Node


@dataclass(slots=True)
class Logical(Node):
    op: str  # 'және' | 'немесе'
    left: Node
    right: Node


@dataclass(slots=True)
class Compare(Node):
    left: Node
    ops: list  # [(оператор, узел)]; оператор: == != < <= > >= ішінде 'емес ішінде'


@dataclass(slots=True)
class Call(Node):
    func: Node
    args: list


@dataclass(slots=True)
class Index(Node):
    obj: Node
    index: Node


@dataclass(slots=True)
class Slice(Node):
    obj: Node
    lo: Node | None
    hi: Node | None
    step: Node | None


@dataclass(slots=True)
class Attr(Node):
    obj: Node
    name: str


# ---------------- инструкции ----------------
@dataclass(slots=True)
class VarDecl(Node):
    name: str
    value: Node


@dataclass(slots=True)
class Assign(Node):
    target: Node  # Name | Index | Attr
    op: str       # '=', '+=', '-=', '*=', '/='
    value: Node


@dataclass(slots=True)
class ExprStmt(Node):
    expr: Node


@dataclass(slots=True)
class If(Node):
    branches: list  # [(условие, тело)]
    orelse: list | None


@dataclass(slots=True)
class While(Node):
    cond: Node
    body: list


@dataclass(slots=True)
class For(Node):
    targets: list  # [имя, ...]
    iterable: Node
    body: list


@dataclass(slots=True)
class Param:
    name: str
    default: Node | None = None


@dataclass(slots=True)
class FuncDef(Node):
    name: str
    params: list
    body: list


@dataclass(slots=True)
class ClassDef(Node):
    name: str
    base: Node | None
    body: list


@dataclass(slots=True)
class Return(Node):
    value: Node | None


@dataclass(slots=True)
class Break(Node):
    pass


@dataclass(slots=True)
class Continue(Node):
    pass


@dataclass(slots=True)
class Pass(Node):
    pass


@dataclass(slots=True)
class Raise(Node):
    value: Node


@dataclass(slots=True)
class Try(Node):
    body: list
    catch_name: str | None
    catch_body: list | None
    final_body: list | None


@dataclass(slots=True)
class Program(Node):
    body: list
