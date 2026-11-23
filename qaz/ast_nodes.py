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
class TupleLit(Node):
    items: list


@dataclass(slots=True)
class ListComp(Node):
    elt: Node
    clauses: list  # [("for", [имена], выражение) | ("if", условие)]


@dataclass(slots=True)
class DictComp(Node):
    key: Node
    value: Node
    clauses: list


@dataclass(slots=True)
class TargetList(Node):
    items: list  # цели присваивания: Name | Index | Attr


@dataclass(slots=True)
class VarDeclMulti(Node):
    names: list
    value: Node


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
    kwargs: list = field(default_factory=list)  # [(имя, выражение)] — именованные аргументы


@dataclass(slots=True)
class Ternary(Node):
    cond: Node
    then: Node
    orelse: Node


@dataclass(slots=True)
class Pipe(Node):
    left: Node
    right: Node


@dataclass(slots=True)
class Lambda(Node):
    params: list  # [Param]
    body: Node


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
    mode: str = "."   # '.' выполнить, '?' показать значение, '!' утверждение
    text: str = ""    # исходный текст выражения (для '?' и '!')


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
