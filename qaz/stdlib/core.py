"""Core: функции, доступные сразу."""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from ..runtime import QInstance, to_repr, to_str, type_name, truthy
from .registry import (as_list, builtin, expect_int, expect_number, expect_str, is_number,
                       method, rt_error)


# ---------------- ввод / вывод ----------------
@builtin("жаз", 0, None, sig="жаз(a, b, …)", doc="Выводит значения через пробел и переводит строку.")
def _print(interp, *args):
    interp.write(" ".join(to_str(a) for a in args) + "\n")


@builtin("енгіз", 0, 1, sig="енгіз(подсказка?)", doc="Читает строку из ввода. Возвращает мәтін.")
def _input(interp, prompt=""):
    if prompt != "":
        interp.write(to_str(prompt))
    line = interp.read_line()
    if line is None:
        rt_error("Ввод закончился: нет данных для «енгіз»")
    return line


# ---------------- типы и преобразования ----------------
@builtin("ұзындық", 1, 1, sig="ұзындық(x)", doc="Длина мәтін, тізім, сөздік или аралық.")
def _len(interp, x):
    if isinstance(x, (str, list, dict, range)):
        return len(x)
    rt_error(f"«ұзындық»: у значения типа {type_name(x)} нет длины",
             hint="Длину имеют мәтін, тізім, сөздік и аралық.")


@builtin("түр", 1, 1, sig="түр(x)", doc="Имя типа значения (мәтін, бүтін, нақты, логика, тізім, сөздік, бос …).")
def _type(interp, x):
    return type_name(x)


@builtin("бүтін", 1, 1, sig="бүтін(x)", doc="Преобразует в целое число (дробную часть отбрасывает).")
def _int(interp, x):
    if isinstance(x, str):
        try:
            return int(x.strip().replace("_", ""))
        except ValueError:
            rt_error(f"Мәтінді бүтін санға айналдыру мүмкін емес: {to_repr(x)}",
                     hint="Строка должна содержать целое число, например \"42\".")
    if isinstance(x, bool):
        return int(x)
    if isinstance(x, int):
        return x
    if isinstance(x, float):
        if math.isnan(x) or math.isinf(x):
            rt_error("Нельзя превратить nan/inf в целое число")
        return int(x)
    rt_error(f"«бүтін»: нельзя преобразовать {type_name(x)} в целое число")


@builtin("нақты", 1, 1, sig="нақты(x)", doc="Преобразует в число с плавающей точкой.")
def _float(interp, x):
    if isinstance(x, str):
        try:
            return float(x.strip().replace("_", ""))
        except ValueError:
            rt_error(f"Мәтінді нақты санға айналдыру мүмкін емес: {to_repr(x)}",
                     hint="Пример корректной строки: \"3.14\".")
    if isinstance(x, (int, float)):
        return float(x)
    rt_error(f"«нақты»: нельзя преобразовать {type_name(x)} в число")


@builtin("мәтін", 0, 1, sig="мәтін(x)", doc="Преобразует значение в строку.")
def _str(interp, *args):
    return to_str(args[0]) if args else ""


@builtin("логика", 1, 1, sig="логика(x)", doc="Истинность значения: 0, \"\", [], {} и бос — жалған.")
def _bool(interp, x):
    return truthy(x)


@builtin("тізім", 0, 1, sig="тізім(x?)", doc="Создаёт список из коллекции (или пустой).")
def _list(interp, *args):
    return as_list("тізім", args[0]) if args else []


@builtin("сөздік", 0, 1, sig="сөздік(пары?)", doc="Создаёт словарь из списка пар [[ключ, значение], …] (или пустой).")
def _dict(interp, *args):
    if not args:
        return {}
    src = args[0]
    if isinstance(src, dict):
        return dict(src)
    out = {}
    for pair in as_list("сөздік", src):
        if not isinstance(pair, list) or len(pair) != 2:
            rt_error("«сөздік»: ожидался список пар [[ключ, значение], …]")
        try:
            out[pair[0]] = pair[1]
        except TypeError:
            rt_error("«сөздік»: ключом не может быть изменяемое значение (тізім/сөздік)")
    return out


@builtin("аралық", 1, 3, sig="аралық(конец) | аралық(начало, конец, шаг?)",
         doc="Последовательность целых чисел; конец не включается.")
def _range(interp, *args):
    for a in args:
        expect_int("аралық", a)
    if len(args) == 3 and args[2] == 0:
        rt_error("«аралық»: шаг не может быть нулём")
    return range(*args)


# ---------------- числа ----------------
@builtin("модуль", 1, 1, sig="модуль(x)", doc="Абсолютное значение.")
def _abs(interp, x):
    return abs(expect_number("модуль", x))


def _min_max(name: str, pick, args):
    items = as_list(name, args[0]) if len(args) == 1 else list(args)
    if not items:
        rt_error(f"«{name}»: пустая коллекция")
    try:
        return pick(items)
    except TypeError:
        rt_error(f"«{name}»: значения нельзя сравнивать между собой")


@builtin("минимум", 1, None, sig="минимум(коллекция) | минимум(a, b, …)", doc="Наименьшее значение.")
def _min(interp, *args):
    return _min_max("минимум", min, args)


@builtin("максимум", 1, None, sig="максимум(коллекция) | максимум(a, b, …)", doc="Наибольшее значение.")
def _max(interp, *args):
    return _min_max("максимум", max, args)


@builtin("қосынды", 1, 2, sig="қосынды(коллекция, начало=0)", doc="Сумма чисел коллекции.")
def _sum(interp, items, start=0):
    total = expect_number("қосынды", start)
    for x in as_list("қосынды", items):
        total += expect_number("қосынды", x)
    return total


@builtin("дөңгелекте", 1, 2, sig="дөңгелекте(x, знаков=0)",
         doc="Округляет «по-школьному» (0.5 → вверх). Без знаков возвращает бүтін.")
def _round(interp, x, digits=0):
    expect_number("дөңгелекте", x)
    expect_int("дөңгелекте", digits)
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        rt_error("«дөңгелекте»: нельзя округлить nan/inf")
    if isinstance(x, int):
        if digits >= 0:
            return x
    try:
        q = Decimal(1).scaleb(-digits)
        r = Decimal(repr(x)).quantize(q, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        rt_error("«дөңгелекте»: число слишком велико")
    return int(r) if digits <= 0 else float(r)


@builtin("еден", 1, 1, sig="еден(x)", doc="Округление вниз до целого.")
def _floor(interp, x):
    return math.floor(expect_number("еден", x))


@builtin("төбе", 1, 1, sig="төбе(x)", doc="Округление вверх до целого.")
def _ceil(interp, x):
    return math.ceil(expect_number("төбе", x))


# ---------------- коллекции ----------------
@builtin("сұрып", 1, 2, sig="сұрып(коллекция, кері=жалған)", doc="Новый отсортированный список.")
def _sorted(interp, items, reverse=False):
    try:
        return sorted(as_list("сұрып", items), reverse=truthy(reverse))
    except TypeError:
        rt_error("«сұрып»: значения разных типов нельзя сортировать вместе")


@builtin("сүз", 2, 2, sig="сүз(функция, коллекция)", doc="Элементы, для которых функция вернула истину.")
def _filter(interp, fn, items):
    return [x for x in as_list("сүз", items) if truthy(interp.call_value(fn, [x]))]


@builtin("бейнеле", 2, 2, sig="бейнеле(функция, коллекция)", doc="Применяет функцию к каждому элементу.")
def _map(interp, fn, items):
    return [interp.call_value(fn, [x]) for x in as_list("бейнеле", items)]


@builtin("кері", 1, 1, sig="кері(x)", doc="Копия в обратном порядке (тізім, мәтін, аралық).")
def _reverse(interp, x):
    if isinstance(x, str):
        return x[::-1]
    if isinstance(x, (list, range)):
        return list(x)[::-1]
    rt_error(f"«кері»: нельзя перевернуть значение типа {type_name(x)}")


# ---------------- методы мәтін ----------------
@method(str, "жоғары", doc="Верхний регистр.")
def _s_upper(interp, s):
    return s.upper()


@method(str, "төмен", doc="Нижний регистр.")
def _s_lower(interp, s):
    return s.lower()


@method(str, "тазала", doc="Убирает пробелы по краям.")
def _s_strip(interp, s):
    return s.strip()


@method(str, "бөл", 0, 1, sig=".бөл(разделитель?)", doc="Разбивает строку на список.")
def _s_split(interp, s, sep=None):
    if sep is not None:
        expect_str("бөл", sep)
        if sep == "":
            rt_error("«бөл»: разделитель не может быть пустым")
    return s.split(sep)


@method(str, "біріктір", 1, 1, sig=".біріктір(список)", doc="Склеивает мәтін-элементы списка этой строкой.")
def _s_join(interp, s, items):
    parts = as_list("біріктір", items)
    for p in parts:
        if not isinstance(p, str):
            rt_error(f"«біріктір»: элементы должны быть мәтін, найден {type_name(p)}",
                     hint="Преобразуйте элементы через бейнеле(мәтін, список).")
    return s.join(parts)


@method(str, "ауыстыр", 2, 2, sig=".ауыстыр(что, на_что)", doc="Заменяет все вхождения.")
def _s_replace(interp, s, old, new):
    return s.replace(expect_str("ауыстыр", old), expect_str("ауыстыр", new))


@method(str, "бастала", 1, 1, sig=".бастала(префикс)", doc="Начинается ли строка с префикса.")
def _s_starts(interp, s, p):
    return s.startswith(expect_str("бастала", p))


@method(str, "аяқтал", 1, 1, sig=".аяқтал(суффикс)", doc="Заканчивается ли строка суффиксом.")
def _s_ends(interp, s, p):
    return s.endswith(expect_str("аяқтал", p))


@method(str, "тап", 1, 1, sig=".тап(подстрока)", doc="Индекс первого вхождения или -1.")
def _s_find(interp, s, sub):
    return s.find(expect_str("тап", sub))


@method(str, "сана", 1, 1, sig=".сана(подстрока)", doc="Сколько раз подстрока встречается.")
def _s_count(interp, s, sub):
    sub = expect_str("сана", sub)
    if sub == "":
        rt_error("«сана»: подстрока не может быть пустой")
    return s.count(sub)


# ---------------- методы тізім ----------------
@method(list, "қос", 1, 1, sig=".қос(x)", doc="Добавляет элемент в конец.")
def _l_append(interp, lst, x):
    lst.append(x)


@method(list, "кірістір", 2, 2, sig=".кірістір(индекс, x)", doc="Вставляет элемент на позицию.")
def _l_insert(interp, lst, i, x):
    lst.insert(expect_int("кірістір", i), x)


@method(list, "шығар", 0, 1, sig=".шығар(индекс=-1)", doc="Удаляет и возвращает элемент.")
def _l_pop(interp, lst, i=-1):
    expect_int("шығар", i)
    if not lst:
        rt_error("«шығар»: список пуст")
    if not -len(lst) <= i < len(lst):
        rt_error(f"«шығар»: индекс {i} вне диапазона (длина {len(lst)})")
    return lst.pop(i)


@method(list, "өшір", 1, 1, sig=".өшір(x)", doc="Удаляет первое вхождение значения.")
def _l_remove(interp, lst, x):
    try:
        lst.remove(x)
    except ValueError:
        rt_error(f"«өшір»: значения {to_repr(x)} нет в списке")


@method(list, "тап", 1, 1, sig=".тап(x)", doc="Индекс первого вхождения или -1.")
def _l_index(interp, lst, x):
    try:
        return lst.index(x)
    except ValueError:
        return -1


@method(list, "сана", 1, 1, sig=".сана(x)", doc="Сколько раз значение встречается.")
def _l_count(interp, lst, x):
    return lst.count(x)


@method(list, "ұзарт", 1, 1, sig=".ұзарт(коллекция)", doc="Добавляет все элементы коллекции в конец.")
def _l_extend(interp, lst, items):
    lst.extend(as_list("ұзарт", items))


@method(list, "көшір", doc="Поверхностная копия списка.")
def _l_copy(interp, lst):
    return list(lst)


@method(list, "босат", doc="Удаляет все элементы.")
def _l_clear(interp, lst):
    lst.clear()


# ---------------- методы сөздік ----------------
@method(dict, "кілттер", doc="Список ключей.")
def _d_keys(interp, d):
    return list(d.keys())


@method(dict, "мәндер", doc="Список значений.")
def _d_values(interp, d):
    return list(d.values())


@method(dict, "жұптар", doc="Список пар [ключ, значение].")
def _d_items(interp, d):
    return [[k, v] for k, v in d.items()]


@method(dict, "ал", 1, 2, sig=".ал(ключ, по_умолчанию=бос)", doc="Значение по ключу или значение по умолчанию.")
def _d_get(interp, d, key, default=None):
    try:
        return d.get(key, default)
    except TypeError:
        rt_error("Ключом не может быть изменяемое значение (тізім/сөздік)")


@method(dict, "шығар", 1, 2, sig=".шығар(ключ, по_умолчанию?)", doc="Удаляет ключ и возвращает значение.")
def _d_pop(interp, d, key, *default):
    try:
        if key in d:
            return d.pop(key)
    except TypeError:
        rt_error("Ключом не может быть изменяемое значение (тізім/сөздік)")
    if default:
        return default[0]
    rt_error(f"Ключ не найден: {to_repr(key)}")


@method(dict, "өшір", 1, 1, sig=".өшір(ключ)", doc="Удаляет ключ (ошибка, если его нет).")
def _d_remove(interp, d, key):
    try:
        del d[key]
    except KeyError:
        rt_error(f"Ключ не найден: {to_repr(key)}")
    except TypeError:
        rt_error("Ключом не может быть изменяемое значение (тізім/сөздік)")


@method(dict, "жаңарт", 1, 1, sig=".жаңарт(другой_сөздік)", doc="Добавляет пары из другого словаря.")
def _d_update(interp, d, other):
    if not isinstance(other, dict):
        rt_error("«жаңарт»: ожидался сөздік")
    d.update(other)


@method(dict, "көшір", doc="Поверхностная копия словаря.")
def _d_copy(interp, d):
    return dict(d)


@method(dict, "босат", doc="Удаляет все пары.")
def _d_clear(interp, d):
    d.clear()
