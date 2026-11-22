import unicodedata

from conftest import run

ALPHABET = "Ә Ғ Қ Ң Ө Ұ Ү Һ І ә ғ қ ң ө ұ ү һ і"


def test_alphabet_roundtrip():
    src = f'айным әліпби = "{ALPHABET}".\nжаз(әліпби).\nжаз(ұзындық(әліпби)).'
    assert run(src) == f"{ALPHABET}\n{len(ALPHABET)}\n"


def test_kazakh_identifiers_work():
    src = "айным оқушы = \"Али\".\nайным қала = \"Атырау\".\nайным қазақстан = ақиқат.\nжаз(оқушы, қала, қазақстан)."
    assert run(src) == "Али Атырау ақиқат\n"


def test_each_special_letter_as_identifier():
    for letter in "әғқңөұүһі":
        assert run(f"айным {letter}{letter} = 1.\nжаз({letter}{letter}).") == "1\n"


def test_nfd_and_nfc_identifiers_are_the_same_variable():
    nfd = unicodedata.normalize("NFD", "қайтарым")  # содержит «й»: и + U+0306
    nfc = unicodedata.normalize("NFC", "қайтарым")
    assert nfd != nfc
    assert run(f"айным {nfc} = 7.\nжаз({nfd}).") == "7\n"
    assert run(f"айным {nfd} = 8.\nжаз({nfc}).") == "8\n"


def test_nfd_keyword_works():
    kw = unicodedata.normalize("NFD", "қайтар")
    src = f"функ f():\n    {kw} 5.\nжаз(f())."
    assert run(src) == "5\n"


def test_unicode_in_strings_comments_and_fstrings():
    src = '# Қазақша комментарий: ә ғ қ\nайным ат = "Жәңгір".\nжаз(ф"Сәлем, {ат}! ✓ 😀").'
    assert run(src) == "Сәлем, Жәңгір! ✓ 😀\n"


def test_string_methods_on_kazakh_text():
    assert run('жаз("қазақ".жоғары()).') == "ҚАЗАҚ\n"
    assert run('жаз("ҚАЗАҚ".төмен(), ұзындық("Ұлы Дала")).') == "қазақ 8\n"
    assert run('жаз("қазақстан"[::-1]).') == "натсқазақ\n"


def test_dict_with_kazakh_keys():
    assert run('айным д = {"қала": "Астана"}.\nжаз(д["қала"], "қала" ішінде д).') == "Астана ақиқат\n"
