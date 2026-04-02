"""
invoice_service.py
==================
Business logic for Invoice lifecycle.

Contains:
- Standalone functions (kept for backward compatibility).
- InvoiceService class — the canonical entry point for all invoice operations.
  Viewsets call methods on this class; the class uses InvoiceRepository for
  all data access and raises AppException subclasses for domain errors.
"""
import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


def compute_invoice_totals(line_items, discount, vat_rate):
    """
    Return (subtotal, vat_amount, total).

    line_items: list of dicts with unit_price, qty, and discount keys.
      - discount per line is a PERCENTAGE (0–100), e.g. 10 means 10% off.
    discount: document-level absolute discount deducted from the sum of line totals.
    vat_rate: e.g. Decimal('0.13') for 13% Nepal VAT.
    """
    try:
        per_line_sum = sum(
            Decimal(str(item.get('unit_price', 0)))
            * Decimal(str(item.get('qty', 1)))
            * (1 - Decimal(str(item.get('discount', 0))) / 100)
            for item in line_items
        )
    except Exception as exc:
        raise ValueError(
            f"Invalid numeric value in line items — unit_price, qty, and discount "
            f"must all be numbers. Detail: {exc}"
        ) from exc
    subtotal   = max(per_line_sum - Decimal(str(discount)), Decimal('0'))
    vat_amount = (subtotal * Decimal(str(vat_rate))).quantize(Decimal('0.01'))
    total      = subtotal + vat_amount
    return subtotal, vat_amount, total


def generate_from_ticket(ticket, tenant, due_date=None, notes='', created_by=None):
    """
    Auto-build a DRAFT Invoice from a ticket's service charge and/or products.
    Delegates to ticket_invoice_service.generate_ticket_invoice.
    Returns the created Invoice instance.
    """
    from accounting.services.ticket_invoice_service import generate_ticket_invoice
    return generate_ticket_invoice(
        ticket, tenant,
        due_date=due_date,
        notes=notes,
        created_by=created_by,
    )


def generate_pdf_bytes(invoice):
    """
    Render invoice as PDF bytes using weasyprint.
    Falls back to plain bytes if weasyprint not available.
    """
    try:
        from weasyprint import HTML
        from django.template.loader import render_to_string
    except ImportError:
        return b"%PDF stub - install weasyprint"

    html_string = render_to_string(
        'accounting/invoice_pdf.html',
        {'invoice': invoice, 'tenant': invoice.tenant},
    )
    return HTML(string=html_string).write_pdf()


def apply_credit_note(credit_note, target_invoice, created_by=None):
    """
    Apply an issued credit note to a target invoice.
    Creates a Payment record of method='credit_note' for the amount.
    Marks the credit_note as applied.
    """
    from accounting.models import Payment
    from django.utils import timezone as tz

    if credit_note.status != 'issued':
        raise ValueError("Only issued credit notes can be applied.")
    if target_invoice.status not in ('issued', 'paid'):
        raise ValueError("Credit note can only be applied to issued or paid invoices.")

    payment = Payment.objects.create(
        tenant=credit_note.tenant,
        created_by=created_by,
        date=tz.localdate(),
        type=Payment.TYPE_INCOMING,
        method=Payment.METHOD_CREDIT_NOTE,
        amount=credit_note.total,
        invoice=target_invoice,
        reference=credit_note.credit_note_number,
        notes=f"Credit note {credit_note.credit_note_number} applied",
    )

    credit_note.status = 'applied'
    credit_note.applied_to = target_invoice
    credit_note.save(update_fields=['status', 'applied_to'])

    # Auto-mark invoice paid if fully settled
    if target_invoice.amount_due <= Decimal('0'):
        target_invoice.status = 'paid'
        target_invoice.paid_at = tz.now()
        target_invoice.save(update_fields=['status', 'paid_at'])

    return payment


# ─────────────────────────────────────────────────────────────────────────────
# InvoiceService — class-based, used by InvoiceViewSet via NexusViewSet
# ─────────────────────────────────────────────────────────────────────────────

class InvoiceService:
    """
    Single source of truth for invoice business logic.

    Rules:
    - All invoice state transitions go through methods here.
    - Raise core.exceptions.AppException subclasses — never raise bare Exception
      or return Response objects.
    - Multi-step DB writes are wrapped in @transaction.atomic.
    - All data access goes through self.repo (InvoiceRepository).
    - Never read request.* here — receive plain data from views.

    Instantiated per-request by NexusViewSet.get_service()::

        service = InvoiceService(tenant=request.tenant, user=request.user)
    """

    def __init__(self, tenant, user=None):
        from accounting.repositories.invoice_repo import InvoiceRepository
        self.tenant = tenant
        self.user = user
        self.repo = InvoiceRepository(tenant=tenant)

    # ── Queries ───────────────────────────────────────────────────────────────

    def list(
        self,
        status=None,
        finance_status=None,
        customer_id=None,
        ticket_id=None,
        fiscal_year_start=None,
        fiscal_year_end=None,
    ):
        return self.repo.list(
            status=status,
            finance_status=finance_status,
            customer_id=customer_id,
            ticket_id=ticket_id,
            fiscal_year_start=fiscal_year_start,
            fiscal_year_end=fiscal_year_end,
        )

    def get_or_404(self, pk: int):
        from core.exceptions import NotFoundError
        inv = self.repo.get_with_relations(pk)
        if not inv:
            raise NotFoundError("Invoice not found")
        return inv

    def pending_finance_review(self):
        return self.repo.pending_finance_review()

    # ── Compute helpers ───────────────────────────────────────────────────────

    def _compute_totals_kwargs(self, line_items, discount=Decimal('0'), apply_vat=True) -> dict:
        """Return dict of subtotal/vat_rate/vat_amount/total ready to save."""
        t = self.tenant
        vat_rate = (t.vat_rate if t and t.vat_enabled else Decimal('0')) if apply_vat else Decimal('0')
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, discount, vat_rate
        )
        return dict(
            subtotal=subtotal,
            vat_rate=vat_rate,
            vat_amount=vat_amount,
            total=total,
        )

    # ── Create / update ───────────────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        """Create a draft invoice with computed totals."""
        from accounting.models import Invoice
        line_items = validated_data.get('line_items', [])
        discount = validated_data.get('discount', Decimal('0'))
        apply_vat = validated_data.pop('apply_vat', True)
        totals = self._compute_totals_kwargs(line_items, discount, apply_vat=apply_vat)
        instance = Invoice.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            line_items=line_items,
            **{k: v for k, v in validated_data.items()
               if k not in ('line_items',)},
            **totals,
        )
        logger.info("Invoice created id=%s tenant=%s", instance.pk, self.tenant.slug)
        try:
            from core.events import EventBus
            EventBus.publish('invoice.created', {
                'id': instance.pk,
                'tenant_id': self.tenant.id,
                'customer_id': instance.customer_id,
                'total': str(instance.total),
            }, tenant=self.tenant)
        except Exception:
            pass
        return instance

    @transaction.atomic
    def update(self, instance, validated_data: dict):
        """
        Update invoice fields. Only draft invoices can be edited unless the
        calling user is admin (checked in the view via get_permissions).
        Re-computes VAT totals whenever line_items or discount change.
        """
        from core.exceptions import InvoiceStateError
        from accounting.models import Invoice

        if instance.status != Invoice.STATUS_DRAFT:
            raise InvoiceStateError(
                "Only draft invoices can be edited. "
                "Ask an admin to override."
            )
        line_items = validated_data.get('line_items', instance.line_items)
        discount = validated_data.get('discount', instance.discount)
        totals = self._compute_totals_kwargs(line_items, discount)

        for field, value in validated_data.items():
            setattr(instance, field, value)
        for field, value in totals.items():
            setattr(instance, field, value)

        update_fields = list(validated_data.keys()) + list(totals.keys()) + ['updated_at']
        instance.save(update_fields=list(set(update_fields)))
        return instance

    def delete(self, instance):
        """Hard-delete — admin only (enforced by view permissions)."""
        instance.delete()

    # ── State transitions ─────────────────────────────────────────────────────

    @transaction.atomic
    def generate_issued(self, validated_data: dict):
        """Create an invoice and immediately issue it (skip draft step)."""
        from accounting.models import Invoice
        line_items = validated_data.get('line_items', [])
        discount = validated_data.get('discount', Decimal('0'))
        totals = self._compute_totals_kwargs(line_items, discount)
        instance = Invoice.objects.create(
            tenant=self.tenant,
            created_by=self.user,
            status=Invoice.STATUS_ISSUED,
            line_items=line_items,
            **{k: v for k, v in validated_data.items()
               if k not in ('line_items',)},
            **totals,
        )
        logger.info("Invoice generated+issued id=%s tenant=%s", instance.pk, self.tenant.slug)
        try:
            from core.events import EventBus
            EventBus.publish('invoice.sent', {
                'id': instance.pk,
                'tenant_id': self.tenant.id,
                'customer_id': instance.customer_id,
                'total': str(instance.total),
            }, tenant=self.tenant)
        except Exception:
            pass
        return instance

    @transaction.atomic
    def issue(self, invoice):
        """Move a draft invoice to issued status."""
        from core.exceptions import InvoiceStateError
        from accounting.models import Invoice
        if invoice.status != Invoice.STATUS_DRAFT:
            raise InvoiceStateError("Only draft invoices can be issued.")
        invoice.status = Invoice.STATUS_ISSUED
        invoice.save(update_fields=['status', 'updated_at'])
        logger.info("Invoice issued id=%s tenant=%s", invoice.pk, self.tenant.slug)
        try:
            from core.events import EventBus
            EventBus.publish('invoice.sent', {
                'id': invoice.pk,
                'tenant_id': self.tenant.id,
                'customer_id': invoice.customer_id,
                'total': str(invoice.total),
            }, tenant=self.tenant)
        except Exception:
            pass
        return invoice

    @transaction.atomic
    def mark_paid(self, invoice, method: str, bank_account_id: int | None = None):
        """
        Mark an invoice as paid, creating a Payment record for the outstanding balance.
        Raises InvoiceStateError if the invoice is not in issued state.
        Raises ValidationError if bank_account required but missing.
        """
        from core.exceptions import InvoiceStateError, ValidationError
        from accounting.models import Invoice, Payment, BankAccount
        from accounting.services.payment_service import record_payment

        if invoice.status != Invoice.STATUS_ISSUED:
            raise InvoiceStateError(
                "Only issued invoices can be marked as paid. Issue the invoice first."
            )
        if method not in dict(Payment.METHOD_CHOICES):
            method = Payment.METHOD_CASH

        bank_account = None
        if bank_account_id:
            bank_account = BankAccount.objects.filter(
                pk=bank_account_id, tenant=self.tenant
            ).first()
            if not bank_account:
                raise ValidationError("Bank account not found.")

        if method != Payment.METHOD_CASH and not bank_account:
            raise ValidationError("bank_account is required for non-cash payment methods.")

        amount_due = invoice.amount_due
        payment = None
        if amount_due > Decimal('0'):
            payment = record_payment(
                tenant=self.tenant,
                created_by=self.user,
                payment_type=Payment.TYPE_INCOMING,
                method=method,
                amount=amount_due,
                date=timezone.localdate(),
                invoice=invoice,
                bank_account=bank_account,
                reference=invoice.invoice_number,
                notes=f'Invoice payment via {method}.',
            )
        else:
            invoice.status = Invoice.STATUS_PAID
            invoice.paid_at = timezone.now()
            invoice.save(update_fields=['status', 'paid_at', 'updated_at'])

        invoice.refresh_from_db()
        logger.info("Invoice marked paid id=%s tenant=%s", invoice.pk, self.tenant.slug)
        return invoice, payment

    @transaction.atomic
    def void(self, invoice):
        """Void an invoice. Raises InvoiceStateError for paid invoices."""
        from core.exceptions import InvoiceStateError
        from accounting.models import Invoice

        if invoice.status == Invoice.STATUS_VOID:
            raise InvoiceStateError("Invoice is already voided.")
        if invoice.status == Invoice.STATUS_PAID:
            raise InvoiceStateError(
                "Paid invoices cannot be voided. "
                "Create a credit note or refund payment instead."
            )
        invoice.status = Invoice.STATUS_VOID
        invoice.save(update_fields=['status', 'updated_at'])
        logger.info("Invoice voided id=%s tenant=%s", invoice.pk, self.tenant.slug)
        try:
            from core.events import EventBus
            EventBus.publish('invoice.cancelled', {
                'id': invoice.pk,
                'tenant_id': self.tenant.id,
                'customer_id': invoice.customer_id,
            }, tenant=self.tenant)
        except Exception:
            pass
        return invoice

    @transaction.atomic
    def invoice_from_ticket(self, ticket_id: int, due_date=None, notes: str = '',
                            service_charge=None):
        """Generate a draft invoice from a ticket's service + products.

        If service_charge is provided (not None), it is saved onto the ticket
        before the invoice is built so the value is persisted and reflected
        in the service line item.
        """
        from decimal import Decimal
        from core.exceptions import NotFoundError, ValidationError
        from tickets.models import Ticket
        from accounting.services.ticket_invoice_service import generate_ticket_invoice

        try:
            ticket = Ticket.objects.get(pk=ticket_id, tenant=self.tenant)
        except Ticket.DoesNotExist:
            raise NotFoundError("Ticket not found.")

        if service_charge is not None:
            try:
                ticket.service_charge = Decimal(str(service_charge))
                ticket.save(update_fields=['service_charge', 'updated_at'])
            except Exception:
                raise ValidationError('service_charge must be a valid decimal number.')

        try:
            invoice = generate_ticket_invoice(
                ticket, self.tenant,
                due_date=due_date,
                notes=notes,
                created_by=self.user,
            )
        except ValueError as e:
            raise ValidationError(str(e))

        return invoice

    @transaction.atomic
    def collect_payment(self, invoice, method: str, amount, bank_account_id=None,
                        reference: str = '', notes: str = ''):
        """Staff records a customer payment on-site."""
        from core.exceptions import ValidationError
        from accounting.services.ticket_invoice_service import submit_invoice_payment
        from accounting.models import BankAccount

        if not method:
            raise ValidationError('"method" is required (cash/bank_transfer/…).')
        if not amount:
            raise ValidationError('"amount" is required.')

        bank_account = None
        if bank_account_id:
            bank_account = BankAccount.objects.filter(
                pk=bank_account_id, tenant=self.tenant
            ).first()
            if not bank_account:
                raise ValidationError("Bank account not found.")

        try:
            submit_invoice_payment(
                invoice=invoice,
                collected_by=self.user,
                method=method,
                amount=amount,
                bank_account=bank_account,
                reference=reference,
                notes=notes,
            )
        except ValueError as e:
            raise ValidationError(str(e))

        invoice.refresh_from_db()
        return invoice

    @transaction.atomic
    def finance_review(self, invoice, action: str, notes: str = ''):
        """Finance approves or rejects a submitted invoice."""
        from core.exceptions import ValidationError
        from accounting.services.ticket_invoice_service import (
            finance_approve_invoice,
            finance_reject_invoice,
        )

        if action not in ('approve', 'reject'):
            raise ValidationError('"action" must be "approve" or "reject".')

        try:
            if action == 'approve':
                finance_approve_invoice(invoice, self.user, notes)
            else:
                finance_reject_invoice(invoice, self.user, notes)
        except ValueError as e:
            raise ValidationError(str(e))  # noqa: B904

        invoice.refresh_from_db()
        return invoice

    def send_email(self, invoice):
        """Email the PDF invoice to the customer."""
        from core.exceptions import ValidationError, ServiceUnavailableError
        from notifications.service import send_invoice_email

        if not invoice.customer or not invoice.customer.email:
            raise ValidationError("Customer has no email address.")

        try:
            send_invoice_email(invoice)
        except Exception as exc:
            logger.error(
                "Invoice email failed for invoice %s: %s", invoice.pk, exc, exc_info=True
            )
            raise ServiceUnavailableError(
                "Failed to send invoice email. Check server logs or contact support."
            ) from exc

    def get_pdf_bytes(self, invoice) -> bytes:
        """Render and return PDF bytes for the invoice."""
        return generate_pdf_bytes(invoice)
