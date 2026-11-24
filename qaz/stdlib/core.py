"""Core: функции, доступные сразу."""
from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from ..runtime import QInstance, QSet, to_repr, to_str, type_name, truthy
from .registry import (as_list, builtin, expect_int, expect_number, expect_str, is_number,
                       method, rt_error)


# ---------------- ввод / вывод ----------------
@builtin("жаз", 0, None, kwonly=("соңы", "бөлгіш"), sig="жаз(a, b, …, соңы=\"\\n\", бөлгіш=\" \")",
         doc="Выводит значения через пробел и переводит строку. соңы= — чем закончить вывод (по умолчанию перевод строки), "
             "бөлгіш= — чем разделять значения (по умолчанию пробел). Оба параметра — мәтін.")
def _print(interp, *args, соңы="\n", бөлгіш=" "):
    for name, value in (("соңы", соңы), ("бөлгіш", бөлгіш)):
        if not isinstance(value, str):
            rt_error(f"«жаз»: параметр «{name}» должен быть мәтін, а не {type_name(value)}")
    interp.write(бөлгіш.join(to_str(a) for a in args) + соңы)


@builtin("енгіз", 0, 1, sig="енгіз(подсказка?)", doc="Читает строку из ввода. Возвращает мәтін.")
def _input(interp, prompt=""):
    if prompt != "":
        interp.write(to_str(prompt))
    line = interp.read_line()
    if line is None:
        rt_error("Ввод закончился: нет данных для «енгіз»")
    return line


# ---------------- типы и преобразования ----------------
@builtin("ұзындық", 1, 1, sig="ұзындық(x)", doc="Длина мәтін, тізім, кортеж, сөздік, жиын или аралық.")
def _len(interp, x):
    if isinstance(x, (str, list, dict, range, tuple, QSet)):
        return len(x)
    rt_error(f"«ұзындық»: у значения типа {type_name(x)} нет длины",
             hint="Длину имеют мәтін, тізім, кортеж, сөздік, жиын и аралық.")


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


@builtin("кортеж", 0, 1, sig="кортеж(x?)", doc="Создаёт неизменяемый кортеж из коллекции (или пустой).")
def _tuple(interp, *args):
    return tuple(as_list("кортеж", args[0])) if args else ()


@builtin("жиын", 0, 1, sig="жиын(коллекция?)",
         doc="Множество: набор без повторов, порядок — по добавлению. Элементы только неизменяемые (не тізім/сөздік/жиын).")
def _set(interp, *args):
    if not args:
        return QSet()
    try:
        return QSet(as_list("жиын", args[0]))
    except TypeError:
        _unhashable_element("жиын")


def _unhashable_element(name: str):
    rt_error(f"«{name}»: элементом множества не может быть изменяемое значение (тізім/сөздік/жиын)")


@builtin("сөздік", 0, 1, sig="сөздік(пары?)", doc="Создаёт словарь из списка пар [[ключ, значение], …] (или пустой).")
def _dict(interp, *args):
    if not args:
        return {}
    src = args[0]
    if isinstance(src, dict):
        return dict(src)
    out = {}
    for pair in as_list("сөздік", src):
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
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


def _min_max(interp, name: str, pick, args, key):
    items = as_list(name, args[0]) if len(args) == 1 else list(args)
    if not items:
        rt_error(f"«{name}»: пустая коллекция")
    try:
        if key is None:
            return pick(items)
        keys = [interp.call_value(key, [x]) for x in items]
        return items[pick(range(len(items)), key=keys.__getitem__)]
    except TypeError:
        rt_error(f"«{name}»: значения нельзя сравнивать между собой")


@builtin("минимум", 1, None, kwonly=("кілт",), sig="минимум(коллекция) | минимум(a, b, …) | кілт=функция",
         doc="Наименьшее значение. С кілт=функция сравниваются результаты функции, например минимум(слова, кілт=ұзындық).")
def _min(interp, *args, кілт=None):
    return _min_max(interp, "минимум", min, args, кілт)


@builtin("максимум", 1, None, kwonly=("кілт",), sig="максимум(коллекция) | максимум(a, b, …) | кілт=функция",
         doc="Наибольшее значение. С кілт=функция сравниваются результаты функции, например максимум(слова, кілт=ұзындық).")
def _max(interp, *args, кілт=None):
    return _min_max(interp, "максимум", max, args, кілт)


@builtin("қосынды", 1, 2, kw=("коллекция", "бастау"), sig="қосынды(коллекция, бастау=0)", doc="Сумма чисел коллекции (дробные суммируются точно: 0.1 + 0.2 + 0.3 = 0.6).")
def _sum(interp, items, start=0):
    from .data import exact_sum
    values = [expect_number("қосынды", start)]
    for x in as_list("қосынды", items):
        values.append(expect_number("қосынды", x))
    return exact_sum(values)


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
@builtin("сұрып", 1, 2, kw=("коллекция", "кері"), kwonly=("кілт",), sig="сұрып(коллекция, кері=жалған, кілт=функция)",
         doc="Новый отсортированный список. Параметр кері=ақиқат — по убыванию; кілт=функция — сортировать по результату функции.")
def _sorted(interp, items, reverse=False, *, кілт=None):
    values = as_list("сұрып", items)
    try:
        if кілт is None:
            return sorted(values, reverse=truthy(reverse))
        keys = [interp.call_value(кілт, [x]) for x in values]
        order = sorted(range(len(values)), key=keys.__getitem__, reverse=truthy(reverse))
        return [values[i] for i in order]
    except TypeError:
        rt_error("«сұрып»: значения разных типов нельзя сортировать вместе")


@builtin("сүз", 2, 2, sig="сүз(функция, коллекция)", doc="Элементы, для которых функция вернула истину.")
def _filter(interp, fn, items):
    return [x for x in as_list("сүз", items) if truthy(interp.call_value(fn, [x]))]


@builtin("бейнеле", 2, 2, sig="бейнеле(функция, коллекция)", doc="Применяет функцию к каждому элементу.")
def _map(interp, fn, items):
    return [interp.call_value(fn, [x]) for x in as_list("бейнеле", items)]


@builtin("топта", 2, 2, sig="топта(функция, коллекция)",
         doc="Группирует элементы в сөздік: ключ — результат функции, значение — список элементов с этим ключом (порядок — по первому появлению).")
def _group(interp, fn, items):
    out: dict = {}
    for x in as_list("топта", items):
        key = interp.call_value(fn, [x])
        try:
            out.setdefault(key, []).append(x)
        except TypeError:
            rt_error("«топта»: ключ группы не может быть изменяемым значением (тізім/сөздік/жиын)")
    return out


@builtin("кері", 1, 1, sig="кері(x)", doc="Копия в обратном порядке (тізім, мәтін, аралық).")
def _reverse(interp, x):
    if isinstance(x, str):
        return x[::-1]
    if isinstance(x, (list, range, tuple)):
        return list(x)[::-1]
    rt_error(f"«кері»: нельзя перевернуть значение типа {type_name(x)}")


@builtin("нөмірле", 1, 2, kw=("коллекция", "бастау"), sig="нөмірле(коллекция, бастау=0)",
         doc="Список пар (номер, элемент): әрбір і, x ішінде нөмірле(список):")
def _enumerate(interp, items, start=0):
    expect_int("нөмірле", start)
    return [(i, x) for i, x in enumerate(as_list("нөмірле", items), start)]


@builtin("жұптастыр", 2, None, sig="жұптастыр(a, b, …)",
         doc="Список кортежей из элементов коллекций по порядку; длина — по самой короткой.")
def _zip(interp, *colls):
    return list(zip(*[as_list("жұптастыр", c) for c in colls]))


@builtin("бірі", 1, 1, sig="бірі(коллекция)", doc="Истина, если хотя бы один элемент истинный (для пустой — жалған).")
def _any(interp, items):
    return any(truthy(x) for x in as_list("бірі", items))


@builtin("барлығы", 1, 1, sig="барлығы(коллекция)", doc="Истина, если все элементы истинные (для пустой — ақиқат).")
def _all(interp, items):
    return all(truthy(x) for x in as_list("барлығы", items))


@builtin("символ", 1, 1, sig="символ(код)", doc="Символ Unicode по номеру: символ(1241) даёт «ә».")
def _chr(interp, n):
    expect_int("символ", n)
    if not (0 <= n <= 0x10FFFF) or 0xD800 <= n <= 0xDFFF:
        rt_error("«символ»: номер вне диапазона Unicode")
    return chr(n)


@builtin("код", 1, 1, sig="код(символ)", doc="Номер Unicode символа: код(\"ә\") даёт 1241.")
def _ord(interp, c):
    if not isinstance(c, str) or len(c) != 1:
        rt_error("«код»: ожидалась строка из одного символа")
    return ord(c)


@builtin("бөлінді", 2, 2, sig="бөлінді(a, b)", doc="Кортеж (a // b, a % b): неполное частное и остаток.")
def _divmod(interp, a, b):
    expect_number("бөлінді", a)
    expect_number("бөлінді", b)
    return (interp.binop("//", a, b), interp.binop("%", a, b))


# ---------------- методы мәтін ----------------
@method(str, "сандық", doc="Истина, если строка не пуста и состоит только из цифр 0–9.", sig=".сандық()")
def _s_isdigit(interp, s):
    return s != "" and all("0" <= ch <= "9" for ch in s)


@method(str, "әріптік", doc="Истина, если строка не пуста и состоит только из букв (любого алфавита).", sig=".әріптік()")
def _s_isalpha(interp, s):
    return s.isalpha()


_MAX_PAD = 1_000_000


@method(str, "толтыр", 1, 2, sig=".толтыр(длина, символ=\" \")",
        doc="Дополняет строку слева символом до заданной длины: \"7\".толтыр(3, \"0\") даёт \"007\". Длиннее — без изменений.")
def _s_pad(interp, s, length, fill=" "):
    expect_int("толтыр", length, "длина")
    if not isinstance(fill, str) or len(fill) != 1:
        rt_error("«толтыр»: символ заполнения должен быть строкой из одного символа")
    if length > _MAX_PAD:
        rt_error(f"«толтыр»: длина слишком велика (максимум {_MAX_PAD})")
    return fill * max(length - len(s), 0) + s


@method(str, "жолдар", sig=".жолдар()", doc="Список строк: разбивает по переводам строки (\\n, \\r\\n, \\r); пустая строка даёт пустой список.")
def _s_lines(interp, s):
    import re
    parts = re.split(r"\r\n|\r|\n", s)
    if parts and parts[-1] == "":
        parts.pop()
    return parts


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


# ---------------- методы кортеж ----------------
@method(tuple, "тап", 1, 1, sig=".тап(x)", doc="Индекс первого вхождения или -1.")
def _t_index(interp, t, x):
    try:
        return t.index(x)
    except ValueError:
        return -1


@method(tuple, "сана", 1, 1, sig=".сана(x)", doc="Сколько раз значение встречается.")
def _t_count(interp, t, x):
    return t.count(x)


# ---------------- методы жиын ----------------
def _other_set(name: str, other) -> QSet:
    try:
        return QSet(as_list(name, other))
    except TypeError:
        _unhashable_element(name)


@method(QSet, "қос", 1, 1, sig=".қос(x)", doc="Добавляет элемент (если его ещё нет).")
def _s_add(interp, s, x):
    try:
        s.d.setdefault(x, True)
    except TypeError:
        _unhashable_element("қос")


@method(QSet, "өшір", 1, 1, sig=".өшір(x)", doc="Удаляет элемент; если его нет — ошибка.")
def _s_remove(interp, s, x):
    try:
        del s.d[x]
    except KeyError:
        rt_error(f"«өшір»: значения {to_repr(x)} нет в множестве")
    except TypeError:
        _unhashable_element("өшір")


@method(QSet, "босат", 0, 0, sig=".босат()", doc="Удаляет все элементы.")
def _s_clear(interp, s):
    s.d.clear()


@method(QSet, "көшір", 0, 0, sig=".көшір()", doc="Копия множества.")
def _s_copy(interp, s):
    return QSet(s)


@method(QSet, "бірлестір", 1, 1, sig=".бірлестір(другая)", doc="Новое множество: элементы обоих (объединение).")
def _s_union(interp, s, other):
    return QSet([*s, *_other_set("бірлестір", other)])


@method(QSet, "қиылыс", 1, 1, sig=".қиылыс(другая)", doc="Новое множество: элементы, которые есть в обоих (пересечение).")
def _s_inter(interp, s, other):
    o = _other_set("қиылыс", other)
    return QSet(x for x in s if x in o)


@method(QSet, "айырма", 1, 1, sig=".айырма(другая)", doc="Новое множество: элементы этого, которых нет в другом (разность).")
def _s_diff(interp, s, other):
    o = _other_set("айырма", other)
    return QSet(x for x in s if x not in o)


@method(QSet, "ішкіжиын", 1, 1, sig=".ішкіжиын(другая)", doc="Истина, если все элементы этого множества есть в другом.")
def _s_subset(interp, s, other):
    o = _other_set("ішкіжиын", other)
    return all(x in o for x in s)
