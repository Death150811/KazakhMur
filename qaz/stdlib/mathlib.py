"""Math: математические функции и случайные числа."""
from __future__ import annotations

import math

from ..runtime import truthy
from .registry import (CONSTANTS, as_list, builtin, expect_int, expect_number, rt_error)

CONSTANTS["пи"] = math.pi


def _guard(name, fn, *args):
    try:
        return fn(*args)
    except (ValueError, OverflowError, ZeroDivisionError) as exc:
        rt_error(f"«{name}»: математическая ошибка ({exc})")


@builtin("түбір", 1, 1, category="math", sig="түбір(x)", doc="Квадратный корень (x ≥ 0).")
def _sqrt(interp, x):
    x = expect_number("түбір", x)
    if x < 0:
        rt_error("«түбір»: корень из отрицательного числа", hint="Аргумент должен быть ≥ 0.")
    return math.sqrt(x)


@builtin("дәреже", 2, 2, category="math", sig="дәреже(основание, показатель)", doc="Возведение в степень (как оператор **).")
def _pow(interp, a, b):
    expect_number("дәреже", a)
    expect_number("дәреже", b)
    return interp.binop("**", a, b)


@builtin("синус", 1, 1, category="math", sig="синус(x)", doc="Синус (x в радианах).")
def _sin(interp, x):
    return math.sin(expect_number("синус", x))


@builtin("косинус", 1, 1, category="math", sig="косинус(x)", doc="Косинус (x в радианах).")
def _cos(interp, x):
    return math.cos(expect_number("косинус", x))


@builtin("тангенс", 1, 1, category="math", sig="тангенс(x)", doc="Тангенс (x в радианах).")
def _tan(interp, x):
    return math.tan(expect_number("тангенс", x))


@builtin("логарифм", 1, 2, category="math", sig="логарифм(x, основание=e)", doc="Логарифм (по умолчанию натуральный).")
def _log(interp, x, base=None):
    x = expect_number("логарифм", x)
    if base is None:
        return _guard("логарифм", math.log, x)
    return _guard("логарифм", math.log, x, expect_number("логарифм", base))


@builtin("факториал", 1, 1, category="math", sig="факториал(n)", doc="n! для целого 0 ≤ n ≤ 5000.")
def _fact(interp, n):
    expect_int("факториал", n)
    if n < 0 or n > 5000:
        rt_error("«факториал»: n должно быть от 0 до 5000")
    return math.factorial(n)


@builtin("комбинация", 2, 2, category="math", sig="комбинация(n, k)", doc="Число сочетаний C(n, k).")
def _comb(interp, n, k):
    expect_int("комбинация", n)
    expect_int("комбинация", k)
    if n < 0 or k < 0:
        rt_error("«комбинация»: n и k должны быть неотрицательными")
    if n > 100000:
        rt_error("«комбинация»: n слишком велико (максимум 100000)")
    return math.comb(n, k)


@builtin("кездейсоқ", 0, 2, category="math", sig="кездейсоқ() | кездейсоқ(a, b)",
         doc="Без аргументов — число [0, 1); с двумя — случайное целое от a до b включительно.")
def _random(interp, *args):
    if not args:
        return interp.rng.random()
    if len(args) != 2:
        rt_error("«кездейсоқ»: нужно 0 или 2 аргумента")
    a, b = expect_int("кездейсоқ", args[0]), expect_int("кездейсоқ", args[1])
    if a > b:
        rt_error("«кездейсоқ»: начало диапазона больше конца")
    return interp.rng.randint(a, b)


@builtin("таңда", 1, 1, category="math", sig="таңда(коллекция)", doc="Случайный элемент коллекции.")
def _choice(interp, items):
    items = as_list("таңда", items)
    if not items:
        rt_error("«таңда»: коллекция пуста")
    return interp.rng.choice(items)


@builtin("тұқым", 1, 1, category="math", sig="тұқым(n)", doc="Задаёт начальное число генератора случайных чисел (для повторяемости).")
def _seed(interp, n):
    interp.rng.seed(expect_int("тұқым", n))
