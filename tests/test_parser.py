import pytest

from qaz import ast_nodes as A
from qaz.errors import QazaqSyntaxError
from qaz.parser import parse


def expr(src):
    return parse(src + ".").body[0].expr


def err(src):
    with pytest.raises(QazaqSyntaxError) as e:
        parse(src)
    return e.value


def test_var_decl():
    node = parse("айным x = 10.").body[0]
    assert isinstance(node, A.VarDecl) and node.name == "x" and node.value.value == 10


def test_precedence():
    e = expr("1 + 2 * 3")
    assert e.op == "+" and e.right.op == "*"
    e = expr("(1 + 2) * 3")
    assert e.op == "*" and e.left.op == "+"


def test_power_right_assoc_and_unary():
    e = expr("2 ** 3 ** 2")
    assert e.op == "**" and e.right.op == "**"
    e = expr("-2 ** 2")
    assert isinstance(e, A.Unary) and e.operand.op == "**"
    e = expr("2 ** -1")
    assert e.right.op == "-"


def test_logical_precedence():
    e = expr("емес a және b немесе c")
    assert e.op == "немесе" and e.left.op == "және" and e.left.left.op == "емес"


def test_chained_comparison():
    e = expr("1 < x <= 10")
    assert isinstance(e, A.Compare) and [o for o, _ in e.ops] == ["<", "<="]


def test_membership_operators():
    assert expr("x ішінде тізім").ops[0][0] == "ішінде"
    assert expr("x емес ішінде тізім").ops[0][0] == "емес ішінде"


def test_if_elif_else():
    node = parse("егер a:\n    x.\nәйтпесе егер b:\n    y.\nәйтпесе:\n    z.\n").body[0]
    assert len(node.branches) == 2 and node.orelse is not None


def test_inline_block():
    node = parse("егер a: жаз(1).\nжаз(2).").body
    assert isinstance(node[0], A.If) and len(node) == 2


def test_function_def_and_defaults():
    f = parse("функ қосу(a, b = 5):\n    қайтар a + b.\n").body[0]
    assert [p.name for p in f.params] == ["a", "b"] and f.params[1].default.value == 5


def test_default_order_error():
    e = err("функ f(a = 1, b):\n    қайтар a.\n")
    assert "значения по умолчанию" in e.message


def test_duplicate_param():
    assert "Повторяющийся" in err("функ f(a, a):\n    қайтар a.\n").message


def test_collections_and_trailing_commas():
    e = expr("[1, 2, 3,]")
    assert len(e.items) == 3
    e = expr('{"а": 1, "б": [2],}')
    assert len(e.pairs) == 2


def test_index_slice_attr_call_chain():
    e = expr("а[1:3].бөл(\",\")[0]")
    assert isinstance(e, A.Index) and isinstance(e.obj, A.Call)
    s = expr("а[:2]")
    assert isinstance(s, A.Slice) and s.lo is None and s.hi.value == 2
    s = expr("а[::2]")
    assert s.lo is None and s.hi is None and s.step.value == 2
    s = expr("а[1:]")
    assert s.hi is None


def test_multiline_expression_without_brackets():
    prog = parse("айным x = 1 +\n    2 +\n    3.\nжаз(x).")
    assert len(prog.body) == 2


def test_for_with_unpacking():
    f = parse("әрбір к, м ішінде жұптар:\n    жаз(к).\n").body[0]
    assert f.targets == ["к", "м"]


def test_try_catch_finally():
    t = parse("байқа:\n    x.\nқате е:\n    y.\nсоңында:\n    z.\n").body[0]
    assert t.catch_name == "е" and t.catch_body and t.final_body


def test_try_without_handler():
    assert "қате" in err("байқа:\n    x.\n").message


def test_class_with_base():
    c = parse("сынып Ит(Жануар):\n    функ дыбыс(өзі):\n        қайтар 1.\n").body[0]
    assert c.name == "Ит" and c.base.name == "Жануар"


def test_class_body_restrictions():
    assert "тек" in err("сынып A:\n    жаз(1).\n").message.lower() or "допустимы" in \
        err("сынып A:\n    жаз(1).\n").message


def test_missing_period_position_is_end_of_previous_token():
    e = err("айным x = 1\nайным y = 2.")
    assert "точк" in e.message
    assert (e.line, e.col) == (1, 12)


def test_missing_period_at_end_of_file():
    e = err("жаз(1)")
    assert "точк" in e.message and (e.line, e.col) == (1, 7)


def test_missing_colon():
    e = err("егер x > 1\n    жаз(1).\n")
    assert "двоеточие" in e.message
    assert e.line == 1


def test_missing_assignment_sign():
    e = err("айным x 5.")
    assert "'='" in e.message


def test_invalid_assignment_target():
    assert "Слева" in err("1 + 2 = 3.").message


def test_break_continue_return_placement():
    assert "цикла" in err("тоқта.").message
    assert "цикла" in err("жалғас.").message
    assert "функции" in err("қайтар 1.").message
    assert "цикла" in err("әзір ақиқат:\n    функ f():\n        тоқта.\n").message


def test_return_in_function_in_loop_ok():
    parse("әзір ақиқат:\n    функ f():\n        қайтар 1.\n    тоқта.\n")


def test_empty_block_error_and_pass():
    parse("егер ақиқат:\n    өткіз.\n")
    err("егер ақиқат:\nжаз(1).\n")


def test_unexpected_indent():
    assert "отступ" in err("жаз(1).\n    жаз(2).\n").message.lower()


def test_stray_else():
    assert "әйтпесе" in err("әйтпесе:\n    жаз(1).\n").message


def test_keyword_as_value_error():
    assert "Ключевое" in err("айным x = егер.").message


def test_stray_terminator_and_unbalanced():
    err(". ")
    from qaz.errors import QazaqError
    with pytest.raises(QazaqError):
        parse("айным x = (1 + 2.")


def test_fstring_expression_parsed():
    e = expr('ф"сан: {1 + 2:>4}"')
    assert isinstance(e, A.FString)
    node, spec = e.parts[1]
    assert node.op == "+" and spec == ">4"


def test_fstring_bad_expression():
    err('жаз(ф"{1 +}").')
