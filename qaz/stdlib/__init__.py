"""Стандартная библиотека Qazaq."""
from . import core, data, io_lib, mathlib, science  # noqa: F401  (регистрируют функции)
from .registry import alias as _alias

# Полные написания терминов принимаются наравне с краткими
_alias("туынды", "туын")
_alias("интеграл", "интегр")
from .registry import ALIASES, BUILTINS, CATEGORIES, CONSTANTS, METHODS, alias, builtin, method  # noqa: F401
