"""Стандартная библиотека Qazaq."""
from . import core, data, io_lib, mathlib, science  # noqa: F401  (регистрируют функции)
from .registry import BUILTINS, CATEGORIES, CONSTANTS, METHODS, builtin, method  # noqa: F401
