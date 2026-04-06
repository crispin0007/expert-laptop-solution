"""
accounting/repositories/invoice_repo.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
All ORM access for Invoice lives here.

Rules:
- Zero business logic — pure data access only
- Always scope to self.tenant via self._qs
- Always add select_related / prefetch_related to list queries
- Return None from get_* methods, never raise DoesNotExist
- Services call this — views never call this directly
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Sum, Value, F
from django.db.models.functions import Coalesce

from core.repositories import BaseRepository
from accounting.models import Invoice


# Reusable annotation that computes amount_paid in SQL — eliminates N+1 on list views.
_AMOUNT_PAID_ANNOTATION = Coalesce(
    Sum(
        F('payments__amount') + Coalesce(F('payments__tds_withheld_amount'), Value(Decimal('0')))
    ),
    Value(Decimal('0')),
)


class InvoiceRepository(BaseRepository):
    """
    Data access layer for Invoice.

    Instantiated by InvoiceService via repo_class = InvoiceRepository.
    The constructor receives tenant; BaseRepository builds self._qs automatically.
    """

    model = Invoice

    # ── List queries ──────────────────────────────────────────────────────────

    def list(
        self,
        status: str | None = None,
        finance_status: str | None = None,
        customer_id: int | None = None,
        ticket_id: int | None = None,
        fiscal_year_start=None,
        fiscal_year_end=None,
    ):
        """
        Return a filtered queryset for the invoice list endpoint.
        All filters are optional — no filter → all tenant invoices.
        """
        qs = (
            self._qs
            .select_related("customer", "ticket", "project", "created_by")
            .annotate(amount_paid_sum=_AMOUNT_PAID_ANNOTATION)
            .order_by("-created_at")
        )
        if status:
            qs = qs.filter(status=status)
        if finance_status:
            qs = qs.filter(finance_status=finance_status)
        if customer_id:
            qs = qs.filter(customer_id=customer_id)
        if ticket_id:
            qs = qs.filter(ticket_id=ticket_id)
        if fiscal_year_start and fiscal_year_end:
            from django.db.models import Q
            # Prefer the explicit `date` field; fall back to created_at::date for
            # legacy invoices created before migration 0017 added the date column.
            qs = qs.filter(
                Q(date__gte=fiscal_year_start, date__lte=fiscal_year_end) |
                Q(date__isnull=True,
                  created_at__date__gte=fiscal_year_start,
                  created_at__date__lte=fiscal_year_end)
            )
        return qs

    def get_with_relations(self, pk: int) -> Invoice | None:
        """Fetch single invoice with all related objects pre-loaded."""
        return (
            self._qs
            .filter(pk=pk)
            .select_related("customer", "ticket", "project", "created_by")
            .annotate(amount_paid_sum=_AMOUNT_PAID_ANNOTATION)
            .prefetch_related("payments")
            .first()
        )

    def get_active_for_ticket(self, ticket_id: int) -> Invoice | None:
        """Return the active (non-voided) invoice for a ticket, or None."""
        return (
            self._qs
            .filter(ticket_id=ticket_id)
            .exclude(status=Invoice.STATUS_VOID)
            .first()
        )

    def pending_finance_review(self):
        """Invoices submitted for finance review, not yet approved/rejected."""
        return (
            self._qs
            .filter(finance_status="submitted")
            .select_related("customer", "ticket", "created_by")
            .order_by("created_at")
        )
