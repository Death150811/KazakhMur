"""Data / AI: анализ данных и простая линейная регрессия (без внешних библиотек)."""
from __future__ import annotations

import math
import statistics
from fractions import Fraction

from .registry import as_list, builtin, expect_number, is_number, numbers, rt_error


def exact_sum(items):
    """Сумма без накопления ошибки: целые — точно, с дробными — math.fsum (одинаково во всех версиях Python)."""
    if all(isinstance(x, int) for x in items):
        return sum(items)
    return math.fsum(items)


def _isqrt_frac_rto(n: int, m: int) -> int:
    a = math.isqrt(n // m)
    return a | (a * a * m != n)


def exact_stdev(xs) -> float:
    """Выборочное стандартное отклонение, корректно округлённое (не зависит от версии Python)."""
    n = len(xs)
    fr = [Fraction(x) for x in xs]
    mean = sum(fr, Fraction(0)) / n
    ss = sum(((x - mean) ** 2 for x in fr), Fraction(0))
    var = ss / (n - 1)
    num, den = var.numerator, var.denominator
    if num == 0:
        return 0.0
    q = (num.bit_length() - den.bit_length() - 109) // 2
    if q >= 0:
        top, bottom = _isqrt_frac_rto(num, den << (2 * q)) << q, 1
    else:
        top, bottom = _isqrt_frac_rto(num << (-2 * q), den), 1 << -q
    return top / bottom


@builtin("талда", 1, 1, category="data", sig="талда(числа)",
         doc="Статистика списка чисел: сөздік с ключами саны, қосынды, орташа, медиана, "
             "минимум, максимум, ауытқу (выборочное стандартное отклонение; 0 при одном значении).")
def _analyze(interp, data):
    xs = numbers("талда", data)
    if not xs:
        rt_error("«талда»: нет данных для анализа")
    std = exact_stdev(xs) if len(xs) > 1 else 0.0
    mean = statistics.fmean(xs)
    med = statistics.median(xs)
    return {
        "саны": len(xs),
        "қосынды": exact_sum(xs),
        "орташа": mean,
        "медиана": med,
        "минимум": min(xs),
        "максимум": max(xs),
        "ауытқу": std,
    }


@builtin("үйрет", 2, 2, category="ai", sig="үйрет(x, y)",
         doc="Обучает линейную модель y = k·x + b методом наименьших квадратов. "
             "Возвращает сөздік-модель; используйте болжа(модель, x).")
def _fit(interp, xs, ys):
    xs, ys = numbers("үйрет", xs), numbers("үйрет", ys)
    if len(xs) != len(ys):
        rt_error("«үйрет»: x и y должны быть одной длины")
    if len(xs) < 2:
        rt_error("«үйрет»: нужно минимум 2 точки")
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    sxx = math.fsum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        rt_error("«үйрет»: все значения x одинаковы — прямую построить нельзя")
    k = math.fsum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    b = my - k * mx
    ss_tot = math.fsum((y - my) ** 2 for y in ys)
    ss_res = math.fsum((y - (k * x + b)) ** 2 for x, y in zip(xs, ys))
    r2 = 1.0 if ss_tot == 0 else 1 - ss_res / ss_tot
    return {"түр": "сызықтық", "көлбеу": k, "жылжу": b, "R2": r2}


@builtin("болжа", 2, 2, category="ai", sig="болжа(модель, x)",
         doc="Прогноз по модели из үйрет: для числа — число, для списка — список.")
def _predict(interp, model, x):
    if (not isinstance(model, dict) or model.get("түр") != "сызықтық"
            or "көлбеу" not in model or "жылжу" not in model):
        rt_error("«болжа»: первый аргумент должен быть моделью из үйрет()")
    k, b = model["көлбеу"], model["жылжу"]
    if isinstance(x, list):
        return [k * expect_number("болжа", v) + b for v in x]
    return k * expect_number("болжа", x) + b
