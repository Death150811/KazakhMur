"""Токены и ключевые слова языка Qazaq."""
from __future__ import annotations

from dataclasses import dataclass

# ключевое слово -> (аналог, пояснение)
KEYWORD_INFO: dict[str, tuple[str, str]] = {
    "айным": ("var / let", "объявление переменной"),
    "функ": ("def / function", "объявление функции"),
    "егер": ("if", "условие"),
    "әйтпесе": ("else", "иначе; «әйтпесе егер» — else if"),
    "қайтар": ("return", "вернуть значение из функции"),
    "әзір": ("while", "цикл с условием"),
    "әрбір": ("for", "перебор: әрбір x ішінде тізім:"),
    "ішінде": ("in", "«внутри»: перебор и проверка принадлежности"),
    "ақиқат": ("true", "логическая истина"),
    "жалған": ("false", "логическая ложь"),
    "бос": ("null / None", "отсутствие значения"),
    "сынып": ("class", "объявление класса"),
    "тоқта": ("break", "выйти из цикла"),
    "жалғас": ("continue", "перейти к следующей итерации"),
    "және": ("and", "логическое И"),
    "немесе": ("or", "логическое ИЛИ"),
    "емес": ("not", "логическое НЕ"),
    "байқа": ("try", "блок с обработкой ошибок"),
    "қате": ("except", "обработчик ошибки: қате e:"),
    "соңында": ("finally", "блок, выполняемый всегда"),
    "лақтыр": ("raise / throw", "вызвать ошибку"),
    "өткіз": ("pass", "пустая инструкция"),
}
KEYWORDS = frozenset(KEYWORD_INFO)

# Виды токенов
INT, FLOAT, STR, FSTR = "INT", "FLOAT", "STR", "FSTR"
NAME, KW, OP, DOT = "NAME", "KW", "OP", "DOT"
END = "END"        # точка — завершитель инструкции
NL, INDENT, DEDENT, EOF = "NL", "INDENT", "DEDENT", "EOF"


@dataclass(slots=True)
class Token:
    kind: str
    value: object
    line: int
    col: int
    end_line: int
    end_col: int  # колонка сразу после последнего символа

    def __repr__(self) -> str:
        return f"Token({self.kind}, {self.value!r}, {self.line}:{self.col})"


@dataclass(slots=True)
class FPart:
    """Выражение внутри форматной строки ф"...{x}..."."""
    source: str
    spec: str | None
    line: int
    col: int
