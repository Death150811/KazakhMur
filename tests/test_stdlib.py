import math

import pytest

from conftest import run, run_err


def test_core_conversions():
    assert run('жаз(бүтін("42"), бүтін(3.9), бүтін(-3.9), нақты("2.5"), мәтін(12), логика(0), логика("а")).') \
        == "42 3 -3 2.5 12 жалған ақиқат\n"
    assert "айналдыру" in run_err('бүтін("abc").').message
    assert "айналдыру" in run_err('нақты("x").').message
    assert run('жаз(тізім("абв"), тізім(), сөздік(), сөздік([["а", 1]])).') == '["а", "б", "в"] [] {} {"а": 1}\n'


def test_type_names():
    assert run('жаз(түр(1), түр(1.5), түр("а"), түр(ақиқат), түр(бос), түр([]), түр({}), түр(жаз)).') == \
        "бүтін нақты мәтін логика бос тізім сөздік функция\n"


def test_len_errors():
    assert "нет длины" in run_err("ұзындық(5).").message
    assert run('жаз(ұзындық([1, 2]), ұзындық({}), ұзындық("")).') == "2 0 0\n"


def test_range_variants():
    assert run("жаз(тізім(аралық(3)), тізім(аралық(1, 4)), тізім(аралық(10, 0, -4))).") == \
        "[0, 1, 2] [1, 2, 3] [10, 6, 2]\n"
    assert "нулём" in run_err("аралық(0, 5, 0).").message
    assert "целое" in run_err("аралық(1.5).").message


def test_numeric_helpers():
    assert run("жаз(модуль(-5), модуль(2.5), минимум([3, 1, 2]), максимум(4, 9, 2), қосынды([1, 2, 3]), қосынды([])).") \
        == "5 2.5 1 9 6 0\n"
    assert "пуст" in run_err("минимум([]).").message


def test_rounding_half_up():
    assert run("жаз(дөңгелекте(2.5), дөңгелекте(3.5), дөңгелекте(-2.5), дөңгелекте(3.14159, 2), "
               "дөңгелекте(1234, -2), дөңгелекте(7), еден(2.7), төбе(2.1), еден(-2.1)).") == \
        "3 4 -3 3.14 1200 7 2 3 -3\n"


def test_sorting_filtering():
    src = """\
айным с = [5, 2, 9, 1].
жаз(сұрып(с), сұрып(с, ақиқат), с).
функ жұп(x):
    қайтар x % 2 == 0.
жаз(сүз(жұп, с), бейнеле(мәтін, с), кері([1, 2, 3]), кері("абв")).
"""
    assert run(src) == "[1, 2, 5, 9] [9, 5, 2, 1] [5, 2, 9, 1]\n[2] [\"5\", \"2\", \"9\", \"1\"] [3, 2, 1] вба\n"
    assert "сортировать" in run_err('сұрып([1, "а"]).').message


def test_string_methods():
    src = '''\
айным с = "  Сәлем, Әлем!  ".
жаз(с.тазала().жоғары(), с.төмен().тазала()).
жаз("а,б,в".бөл(","), "а б  в".бөл(), ", ".біріктір(["а", "б"])).
жаз("қала".ауыстыр("а", "о"), "қала".бастала("қа"), "қала".аяқтал("х"), "қала".тап("л"), "қала".тап("з"), "аба".сана("а")).
'''
    assert run(src) == ('СӘЛЕМ, ӘЛЕМ! сәлем, әлем!\n'
                        '["а", "б", "в"] ["а", "б", "в"] а, б\n'
                        'қоло ақиқат жалған 2 -1 2\n')
    assert "мәтін" in run_err('", ".біріктір([1, 2]).').message


def test_list_methods():
    src = """\
айным л = [1, 2, 3].
л.кірістір(0, 9).
л.өшір(2).
л.ұзарт([7, 7]).
жаз(л, л.тап(7), л.тап(100), л.сана(7), л.көшір()).
л.босат().
жаз(л).
"""
    assert run(src) == "[9, 1, 3, 7, 7] 3 -1 2 [9, 1, 3, 7, 7]\n[]\n"
    assert "нет в списке" in run_err("[1].өшір(5).").message
    assert "пуст" in run_err("[].шығар().").message


def test_dict_methods():
    src = """\
айным д = {"а": 1}.
д.жаңарт({"б": 2}).
жаз(д.жұптар(), д.шығар("а"), д.шығар("жоқ", 0), д).
д.босат().
жаз(д).
"""
    assert run(src) == '[["а", 1], ["б", 2]] 1 0 {"б": 2}\n{}\n'
    assert "не найден" in run_err('{}.шығар("х").'.replace("{}", "сөздік()")).message


def test_math():
    assert run("жаз(түбір(16), дәреже(2, 8), факториал(5), комбинация(5, 2), логарифм(100, 10), еден(синус(0)), косинус(0)).") == \
        "4.0 256 120 10 2.0 0 1.0\n"
    assert math.isclose(float(run("жаз(пи).")), math.pi)
    assert "отрицательного" in run_err("түбір(-1).").message
    assert "математическая" in run_err("логарифм(0).").message
    assert "от 0 до" in run_err("факториал(-1).").message


def test_random_with_seed_is_repeatable():
    src = "тұқым(42).\nжаз(кездейсоқ(1, 100), кездейсоқ(1, 100), таңда([1, 2, 3]) ішінде [1, 2, 3], 0 <= кездейсоқ() < 1)."
    assert run(src) == run(src)
    e = run_err("кездейсоқ(5, 1).")
    assert "больше" in e.message


def test_analyze():
    out = run('айным а = талда([10, 20, 30, 40]).\nжаз(а["саны"], а["қосынды"], а["орташа"], а["медиана"], а["минимум"], а["максимум"]).')
    assert out == "4 100 25.0 25.0 10 40\n"
    sd = run('жаз(талда([10, 20, 30, 40])["ауытқу"]).')
    assert math.isclose(float(sd), 12.909944487358056)
    assert run('жаз(талда([5])["ауытқу"]).') == "0.0\n"
    assert "нет данных" in run_err("талда([]).").message
    assert "числами" in run_err('талда([1, "а"]).').message


def test_linear_regression():
    src = """\
айным м = үйрет([1, 2, 3, 4], [3, 5, 7, 9]).
жаз(дөңгелекте(м["көлбеу"], 6), дөңгелекте(м["жылжу"], 6), дөңгелекте(м["R2"], 6)).
жаз(болжа(м, 10), болжа(м, [0, 5])).
"""
    assert run(src) == "2.0 1.0 1.0\n21.0 [1.0, 11.0]\n"
    assert "одинаковы" in run_err("үйрет([1, 1], [2, 3]).").message
    assert "моделью" in run_err("болжа(1, 2).").message


def test_arity_errors_for_builtins():
    assert "ожидает" in run_err("ұзындық().").message
    assert "ожидает" in run_err("ұзындық(1, 2).").message
    assert "ожидает" in run_err('"а".жоғары(1).').message


# ---------- Science (SymPy) ----------
sympy = pytest.importorskip("sympy")


def test_solve():
    assert run('жаз(шеш("x^2 - 9 = 0")).') == "[-3, 3]\n"
    assert run('жаз(шеш("2*x + 4 = 0")).') == "[-2]\n"
    assert run('жаз(шеш("x^2 = 2")).') == "[-1.4142135623730951, 1.4142135623730951]\n"


def test_derivative_and_integral():
    assert run('жаз(туын("x^3")).') == "3*x^2\n"
    assert run('жаз(туын("sin(x)")).') == "cos(x)\n"
    assert run('жаз(интегр("x^2")).') == "x^3/3\n"
    assert run('жаз(интегр("x^2", "x", 0, 3)).') == "9\n"


def test_science_input_is_validated():
    for evil in ('__import__("os").system("echo hi")', "x.__class__", "open('f')", "x[0]",
                 "lambda: 1", "exec('1')", "a" * 500):
        e = run_err(f"шеш({evil!r}).".replace("'", '"') if '"' not in evil else "шеш(" + repr(evil) + ").")
        assert e.line == 1


def test_science_injection_attempts_rejected():
    from qaz.stdlib.science import _validate
    from qaz.errors import QazaqRuntimeError
    for evil in ["__import__('os')", "x.real", "open(x)", "x[0]", "(1).__class__", "lambda x: x",
                 "eval(x)", "x; y"]:
        with pytest.raises(QazaqRuntimeError):
            _validate("шеш", evil)
    assert _validate("шеш", "x^2 + sin(x) - 2*y") == "x ** 2 + sin ( x ) - 2 * y"


def test_plot_unavailable_in_safe_mode_and_works_otherwise(tmp_path):
    assert "безопасном" in run_err('сыз([1, 2], [3, 4]).', safe=True).message
    pytest.importorskip("matplotlib")
    path = tmp_path / "g.png"
    out = run(f'жаз(сыз([1, 2, 3], [2, 4, 6], "{path}")).')
    assert path.exists() and path.stat().st_size > 100
    assert str(path) in out


def test_file_io(tmp_path):
    path = tmp_path / "а.txt"
    out = run(f'сақта("{path}", "Сәлем\\nӘлем").\nжаз(оқы("{path}")).')
    assert out == "Сәлем\nӘлем\n"
    assert "не найден" in run_err('оқы("/жоқ/файл.txt").').message


def test_key_function_for_sort_min_max():
    assert run('жаз(сұрып(["бб", "а", "ccc"], кілт = ұзындық), сұрып([3, 1, 2], кері = ақиқат, кілт = функ(x): -x)).') \
        == '["а", "бб", "ccc"] [1, 2, 3]\n'
    assert run('жаз(минимум(["бб", "а"], кілт = ұзындық), максимум([1, -5, 3], кілт = модуль)).') == "а -5\n"
    # равные ключи: побеждает первый элемент (как в Python), сортировка устойчива
    assert run('жаз(максимум(["аа", "бб"], кілт = ұзындық), минимум(["аа", "бб"], кілт = ұзындық)).') == "аа аа\n"
    assert run('жаз(сұрып([[1, "а"], [2, "б"], [1, "в"]], кері = ақиқат, кілт = функ(p): p[0])).') == '[[2, "б"], [1, "а"], [1, "в"]]\n'
    assert "нет параметра" in run_err("сұрып([1], жоқ = 1).").message


def test_enumerate_zip_any_all():
    assert run('әрбір і, x ішінде нөмірле(["а", "б"], 1):\n    жаз(і, x).') == "1 а\n2 б\n"
    assert run('жаз(жұптастыр([1, 2, 3], "аб"), бірі([0, 1]), барлығы([1, 0]), бірі([]), барлығы([])).') \
        == '[(1, "а"), (2, "б")] ақиқат жалған жалған ақиқат\n'


def test_chr_ord_divmod():
    assert run('жаз(символ(1241), код("ә"), бөлінді(-7, 2), бөлінді(7.5, 2)).') == "ә 1241 (-4, 1) (3.0, 1.5)\n"
    assert "диапазона" in run_err("символ(-1).").message
    assert "одного символа" in run_err('код("аб").').message
    assert "деление на ноль" in run_err("бөлінді(1, 0).").message


def test_new_string_methods_and_group():
    assert run('жаз("123".сандық(), "1а".сандық(), "Қаз".әріптік(), "а1".әріптік()).') == "ақиқат жалған ақиқат жалған\n"
    assert run('жаз("7".толтыр(3, "0"), "abc".толтыр(2), "а".толтыр(4, "*")).') == "007 abc ***а\n"
    assert run('жаз("а\\nб\\r\\nв\\n".жолдар(), "".жолдар()).') == '["а", "б", "в"] []\n'
    assert run("жаз(топта(функ(x): x % 2, аралық(5))).") == "{0: [0, 2, 4], 1: [1, 3]}\n"
    assert "одного символа" in run_err('"а".толтыр(3, "ab").').message
    assert "изменяемым" in run_err("топта(функ(x): [x], [1]).").message
