"""
core/repositories.py
~~~~~~~~~~~~~~~~~~~~
BaseRepository — the single point of ORM access for NEXUS BMS.

Architecture contract:
- All ORM queries live in repository classes. Nowhere else.
- Repositories are always scoped to a tenant (via self._qs).
- Repositories never raise exceptions — return None / empty queryset.
- Repositories have NO business logic. Pure data access only.
- Services call repositories. Views never call repositories directly.

Quick start::

    from core.repositories import BaseRepository
    from .models import Invoice

    class InvoiceRepository(BaseRepository):
        model = Invoice

        def list_unpaid(self):
            return (
                self._qs
                .filter(status="unpaid", is_deleted=False)
                .select_related("customer", "created_by")
                .prefetch_related("items")
                .order_by("-created_at")
            )

        def get_with_items(self, pk: int):
            return (
                self._qs
                .filter(pk=pk)
                .select_related("customer")
                .prefetch_related("items__product")
                .first()
            )
"""
from __future__ import annotations

import logging
from django.utils import timezone

logger = logging.getLogger(__name__)


class BaseRepository:
    """
    Base class for all data-access repositories in NEXUS BMS.

    Attributes:
        tenant — Tenant model instance
        model  — The Django Model class (set in subclass)
        _qs    — Base queryset already filtered to this tenant

    Rules:
    - Always access data via self._qs (tenant-scoped automatically)
    - Add select_related / prefetch_related in every list method
    - Return None from get_* methods when not found — never raise
    - Use bulk_create for multi-row inserts (never loop .create())
    - Keep methods small and single-purpose
    """

    # Override in subclass with the Django model class
    model = None

    def __init__(self, tenant):
        if self.model is None:
            raise NotImplementedError(
                f"{self.__class__.__name__} must define `model`"
            )
        self.tenant = tenant
        # Base queryset — every subclass query must chain from this
        self._qs = self.model.objects.filter(tenant=tenant)

    # ── Generic CRUD ─────────────────────────────────────────────────────────

    def get_by_id(self, pk: int):
        """
        Return model instance by PK within this tenant, or None.
        Always use this rather than .get(pk=pk) — avoids DoesNotExist raises.
        """
        return self._qs.filter(pk=pk).first()

    def list(self, include_deleted: bool = False):
        """
        Return base queryset for this tenant.
        Subclasses should override with select_related and domain filters.
        """
        qs = self._qs
        if not include_deleted and hasattr(self.model, "is_deleted"):
            qs = qs.filter(is_deleted=False)
        return qs

    def create(self, data: dict, created_by=None) -> object:
        """
        Create a new model instance scoped to this tenant.

        Automatically injects:
        - tenant
        - created_by (if the model has the field and created_by is provided)
        """
        kwargs = {"tenant": self.tenant, **data}
        if created_by is not None and hasattr(self.model, "created_by_id"):
            kwargs["created_by"] = created_by
        return self.model.objects.create(**kwargs)

    def update(self, instance, data: dict) -> object:
        """
        Update specific fields on an instance.
        Always uses update_fields for efficiency — no full-row rewrite.
        updated_at is always included if the model has the field.
        """
        update_fields = list(data.keys())
        for field, value in data.items():
            setattr(instance, field, value)
        if hasattr(instance, "updated_at") and "updated_at" not in update_fields:
            update_fields.append("updated_at")
        instance.save(update_fields=update_fields)
        return instance

    def soft_delete(self, instance) -> object:
        """
        Mark instance as deleted without removing from DB.
        Requires is_deleted + deleted_at fields on the model.
        """
        if not hasattr(instance, "is_deleted"):
            raise AttributeError(
                f"{instance.__class__.__name__} does not support soft delete "
                f"(missing is_deleted field). Use hard_delete() instead."
            )
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        fields = ["is_deleted", "deleted_at"]
        if hasattr(instance, "updated_at"):
            fields.append("updated_at")
        instance.save(update_fields=fields)
        return instance

    def hard_delete(self, instance) -> None:
        """
        Permanently remove instance from DB.
        Use sparingly — only for non-critical data (e.g. draft attachments).
        """
        instance.delete()

    def bulk_create(self, records: list[dict], created_by=None) -> list:
        """
        Efficiently insert multiple records in a single DB round-trip.

        Usage::

            repo.bulk_create([
                {"product_id": 1, "quantity": 10},
                {"product_id": 2, "quantity": 5},
            ], created_by=user)
        """
        instances = []
        for data in records:
            kwargs = {"tenant": self.tenant, **data}
            if created_by is not None and hasattr(self.model, "created_by_id"):
                kwargs["created_by"] = created_by
            instances.append(self.model(**kwargs))
        return self.model.objects.bulk_create(instances)

    def exists(self, **filters) -> bool:
        """Check existence within this tenant scope."""
        return self._qs.filter(**filters).exists()

    def count(self, **filters) -> int:
        """Count records within this tenant scope."""
        return self._qs.filter(**filters).count()
