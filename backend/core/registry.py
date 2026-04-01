"""
Module Registry — self-registering BMS module descriptors.

Usage (in any app's module.py):

    from core.registry import BMSModule, register_module

    @register_module
    class TicketsModule(BMSModule):
        id = 'tickets'
        name = 'Tickets'
        ...

Modules are auto-discovered when their app's AppConfig.ready() imports module.py.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Type

# ── Registry storage ──────────────────────────────────────────────────────────

_REGISTRY: Dict[str, "BMSModule"] = {}


def get_registry() -> Dict[str, "BMSModule"]:
    """Return all registered module descriptors keyed by module id."""
    return _REGISTRY


def get_module(module_id: str) -> Optional["BMSModule"]:
    """Return a module descriptor by id, or None if not found."""
    return _REGISTRY.get(module_id)


# ── Base descriptor ───────────────────────────────────────────────────────────

class BMSModule:
    """
    Base class for BMS module descriptors.

    Subclass and override the class attributes, then apply @register_module.
    All attributes are class-level — no instance initialisation needed.
    """

    id: str = ''
    name: str = ''
    description: str = ''
    icon: str = 'box'
    version: str = '1.0.0'
    is_premium: bool = False
    base_price: float = 0.0
    requires: List[str] = []
    permissions: List[str] = []
    nav: dict = {}

    def to_dict(self) -> dict:
        """Serialise descriptor to a plain dict (for API responses)."""
        return {
            'id': self.__class__.id,
            'name': self.__class__.name,
            'description': self.__class__.description,
            'icon': self.__class__.icon,
            'version': self.__class__.version,
            'is_premium': self.__class__.is_premium,
            'base_price': self.__class__.base_price,
            'requires': self.__class__.requires,
            'permissions': self.__class__.permissions,
            'nav': self.__class__.nav,
        }


# ── Decorator ─────────────────────────────────────────────────────────────────

def register_module(cls: Type[BMSModule]) -> Type[BMSModule]:
    """
    Class decorator that registers the descriptor class.

    Usage::

        @register_module
        class TicketsModule(BMSModule):
            id = 'tickets'
            ...
    """
    module_id = cls.__dict__.get('id', '') or ''
    if not module_id:
        raise ValueError(f"BMSModule subclass {cls.__name__} must define a non-empty 'id'.")
    _REGISTRY[module_id] = cls()
    return cls

