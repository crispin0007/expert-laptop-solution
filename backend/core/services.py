"""
core/services.py
~~~~~~~~~~~~~~~~
BaseService — the foundation for all business logic in NEXUS BMS.

Architecture contract:
- ViewSets call service methods. Nothing else.
- Service methods are the ONLY place business rules live.
- Services call repositories for data access. Never touch ORM directly.
- Services raise AppException subclasses. Never raise bare Exception.
- Multi-step writes MUST be wrapped in @transaction.atomic.
- Services never touch request.* — receive plain data, return model instances.

Quick start::

    from core.services import BaseService
    from core.exceptions import ValidationError, NotFoundError
    from .repositories import InvoiceRepository

    class InvoiceService(BaseService):
        repo_class = InvoiceRepository

        def create_invoice(self, data: dict) -> Invoice:
            if not data.get("items"):
                raise ValidationError("Invoice must have at least one item")
            with transaction.atomic():
                invoice = self.repo.create(data, created_by=self.user)
                self._compute_totals(invoice)
            return invoice
"""
from __future__ import annotations

import logging
from django.db import transaction

from core.exceptions import NotFoundError


class BaseService:
    """
    Base class for all service classes in NEXUS BMS.

    Attributes:
        tenant  — Tenant model instance, scoped from request.tenant
        user    — User model instance, scoped from request.user
        repo    — Repository instance (created from repo_class if defined)
        logger  — Module-level logger named after the concrete class

    Subclass pattern::

        class MyService(BaseService):
            repo_class = MyRepository          # optional but typical

            def do_thing(self, data):
                obj = self.repo.create(data, self.user)
                self.logger.info("Created %s id=%s", obj.__class__.__name__, obj.pk)
                return obj
    """

    # Set in subclass: the Repository class to instantiate automatically.
    # If None, self.repo is not created and you manage data access yourself.
    repo_class = None

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user
        # Scoped logger: "accounting.services.invoice_service" etc.
        self.logger = logging.getLogger(
            f"{self.__class__.__module__}.{self.__class__.__name__}"
        )
        # Auto-create repository if defined
        if self.repo_class is not None:
            self.repo = self.repo_class(tenant=tenant)

    # ── Default CRUD operations ───────────────────────────────────────────────
    # Override any or all of these in the concrete service.

    def create(self, validated_data: dict):
        """Default create — delegates to repo. Override for business logic."""
        return self.repo.create(data=validated_data, created_by=self.user)

    def update(self, instance, validated_data: dict):
        """Default update — delegates to repo. Override for business logic."""
        return self.repo.update(instance, data=validated_data)

    def delete(self, instance):
        """
        Default delete — soft-delete via repo.
        Override if hard delete is required (rare — only for non-critical data).
        """
        return self.repo.soft_delete(instance)

    # ── Helper utilities ──────────────────────────────────────────────────────

    def get_or_404(self, pk: int):
        """
        Fetch by PK within the current tenant scope, or raise NotFoundError.

        Usage::

            invoice = self.get_or_404(pk)   # raises 404 automatically if missing
        """
        instance = self.repo.get_by_id(pk)
        if not instance:
            model_name = getattr(self.repo, "model", None)
            name = model_name.__name__ if model_name else "Object"
            raise NotFoundError(f"{name} not found")
        return instance

    @staticmethod
    def atomic(func):
        """
        Decorator shortcut for @transaction.atomic on service methods.

        Usage::

            @BaseService.atomic
            def create_invoice(self, data):
                ...
        """
        from functools import wraps

        @wraps(func)
        def wrapper(*args, **kwargs):
            with transaction.atomic():
                return func(*args, **kwargs)

        return wrapper
