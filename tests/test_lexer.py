import unicodedata

import pytest

from qaz.errors import LexicalError
from qaz.lexer import tokenize


def kinds(src):
    return [t.kind for t in tokenize(src)]


def vals(src, *skip):
    return [t.value for t in tokenize(src) if t.kind not in skip]


def test_simple_declaration():
    toks = tokenize("айным x = 10.")
    assert [t.kind for t in toks] == ["KW", "NAME", "OP", "INT", "END", "NL", "EOF"]
    assert toks[0].value == "айным" and toks[3].value == 10


def test_decimal_point_vs_terminator():
    toks = tokenize("айным сан = 3.14.")
    assert [t.kind for t in toks][:6] == ["KW", "NAME", "OP", "FLOAT", "END", "NL"]
    assert toks[3].value == 3.14


def test_integer_followed_by_terminator():
    assert kinds("айным x = 10.") == ["KW", "NAME", "OP", "INT", "END", "NL", "EOF"]
    assert kinds("жаз(5).") == ["NAME", "OP", "INT", "OP", "END", "NL", "EOF"]


def test_terminator_before_comment_and_eof():
    assert kinds("x = 1.# комментарий")[2:4] == ["INT", "END"]
    assert kinds("x = 1.")[-3:] == ["END", "NL", "EOF"]


def test_member_access_dot():
    assert kinds("а.қос(1).")[:3] == ["NAME", "DOT", "NAME"]
    assert kinds("\"a, b\".бөл(\",\").")[:3] == ["STR", "DOT", "NAME"]


def test_multiple_statements_one_line():
    ks = kinds("айным a = 1. айным b = 2.")
    assert ks.count("END") == 2 and ks.count("NL") == 1


def test_float_then_terminator_and_exponent():
    assert vals("x = 2.5. y = 1e3. z = 1_000.", "OP", "END", "NL", "EOF") == \
        ["x", 2.5, "y", 1000.0, "z", 1000]


def test_dot_errors():
    with pytest.raises(LexicalError):
        tokenize("x = .5.")
    with pytest.raises(LexicalError) as e:
        tokenize("жаз(1).2")
    assert "точк" in e.value.message.lower()


def test_number_followed_by_letter():
    with pytest.raises(LexicalError):
        tokenize("x = 10abc.")


def test_kazakh_letters_in_identifiers():
    toks = tokenize("айным әліпби = ғ + қ + ң + ө + ұ + ү + һ + і.")
    names = [t.value for t in toks if t.kind == "NAME"]
    assert names == ["әліпби", "ғ", "қ", "ң", "ө", "ұ", "ү", "һ", "і"]


def test_all_keywords_recognised():
    from qaz.tokens import KEYWORDS
    for kw in KEYWORDS:
        assert tokenize(kw + " ")[0].kind == "KW", kw


def test_nfd_identifiers_normalised_to_nfc():
    nfc = "қайтар"
    nfd = unicodedata.normalize("NFD", nfc)
    assert nfc != nfd
    assert tokenize(nfd)[0].kind == "KW" and tokenize(nfd)[0].value == nfc
    name = unicodedata.normalize("NFD", "жүйе")
    assert tokenize(name)[0].value == unicodedata.normalize("NFC", name)


def test_mixed_script_identifier_rejected():
    with pytest.raises(LexicalError) as e:
        tokenize("айным қaйтар2 = 1.")  # латинская a внутри кириллического слова
    assert "латиниц" in e.value.message
    assert e.value.line == 1 and e.value.col == 7


def test_pure_latin_identifier_ok():
    assert tokenize("айным abc = 1.")[1].value == "abc"


def test_strings_and_escapes():
    assert tokenize('"а\\nб\\t\\"в\\\\"')[0].value == 'а\nб\t"в\\'
    assert tokenize("'сәлем'")[0].value == "сәлем"
    assert tokenize('"""көп\nжолды"""')[0].value == "көп\nжолды"


def test_unterminated_string_position():
    with pytest.raises(LexicalError) as e:
        tokenize('жаз("сәлем).')
    assert (e.value.line, e.value.col) == (1, 5)


def test_unknown_escape():
    with pytest.raises(LexicalError):
        tokenize('"a\\qb"')


def test_fstring_parts():
    tok = tokenize('ф"Сәлем, {есім}! {x:.2f} {{жақша}}"')[0]
    assert tok.kind == "FSTR"
    parts = tok.value
    assert parts[0] == "Сәлем, "
    assert parts[1].source == "есім" and parts[1].spec is None
    assert parts[3].source == "x" and parts[3].spec == ".2f"
    assert parts[-1] == "! " or isinstance(parts[-1], str)
    assert "{жақша}" in parts[-1]


def test_fstring_errors():
    with pytest.raises(LexicalError):
        tokenize('ф"{x"')
    with pytest.raises(LexicalError):
        tokenize('ф"a}"')
    with pytest.raises(LexicalError):
        tokenize('ф"{}"')


def test_comments_ignored():
    assert vals("# тек комментарий\nайным x = 1. # соңында", "NL", "EOF") == ["айным", "x", "=", 1, "."]


def test_indent_dedent():
    ks = kinds("егер x:\n    жаз(1).\n    егер y:\n        жаз(2).\nжаз(3).\n")
    assert ks.count("INDENT") == 2 and ks.count("DEDENT") == 2


def test_dedent_at_eof():
    ks = kinds("егер x:\n    егер y:\n        жаз(1).")
    assert ks[-3:] == ["DEDENT", "DEDENT", "EOF"]


def test_inconsistent_dedent():
    with pytest.raises(LexicalError):
        tokenize("егер x:\n        жаз(1).\n    жаз(2).\n")


def test_continuation_line_has_no_newline_token():
    ks = kinds("айным x = 1 +\n    2.\n")
    assert ks.count("NL") == 1 and "INDENT" not in ks


def test_brackets_ignore_newlines():
    ks = kinds("жаз(\n  1,\n  2\n).\n")
    assert ks.count("NL") == 1 and "INDENT" not in ks


def test_unclosed_and_extra_brackets():
    with pytest.raises(LexicalError) as e:
        tokenize("жаз((1).")
    assert e.value.line == 1
    with pytest.raises(LexicalError):
        tokenize("жаз(1)).")


def test_semicolon_hint():
    with pytest.raises(LexicalError) as e:
        tokenize("айным x = 1;")
    assert "точк" in e.value.hint


def test_positions():
    toks = tokenize("айным x = 1.\nжаз(x).")
    jaz = next(t for t in toks if t.value == "жаз")
    assert (jaz.line, jaz.col) == (2, 1)


def test_crlf_and_bom():
    assert kinds("\ufeffайным x = 1.\r\nжаз(x).\r\n").count("NL") == 2


def test_tabs_as_indent():
    assert "INDENT" in kinds("егер x:\n\tжаз(1).\n")
