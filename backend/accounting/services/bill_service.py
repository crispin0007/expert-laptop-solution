"""
accounting/services/bill_service.py

All business logic for supplier Bill lifecycle — mirrors InvoiceService in structure.
VAT computation, state transitions, and payment recording live here.
"""
import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
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

    def _compute_totals(self, line_items, discount=Decimal('0'), apply_vat=True) -> dict:
        vat_rate = (
            self.tenant.vat_rate if self.tenant and self.tenant.vat_enabled and apply_vat
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
            # Use the supplier's invoice date (date field) for fiscal year placement.
            # Fall back to created_at for legacy records where date is NULL.
            qs = qs.filter(
                Q(date__gte=fiscal_year_start, date__lte=fiscal_year_end)
                | Q(date__isnull=True,
                    created_at__date__gte=fiscal_year_start,
                    created_at__date__lte=fiscal_year_end)
            )
        return qs.order_by('-created_at')

    # ── Create / update / delete ──────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        from accounting.models import Bill
        apply_vat  = validated_data.pop('apply_vat', True)
        line_items = validated_data.get('line_items', [])
        discount   = validated_data.get('discount', Decimal('0'))
        totals     = self._compute_totals(line_items, discount, apply_vat=apply_vat)
        bill = Bill.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            line_items=line_items,
            **{k: v for k, v in validated_data.items() if k not in ('line_items',)},
            **totals,
        )
        logger.info("Bill created id=%s tenant=%s", bill.pk, self.tenant.slug)
        try:
            from core.events import EventBus
            EventBus.publish('invoice.created', {
                'id': bill.pk,
                'tenant_id': self.tenant.id,
                'total': str(bill.total),
                'type': 'bill',
            }, tenant=self.tenant)
        except Exception as exc:
            logger.warning('EventBus.publish invoice.created failed for bill %s: %s', bill.pk, exc, exc_info=True)
        return bill

    @transaction.atomic
    def update(self, instance, validated_data: dict, is_admin: bool = False):
        """Update a draft bill and recompute VAT totals."""
        from accounting.models import Bill
        if instance.status != Bill.STATUS_DRAFT and not is_admin:
            raise ConflictError(
                'Only draft bills can be edited. Ask an admin to override.'
            )
        apply_vat  = validated_data.pop('apply_vat', True)
        line_items = validated_data.get('line_items', instance.line_items)
        discount   = validated_data.get('discount', instance.discount)
        totals     = self._compute_totals(line_items, discount, apply_vat=apply_vat)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        for field, value in totals.items():
            setattr(instance, field, value)
        update_fields = list(validated_data.keys()) + list(totals.keys()) + ['updated_at']
        instance.save(update_fields=update_fields)
        return instance

    def delete(self, instance):
        instance.delete()

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def approve(self, bill):
        from accounting.models import Bill
        # Re-fetch with row lock to prevent concurrent double-approve.
        bill = Bill.objects.select_for_update().get(pk=bill.pk)
        if bill.status != Bill.STATUS_DRAFT:
            raise ConflictError('Only draft bills can be approved.')
        bill.status      = Bill.STATUS_APPROVED
        bill.approved_at = timezone.now()
        bill.save(update_fields=['status', 'approved_at', 'updated_at'])
        try:
            from core.events import EventBus
            EventBus.publish('invoice.sent', {
                'id': bill.pk,
                'tenant_id': self.tenant.id,
                'total': str(bill.total),
                'type': 'bill',
            }, tenant=self.tenant)
        except Exception as exc:
            logger.warning('EventBus.publish invoice.sent failed for bill %s: %s', bill.pk, exc, exc_info=True)
        return bill

    @transaction.atomic
    def void(self, bill):
        from accounting.models import Bill
        # Re-fetch with row lock to prevent concurrent state changes.
        bill = Bill.objects.select_for_update().get(pk=bill.pk)
        if bill.status == Bill.STATUS_VOID:
            raise ConflictError('Already voided.')
        if bill.status == Bill.STATUS_PAID:
            raise ConflictError(
                'Paid bills cannot be voided. '
                'Create a debit note or reverse the payment instead.'
            )
        bill.status = Bill.STATUS_VOID
        bill.save(update_fields=['status', 'updated_at'])
        return bill

    @transaction.atomic
    def mark_paid(self, bill, method: str, bank_account_id=None):
        """
        Mark an approved bill as paid and record the outgoing payment.
        Returns (bill, Payment | None).
        """
        from accounting.models import Bill, BankAccount, Payment
        from accounting.services.payment_service import record_payment

        # Re-fetch with row lock to prevent concurrent double-payment.
        bill = Bill.objects.select_for_update().get(pk=bill.pk)
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
            bill.save(update_fields=['status', 'paid_at', 'updated_at'])

        bill.refresh_from_db()
        logger.info("Bill %s marked paid. payment=%s", bill.pk, payment and payment.pk)
        return bill, payment

    # ── PO-linked auto-creation (Odoo-style) ─────────────────────────────────

    @classmethod
    @transaction.atomic
    def create_from_po_payload(cls, tenant, payload: dict):
        """Odoo-style: one Bill per PO, accumulated across partial receipts.

        Called by the accounting listener — no direct import of inventory models.
        All data arrives via the payload dict so this stays fully decoupled.

        Rules:
        - If a DRAFT bill already exists for this PO → merge new lines into it
          (increment qty on existing lines, append genuinely new products).
        - If no draft exists (first receive, or prior bill already approved/paid)
          → create a fresh draft Bill.

        This mirrors Odoo behaviour: a single vendor bill accumulates all
        partial-delivery quantities until the accountant approves it.  Once
        approved, the next receive starts a new bill for that batch.

        payload keys (see receive_purchase_order() in inventory/services.py):
            id           — PurchaseOrder pk
            tenant_id    — tenant pk (already validated by EventBus)
            supplier_id  — Supplier pk (may be null)
            supplier_name — display name fallback
            po_number    — Human-readable PO reference
            lines        — list of {product_name, quantity, unit_cost}
        """
        from accounting.models import Bill

        po_id         = payload['id']
        supplier_id   = payload.get('supplier_id')
        po_number     = payload.get('po_number', f'PO-{po_id}')
        lines         = payload.get('lines', [])

        if not lines:
            logger.warning('create_from_po_payload: no lines in payload for PO %s — skipping', po_id)
            return None

        new_line_items = [
            {
                'description': line['product_name'],
                'qty': line['quantity'],
                'unit_price': str(line['unit_cost']),
                'discount': '0',
            }
            for line in lines
        ]

        service = cls(tenant=tenant)

        # ── Check for an existing draft bill for this PO ──────────────────────
        existing_draft = (
            Bill.objects.select_for_update()
            .filter(tenant=tenant, purchase_order_id=po_id, status=Bill.STATUS_DRAFT)
            .first()
        )

        if existing_draft:
            # Merge: accumulate quantities on matching lines, append new products.
            merged = _merge_line_items(existing_draft.line_items, new_line_items)
            service.update(existing_draft, {'line_items': merged, 'apply_vat': False}, is_admin=True)
            logger.info(
                'Merged receive batch into existing draft Bill %s for PO %s',
                existing_draft.bill_number, po_number,
            )
            return existing_draft

        # ── No draft exists — create a fresh bill ────────────────────────────
        bill = service.create({
            'supplier_id': supplier_id,
            'supplier_name': payload.get('supplier_name', ''),
            'reference': po_number,
            'line_items': new_line_items,
            'notes': f'Auto-created from Purchase Order {po_number}.',
            'apply_vat': False,   # Staff reviews VAT applicability before approving
        })
        Bill.objects.filter(pk=bill.pk).update(purchase_order_id=po_id)
        bill.purchase_order_id = po_id
        logger.info('Auto-created draft Bill %s from PO %s', bill.bill_number, po_number)
        return bill


def _merge_line_items(existing: list, incoming: list) -> list:
    """Merge incoming line items into an existing list.

    Lines with matching ``description`` have their ``qty`` incremented.
    Genuinely new products are appended.  Returns a new list (does not
    mutate either argument).
    """
    merged = {item['description']: dict(item) for item in existing}
    for item in incoming:
        key = item['description']
        if key in merged:
            merged[key]['qty'] = int(merged[key]['qty']) + int(item['qty'])
        else:
            merged[key] = dict(item)
    return list(merged.values())
