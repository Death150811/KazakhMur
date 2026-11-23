"""Интерпретатор Qazaq: исполняет AST собственной моделью исполнения (без eval/exec)."""
from __future__ import annotations

import random
import sys
import time
from dataclasses import dataclass
from typing import Callable

from . import ast_nodes as A
from .errors import QazaqError, QazaqRuntimeError, ResourceLimitError
from .lexer import Lexer
from .parser import Parser
from .runtime import (BoundBuiltin, BoundMethod, Builtin, Env, QClass, QFunction, QInstance,
                      suggest, to_repr, to_str, truthy, type_name)
from .stdlib import BUILTINS, CONSTANTS, METHODS

# Python по умолчанию не печатает целые длиннее 4300 цифр; для факториалов и степеней поднимаем лимит
if 0 < sys.get_int_max_str_digits() < 150_000:
    sys.set_int_max_str_digits(150_000)

NUMBER = (int, float)
MAX_INT_BITS = 300_000            # максимальный размер целого результата умножения/степени (бит)
MAX_SEQ_RESULT = 10_000_000       # максимальный размер результата повторения строки/списка


@dataclass
class Limits:
    """Ограничения исполнения. None — без ограничения."""
    max_steps: int | None = None
    max_depth: int = 1000
    timeout: float | None = None   # секунды (по стенным часам)
    max_output: int | None = None  # символов


_MISSING = object()


class _Return(Exception):
    def __init__(self, value):
        self.value = value


class _Break(Exception):
    pass


class _Continue(Exception):
    pass


class Interpreter:
    def __init__(self, *, stdout=None, stdin=None, safe: bool = False,
                 limits: Limits | None = None, filename: str | None = None):
        self.stdout = stdout if stdout is not None else sys.stdout
        self.stdin = stdin if stdin is not None else sys.stdin
        self.safe = safe
        self.limits = limits or Limits()
        self.filename = filename
        self.rng = random.Random()
        self.steps = 0
        self.depth = 0
        self.out_chars = 0
        self.deadline: float | None = None
        self.echo = False

        self.builtin_env = Env(readonly=True)
        for name, b in BUILTINS.items():
            self.builtin_env.vars[name] = b
        for name, value in CONSTANTS.items():
            self.builtin_env.vars[name] = value
        self.globals = Env(self.builtin_env)

        self._ex: dict[type, Callable] = {
            A.VarDecl: self.x_vardecl, A.Assign: self.x_assign, A.ExprStmt: self.x_expr,
            A.If: self.x_if, A.While: self.x_while, A.For: self.x_for,
            A.FuncDef: self.x_funcdef, A.ClassDef: self.x_classdef, A.Return: self.x_return,
            A.Break: self.x_break, A.Continue: self.x_continue, A.Pass: lambda n, e: None,
            A.Raise: self.x_raise, A.Try: self.x_try,
        }
        self._ev: dict[type, Callable] = {
            A.Literal: lambda n, e: n.value, A.FString: self.e_fstring, A.Name: self.e_name,
            A.ListLit: self.e_list, A.DictLit: self.e_dict, A.Unary: self.e_unary,
            A.Binary: self.e_binary, A.Logical: self.e_logical, A.Compare: self.e_compare,
            A.Call: self.e_call, A.Index: self.e_index, A.Slice: self.e_slice,
            A.Attr: self.e_attr, A.Lambda: self.e_lambda,
        }

    # ------------------------------------------------------------------
    # Публичный интерфейс
    # ------------------------------------------------------------------
    def run_source(self, source: str, *, echo: bool = False):
        program = Parser(Lexer(source).tokenize()).parse_program()
        return self.run(program, echo=echo)

    def run(self, program: A.Program, *, echo: bool = False) -> None:
        """Исполняет программу. Ошибки поднимаются как QazaqError."""
        self.steps = 0
        self.depth = 0
        self.echo = echo
        if self.limits.timeout is not None:
            self.deadline = time.monotonic() + self.limits.timeout
        old_limit = sys.getrecursionlimit()
        sys.setrecursionlimit(max(old_limit, self.limits.max_depth * 40 + 2000))
        try:
            for stmt in program.body:
                self.run_stmt(stmt, self.globals)
        except (_Return, _Break, _Continue):  # защитные: парсер такого не пропускает
            raise QazaqRuntimeError("Недопустимое использование управляющей инструкции")
        except RecursionError:
            raise QazaqRuntimeError("Слишком глубокая вложенность выражений или вызовов",
                                    hint="Проверьте условие выхода из рекурсии или упростите вложенность.")
        except QazaqError as exc:
            if exc.filename is None:
                exc.filename = self.filename
            raise
        finally:
            sys.setrecursionlimit(old_limit)

    # ------------------------------------------------------------------
    # Ввод / вывод / ресурсы (используются и стандартной библиотекой)
    # ------------------------------------------------------------------
    def write(self, text: str) -> None:
        self.out_chars += len(text)
        if self.limits.max_output is not None and self.out_chars > self.limits.max_output:
            raise ResourceLimitError(f"Превышен лимит вывода ({self.limits.max_output} символов)")
        self.stdout.write(text)

    def read_line(self) -> str | None:
        line = self.stdin.readline()
        if line == "":
            return None
        return line.rstrip("\n")

    def _tick(self) -> None:
        self.steps += 1
        lim = self.limits
        if lim.max_steps is not None and self.steps > lim.max_steps:
            raise ResourceLimitError(
                f"Превышен лимит шагов исполнения ({lim.max_steps}). Возможно, бесконечный цикл.")
        if self.deadline is not None and (self.steps & 255) == 0 and time.monotonic() > self.deadline:
            raise ResourceLimitError(f"Превышено время исполнения ({lim.timeout:g} с). "
                                     "Возможно, бесконечный цикл.")

    @staticmethod
    def _locate(exc: QazaqError, node) -> None:
        if exc.line is None:
            exc.line, exc.col = node.line, node.col

    # ------------------------------------------------------------------
    # Диспетчеры
    # ------------------------------------------------------------------
    def run_stmt(self, node, env: Env) -> None:
        self._tick()
        try:
            self._ex[type(node)](node, env)
        except QazaqError as exc:
            self._locate(exc, node)
            raise

    def exec_block(self, stmts: list, env: Env) -> None:
        for stmt in stmts:
            self.run_stmt(stmt, env)

    def evaluate(self, node, env: Env):
        try:
            return self._ev[type(node)](node, env)
        except QazaqError as exc:
            self._locate(exc, node)
            raise

    # ------------------------------------------------------------------
    # Инструкции
    # ------------------------------------------------------------------
    def x_vardecl(self, node: A.VarDecl, env: Env) -> None:
        env.declare(node.name, self.evaluate(node.value, env))

    def x_assign(self, node: A.Assign, env: Env) -> None:
        target = node.target
        if isinstance(target, A.Name):
            value = self.evaluate(node.value, env)
            if node.op != "=":
                try:
                    current = env.lookup(target.name)
                except KeyError:
                    self._undeclared(target)
                value = self.binop(node.op[0], current, value)
            if not env.assign(target.name, value):
                self._undeclared(target)
        elif isinstance(target, A.Index):
            obj = self.evaluate(target.obj, env)
            idx = self.evaluate(target.index, env)
            value = self.evaluate(node.value, env)
            if node.op != "=":
                value = self.binop(node.op[0], self.get_index(obj, idx), value)
            self.set_index(obj, idx, value)
        else:  # A.Attr
            obj = self.evaluate(target.obj, env)
            value = self.evaluate(node.value, env)
            if node.op != "=":
                value = self.binop(node.op[0], self.get_attr(obj, target.name), value)
            if not isinstance(obj, QInstance):
                raise QazaqRuntimeError(
                    f"Поля можно менять только у объектов классов, а не у значения типа "
                    f"{type_name(obj)}")
            obj.fields[target.name] = value

    def _undeclared(self, target: A.Name):
        hint = f"Сначала объявите переменную: айным {target.name} = …."
        near = suggest(target.name, self.globals.visible_names())
        if near:
            hint = f"Возможно, вы имели в виду «{near}». " + hint
        raise QazaqRuntimeError(f"Переменная «{target.name}» не объявлена", hint=hint)

    def x_expr(self, node: A.ExprStmt, env: Env) -> None:
        value = self.evaluate(node.expr, env)
        if self.echo and env is self.globals and value is not None:
            self.write(to_repr(value) + "\n")

    def x_if(self, node: A.If, env: Env) -> None:
        for cond, body in node.branches:
            if truthy(self.evaluate(cond, env)):
                self.exec_block(body, env)
                return
        if node.orelse is not None:
            self.exec_block(node.orelse, env)

    def x_while(self, node: A.While, env: Env) -> None:
        while truthy(self.evaluate(node.cond, env)):
            try:
                self.exec_block(node.body, env)
            except _Break:
                break
            except _Continue:
                pass
            self._tick()

    def x_for(self, node: A.For, env: Env) -> None:
        iterable = self.evaluate(node.iterable, env)
        if isinstance(iterable, dict):
            iterable = list(iterable)
        elif not isinstance(iterable, (list, str, range)):
            raise QazaqRuntimeError(
                f"Нельзя перебирать значение типа {type_name(iterable)}",
                hint="Перебирать можно тізім, мәтін, сөздік и аралық.")
        targets = node.targets
        for item in iterable:
            if len(targets) == 1:
                env.vars[targets[0]] = item
            else:
                if not isinstance(item, list) or len(item) != len(targets):
                    raise QazaqRuntimeError(
                        f"Нельзя разложить значение {to_repr(item)} на {len(targets)} переменные")
                for name, v in zip(targets, item):
                    env.vars[name] = v
            try:
                self.exec_block(node.body, env)
            except _Break:
                break
            except _Continue:
                pass
            self._tick()

    def x_funcdef(self, node: A.FuncDef, env: Env) -> None:
        env.declare(node.name, QFunction(node.name, node.params, node.body, env))

    def x_classdef(self, node: A.ClassDef, env: Env) -> None:
        base = None
        if node.base is not None:
            base = self.evaluate(node.base, env)
            if not isinstance(base, QClass):
                raise QazaqRuntimeError(f"Базовым классом может быть только сынып, "
                                        f"а не {type_name(base)}")
        cls = QClass(node.name, base)
        for stmt in node.body:
            if isinstance(stmt, A.FuncDef):
                cls.members[stmt.name] = QFunction(stmt.name, stmt.params, stmt.body, env)
            elif isinstance(stmt, A.VarDecl):
                cls.members[stmt.name] = self.evaluate(stmt.value, env)
        env.declare(node.name, cls)

    def x_return(self, node: A.Return, env: Env) -> None:
        raise _Return(None if node.value is None else self.evaluate(node.value, env))

    def x_break(self, node, env) -> None:
        raise _Break()

    def x_continue(self, node, env) -> None:
        raise _Continue()

    def x_raise(self, node: A.Raise, env: Env) -> None:
        value = self.evaluate(node.value, env)
        raise QazaqRuntimeError(to_str(value))

    def x_try(self, node: A.Try, env: Env) -> None:
        try:
            try:
                self.exec_block(node.body, env)
            except QazaqError as exc:
                if node.catch_body is None or not exc.catchable:
                    raise
                cenv = Env(env)
                if node.catch_name:
                    cenv.declare(node.catch_name, exc.message)
                self.exec_block(node.catch_body, cenv)
        finally:
            if node.final_body is not None:
                self.exec_block(node.final_body, env)

    # ------------------------------------------------------------------
    # Выражения
    # ------------------------------------------------------------------
    def e_name(self, node: A.Name, env: Env):
        try:
            return env.lookup(node.name)
        except KeyError:
            hint = None
            near = suggest(node.name, env.visible_names())
            if near:
                hint = f"Возможно, вы имели в виду «{near}»."
            else:
                hint = f"Объявите переменную: айным {node.name} = …."
            raise QazaqRuntimeError(f"Имя «{node.name}» не определено", hint=hint)

    def e_fstring(self, node: A.FString, env: Env):
        out: list[str] = []
        for part in node.parts:
            if isinstance(part, str):
                out.append(part)
                continue
            expr, spec = part
            value = self.evaluate(expr, env)
            if spec:
                try:
                    out.append(format(value, spec))
                except (ValueError, TypeError):
                    raise QazaqRuntimeError(
                        f"Формат «{spec}» не подходит для значения типа {type_name(value)}",
                        node.line, node.col)
            else:
                out.append(to_str(value))
        return "".join(out)

    def e_list(self, node: A.ListLit, env: Env):
        return [self.evaluate(item, env) for item in node.items]

    def e_dict(self, node: A.DictLit, env: Env):
        result = {}
        for knode, vnode in node.pairs:
            key = self.evaluate(knode, env)
            value = self.evaluate(vnode, env)
            try:
                result[key] = value
            except TypeError:
                raise QazaqRuntimeError(
                    f"Ключом словаря не может быть значение типа {type_name(key)}",
                    knode.line, knode.col)
        return result

    def e_unary(self, node: A.Unary, env: Env):
        v = self.evaluate(node.operand, env)
        if node.op == "емес":
            return not truthy(v)
        if not isinstance(v, NUMBER):
            raise QazaqRuntimeError(f"Унарный «{node.op}» не применим к значению типа {type_name(v)}")
        return -v if node.op == "-" else +v

    def e_logical(self, node: A.Logical, env: Env):
        left = self.evaluate(node.left, env)
        if node.op == "және":
            return self.evaluate(node.right, env) if truthy(left) else left
        return left if truthy(left) else self.evaluate(node.right, env)

    def e_binary(self, node: A.Binary, env: Env):
        left = self.evaluate(node.left, env)
        right = self.evaluate(node.right, env)
        return self.binop(node.op, left, right)

    def e_compare(self, node: A.Compare, env: Env):
        left = self.evaluate(node.left, env)
        for op, rnode in node.ops:
            right = self.evaluate(rnode, env)
            if not self.compare(op, left, right):
                return False
            left = right
        return True

    # ---- арифметика -----------------------------------------------------
    def binop(self, op: str, a, b):
        try:
            return self._binop(op, a, b)
        except ZeroDivisionError:
            raise QazaqRuntimeError("Нөлге бөлу: деление на ноль" if op in "/%" or op == "//"
                                    else "Нуль в отрицательной степени",
                                    hint="Проверьте делитель перед делением.")
        except OverflowError:
            raise QazaqRuntimeError("Результат слишком велик для вычисления")

    def _binop(self, op: str, a, b):
        a_num, b_num = isinstance(a, NUMBER), isinstance(b, NUMBER)
        if op == "+":
            if (a_num and b_num) or (isinstance(a, str) and isinstance(b, str)) \
                    or (isinstance(a, list) and isinstance(b, list)):
                return a + b
        elif op == "-":
            if a_num and b_num:
                return a - b
        elif op == "*":
            if a_num and b_num:
                if isinstance(a, int) and isinstance(b, int) \
                        and a.bit_length() + b.bit_length() > MAX_INT_BITS:
                    raise QazaqRuntimeError("Результат умножения слишком велик")
                return a * b
            seq, n = (a, b) if isinstance(a, (str, list)) else (b, a)
            if isinstance(seq, (str, list)) and isinstance(n, int) and not isinstance(n, bool):
                if len(seq) * max(n, 0) > MAX_SEQ_RESULT:
                    raise QazaqRuntimeError("Результат повторения слишком велик")
                return seq * n
        elif op == "/":
            if a_num and b_num:
                return a / b
        elif op == "//":
            if a_num and b_num:
                return a // b
        elif op == "%":
            if a_num and b_num:
                return a % b
        elif op == "**":
            if a_num and b_num:
                if isinstance(a, int) and isinstance(b, int) and b > 0 and abs(a) > 1 \
                        and b * a.bit_length() > MAX_INT_BITS:
                    raise QazaqRuntimeError("Результат возведения в степень слишком велик")
                result = a ** b
                if isinstance(result, complex):
                    raise QazaqRuntimeError("Результат комплексный: основание отрицательно, "
                                            "а показатель дробный")
                return result
        else:
            raise QazaqRuntimeError(f"Неизвестная операция {op}")
        hint = None
        if op == "+" and (isinstance(a, str) != isinstance(b, str)):
            hint = "Чтобы склеить строку с числом, используйте мәтін(…) или ф\"…{x}…\"."
        raise QazaqRuntimeError(
            f"Операция «{op}» не применима к типам {type_name(a)} и {type_name(b)}", hint=hint)

    def compare(self, op: str, a, b) -> bool:
        try:
            if op == "==":
                return a == b
            if op == "!=":
                return a != b
            if op == "<":
                return a < b
            if op == "<=":
                return a <= b
            if op == ">":
                return a > b
            if op == ">=":
                return a >= b
            if op in ("ішінде", "емес ішінде"):
                if isinstance(b, str):
                    if not isinstance(a, str):
                        raise QazaqRuntimeError(
                            f"В строке можно искать только строку, а не {type_name(a)}")
                elif not isinstance(b, (list, dict, range)):
                    raise QazaqRuntimeError(
                        f"Оператор «ішінде» не применим к типу {type_name(b)}",
                        hint="Правая часть должна быть мәтін, тізім, сөздік или аралық.")
                return (a in b) == (op == "ішінде")
        except TypeError:
            raise QazaqRuntimeError(
                f"Нельзя сравнить {type_name(a)} и {type_name(b)} оператором «{op}»")
        raise QazaqRuntimeError(f"Неизвестное сравнение {op}")

    # ---- индексы, срезы, поля ------------------------------------------
    def get_index(self, obj, idx):
        if isinstance(obj, (list, str, range)):
            if isinstance(idx, bool) or not isinstance(idx, int):
                raise QazaqRuntimeError(f"Индекс должен быть бүтін (целым), а не {type_name(idx)}")
            try:
                return obj[idx]
            except IndexError:
                raise QazaqRuntimeError(
                    f"Индекс {idx} вне диапазона (длина {len(obj)})",
                    hint="Индексы начинаются с 0; отрицательные считаются с конца.")
        if isinstance(obj, dict):
            try:
                return obj[idx]
            except KeyError:
                raise QazaqRuntimeError(f"Ключ не найден: {to_repr(idx)}",
                                        hint="Проверьте ключ через «ішінде» или метод .ал(ключ).")
            except TypeError:
                raise QazaqRuntimeError(f"Ключом не может быть значение типа {type_name(idx)}")
        raise QazaqRuntimeError(f"Значение типа {type_name(obj)} не поддерживает индексацию []")

    def set_index(self, obj, idx, value) -> None:
        if isinstance(obj, list):
            if isinstance(idx, bool) or not isinstance(idx, int):
                raise QazaqRuntimeError(f"Индекс должен быть бүтін (целым), а не {type_name(idx)}")
            try:
                obj[idx] = value
            except IndexError:
                raise QazaqRuntimeError(f"Индекс {idx} вне диапазона (длина {len(obj)})")
        elif isinstance(obj, dict):
            try:
                obj[idx] = value
            except TypeError:
                raise QazaqRuntimeError(f"Ключом не может быть значение типа {type_name(idx)}")
        else:
            raise QazaqRuntimeError(
                f"Элементы значения типа {type_name(obj)} нельзя менять присваиванием")

    def e_index(self, node: A.Index, env: Env):
        return self.get_index(self.evaluate(node.obj, env), self.evaluate(node.index, env))

    def e_slice(self, node: A.Slice, env: Env):
        obj = self.evaluate(node.obj, env)
        parts = []
        for sub in (node.lo, node.hi, node.step):
            v = None if sub is None else self.evaluate(sub, env)
            if v is not None and (isinstance(v, bool) or not isinstance(v, int)):
                raise QazaqRuntimeError(f"Границы среза должны быть бүтін, а не {type_name(v)}")
            parts.append(v)
        if not isinstance(obj, (list, str, range)):
            raise QazaqRuntimeError(f"Значение типа {type_name(obj)} не поддерживает срезы")
        if parts[2] == 0:
            raise QazaqRuntimeError("Шаг среза не может быть нулём")
        return obj[slice(*parts)]

    def get_attr(self, obj, name: str):
        if isinstance(obj, QInstance):
            if name in obj.fields:
                return obj.fields[name]
            try:
                member = obj.cls.find(name)
            except KeyError:
                names = list(obj.fields) + _class_names(obj.cls)
                near = suggest(name, names)
                raise QazaqRuntimeError(
                    f"У объекта класса «{obj.cls.name}» нет поля или метода «{name}»",
                    hint=f"Возможно, вы имели в виду «{near}»." if near else None)
            return BoundMethod(member, obj) if isinstance(member, QFunction) else member
        if isinstance(obj, QClass):
            try:
                return obj.find(name)
            except KeyError:
                raise QazaqRuntimeError(f"У класса «{obj.name}» нет члена «{name}»")
        table = METHODS.get(type(obj))
        if table and name in table:
            b = table[name]
            return BoundBuiltin(name, b.fn, obj, b.min_args, b.max_args)
        names = list(table) if table else []
        near = suggest(name, names)
        if names:
            hint = (f"Возможно, вы имели в виду «{near}»." if near
                    else "Доступные методы: " + ", ".join(sorted(names)))
        else:
            hint = None
        raise QazaqRuntimeError(f"У значения типа {type_name(obj)} нет метода «{name}»", hint=hint)

    def e_attr(self, node: A.Attr, env: Env):
        return self.get_attr(self.evaluate(node.obj, env), node.name)

    # ---- вызовы ---------------------------------------------------------
    def e_lambda(self, node: A.Lambda, env: Env):
        body = [A.Return(node.body, line=node.body.line, col=node.body.col)]
        return QFunction("<лямбда>", node.params, body, env)

    def e_call(self, node: A.Call, env: Env):
        fn = self.evaluate(node.func, env)
        args = [self.evaluate(a, env) for a in node.args]
        kwargs = {name: self.evaluate(expr, env) for name, expr in node.kwargs} if node.kwargs else None
        return self.call_value(fn, args, node.line, kwargs)

    def call_value(self, fn, args: list, line: int | None = None, kwargs: dict | None = None):
        if isinstance(fn, QFunction):
            return self.call_function(fn, args, line, kwargs)
        if isinstance(fn, BoundMethod):
            return self.call_function(fn.func, [fn.receiver] + args, line, kwargs)
        if isinstance(fn, Builtin):
            if fn.unsafe and self.safe:
                raise QazaqRuntimeError(
                    f"Функция «{fn.name}» недоступна в безопасном режиме (Playground)")
            if kwargs:
                args = self._bind_builtin_kwargs(fn, args, kwargs)
            self._arity(fn.name, len(args), fn.min_args, fn.max_args)
            return self._call_native(fn.name, fn.fn, (self, *args))
        if isinstance(fn, BoundBuiltin):
            if kwargs:
                raise QazaqRuntimeError(f"Метод «{fn.name}» не принимает именованные аргументы")
            self._arity("." + fn.name, len(args), fn.min_args, fn.max_args)
            return self._call_native(fn.name, fn.fn, (self, fn.receiver, *args))
        if isinstance(fn, QClass):
            return self.instantiate(fn, args, line, kwargs)
        raise QazaqRuntimeError(f"Значение типа {type_name(fn)} нельзя вызвать как функцию")

    @staticmethod
    def _bind_builtin_kwargs(fn: Builtin, args: list, kwargs: dict) -> list:
        if not fn.kw:
            raise QazaqRuntimeError(
                f"Функция «{fn.name}» не принимает именованные аргументы",
                hint="Для сравнения используйте '==', а аргументы передавайте по порядку.")
        slots = list(args)
        for name, value in kwargs.items():
            if name not in fn.kw:
                raise QazaqRuntimeError(f"У функции «{fn.name}» нет параметра «{name}»",
                                        hint="Параметры: " + ", ".join(fn.kw))
            idx = fn.kw.index(name)
            if idx < len(args):
                raise QazaqRuntimeError(f"Параметр «{name}» функции «{fn.name}» получил значение дважды")
            while len(slots) <= idx:
                slots.append(_MISSING)
            slots[idx] = value
        for i, v in enumerate(slots):
            if v is _MISSING:
                raise QazaqRuntimeError(
                    f"Функция «{fn.name}» не получила значение параметра «{fn.kw[i]}»")
        return slots

    def _call_native(self, name: str, fn, args: tuple):
        self._tick()
        try:
            return fn(*args)
        except (QazaqError, _Return, _Break, _Continue, BrokenPipeError):
            raise
        except RecursionError:
            raise QazaqRuntimeError("Слишком глубокая вложенность значений")
        except (ValueError, TypeError, OverflowError, ArithmeticError, MemoryError, OSError) as exc:
            raise QazaqRuntimeError(f"«{name}»: {exc.__class__.__name__}: {exc}")

    @staticmethod
    def _arity(name: str, given: int, lo: int, hi: int | None) -> None:
        if given < lo or (hi is not None and given > hi):
            if hi is None:
                want = f"не менее {lo}"
            elif lo == hi:
                want = str(lo)
            else:
                want = f"от {lo} до {hi}"
            raise QazaqRuntimeError(
                f"«{name}» ожидает аргументов: {want}, получено: {given}")

    def call_function(self, fn: QFunction, args: list, line: int | None, kwargs: dict | None = None):
        n, params = len(args), fn.params
        if n > len(params) or (not kwargs and n < fn.min_args):
            self._arity(fn.name, n, fn.min_args, len(params))
        if self.depth >= self.limits.max_depth:
            raise QazaqRuntimeError(
                f"Превышена максимальная глубина вызовов ({self.limits.max_depth})",
                hint="Проверьте условие выхода из рекурсии.")
        local = Env(fn.closure)
        vars_ = local.vars
        for i in range(min(n, len(params))):
            vars_[params[i].name] = args[i]
        if kwargs:
            names = [p.name for p in params]
            for key, value in kwargs.items():
                if key not in names:
                    raise QazaqRuntimeError(
                        f"У функции «{fn.name}» нет параметра «{key}»",
                        hint="Параметры: " + (", ".join(names) if names else "нет"))
                if key in vars_:
                    raise QazaqRuntimeError(
                        f"Параметр «{key}» функции «{fn.name}» получил значение дважды")
                vars_[key] = value
        for p in params:
            if p.name not in vars_:
                if p.default is None:
                    raise QazaqRuntimeError(
                        f"Функция «{fn.name}» не получила значение параметра «{p.name}»")
                vars_[p.name] = self.evaluate(p.default, fn.closure)
        self.depth += 1
        self._tick()
        try:
            self.exec_block(fn.body, local)
        except _Return as ret:
            return ret.value
        except QazaqError as exc:
            exc.trace.append((fn.name, line))
            raise
        finally:
            self.depth -= 1
        return None

    def instantiate(self, cls: QClass, args: list, line: int | None, kwargs: dict | None = None):
        inst = QInstance(cls)
        try:
            init = cls.find("жасау")
        except KeyError:
            init = None
        if isinstance(init, QFunction):
            self.call_function(init, [inst] + args, line, kwargs)
        elif args or kwargs:
            raise QazaqRuntimeError(
                f"Класс «{cls.name}» не принимает аргументы: в нём нет метода «жасау»",
                hint="Конструктор объявляется так: функ жасау(өзі, …):")
        return inst


def _class_names(cls: QClass) -> list[str]:
    names: list[str] = []
    while cls is not None:
        names.extend(cls.members)
        cls = cls.base
    return names


def run_source(source: str, *, filename: str | None = None, **kwargs) -> Interpreter:
    interp = Interpreter(filename=filename, **kwargs)
    interp.run_source(source)
    return interp
