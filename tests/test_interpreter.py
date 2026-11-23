import pytest

from conftest import run, run_err
from qaz.interpreter import Limits


def test_arithmetic():
    assert run("жаз(1 + 2 * 3, (1 + 2) * 3, 7 // 2, 7 % 3, 2 ** 10, 7 / 2, -3 + 5).") == \
        "7 9 3 1 1024 3.5 2\n"


def test_float_and_int_distinction():
    assert run("жаз(10 / 2, 3.0, 2 * 1.5, түр(1), түр(1.5)).") == "5.0 3.0 3.0 бүтін нақты\n"


def test_power_semantics():
    assert run("жаз(-2 ** 2, 2 ** -1, 2 ** 3 ** 2).") == "-4 0.5 512\n"


def test_division_by_zero():
    for src in ("жаз(1 / 0).", "жаз(1 // 0).", "жаз(1 % 0)."):
        e = run_err(src)
        assert "ноль" in e.message and e.line == 1
    e = run_err("жаз(0 ** -1).")
    assert e.line == 1


def test_huge_power_guard():
    assert "слишком велик" in run_err("жаз(10 ** 10 ** 10).").message


def test_complex_result_rejected():
    assert "комплекс" in run_err("жаз((-8) ** 0.5).").message


def test_strings():
    assert run('жаз("а" + "б", "ab" * 3, ұзындық("сәлем")).') == "аб ababab 5\n"
    assert run('айным с = "Қазақстан".\nжаз(с[0], с[-1], с[1:4]).') == "Қ н аза\n"


def test_string_plus_number_error_has_hint():
    e = run_err('жаз("a" + 1).')
    assert "типам" in e.message and "мәтін" in e.hint


def test_booleans_and_none():
    assert run("жаз(ақиқат, жалған, бос, ақиқат және жалған, ақиқат немесе жалған, емес ақиқат).") \
        == "ақиқат жалған бос жалған ақиқат жалған\n"


def test_logical_short_circuit_and_values():
    assert run("функ f():\n    жаз(\"вызвано\").\n    қайтар ақиқат.\n"
               "жаз(жалған және f()).\nжаз(ақиқат немесе f()).\nжаз(0 немесе \"x\").") == \
        "жалған\nақиқат\nx\n"


def test_comparisons():
    assert run("жаз(1 < 2, 2 <= 2, 3 > 4, 1 == 1.0, \"а\" != \"б\", 1 < 2 < 3, 1 < 3 < 2).") == \
        "ақиқат ақиқат жалған ақиқат ақиқат ақиқат жалған\n"


def test_incomparable_types():
    assert "Нельзя сравнить" in run_err('жаз(1 < "a").').message


def test_membership():
    assert run('жаз(2 ішінде [1, 2], "а" ішінде "қала", "к" ішінде {"к": 1}, 5 емес ішінде [1]).') \
        == "ақиқат ақиқат ақиқат ақиқат\n"
    run_err("жаз(1 ішінде 5).")


def test_variables_and_scope():
    src = """\
айным x = 1.
функ f():
    айным x = 2.
    қайтар x.
жаз(f(), x).
"""
    assert run(src) == "2 1\n"


def test_assignment_updates_outer_variable():
    src = """\
айным счёт = 0.
функ өсіру():
    счёт += 1.
өсіру().
өсіру().
жаз(счёт).
"""
    assert run(src) == "2\n"


def test_undeclared_assignment_error_with_suggestion():
    e = run_err("айным санауыш = 1.\nсанаушы = 2.")
    assert "не объявлена" in e.message and "санауыш" in e.hint
    assert e.line == 2


def test_undefined_name():
    e = run_err("жаз(белгісіз).")
    assert "не определено" in e.message and e.col == 5


def test_builtin_cannot_be_assigned():
    assert "встроенное" in run_err("жаз = 1.").message
    assert run("айным жаз = 5.\nтүр(жаз).".replace("түр(жаз).", "")) == ""


def test_compound_assignment():
    assert run("айным x = 10.\nx += 5.\nx -= 3.\nx *= 2.\nx /= 4.\nжаз(x).") == "6.0\n"


def test_if_elif_else():
    src = """\
функ f(n):
    егер n > 0:
        қайтар "оң".
    әйтпесе егер n < 0:
        қайтар "теріс".
    әйтпесе:
        қайтар "нөл".
жаз(f(5), f(-1), f(0)).
"""
    assert run(src) == "оң теріс нөл\n"


def test_while_break_continue():
    src = """\
айным i = 0.
әзір ақиқат:
    i += 1.
    егер i == 2:
        жалғас.
    егер i > 4:
        тоқта.
    жаз(i).
"""
    assert run(src) == "1\n3\n4\n"


def test_for_loops():
    assert run("әрбір i ішінде аралық(3):\n    жаз(i).\n") == "0\n1\n2\n"
    assert run('әрбір с ішінде "қаз":\n    жаз(с).\n') == "қ\nа\nз\n"
    assert run('әрбір к ішінде {"а": 1, "б": 2}:\n    жаз(к).\n') == "а\nб\n"
    assert run('әрбір к, м ішінде {"а": 1}.жұптар():\n    жаз(к, м).\n') == "а 1\n"


def test_for_break_continue_nested():
    src = """\
әрбір i ішінде аралық(3):
    әрбір j ішінде аралық(3):
        егер j == 1:
            жалғас.
        егер i == 1:
            тоқта.
        жаз(i, j).
"""
    assert run(src) == "0 0\n0 2\n2 0\n2 2\n"


def test_for_not_iterable():
    assert "перебирать" in run_err("әрбір x ішінде 5:\n    жаз(x).\n").message


def test_functions_defaults_and_arity():
    src = "функ f(a, b = 10):\n    қайтар a + b.\nжаз(f(1), f(1, 2))."
    assert run(src) == "11 3\n"
    e = run_err("функ f(a, b):\n    қайтар a.\nf(1).")
    assert "ожидает" in e.message and "2" in e.message
    e = run_err("функ f(a):\n    қайтар a.\nf(1, 2).")
    assert "ожидает" in e.message


def test_default_evaluated_per_call():
    src = "функ f(x = []):\n    x.қос(1).\n    қайтар x.\nжаз(f(), f())."
    assert run(src) == "[1] [1]\n"


def test_function_without_return_gives_none():
    assert run("функ f():\n    өткіз.\nжаз(f()).") == "бос\n"


def test_recursion():
    src = """\
функ факт(n):
    егер n <= 1:
        қайтар 1.
    қайтар n * факт(n - 1).
функ фиб(n):
    егер n < 2:
        қайтар n.
    қайтар фиб(n - 1) + фиб(n - 2).
жаз(факт(10), фиб(15), факт(30)).
"""
    assert run(src) == "3628800 610 265252859812191058636308480000000\n"


def test_deep_recursion_ok_and_limit():
    src = "функ f(n):\n    егер n == 0:\n        қайтар 0.\n    қайтар 1 + f(n - 1).\n"
    assert run(src + "жаз(f(900)).") == "900\n"
    e = run_err(src + "жаз(f(100000)).")
    assert "глубина" in e.message
    assert len(e.trace) > 100


def test_infinite_recursion_caught_by_try():
    src = "функ f():\n    қайтар f().\nбайқа:\n    f().\nқате e:\n    жаз(\"пойман\").\n"
    assert run(src) == "пойман\n"


def test_closures():
    src = """\
функ санауыш():
    айным c = 0.
    функ келесі():
        c += 1.
        қайтар c.
    қайтар келесі.
айным а = санауыш().
айным б = санауыш().
жаз(а(), а(), б()).
"""
    assert run(src) == "1 2 1\n"


def test_functions_are_values():
    src = "функ екі(x):\n    қайтар x * 2.\nжаз(бейнеле(екі, [1, 2, 3]), түр(екі))."
    assert run(src) == "[2, 4, 6] функция\n"


def test_lists():
    src = """\
айным л = [3, 1, 2].
л.қос(4).
л[0] = 10.
жаз(л, л[1:3], л[-1], ұзындық(л), л + [5], [0] * 3).
жаз(л.шығар(), л).
"""
    assert run(src) == "[10, 1, 2, 4] [1, 2] 4 4 [10, 1, 2, 4, 5] [0, 0, 0]\n4 [10, 1, 2]\n"


def test_list_aliasing():
    assert run("айным а = [1].\nайным б = а.\nб.қос(2).\nжаз(а).") == "[1, 2]\n"


def test_list_index_errors():
    e = run_err("айным л = [1, 2].\nжаз(л[5]).")
    assert "вне диапазона" in e.message and e.line == 2
    assert "бүтін" in run_err('жаз([1][ "a" ]).').message


def test_nested_collections():
    src = 'айным д = {"а": [1, {"б": 2}]}.\nд["а"][1]["б"] = 3.\nжаз(д, д["а"][1]["б"]).'
    assert run(src) == '{"а": [1, {"б": 3}]} 3\n'


def test_dicts():
    src = """\
айным д = {"а": 1, "б": 2}.
д["в"] = 3.
жаз(д.кілттер(), д.мәндер(), ұзындық(д), "а" ішінде д, д.ал("жоқ", 0)).
д.өшір("а").
жаз(д).
"""
    assert run(src) == '["а", "б", "в"] [1, 2, 3] 3 ақиқат 0\n{"б": 2, "в": 3}\n'


def test_dict_missing_key():
    e = run_err('айным д = {}.\nжаз(д["х"]).')
    assert "Ключ не найден" in e.message


def test_unhashable_key():
    assert "Ключом" in run_err("айным д = {}.\nд[[1]] = 2.").message


def test_slices():
    assert run("айным л = [0, 1, 2, 3, 4, 5].\nжаз(л[2:], л[:2], л[::2], л[::-1], л[1:-1], \"абвгд\"[1:3]).") \
        == "[2, 3, 4, 5] [0, 1] [0, 2, 4] [5, 4, 3, 2, 1, 0] [1, 2, 3, 4] бв\n"
    assert "нулём" in run_err("жаз([1][::0]).").message


def test_string_immutable():
    assert "нельзя менять" in run_err('айным с = "аб".\nс[0] = "в".').message


def test_try_catch_finally():
    src = """\
байқа:
    жаз(1 / 0).
қате е:
    жаз("қате:", е).
соңында:
    жаз("соң").
"""
    assert run(src) == "қате: Нөлге бөлу: деление на ноль\nсоң\n"


def test_raise_and_catch():
    src = """\
функ тексеру(x):
    егер x < 0:
        лақтыр "теріс сан".
    қайтар x.
байқа:
    тексеру(-1).
қате:
    жаз("ұсталды").
"""
    assert run(src) == "ұсталды\n"


def test_uncaught_raise():
    e = run_err('лақтыр "бүлінді".')
    assert e.message == "бүлінді"


def test_finally_runs_on_return_and_break():
    src = """\
функ f():
    байқа:
        қайтар 1.
    соңында:
        жаз("finally").
жаз(f()).
әрбір i ішінде аралық(2):
    байқа:
        тоқта.
    соңында:
        жаз("fin").
"""
    assert run(src) == "finally\n1\nfin\n"


def test_error_in_catch_variable_scoped():
    src = "байқа:\n    1 / 0.\nқате е:\n    өткіз.\nжаз(е)."
    assert "не определено" in run_err(src).message


def test_classes():
    src = """\
сынып Адам:
    функ жасау(өзі, есім, жас = 18):
        өзі.есім = есім.
        өзі.жас = жас.
    функ таныстыр(өзі):
        қайтар ф"{өзі.есім}, {өзі.жас}".
    функ есею(өзі):
        өзі.жас += 1.
айным а = Адам("Али").
а.есею().
жаз(а.таныстыр(), а.жас, түр(а), түр(Адам)).
"""
    assert run(src) == "Али, 19 19 Адам сынып\n"


def test_inheritance_and_super_call():
    src = """\
сынып Жануар:
    айным дыбыс = "...".
    функ жасау(өзі, ат):
        өзі.ат = ат.
    функ сөйле(өзі):
        қайтар өзі.ат + ": " + өзі.дыбыс.
сынып Ит(Жануар):
    функ жасау(өзі, ат):
        Жануар.жасау(өзі, ат + "!").
    функ дыбыс2(өзі):
        қайтар "әу".
айным и = Ит("Тарзан").
жаз(и.сөйле(), и.дыбыс2()).
"""
    assert run(src) == "Тарзан!: ... әу\n"


def test_class_errors():
    e = run_err("сынып A:\n    өткіз.\nA(1).")
    assert "не принимает" in e.message
    e = run_err("сынып A:\n    өткіз.\nайным a = A().\nжаз(a.жоқ).")
    assert "нет поля" in e.message
    assert "нельзя вызвать" in run_err("5().").message


def test_methods_on_wrong_type():
    e = run_err("жаз((5).жоқ).".replace("(5)", "5"))  # 5.жоқ — число с точкой-доступом
    assert e is not None


def test_unknown_method_hint():
    e = run_err('жаз("а".жоғар()).')
    assert "жоғары" in e.hint


def test_fstring_formatting():
    src = 'айным x = 3.14159.\nайным а = "Али".\nжаз(ф"{а}: {x:.2f}, {1 + 1}, {{қос}}").'
    assert run(src) == "Али: 3.14, 2, {қос}\n"
    assert "Формат" in run_err("жаз(ф\"{'а':d}\").").message


def test_input_from_stdin():
    assert run('айным а = енгіз("Аты: ").\nжаз("Сәлем,", а).', stdin="Нұрлан\n") == "Аты: Сәлем, Нұрлан\n"
    assert "Ввод закончился" in run_err("енгіз().").message


def test_traceback_chain():
    src = "функ a():\n    қайтар 1 / 0.\nфунк b():\n    қайтар a().\nb().\n"
    e = run_err(src)
    assert [n for n, _ in e.trace] == ["a", "b"]
    assert e.line == 2


def test_error_position_inside_expression():
    e = run_err("айным x = 1 + 2 * (3 / 0).")
    assert (e.line, e.col) == (1, 22)


def test_step_limit_stops_infinite_loop():
    e = run_err("әзір ақиқат:\n    өткіз.", limits=Limits(max_steps=10_000))
    assert "лимит шагов" in e.message and not e.catchable


def test_timeout_stops_infinite_loop():
    e = run_err("әзір ақиқат:\n    өткіз.", limits=Limits(timeout=0.3))
    assert "время" in e.message


def test_limit_not_catchable_by_try():
    src = "байқа:\n    әзір ақиқат:\n        өткіз.\nқате:\n    жаз(\"ұсталды\").\n"
    e = run_err(src, limits=Limits(max_steps=5000))
    assert "лимит" in e.title.lower() or "лимит" in e.message


def test_output_limit():
    e = run_err('әзір ақиқат:\n    жаз("a" * 1000).', limits=Limits(max_output=5000, max_steps=10**6))
    assert "вывода" in e.message


def test_repetition_guard():
    assert "слишком" in run_err('жаз(ұзындық("a" * 10 ** 12)).').message


def test_range_is_lazy():
    assert run("жаз(ұзындық(аралық(10 ** 12)), 5 ішінде аралық(10), аралық(0, 6, 2)).") == \
        "1000000000000 ақиқат аралық(0, 6, 2)\n"


def test_multiline_statement():
    src = "айным нәтиже = 1 +\n    2 +\n    3.\nжаз(\n    нәтиже,\n    \"бар\"\n).\n"
    assert run(src) == "6 бар\n"


def test_unicode_program():
    src = 'айным әліпби = "Ә Ғ Қ Ң Ө Ұ Ү Һ І".\nжаз(әліпби, ұзындық(әліпби)).'
    assert run(src) == "Ә Ғ Қ Ң Ө Ұ Ү Һ І 17\n"


def test_safe_mode_blocks_file_functions():
    assert "безопасном" in run_err('оқы("/etc/passwd").', safe=True).message
    assert "безопасном" in run_err('сақта("x.txt", "a").', safe=True).message


def test_big_integers_print_and_limits():
    assert len(run("жаз(факториал(3000)).").strip()) == 9131
    assert run("айным n = " + "9" * 5000 + ".\nжаз(ұзындық(мәтін(n))).") == "5000\n"
    e = run_err("айным x = 10 ** 1000.\nәрбір i ішінде аралық(40):\n    x = x * x.")
    assert "слишком велик" in e.message
    assert "слишком велик" in run_err("жаз(10 ** 400000).").message


def test_lambda_basics_and_closures():
    assert run("айным екі = функ(x): x * 2.\nжаз(екі(4), бейнеле(функ(x): x + 1, [1, 2])).") == "8 [2, 3]\n"
    assert run("жаз((функ(x): функ(y): x + y)(1)(2)).") == "3\n"
    assert run("айным n = 10.\nайным ф = функ(a, b = n): a + b.\nn = 100.\nжаз(ф(1)).") == "101\n"
    assert run("жаз(түр(функ(x): x)).") == "функция\n"


def test_lambda_errors():
    assert "в той же строке" in run_err("айным ф = функ(x):\n    x.").message
    e = run_err("айным бөл = функ(a, b): a / b.\nжаз(бөл(1, 0)).")
    assert [n for n, _ in e.trace] == ["<лямбда>"]


def test_named_arguments():
    src = "функ f(a, b = 10, c = 100):\n    қайтар [a, b, c].\nжаз(f(1), f(1, c = 5), f(c = 1, a = 2, b = 3))."
    assert run(src) == "[1, 10, 100] [1, 10, 5] [2, 3, 1]\n"
    assert run('жаз(сұрып([3, 1, 2], кері = ақиқат), қосынды([1, 2], бастау = 10)).') == "[3, 2, 1] 13\n"
    assert run("сынып A:\n    функ жасау(өзі, x, y = 0):\n        өзі.x = x.\n        өзі.y = y.\n"
               "айным а = A(1, y = 5).\nжаз(а.x, а.y).") == "1 5\n"


def test_named_argument_errors():
    base = "функ f(a, b):\n    қайтар a.\n"
    assert "дважды" in run_err(base + "f(1, a = 2).").message
    assert "нет параметра" in run_err(base + "f(z = 1).").message
    assert "не получила" in run_err(base + "f(a = 1).").message
    assert "не принимает именованные" in run_err("ұзындық(x = 1).").message
    assert "Позиционный аргумент после" in run_err(base + "f(a = 1, 2).").message
    assert "Повторяющийся" in run_err(base + "f(a = 1, a = 2).").message
