"""Синтаксический анализатор Qazaq (рекурсивный спуск). Грамматика — в docs/GRAMMAR.md."""
from __future__ import annotations

from . import ast_nodes as A
from .errors import QazaqSyntaxError
from .lexer import Lexer
from .tokens import (DEDENT, DOT, END, EOF, FLOAT, FPart, FSTR, INDENT, INT, KW, NAME, NL, OP,
                     STR, Token)

COMPARE_OPS = {"==", "!=", "<", "<=", ">", ">="}
MAX_NESTING = 60   # максимальная вложенность выражений и блоков (защита от переполнения стека)
ASSIGN_OPS = {"=", "+=", "-=", "*=", "/="}


class Parser:
    def __init__(self, tokens: list[Token], source: str | None = None):
        self.toks = tokens
        self.src_lines = source.replace("\r\n", "\n").split("\n") if source is not None else None
        self.pos = 0
        self.nesting = 0      # текущая вложенность выражений и блоков
        self.func_depth = 0   # внутри скольких функций мы находимся
        self.loop_depth = 0   # внутри скольких циклов (в пределах текущей функции)

    # ---- базовые операции ----------------------------------------------
    def peek(self, offset: int = 0) -> Token:
        i = min(self.pos + offset, len(self.toks) - 1)
        return self.toks[i]

    def advance(self) -> Token:
        tok = self.toks[self.pos]
        if tok.kind != EOF:
            self.pos += 1
        return tok

    def check(self, kind: str, value: object = None, offset: int = 0) -> bool:
        t = self.peek(offset)
        return t.kind == kind and (value is None or t.value == value)

    def match(self, kind: str, value: object = None) -> Token | None:
        if self.check(kind, value):
            return self.advance()
        return None

    def error(self, msg: str, tok: Token | None = None, hint: str | None = None):
        tok = tok or self.peek()
        raise QazaqSyntaxError(msg, tok.line, tok.col, hint=hint)

    def describe(self, tok: Token) -> str:
        if tok.kind == EOF:
            return "конец файла"
        if tok.kind == NL:
            return "конец строки"
        if tok.kind == INDENT:
            return "лишний отступ"
        if tok.kind == DEDENT:
            return "конец блока"
        if tok.kind == END:
            return "точка '.'"
        if tok.kind == KW:
            return f"ключевое слово «{tok.value}»"
        if tok.kind in (STR, FSTR):
            return "строка"
        return f"«{tok.value}»"

    def expect(self, kind: str, value: object = None, what: str | None = None) -> Token:
        if self.check(kind, value):
            return self.advance()
        tok = self.peek()
        want = what or (f"«{value}»" if value is not None else kind)
        line, col = tok.line, tok.col
        prev = self.toks[self.pos - 1] if self.pos > 0 else None
        if prev is not None and tok.kind not in (EOF, NL, DEDENT) and tok.line > prev.end_line:
            line, col = prev.end_line, prev.end_col  # ошибка «в конце предыдущей строки»
        raise QazaqSyntaxError(f"Ожидалось {want}, найдено {self.describe(tok)}", line, col)

    def expect_end(self, marks: bool = False) -> Token:
        """Каждая простая инструкция заканчивается точкой. Выражение может заканчиваться
        также «?» (показать значение) или «!» (утверждение)."""
        if self.check(END):
            tok = self.advance()
            if tok.value != "." and not marks:
                raise QazaqSyntaxError(
                    f"Здесь нужна точка: знаки «?» и «!» завершают только выражения",
                    tok.line, tok.col,
                    hint="Пример: x + 1?  показывает значение, x > 0!  проверяет утверждение.")
            return tok
        prev = self.toks[self.pos - 1] if self.pos > 0 else self.peek()
        tok = self.peek()
        raise QazaqSyntaxError(
            f"Инструкция должна заканчиваться точкой '.' (найдено {self.describe(tok)})",
            prev.end_line, prev.end_col,
            hint="Поставьте '.' в конце инструкции. Строки блоков (егер, функ, әзір …) "
                 "заканчиваются двоеточием ':'.")

    def text_between(self, first: Token, last: Token) -> str:
        """Исходный текст от начала first до конца last (для сообщений «?» и «!»)."""
        if self.src_lines is None:
            return "выражение"
        parts = []
        for ln in range(first.line, last.end_line + 1):
            if ln - 1 >= len(self.src_lines):
                break
            text = self.src_lines[ln - 1]
            start = first.col - 1 if ln == first.line else 0
            end = last.end_col - 1 if ln == last.end_line else len(text)
            parts.append(text[start:end].strip())
        return " ".join(p for p in parts if p)

    def enter(self, tok: Token | None = None) -> None:
        self.nesting += 1
        if self.nesting > MAX_NESTING:
            self.error(f"Слишком глубокая вложенность выражений или блоков (максимум {MAX_NESTING})",
                       tok, hint="Разбейте выражение на несколько инструкций с промежуточными переменными.")

    def skip_nl(self) -> None:
        while self.peek().kind == NL:
            self.advance()

    # ---- программа и блоки ---------------------------------------------
    def parse_program(self) -> A.Program:
        body: list = []
        self.skip_nl()
        while not self.check(EOF):
            if self.check(INDENT):
                self.error("Неожиданный отступ", hint="Отступ нужен только внутри блока после ':'.")
            if self.check(DEDENT):
                self.advance()
                continue
            body.append(self.parse_statement())
            self.skip_nl()
        return A.Program(body, line=1, col=1)

    def parse_block(self) -> list:
        self.enter()
        try:
            return self._parse_block()
        finally:
            self.nesting -= 1

    def _parse_block(self) -> list:
        """Тело блока после ':' — либо отступная группа, либо одна инструкция в строке."""
        if self.check(NL):
            self.skip_nl()
            if not self.check(INDENT):
                self.error("После ':' ожидается блок с отступом",
                           hint="Сдвиньте инструкции блока вправо на несколько пробелов.")
            self.advance()
            body: list = []
            self.skip_nl()
            while not self.check(DEDENT) and not self.check(EOF):
                if self.check(INDENT):
                    self.error("Неожиданный отступ")
                body.append(self.parse_statement())
                self.skip_nl()
            self.match(DEDENT)
            if not body:
                self.error("Пустой блок", hint="Используйте 'өткіз.', если блок должен быть пустым.")
            return body
        if self.check(EOF):
            self.error("После ':' ожидается тело блока")
        return [self.parse_statement()]

    # ---- инструкции ----------------------------------------------------
    def parse_statement(self):
        tok = self.peek()
        if tok.kind == KW:
            handler = {
                "егер": self.parse_if, "әзір": self.parse_while, "әрбір": self.parse_for,
                "функ": self.parse_funcdef, "сынып": self.parse_classdef, "байқа": self.parse_try,
                "айным": self.parse_vardecl, "қайтар": self.parse_return,
                "тоқта": self.parse_break, "жалғас": self.parse_continue,
                "өткіз": self.parse_pass, "лақтыр": self.parse_raise,
            }.get(tok.value)
            if handler:
                return handler()
            if tok.value in ("әйтпесе", "қате", "соңында"):
                self.error(f"«{tok.value}» без соответствующего "
                           f"{'егер' if tok.value == 'әйтпесе' else 'байқа'}",
                           hint="Проверьте, что отступ совпадает с отступом начала конструкции.")
        return self.parse_simple_expr_stmt()

    def parse_simple_expr_stmt(self):
        start = self.peek()
        expr = self.parse_expr()
        if self.check(OP, ","):   # а, б = б, а  — присваивание нескольким целям
            targets = [expr]
            while self.match(OP, ","):
                targets.append(self.parse_expr())
            for t in targets:
                if not isinstance(t, (A.Name, A.Index, A.Attr)):
                    self.error("В списке слева от '=' могут быть только имена, элементы (a[0]) и поля (a.x)", start)
            self.expect(OP, "=", what="'=' после списка целей")
            value = self.parse_expr_list()
            self.expect_end()
            return A.Assign(A.TargetList(targets, line=start.line, col=start.col), "=", value,
                            line=start.line, col=start.col)
        op_tok = self.peek()
        if op_tok.kind == OP and op_tok.value in ASSIGN_OPS:
            if not isinstance(expr, (A.Name, A.Index, A.Attr)):
                self.error("Слева от '=' должно быть имя, элемент (a[0]) или поле (a.x)", start)
            self.advance()
            value = self.parse_expr_list() if op_tok.value == "=" else self.parse_expr()
            self.expect_end()
            return A.Assign(expr, op_tok.value, value, line=start.line, col=start.col)
        end = self.expect_end(marks=True)
        last = self.toks[self.pos - 2]
        text = self.text_between(start, last) if end.value != "." else ""
        return A.ExprStmt(expr, end.value, text, line=start.line, col=start.col)

    def parse_expr_list(self):
        """expr или expr, expr, … (без скобок — это кортеж)"""
        first = self.parse_expr()
        if not self.check(OP, ","):
            return first
        items = [first]
        while self.match(OP, ","):
            if self.check(END):   # хвостовая запятая: айным t = 1,.
                break
            items.append(self.parse_expr())
        return A.TupleLit(items, line=first.line, col=first.col)

    def parse_vardecl(self):
        kw = self.advance()
        name = self.expect(NAME, what="имя переменной после «айным»")
        names = [name]
        while self.match(OP, ","):
            names.append(self.expect(NAME, what="имя переменной"))
        if self.peek().kind == OP and self.peek().value == "=":
            self.advance()
            value = self.parse_expr_list()
        else:
            raise QazaqSyntaxError(f"После имени «{names[-1].value}» ожидался знак '='",
                                   names[-1].end_line, names[-1].end_col,
                                   hint="Пример: айным x = 10.   или   айным а, б = 1, 2.")
        self.expect_end()
        if len(names) > 1:
            return A.VarDeclMulti([n.value for n in names], value, line=kw.line, col=kw.col)
        return A.VarDecl(name.value, value, line=kw.line, col=kw.col)

    def parse_return(self):
        kw = self.advance()
        if self.func_depth == 0:
            self.error("«қайтар» можно использовать только внутри функции", kw)
        value = None
        if not self.check(END):
            value = self.parse_expr_list()
        self.expect_end()
        return A.Return(value, line=kw.line, col=kw.col)

    def parse_break(self):
        kw = self.advance()
        if self.loop_depth == 0:
            self.error("«тоқта» можно использовать только внутри цикла", kw)
        self.expect_end()
        return A.Break(line=kw.line, col=kw.col)

    def parse_continue(self):
        kw = self.advance()
        if self.loop_depth == 0:
            self.error("«жалғас» можно использовать только внутри цикла", kw)
        self.expect_end()
        return A.Continue(line=kw.line, col=kw.col)

    def parse_pass(self):
        kw = self.advance()
        self.expect_end()
        return A.Pass(line=kw.line, col=kw.col)

    def parse_raise(self):
        kw = self.advance()
        value = self.parse_expr()
        self.expect_end()
        return A.Raise(value, line=kw.line, col=kw.col)

    # ---- составные инструкции ------------------------------------------
    def parse_if(self):
        kw = self.advance()  # егер
        branches = []
        cond = self.parse_expr()
        self.expect(OP, ":", what="двоеточие ':' после условия")
        branches.append((cond, self.parse_block()))
        orelse = None
        while self.check(KW, "әйтпесе"):
            self.advance()
            if self.check(KW, "егер"):
                self.advance()
                cond = self.parse_expr()
                self.expect(OP, ":", what="двоеточие ':' после условия")
                branches.append((cond, self.parse_block()))
            else:
                self.expect(OP, ":", what="двоеточие ':' после «әйтпесе»")
                orelse = self.parse_block()
                break
        return A.If(branches, orelse, line=kw.line, col=kw.col)

    def parse_while(self):
        kw = self.advance()
        cond = self.parse_expr()
        self.expect(OP, ":", what="двоеточие ':' после условия")
        self.loop_depth += 1
        try:
            body = self.parse_block()
        finally:
            self.loop_depth -= 1
        return A.While(cond, body, line=kw.line, col=kw.col)

    def parse_for(self):
        kw = self.advance()
        targets = [self.expect(NAME, what="имя переменной цикла").value]
        while self.match(OP, ","):
            targets.append(self.expect(NAME, what="имя переменной цикла").value)
        self.expect(KW, "ішінде", what="«ішінде» (пример: әрбір x ішінде тізім:)")
        iterable = self.parse_expr()
        self.expect(OP, ":", what="двоеточие ':' после перебираемого выражения")
        self.loop_depth += 1
        try:
            body = self.parse_block()
        finally:
            self.loop_depth -= 1
        return A.For(targets, iterable, body, line=kw.line, col=kw.col)

    def parse_params(self) -> list:
        """Параметры функции или лямбды: a, b = 5, c = a"""
        params: list[A.Param] = []
        seen_default = False
        while not self.check(OP, ")"):
            pname = self.expect(NAME, what="имя параметра")
            default = None
            if self.match(OP, "="):
                default = self.parse_expr()
                seen_default = True
            elif seen_default:
                self.error("Параметр без значения по умолчанию после параметра со значением",
                           pname)
            if any(p.name == pname.value for p in params):
                self.error(f"Повторяющийся параметр «{pname.value}»", pname)
            params.append(A.Param(pname.value, default))
            if not self.match(OP, ","):
                break
        return params

    def parse_funcdef(self):
        kw = self.advance()
        name = self.expect(NAME, what="имя функции")
        self.expect(OP, "(", what="'(' после имени функции")
        params = self.parse_params()
        self.expect(OP, ")", what="')' после параметров")
        self.expect(OP, ":", what="двоеточие ':' после заголовка функции")
        saved_loop, self.loop_depth = self.loop_depth, 0
        self.func_depth += 1
        try:
            body = self.parse_block()
        finally:
            self.func_depth -= 1
            self.loop_depth = saved_loop
        return A.FuncDef(name.value, params, body, line=kw.line, col=kw.col)

    def parse_lambda(self):
        """Анонимная функция: функ(x): x * 2 — тело (одно выражение) в той же строке."""
        kw = self.advance()
        self.expect(OP, "(", what="'(' после «функ» в анонимной функции")
        params = self.parse_params()
        self.expect(OP, ")", what="')' после параметров")
        self.expect(OP, ":", what="двоеточие ':' после параметров анонимной функции")
        if self.check(NL):
            self.error("Тело анонимной функции должно быть в той же строке после ':'", self.peek(),
                       hint="Для многострочной функции используйте: функ имя(…):")
        body = self.parse_expr()
        return A.Lambda(params, body, line=kw.line, col=kw.col)

    def parse_classdef(self):
        kw = self.advance()
        name = self.expect(NAME, what="имя класса")
        base = None
        if self.match(OP, "("):
            base = self.parse_expr()
            self.expect(OP, ")", what="')' после базового класса")
        self.expect(OP, ":", what="двоеточие ':' после заголовка класса")
        body = self.parse_block()
        for stmt in body:
            if not isinstance(stmt, (A.FuncDef, A.VarDecl, A.Pass)):
                raise QazaqSyntaxError(
                    "В теле класса допустимы только функции (функ), поля (айным) и 'өткіз.'",
                    stmt.line, stmt.col)
        return A.ClassDef(name.value, base, body, line=kw.line, col=kw.col)

    def parse_try(self):
        kw = self.advance()
        self.expect(OP, ":", what="двоеточие ':' после «байқа»")
        body = self.parse_block()
        catch_name = catch_body = final_body = None
        if self.check(KW, "қате"):
            self.advance()
            if self.check(NAME):
                catch_name = self.advance().value
            self.expect(OP, ":", what="двоеточие ':' после «қате»")
            catch_body = self.parse_block()
        if self.check(KW, "соңында"):
            self.advance()
            self.expect(OP, ":", what="двоеточие ':' после «соңында»")
            final_body = self.parse_block()
        if catch_body is None and final_body is None:
            self.error("После «байқа» нужен блок «қате» или «соңында»", kw)
        return A.Try(body, catch_name, catch_body, final_body, line=kw.line, col=kw.col)

    # ---- выражения (приоритет от низшего к высшему) --------------------
    def parse_expr(self):
        self.enter()
        try:
            return self.parse_ternary()
        finally:
            self.nesting -= 1

    def parse_ternary(self):
        """A егер условие әйтпесе B"""
        value = self.parse_pipe()
        if self.check(KW, "егер"):
            kw = self.advance()
            cond = self.parse_pipe()
            self.expect(KW, "әйтпесе", what="«әйтпесе» в условном выражении (A егер условие әйтпесе B)")
            other = self.parse_ternary()
            return A.Ternary(cond, value, other, line=kw.line, col=kw.col)
        return value

    def parse_pipe(self):
        """a |> f |> g(2): значение слева становится последним аргументом"""
        left = self.parse_or()
        while self.check(OP, "|>"):
            op = self.advance()
            right = self.parse_or()
            left = A.Pipe(left, right, line=op.line, col=op.col)
        return left

    def parse_or(self):
        left = self.parse_and()
        while self.check(KW, "немесе"):
            op = self.advance()
            left = A.Logical("немесе", left, self.parse_and(), line=op.line, col=op.col)
        return left

    def parse_and(self):
        left = self.parse_not()
        while self.check(KW, "және"):
            op = self.advance()
            left = A.Logical("және", left, self.parse_not(), line=op.line, col=op.col)
        return left

    def parse_not(self):
        if self.check(KW, "емес"):
            op = self.advance()
            self.enter(op)
            try:
                return A.Unary("емес", self.parse_not(), line=op.line, col=op.col)
            finally:
                self.nesting -= 1
        return self.parse_comparison()

    def parse_comparison(self):
        left = self.parse_add()
        ops: list = []
        first = self.peek()
        while True:
            t = self.peek()
            if t.kind == OP and t.value in COMPARE_OPS:
                self.advance()
                ops.append((t.value, self.parse_add()))
            elif t.kind == KW and t.value == "ішінде":
                self.advance()
                ops.append(("ішінде", self.parse_add()))
            elif t.kind == KW and t.value == "емес" and self.check(KW, "ішінде", 1):
                self.advance()
                self.advance()
                ops.append(("емес ішінде", self.parse_add()))
            else:
                break
        if ops:
            return A.Compare(left, ops, line=first.line, col=first.col)
        return left

    def parse_add(self):
        left = self.parse_mul()
        while self.peek().kind == OP and self.peek().value in ("+", "-"):
            op = self.advance()
            left = A.Binary(op.value, left, self.parse_mul(), line=op.line, col=op.col)
        return left

    def parse_mul(self):
        left = self.parse_unary()
        while self.peek().kind == OP and self.peek().value in ("*", "/", "//", "%"):
            op = self.advance()
            left = A.Binary(op.value, left, self.parse_unary(), line=op.line, col=op.col)
        return left

    def parse_unary(self):
        t = self.peek()
        if t.kind == OP and t.value in ("-", "+"):
            self.advance()
            self.enter(t)
            try:
                return A.Unary(t.value, self.parse_unary(), line=t.line, col=t.col)
            finally:
                self.nesting -= 1
        return self.parse_power()

    def parse_power(self):
        base = self.parse_postfix()
        if self.check(OP, "**"):
            op = self.advance()
            # правоассоциативно; допускается унарный минус в показателе: 2 ** -1
            self.enter(op)
            try:
                return A.Binary("**", base, self.parse_unary(), line=op.line, col=op.col)
            finally:
                self.nesting -= 1
        return base

    def parse_postfix(self):
        expr = self.parse_primary()
        while True:
            t = self.peek()
            if t.kind == OP and t.value == "(":
                self.advance()
                args, kwargs = [], []
                while not self.check(OP, ")"):
                    if self.check(NAME) and self.check(OP, "=", 1):
                        name = self.advance()
                        self.advance()
                        if any(n == name.value for n, _ in kwargs):
                            self.error(f"Повторяющийся именованный аргумент «{name.value}»", name)
                        kwargs.append((name.value, self.parse_expr()))
                    else:
                        if kwargs:
                            self.error("Позиционный аргумент после именованного",
                                       hint="Сначала пишите обычные аргументы, затем именованные: f(1, b = 2).")
                        args.append(self.parse_expr())
                    if not self.match(OP, ","):
                        break
                self.expect(OP, ")", what="')' после аргументов")
                expr = A.Call(expr, args, kwargs, line=t.line, col=t.col)
            elif t.kind == OP and t.value == "[":
                self.advance()
                expr = self.parse_subscript(expr, t)
            elif t.kind == DOT:
                self.advance()
                name = self.expect(NAME, what="имя поля или метода после '.'")
                expr = A.Attr(expr, name.value, line=name.line, col=name.col)
            else:
                return expr

    def parse_subscript(self, obj, open_tok: Token):
        lo = hi = step = None
        is_slice = False
        if not self.check(OP, ":"):
            lo = self.parse_expr()
        if self.match(OP, ":"):
            is_slice = True
            if not self.check(OP, ":") and not self.check(OP, "]"):
                hi = self.parse_expr()
            if self.match(OP, ":"):
                if not self.check(OP, "]"):
                    step = self.parse_expr()
        self.expect(OP, "]", what="']'")
        if is_slice:
            return A.Slice(obj, lo, hi, step, line=open_tok.line, col=open_tok.col)
        return A.Index(obj, lo, line=open_tok.line, col=open_tok.col)

    def parse_primary(self):
        t = self.peek()
        if t.kind in (INT, FLOAT, STR):
            self.advance()
            return A.Literal(t.value, line=t.line, col=t.col)
        if t.kind == FSTR:
            self.advance()
            return self.build_fstring(t)
        if t.kind == NAME:
            self.advance()
            return A.Name(t.value, line=t.line, col=t.col)
        if t.kind == KW:
            if t.value == "функ":
                return self.parse_lambda()
            if t.value == "ақиқат":
                self.advance()
                return A.Literal(True, line=t.line, col=t.col)
            if t.value == "жалған":
                self.advance()
                return A.Literal(False, line=t.line, col=t.col)
            if t.value == "бос":
                self.advance()
                return A.Literal(None, line=t.line, col=t.col)
            self.error(f"Ключевое слово «{t.value}» нельзя использовать как значение",
                       hint="Ключевые слова зарезервированы; выберите другое имя.")
        if t.kind == OP and t.value == "(":
            self.advance()
            if self.match(OP, ")"):
                return A.TupleLit([], line=t.line, col=t.col)
            first = self.parse_expr()
            if self.check(OP, ","):
                items = [first]
                while self.match(OP, ","):
                    if self.check(OP, ")"):
                        break
                    items.append(self.parse_expr())
                self.expect(OP, ")", what="')' в конце кортежа")
                return A.TupleLit(items, line=t.line, col=t.col)
            self.expect(OP, ")", what="')'")
            return first
        if t.kind == OP and t.value == "[":
            self.advance()
            items = []
            if not self.check(OP, "]"):
                first = self.parse_expr()
                if self.check(KW, "әрбір"):
                    clauses = self.parse_comp_clauses()
                    self.expect(OP, "]", what="']' в конце генератора списка")
                    return A.ListComp(first, clauses, line=t.line, col=t.col)
                items.append(first)
                while self.match(OP, ","):
                    if self.check(OP, "]"):
                        break
                    items.append(self.parse_expr())
            self.expect(OP, "]", what="']' в конце списка")
            return A.ListLit(items, line=t.line, col=t.col)
        if t.kind == OP and t.value == "{":
            self.advance()
            pairs = []
            while not self.check(OP, "}"):
                key = self.parse_expr()
                self.expect(OP, ":", what="':' между ключом и значением")
                value = self.parse_expr()
                if not pairs and self.check(KW, "әрбір"):
                    clauses = self.parse_comp_clauses()
                    self.expect(OP, "}", what="'}' в конце генератора словаря")
                    return A.DictComp(key, value, clauses, line=t.line, col=t.col)
                pairs.append((key, value))
                if not self.match(OP, ","):
                    break
            self.expect(OP, "}", what="'}' в конце словаря")
            return A.DictLit(pairs, line=t.line, col=t.col)
        if t.kind == END:
            self.error("Ожидалось выражение, найдена точка '.'",
                       hint="Возможно, лишняя точка или пропущено значение.")
        self.error(f"Ожидалось выражение, найдено {self.describe(t)}")

    def parse_comp_clauses(self) -> list:
        """әрбір x ішінде коллекция [егер условие] ... — части генератора списка/словаря"""
        clauses: list = []
        while self.check(KW, "әрбір") or self.check(KW, "егер"):
            if self.match(KW, "әрбір"):
                targets = [self.expect(NAME, what="имя переменной").value]
                while self.match(OP, ","):
                    targets.append(self.expect(NAME, what="имя переменной").value)
                self.expect(KW, "ішінде", what="«ішінде» (пример: [x * x әрбір x ішінде сандар])")
                clauses.append(("for", targets, self.parse_pipe()))
            else:
                self.advance()
                clauses.append(("if", self.parse_pipe()))
        return clauses

    def build_fstring(self, tok: Token):
        parts: list = []
        for part in tok.value:
            if isinstance(part, str):
                parts.append(part)
            else:
                assert isinstance(part, FPart)
                toks = Lexer(part.source, line=part.line, col=part.col, expr_mode=True,
                             square=part.square).tokenize()
                sub = Parser(toks)
                expr = sub.parse_expr()
                if not sub.check(EOF):
                    sub.error(f"Лишний текст в выражении {{…}}: {sub.describe(sub.peek())}")
                parts.append((expr, part.spec))
        return A.FString(parts, line=tok.line, col=tok.col)


def parse(source: str, square: bool | None = None) -> A.Program:
    return Parser(Lexer(source, square=square).tokenize(), source).parse_program()
