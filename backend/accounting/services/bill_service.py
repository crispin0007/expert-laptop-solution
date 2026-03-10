"""
accounting/services/bill_service.py

All business logic for supplier Bill lifecycle — mirrors InvoiceService in structure.
VAT computation, state transitions, and payment recording live here.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.exceptions import (
    NotFoundError, ValidationError, ConflictError,
)
from accounting.services.invoice_service import compute_invoice_totals

logger = logging.getLogger(__name__)


class BillService:
    """Business logic for Bill (supplier expense) lifecycle."""

    def __init__(self, tenant, user=None):
        self.tenant = tenant
        self.user = user

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _compute_totals(self, line_items, discount=Decimal('0')) -> dict:
        vat_rate = (
            self.tenant.vat_rate if self.tenant and self.tenant.vat_enabled
            else Decimal('0')
        )
        subtotal, vat_amount, total = compute_invoice_totals(line_items, discount, vat_rate)
        return dict(subtotal=subtotal, vat_rate=vat_rate, vat_amount=vat_amount, total=total)

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(self, status=None, fiscal_year_start=None, fiscal_year_end=None):
        from accounting.models import Bill
        qs = (
            Bill.objects.filter(tenant=self.tenant)
            .select_related('supplier')
        )
        if status:
            qs = qs.filter(status=status)
        if fiscal_year_start and fiscal_year_end:
            qs = qs.filter(
                created_at__date__gte=fiscal_year_start,
                created_at__date__lte=fiscal_year_end,
            )
        return qs.order_by('-created_at')

    # ── Create / update / delete ──────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        from accounting.models import Bill
        line_items = validated_data.get('line_items', [])
        discount   = validated_data.get('discount', Decimal('0'))
        totals     = self._compute_totals(line_items, discount)
        bill = Bill.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            line_items=line_items,
            **{k: v for k, v in validated_data.items() if k not in ('line_items',)},
            **totals,
        )
        logger.info("Bill created id=%s tenant=%s", bill.pk, self.tenant.slug)
        return bill

    @transaction.atomic
    def update(self, instance, validated_data: dict, is_admin: bool = False):
        """Update a draft bill and recompute VAT totals."""
        from accounting.models import Bill
        if instance.status != Bill.STATUS_DRAFT and not is_admin:
            raise ConflictError(
                'Only draft bills can be edited. Ask an admin to override.'
            )
        line_items = validated_data.get('line_items', instance.line_items)
        discount   = validated_data.get('discount', instance.discount)
        totals     = self._compute_totals(line_items, discount)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        for field, value in totals.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def delete(self, instance):
        instance.delete()

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def approve(self, bill):
        from accounting.models import Bill
        if bill.status != Bill.STATUS_DRAFT:
            raise ConflictError('Only draft bills can be approved.')
        bill.status      = Bill.STATUS_APPROVED
        bill.approved_at = timezone.now()
        bill.save(update_fields=['status', 'approved_at'])
        return bill

    @transaction.atomic
    def void(self, bill):
        from accounting.models import Bill
        if bill.status == Bill.STATUS_VOID:
            raise ConflictError('Already voided.')
        if bill.status == Bill.STATUS_PAID:
            raise ConflictError(
                'Paid bills cannot be voided. '
                'Create a debit note or reverse the payment instead.'
            )
        bill.status = Bill.STATUS_VOID
        bill.save(update_fields=['status'])
        return bill

    @transaction.atomic
    def mark_paid(self, bill, method: str, bank_account_id=None):
        """
        Mark an approved bill as paid and record the outgoing payment.
        Returns (bill, Payment | None).
        """
        from accounting.models import Bill, BankAccount, Payment
        from accounting.services.payment_service import record_payment

        if bill.status != Bill.STATUS_APPROVED:
            raise ConflictError('Only approved bills can be marked as paid.')

        if method not in dict(Payment.METHOD_CHOICES):
            method = Payment.METHOD_CASH

        bank_account = None
        if bank_account_id:
            try:
                bank_account = BankAccount.objects.get(pk=bank_account_id, tenant=self.tenant)
            except BankAccount.DoesNotExist:
                raise NotFoundError('Bank account not found.')

        if method != Payment.METHOD_CASH and not bank_account:
            raise ValidationError('bank_account is required for non-cash payment methods.')

        amount_due = bill.amount_due
        payment = None
        if amount_due > Decimal('0'):
            payment = record_payment(
                tenant=self.tenant,
                created_by=self.user,
                payment_type=Payment.TYPE_OUTGOING,
                method=method,
                amount=amount_due,
                date=timezone.localdate(),
                bill=bill,
                bank_account=bank_account,
                reference=bill.bill_number,
                notes=f'Bill payment via {method}.',
            )
        else:
            bill.status  = Bill.STATUS_PAID
            bill.paid_at = timezone.now()
            bill.save(update_fields=['status', 'paid_at'])

        bill.refresh_from_db()
        logger.info("Bill %s marked paid. payment=%s", bill.pk, payment and payment.pk)
        return bill, payment
