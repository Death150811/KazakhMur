"""Лексический анализатор Qazaq.

Главные правила:

* Точка ``.`` — завершитель инструкции, если после неё пробел, конец строки,
  конец файла или комментарий. Точка внутри числа (``3.14``) — часть числа.
  Точка, сразу за которой идёт буква (``список.қос``), — доступ к члену.
* Перевод строки значим только после завершителя ``.`` или двоеточия ``:``.
  Иначе строка продолжается (так выражения можно переносить без скобок).
* Отступы (INDENT/DEDENT) считаются только в начале логической строки.
"""
from __future__ import annotations

import unicodedata

from .errors import LexicalError
from .tokens import (DEDENT, DOT, END, EOF, FLOAT, FPart, FSTR, INDENT, INT, KEYWORDS, KW,
                     NAME, NL, OP, STR, Token)

OPERATORS_3: tuple[str, ...] = ()
OPERATORS_2 = ("**", "//", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=")
OPERATORS_1 = "+-*/%<>=()[]{},:"
OPENERS = {"(": ")", "[": "]", "{": "}"}
CLOSERS = {")": "(", "]": "[", "}": "{"}
ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "0": "\0", "\\": "\\", '"': '"', "'": "'"}


def is_ident_start(ch: str) -> bool:
    return ch.isalpha() or ch == "_"


def is_ident_part(ch: str) -> bool:
    # isalnum + комбинируемые знаки (NFD-форма «й», «ё» и т.п.)
    return ch.isalnum() or ch == "_" or unicodedata.category(ch).startswith("M")


def _script_of(ch: str) -> str | None:
    if not ch.isalpha():
        return None
    name = unicodedata.name(ch, "")
    if name.startswith("CYRILLIC"):
        return "cyrillic"
    if name.startswith("LATIN"):
        return "latin"
    return None


class Lexer:
    def __init__(self, source: str, *, line: int = 1, col: int = 1, expr_mode: bool = False):
        src = source.replace("\r\n", "\n").replace("\r", "\n")
        if src.startswith("﻿"):
            src = src[1:]
        self.src = src
        self.n = len(src)
        self.i = 0
        self.line = line
        self.col = col
        self.expr_mode = expr_mode  # разбор выражения внутри ф"..." — без отступов и NL
        self.at_line_start = not expr_mode
        self.indents = [0]
        self.brackets: list[tuple[str, int, int]] = []
        self.tokens: list[Token] = []

    # ---- служебное ------------------------------------------------------
    def error(self, msg: str, line: int | None = None, col: int | None = None,
              hint: str | None = None):
        raise LexicalError(msg, line if line is not None else self.line,
                           col if col is not None else self.col, hint=hint)

    def _adv(self, count: int = 1) -> None:
        for _ in range(count):
            if self.src[self.i] == "\n":
                self.line += 1
                self.col = 1
            else:
                self.col += 1
            self.i += 1

    def _emit(self, kind: str, value: object, line: int, col: int) -> Token:
        tok = Token(kind, value, line, col, self.line, self.col)
        self.tokens.append(tok)
        return tok

    # ---- основной цикл --------------------------------------------------
    def tokenize(self) -> list[Token]:
        src, n = self.src, self.n
        while self.i < n:
            if self.at_line_start:
                self._line_start()
                if self.i >= n:
                    break
                if self.at_line_start:  # пропустили пустую строку
                    continue
            ch = src[self.i]
            if ch in " \t":
                self._adv()
            elif ch == "\n":
                last = self.tokens[-1] if self.tokens else None
                ends_logical = (
                    not self.expr_mode and not self.brackets and last is not None
                    and (last.kind == END or (last.kind == OP and last.value == ":"))
                )
                if ends_logical:
                    self._emit(NL, "\n", self.line, self.col)
                    self.at_line_start = True
                self._adv()
            elif ch == "#":
                while self.i < n and src[self.i] != "\n":
                    self._adv()
            elif ch.isdigit():
                self._number()
            elif ch in "\"'":
                self._string(ch, False)
            elif is_ident_start(ch):
                self._identifier()
            else:
                self._operator()
        self._finish()
        return self.tokens

    def _finish(self) -> None:
        if self.brackets:
            b, line, col = self.brackets[-1]
            self.error(f"Скобка '{b}' не закрыта", line, col)
        if not self.expr_mode:
            last = self.tokens[-1] if self.tokens else None
            if last is not None and (last.kind == END or (last.kind == OP and last.value == ":")):
                self._emit(NL, "\n", self.line, self.col)
            while len(self.indents) > 1:
                self.indents.pop()
                self._emit(DEDENT, None, self.line, self.col)
        self._emit(EOF, None, self.line, self.col)

    # ---- отступы --------------------------------------------------------
    def _line_start(self) -> None:
        src, n = self.src, self.n
        j, width = self.i, 0
        while j < n and src[j] in " \t":
            width += 4 if src[j] == "\t" else 1
            j += 1
        if j >= n:
            self.col += j - self.i
            self.i = j
            return
        if src[j] == "\n":
            self.col += j - self.i
            self.i = j
            self._adv()  # съесть '\n'
            return
        if src[j] == "#":
            while j < n and src[j] != "\n":
                j += 1
            self.col += j - self.i
            self.i = j
            if self.i < n:
                self._adv()
            return
        self.col += j - self.i
        self.i = j
        self.at_line_start = False
        top = self.indents[-1]
        if width > top:
            self.indents.append(width)
            self._emit(INDENT, width, self.line, self.col)
        elif width < top:
            while self.indents[-1] > width:
                self.indents.pop()
                self._emit(DEDENT, None, self.line, self.col)
            if self.indents[-1] != width:
                self.error("Уровень отступа не совпадает ни с одним из внешних блоков",
                           hint="Используйте одинаковое число пробелов для одного блока.")

    # ---- числа ----------------------------------------------------------
    def _number(self) -> None:
        src, n = self.src, self.n
        line, col, start = self.line, self.col, self.i
        is_float = False

        def digits() -> None:
            while self.i < n and (src[self.i].isdigit() or (
                    src[self.i] == "_" and self.i + 1 < n and src[self.i + 1].isdigit())):
                self._adv()

        digits()
        if self.i + 1 < n and src[self.i] == "." and src[self.i + 1].isdigit():
            is_float = True
            self._adv()
            digits()
        if self.i < n and src[self.i] in "eE":
            j = self.i + 1
            if j < n and src[j] in "+-":
                j += 1
            if j < n and src[j].isdigit():
                is_float = True
                self._adv(j - self.i)
                digits()
        if self.i < n and is_ident_start(src[self.i]):
            self.error(f"Недопустимый символ '{src[self.i]}' сразу после числа",
                       hint="Отделите число пробелом или оператором.")
        text = src[start:self.i].replace("_", "")
        self._emit(FLOAT if is_float else INT, float(text) if is_float else int(text), line, col)

    # ---- идентификаторы -------------------------------------------------
    def _identifier(self) -> None:
        src, n = self.src, self.n
        line, col, start = self.line, self.col, self.i
        while self.i < n and is_ident_part(src[self.i]):
            self._adv()
        raw = src[start:self.i]
        text = unicodedata.normalize("NFC", raw)
        # ф"..." — форматная строка
        if text == "ф" and self.i < n and src[self.i] in "\"'":
            self._string(src[self.i], True, line, col)
            return
        scripts = {s for s in (_script_of(c) for c in text) if s}
        if len(scripts) > 1:
            bad = next(c for c in text if _script_of(c) == "latin")
            self.error(
                f"Идентификатор «{text}» смешивает латиницу и кириллицу "
                f"(латинская «{bad}», U+{ord(bad):04X})",
                line, col,
                hint="Похожие буквы (например, латинская i и казахская і) — разные символы. "
                     "Перепечатайте слово одной раскладкой.")
        if text in KEYWORDS:
            self._emit(KW, text, line, col)
        else:
            self._emit(NAME, text, line, col)

    # ---- строки ---------------------------------------------------------
    def _string(self, quote: str, is_f: bool, line: int | None = None, col: int | None = None) -> None:
        src, n = self.src, self.n
        sline = line if line is not None else self.line
        scol = col if col is not None else self.col
        triple = src.startswith(quote * 3, self.i)
        self._adv(3 if triple else 1)
        buf: list[str] = []
        parts: list[object] = []

        def unterminated():
            self.error("Строка не закрыта", sline, scol,
                       hint="Добавьте закрывающую кавычку.")

        while True:
            if self.i >= n:
                unterminated()
            c = src[self.i]
            if triple:
                if src.startswith(quote * 3, self.i):
                    self._adv(3)
                    break
            elif c == quote:
                self._adv()
                break
            elif c == "\n":
                unterminated()
            if c == "\\":
                if self.i + 1 >= n:
                    unterminated()
                esc = src[self.i + 1]
                if esc not in ESCAPES:
                    self.error(f"Неизвестная управляющая последовательность '\\{esc}'",
                               hint="Чтобы написать обратную косую черту, удвойте её: \\\\")
                buf.append(ESCAPES[esc])
                self._adv(2)
            elif is_f and c == "{":
                if self.i + 1 < n and src[self.i + 1] == "{":
                    buf.append("{")
                    self._adv(2)
                    continue
                if buf:
                    parts.append("".join(buf))
                    buf = []
                parts.append(self._fexpr(sline, scol))
            elif is_f and c == "}":
                if self.i + 1 < n and src[self.i + 1] == "}":
                    buf.append("}")
                    self._adv(2)
                else:
                    self.error("Одиночная '}' в форматной строке", hint="Для символа } пишите }}.")
            else:
                buf.append(c)
                self._adv()
        if is_f:
            if buf:
                parts.append("".join(buf))
            self._emit(FSTR, parts, sline, scol)
        else:
            self._emit(STR, "".join(buf), sline, scol)

    def _fexpr(self, sline: int, scol: int) -> FPart:
        """Читает {выражение[:формат]} внутри ф-строки; self.i стоит на '{'."""
        src, n = self.src, self.n
        open_line, open_col = self.line, self.col
        self._adv()  # '{'
        line, col = self.line, self.col
        depth = 0
        quote: str | None = None
        spec_at: int | None = None
        start = self.i
        while True:
            if self.i >= n:
                self.error("Фигурная скобка '{' в форматной строке не закрыта", open_line, open_col)
            c = src[self.i]
            if quote:
                if c == quote:
                    quote = None
            elif c in "\"'":
                quote = c
            elif c in "([{":
                depth += 1
            elif c in ")]}":
                if depth == 0:
                    if c != "}":
                        self.error(f"Лишняя '{c}' в выражении форматной строки")
                    break
                depth -= 1
            elif c == ":" and depth == 0 and spec_at is None:
                spec_at = self.i
            elif c == "\n":
                self.error("Перенос строки внутри {…} форматной строки не поддерживается",
                           open_line, open_col)
            self._adv()
        end = self.i
        self._adv()  # '}'
        if spec_at is None:
            text, spec = src[start:end], None
        else:
            text, spec = src[start:spec_at], src[spec_at + 1:end]
        if not text.strip():
            self.error("Пустое выражение в {…}", open_line, open_col)
        return FPart(text, spec, line, col)

    # ---- операторы ------------------------------------------------------
    def _operator(self) -> None:
        src, n = self.src, self.n
        line, col = self.line, self.col
        ch = src[self.i]
        two = src[self.i:self.i + 2]
        if two in OPERATORS_2:
            self._adv(2)
            self._emit(OP, two, line, col)
            return
        if ch == ".":
            nxt = src[self.i + 1] if self.i + 1 < n else ""
            if nxt == "" or nxt in " \t\n#":
                self._adv()
                self._emit(END, ".", line, col)
                return
            if is_ident_start(nxt):
                self._adv()
                self._emit(DOT, ".", line, col)
                return
            self.error("После точки ожидается пробел, конец строки или имя",
                       hint="Точка завершает инструкцию (после неё пробел или перевод строки) "
                            "либо ведёт к члену объекта (список.қос).")
        if ch in OPERATORS_1:
            if ch in OPENERS:
                self.brackets.append((ch, line, col))
            elif ch in CLOSERS:
                if not self.brackets or self.brackets[-1][0] != CLOSERS[ch]:
                    self.error(f"Лишняя закрывающая скобка '{ch}'")
                self.brackets.pop()
            self._adv()
            self._emit(OP, ch, line, col)
            return
        hint = None
        if ch == ";":
            hint = "В Qazaq инструкции завершаются точкой, а не точкой с запятой."
        elif ch in "“”«»":
            hint = "Используйте прямые кавычки \" или '."
        self.error(f"Неизвестный символ '{ch}' (U+{ord(ch):04X})", hint=hint)


def tokenize(source: str) -> list[Token]:
    return Lexer(source).tokenize()
