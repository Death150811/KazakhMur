"""Science: символьная математика (SymPy) и графики (Matplotlib).

SymPy и Matplotlib — необязательные зависимости (pip install qazaq[science]).
Строки-выражения проходят строгую проверку перед разбором: допускаются только числа,
имена переменных, арифметика и небольшой список функций.
"""
from __future__ import annotations

import re

from .registry import as_list, builtin, expect_str, numbers, rt_error

_ALLOWED_FUNCS = {"sin", "cos", "tan", "exp", "log", "ln", "sqrt", "abs", "asin", "acos", "atan",
                  "sinh", "cosh", "tanh", "pi", "E"}
_TOKEN = re.compile(r"\s*(?:(\d+(?:\.\d+)?)|([A-Za-z][A-Za-z0-9]*)|(\*\*|[-+*/^(),=]))")
_MAX_LEN = 200


def _need_sympy(fname: str):
    try:
        import sympy  # noqa: F401
        return sympy
    except ImportError:
        rt_error(f"«{fname}» требует библиотеку SymPy, она не установлена",
                 hint="Установите: pip install sympy  (или pip install 'qazaq[science]').")


def _validate(fname: str, text: str) -> str:
    """Проверяет выражение и возвращает его в синтаксисе Python."""
    expect_str(fname, text)
    if len(text) > _MAX_LEN:
        rt_error(f"«{fname}»: выражение слишком длинное (максимум {_MAX_LEN} символов)")
    pos = 0
    out = []
    names = []
    while pos < len(text):
        if text[pos:].strip() == "":
            break
        m = _TOKEN.match(text, pos)
        if not m:
            bad = text[pos:].lstrip()[:1]
            rt_error(f"«{fname}»: недопустимый символ «{bad}» в выражении")
        num, name, op = m.groups()
        if num:
            out.append(num)
        elif name:
            if name in _ALLOWED_FUNCS:
                out.append({"ln": "log"}.get(name, name))
            elif len(name) <= 3 and name.isalnum() and name.lower() not in {"if", "in", "or", "is", "not", "and", "for", "def", "del", "try", "as"}:
                out.append(name)
                names.append(name)
            else:
                rt_error(f"«{fname}»: имя «{name}» не разрешено",
                         hint="Допустимы переменные до 3 символов и функции: "
                              + ", ".join(sorted(_ALLOWED_FUNCS - {"pi", "E"})))
        else:
            out.append("**" if op == "^" else op)
        pos = m.end()
    return " ".join(out)


def _parse(sympy, fname: str, text: str):
    from sympy.parsing.sympy_parser import (convert_xor, implicit_multiplication_application,
                                           parse_expr, standard_transformations)
    code = _validate(fname, text)
    ns = {n: getattr(sympy, n) for n in _ALLOWED_FUNCS if hasattr(sympy, n)}
    ns["Integer"], ns["Float"], ns["Rational"], ns["Symbol"] = (
        sympy.Integer, sympy.Float, sympy.Rational, sympy.Symbol)
    ns["Function"] = sympy.Function
    transforms = standard_transformations + (convert_xor, implicit_multiplication_application)
    try:
        return parse_expr(code, local_dict={}, global_dict=ns, transformations=transforms,
                          evaluate=True)
    except Exception:
        rt_error(f"«{fname}»: не удалось разобрать выражение «{text}»")


def _convert(sympy, value):
    """SymPy -> значение Qazaq: числа как бүтін/нақты, остальное — мәтін."""
    if value.is_Integer:
        return int(value)
    if value.is_number and value.is_real:
        return float(value)
    return str(value).replace("**", "^")


def _symbol(sympy, expr, var, fname):
    if var is not None:
        expect_str(fname, var)
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,2}", var):
            rt_error(f"«{fname}»: недопустимое имя переменной «{var}»")
        return sympy.Symbol(var)
    free = sorted(expr.free_symbols, key=lambda s: s.name)
    if len(free) == 1:
        return free[0]
    if not free:
        return sympy.Symbol("x")
    rt_error(f"«{fname}»: в выражении несколько переменных, укажите нужную вторым аргументом")


@builtin("шеш", 1, 2, category="science", sig="шеш(теңдеу, айнымалы?)",
         doc="Решает уравнение с одним неизвестным: шеш(\"x^2 - 9 = 0\") → [-3, 3]. Нужен SymPy.")
def _solve(interp, equation, var=None):
    sympy = _need_sympy("шеш")
    text = expect_str("шеш", equation)
    if text.count("=") > 1:
        rt_error("«шеш»: в уравнении может быть только один знак '='")
    if "=" in text:
        left, right = text.split("=")
        expr = _parse(sympy, "шеш", left) - _parse(sympy, "шеш", right)
    else:
        expr = _parse(sympy, "шеш", text)
    sym = _symbol(sympy, expr, var, "шеш")
    try:
        roots = sympy.solve(expr, sym)
    except Exception:
        rt_error("«шеш»: не удалось решить уравнение")
    roots = [r for r in roots if r.is_number]
    try:
        roots.sort(key=lambda r: float(r) if r.is_real else float("inf"))
    except Exception:
        pass
    return [_convert(sympy, r) for r in roots]


@builtin("туын", 1, 2, category="science", sig="туын(өрнек, айнымалы?)",
         doc="Производная выражения: туын(\"x^3\") → \"3*x^2\". Нужен SymPy.")
def _diff(interp, expression, var=None):
    sympy = _need_sympy("туын")
    expr = _parse(sympy, "туын", expect_str("туын", expression))
    sym = _symbol(sympy, expr, var, "туын")
    return _convert(sympy, sympy.diff(expr, sym))


@builtin("интегр", 1, 4, category="science", sig="интегр(өрнек, айнымалы?, a?, b?)",
         doc="Неопределённый интеграл: интегр(\"x^2\") → \"x^3/3\"; определённый: интегр(\"x^2\", \"x\", 0, 3) → 9. Нужен SymPy.")
def _integrate(interp, expression, var=None, a=None, b=None):
    sympy = _need_sympy("интегр")
    expr = _parse(sympy, "интегр", expect_str("интегр", expression))
    sym = _symbol(sympy, expr, var, "интегр")
    if (a is None) != (b is None):
        rt_error("«интегр»: границы a и b задаются вместе")
    if a is None:
        return _convert(sympy, sympy.integrate(expr, sym))
    from .registry import expect_number
    lo, hi = expect_number("интегр", a), expect_number("интегр", b)
    return _convert(sympy, sympy.integrate(expr, (sym, lo, hi)))


@builtin("сыз", 2, 3, category="science", unsafe=True, sig="сыз(x, y, файл=\"график.png\")",
         doc="Строит линейный график и сохраняет в PNG-файл. Нужен Matplotlib. Возвращает имя файла.")
def _plot(interp, xs, ys, path="график.png"):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        rt_error("«сыз» требует библиотеку Matplotlib, она не установлена",
                 hint="Установите: pip install matplotlib  (или pip install 'qazaq[science]').")
    xs, ys = numbers("сыз", xs), numbers("сыз", ys)
    if len(xs) != len(ys) or not xs:
        rt_error("«сыз»: x и y должны быть непустыми и одной длины")
    expect_str("сыз", path)
    fig, ax = plt.subplots()
    ax.plot(xs, ys, marker="o")
    ax.grid(True)
    try:
        fig.savefig(path)
    except OSError as exc:
        rt_error(f"Не удалось сохранить график: {exc.__class__.__name__}")
    finally:
        plt.close(fig)
    return path
