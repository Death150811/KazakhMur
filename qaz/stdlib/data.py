"""Data / AI: анализ данных и простая линейная регрессия (без внешних библиотек)."""
from __future__ import annotations

import math
import statistics

from .registry import as_list, builtin, expect_number, is_number, numbers, rt_error


@builtin("талда", 1, 1, category="data", sig="талда(числа)",
         doc="Статистика списка чисел: сөздік с ключами саны, қосынды, орташа, медиана, "
             "минимум, максимум, ауытқу (выборочное стандартное отклонение; 0 при одном значении).")
def _analyze(interp, data):
    xs = numbers("талда", data)
    if not xs:
        rt_error("«талда»: нет данных для анализа")
    std = statistics.stdev(xs) if len(xs) > 1 else 0.0
    mean = statistics.fmean(xs)
    med = statistics.median(xs)
    return {
        "саны": len(xs),
        "қосынды": sum(xs),
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
    sxx = sum((x - mx) ** 2 for x in xs)
    if sxx == 0:
        rt_error("«үйрет»: все значения x одинаковы — прямую построить нельзя")
    k = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / sxx
    b = my - k * mx
    ss_tot = sum((y - my) ** 2 for y in ys)
    ss_res = sum((y - (k * x + b)) ** 2 for x, y in zip(xs, ys))
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
