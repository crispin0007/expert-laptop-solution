"""
accounting/services/credit_note_service.py

All business logic for CreditNote lifecycle.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.exceptions import NotFoundError, ValidationError, ConflictError
from accounting.services.invoice_service import compute_invoice_totals

logger = logging.getLogger(__name__)


class CreditNoteService:
    """Business logic for CreditNote lifecycle."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _compute_totals(self, line_items) -> dict:
        vat_rate = (
            self.tenant.vat_rate if self.tenant and self.tenant.vat_enabled
            else Decimal('0')
        )
        subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)
        return dict(subtotal=subtotal, vat_amount=vat_amount, total=total)

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(self, fiscal_year_start=None, fiscal_year_end=None):
        from accounting.models import CreditNote
        from django.db.models import Q
        qs = (
            CreditNote.objects.filter(tenant=self.tenant)
            .select_related('invoice', 'applied_to')
        )
        if fiscal_year_start and fiscal_year_end:
            # Prefer issued_at for fiscal placement; fall back to created_at for legacy drafts.
            qs = qs.filter(
                Q(issued_at__date__gte=fiscal_year_start, issued_at__date__lte=fiscal_year_end)
                | Q(issued_at__isnull=True,
                    created_at__date__gte=fiscal_year_start,
                    created_at__date__lte=fiscal_year_end)
            )
        return qs.order_by('-created_at')

    # ── Create / update / delete ──────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        from accounting.models import CreditNote
        line_items = validated_data.get('line_items', [])
        totals     = self._compute_totals(line_items)
        cn = CreditNote.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            **validated_data,
            **totals,
        )
        logger.info("CreditNote created id=%s tenant=%s", cn.pk, self.tenant.slug)
        return cn

    @transaction.atomic
    def update(self, instance, validated_data: dict):
        """Recompute totals on PATCH/PUT. Only draft credit notes may be edited."""
        from accounting.models import CreditNote
        if instance.status != CreditNote.STATUS_DRAFT:
            raise ConflictError('Only draft credit notes can be edited.')
        line_items = validated_data.get('line_items', instance.line_items)
        totals     = self._compute_totals(line_items)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        for field, value in totals.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def delete(self, instance):
        """Only draft credit notes may be deleted (others must be voided)."""
        from accounting.models import CreditNote
        if instance.status != CreditNote.STATUS_DRAFT:
            raise ConflictError(
                'Only draft credit notes can be deleted. Void instead.'
            )
        instance.delete()

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def issue(self, credit_note):
        from accounting.models import CreditNote
        if credit_note.status != CreditNote.STATUS_DRAFT:
            raise ConflictError('Only draft credit notes can be issued.')
        credit_note.status    = CreditNote.STATUS_ISSUED
        credit_note.issued_at = timezone.now()
        credit_note.save(update_fields=['status', 'issued_at', 'credit_note_number'])
        return credit_note

    @transaction.atomic
    def apply(self, credit_note, invoice_id: int):
        """
        Apply an issued credit note to an invoice.
        Delegates to the standalone apply_credit_note service function.
        """
        from accounting.models import Invoice
        from accounting.services.invoice_service import apply_credit_note

        try:
            target = Invoice.objects.get(pk=invoice_id, tenant=self.tenant)
        except Invoice.DoesNotExist:
            raise NotFoundError('Invoice not found.')

        try:
            apply_credit_note(credit_note, target, created_by=self.user)
        except ValueError as exc:
            raise ValidationError(str(exc))

        return credit_note

    @transaction.atomic
    def void(self, credit_note):
        from accounting.models import CreditNote
        if credit_note.status == CreditNote.STATUS_VOID:
            raise ConflictError('Already voided.')
        credit_note.status = CreditNote.STATUS_VOID
        credit_note.save(update_fields=['status'])
        return credit_note
