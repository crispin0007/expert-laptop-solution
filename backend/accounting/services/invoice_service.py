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


def _safe_decimal(value, default='0') -> Decimal:
    """Parse unknown numeric input to Decimal safely for invoice rendering."""
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _int_to_words(n: int) -> str:
    """Convert an integer in range 0..999,999,999 to English words."""
    if n == 0:
        return 'zero'

    ones = [
        '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
        'seventeen', 'eighteen', 'nineteen',
    ]
    tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

    def _under_thousand(x: int) -> str:
        parts = []
        if x >= 100:
            parts.append(f"{ones[x // 100]} hundred")
            x %= 100
        if x >= 20:
            parts.append(tens[x // 10])
            if x % 10:
                parts.append(ones[x % 10])
        elif x > 0:
            parts.append(ones[x])
        return ' '.join(parts)

    scales = [
        (1_000_000_000, 'billion'),
        (1_000_000, 'million'),
        (1_000, 'thousand'),
        (1, ''),
    ]

    parts = []
    remain = n
    for divisor, label in scales:
        chunk = remain // divisor
        if chunk:
            words = _under_thousand(chunk)
            parts.append(f"{words} {label}".strip())
            remain %= divisor
    return ' '.join(parts)


def _currency_amount_to_words(amount: Decimal, currency: str) -> str:
    """Return currency amount in words, e.g. 'NPR one hundred rupees and ten paisa only'."""
    quantized = _safe_decimal(amount).quantize(Decimal('0.01'))
    whole = int(quantized)
    fraction = int((quantized - Decimal(whole)) * 100)
    whole_words = _int_to_words(whole)
    fraction_words = _int_to_words(fraction) if fraction else ''

    if currency.upper() == 'NPR':
        base_unit = 'rupees'
        sub_unit = 'paisa'
    else:
        base_unit = currency.lower()
        sub_unit = 'cents'

    if fraction:
        return f"{currency.upper()} {whole_words} {base_unit} and {fraction_words} {sub_unit} only"
    return f"{currency.upper()} {whole_words} {base_unit} only"


def _invoice_line_rows(invoice) -> list[dict]:
    """Normalize invoice lines for predictable PDF rendering."""
    rows = []
    for idx, raw in enumerate(invoice.line_items or [], start=1):
        qty = _safe_decimal(raw.get('qty') or raw.get('quantity') or 1, default='1')
        unit_price = _safe_decimal(raw.get('unit_price') or 0)
        discount_pct = _safe_decimal(raw.get('discount') or 0)

        computed_total = qty * unit_price * (Decimal('1') - (discount_pct / Decimal('100')))
        line_total = _safe_decimal(raw.get('total'), default=str(computed_total))
        if line_total < 0:
            line_total = Decimal('0')

        rows.append({
            'sn': idx,
            'description': raw.get('description') or raw.get('name') or 'Item',
            'notes': raw.get('notes') or '',
            'qty': qty,
            'unit_price': unit_price,
            'discount_pct': discount_pct,
            'line_total': line_total.quantize(Decimal('0.01')),
        })
    return rows


def _customer_address_lines(invoice) -> list[str]:
    """Build bill-to address lines from customer profile fields with fallback."""
    customer = getattr(invoice, 'customer', None)
    if not customer:
        return [invoice.bill_address] if invoice.bill_address else []

    lines = []
    locality_parts = [
        customer.street,
        f"Ward {customer.ward_no}" if customer.ward_no else '',
        customer.municipality,
        customer.district,
        customer.province,
    ]
    locality = ', '.join([p for p in locality_parts if p])
    if locality:
        lines.append(locality)

    if customer.email:
        lines.append(customer.email)
    if customer.phone:
        lines.append(customer.phone)

    if not lines and invoice.bill_address:
        lines.append(invoice.bill_address)
    return lines


def _bill_to_payload(invoice) -> dict:
    """Resolve bill-to identity from customer/party/invoice fallback fields."""
    if invoice.customer_id and getattr(invoice, 'customer', None):
        customer = invoice.customer
        return {
            'name': customer.name,
            'pan': customer.pan_number or invoice.buyer_pan or '',
            'lines': _customer_address_lines(invoice),
        }

    if invoice.party_id and getattr(invoice, 'party', None):
        party = invoice.party
        lines = []
        if party.email:
            lines.append(party.email)
        if party.phone:
            lines.append(party.phone)
        if invoice.bill_address:
            lines.append(invoice.bill_address)
        return {
            'name': party.name,
            'pan': party.pan_number or invoice.buyer_pan or '',
            'lines': lines,
        }

    return {
        'name': 'Customer',
        'pan': invoice.buyer_pan or '',
        'lines': [invoice.bill_address] if invoice.bill_address else [],
    }


def _snapshot_cost_prices(line_items: list, tenant) -> list:
    """
    B24 — Return a new list of line_items with 'cost_price_snapshot' injected
    for every product line that lacks one.

    The snapshot captures the product's current cost_price at the moment the
    invoice is created.  Later changes to inventory cost (re-stocking at a
    different price) do not affect historical COGS for already-issued invoices.

    If the product doesn't exist or has no cost price, the key is set to '0'
    so create_cogs_journal() can still log the warning correctly.

    This function is intentionally non-destructive: lines without 'product_id'
    or already having 'cost_price_snapshot' are returned unchanged.
    """
    from inventory.models import Product

    product_ids = [
        item.get('product_id')
        for item in line_items
        if item.get('line_type') == 'product'
        and item.get('product_id')
        and 'cost_price_snapshot' not in item
    ]
    if not product_ids:
        return line_items

    # One query for all relevant products
    cost_map = dict(
        Product.objects.filter(pk__in=product_ids, tenant=tenant)
        .values_list('pk', 'cost_price')
    )

    snapped = []
    for item in line_items:
        if (
            item.get('line_type') == 'product'
            and item.get('product_id')
            and 'cost_price_snapshot' not in item
        ):
            pid = item['product_id']
            cost = cost_map.get(pid)
            item = {**item, 'cost_price_snapshot': str(cost) if cost is not None else '0'}
        snapped.append(item)
    return snapped


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
        from django.conf import settings
        from core.nepali_date import ad_to_bs, fiscal_year_label_for
    except ImportError:
        return b"%PDF stub - install weasyprint"

    invoice_date = invoice.date or invoice.created_at.date()
    try:
        invoice_date_bs = ad_to_bs(invoice_date).isoformat()
    except Exception:
        invoice_date_bs = ''
    try:
        invoice_fiscal_label = fiscal_year_label_for(invoice_date)
    except Exception:
        invoice_fiscal_label = ''

    prepared_by_user = getattr(invoice, 'created_by', None)
    prepared_by_name = ''
    if prepared_by_user is not None:
        prepared_by_name = (
            prepared_by_user.get_full_name()
            or getattr(prepared_by_user, 'email', '')
            or getattr(prepared_by_user, 'username', '')
        )

    approved_by_user = getattr(invoice, 'finance_reviewed_by', None) or getattr(invoice, 'payment_received_by', None)
    approved_by_name = ''
    if approved_by_user is not None:
        approved_by_name = (
            approved_by_user.get_full_name()
            or getattr(approved_by_user, 'email', '')
            or getattr(approved_by_user, 'username', '')
        )

    approved_at = (
        getattr(invoice, 'finance_reviewed_at', None)
        or getattr(invoice, 'paid_at', None)
        or getattr(invoice, 'payment_received_at', None)
    )

    period_start = invoice_date
    period_end = invoice.due_date or invoice_date

    context = {
        'invoice': invoice,
        'tenant': invoice.tenant,
        'invoice_date': invoice_date,
        'invoice_date_bs': invoice_date_bs,
        'invoice_fiscal_label': invoice_fiscal_label,
        'line_rows': _invoice_line_rows(invoice),
        'bill_to': _bill_to_payload(invoice),
        'amount_in_words': _currency_amount_to_words(invoice.total, invoice.tenant.currency or 'NPR'),
        'period_start': period_start,
        'period_end': period_end,
        'prepared_by_name': prepared_by_name,
        'prepared_by_at': invoice.created_at,
        'approved_by_name': approved_by_name,
        'approved_by_at': approved_at,
    }

    html_string = render_to_string(
        'accounting/invoice_pdf.html',
        context,
    )
    return HTML(string=html_string, base_url=getattr(settings, 'BASE_DIR', None)).write_pdf()


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
    def _determine_apply_vat(self, validated_data: dict, instance=None) -> bool:
        if 'apply_vat' in validated_data:
            return validated_data.pop('apply_vat')

        if instance is not None:
            return not bool(getattr(instance, 'ticket_id', None) or getattr(instance, 'project_id', None))

        if any(validated_data.get(key) for key in ('ticket', 'ticket_id', 'project', 'project_id')):
            return False

        return True

    def _compute_totals_kwargs(self, line_items, discount=Decimal('0'), apply_vat=True) -> dict:
        """Return dict of subtotal/vat_rate/vat_amount/total ready to save."""
        t = self.tenant
        vat_rate = Decimal('0')
        if apply_vat and t and t.vat_enabled:
            vat_rate = t.vat_rate
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, discount, vat_rate
        )
        return {
            'subtotal': subtotal,
            'vat_rate': vat_rate,
            'vat_amount': vat_amount,
            'total': total,
        }

    # ── Create / update ───────────────────────────────────────────────────────

    @transaction.atomic
    def create(self, validated_data: dict):
        """Create a draft invoice with computed totals."""
        from accounting.models import Invoice
        from customers.models import Customer
        from django.utils import timezone
        line_items = validated_data.get('line_items', [])
        discount = validated_data.get('discount', Decimal('0'))
        apply_vat = self._determine_apply_vat(validated_data)
        totals = self._compute_totals_kwargs(line_items, discount, apply_vat=apply_vat)

        # Voucher date is the accounting source-of-truth; default to today when omitted.
        if validated_data.get('date') is None:
            validated_data['date'] = timezone.localdate()

        if validated_data.get('party_id') is None and validated_data.get('party') is None:
            customer_obj = validated_data.get('customer')
            customer_id = validated_data.get('customer_id')
            if customer_obj is None and customer_id:
                customer_obj = Customer.objects.filter(
                    tenant=self.tenant,
                    pk=customer_id,
                ).only('party_id').first()
            if customer_obj is not None and getattr(customer_obj, 'party_id', None):
                validated_data['party_id'] = customer_obj.party_id

        # B24 — Snapshot cost_price at creation time so COGS is based on the
        # price the tenant paid when the invoice was raised, not the current
        # product cost (which can change after re-stocking at different prices).
        line_items = _snapshot_cost_prices(line_items, self.tenant)

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
        except Exception as exc:
            logger.warning('EventBus.publish invoice.created failed for invoice %s: %s', instance.pk, exc, exc_info=True)
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
        apply_vat = self._determine_apply_vat(validated_data, instance=instance)
        totals = self._compute_totals_kwargs(line_items, discount, apply_vat=apply_vat)

        # B24 — Re-snapshot any product lines that were added or re-submitted
        # during a draft edit and lack a cost_price_snapshot. Lines that already
        # have a snapshot are left unchanged (idempotent).
        line_items = _snapshot_cost_prices(line_items, self.tenant)
        if 'line_items' in validated_data:
            validated_data = {**validated_data, 'line_items': line_items}

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
        from customers.models import Customer
        from django.utils import timezone
        line_items = validated_data.get('line_items', [])
        discount = validated_data.get('discount', Decimal('0'))
        apply_vat = self._determine_apply_vat(validated_data)
        totals = self._compute_totals_kwargs(line_items, discount, apply_vat=apply_vat)

        # Voucher date is the accounting source-of-truth; default to today when omitted.
        if validated_data.get('date') is None:
            validated_data['date'] = timezone.localdate()

        if validated_data.get('party_id') is None and validated_data.get('party') is None:
            customer_obj = validated_data.get('customer')
            customer_id = validated_data.get('customer_id')
            if customer_obj is None and customer_id:
                customer_obj = Customer.objects.filter(
                    tenant=self.tenant,
                    pk=customer_id,
                ).only('party_id').first()
            if customer_obj is not None and getattr(customer_obj, 'party_id', None):
                validated_data['party_id'] = customer_obj.party_id

        # B24 — Snapshot cost_price at creation time. Same rule as create():
        # issued invoices need locked COGS costs even more than drafts.
        line_items = _snapshot_cost_prices(line_items, self.tenant)

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
        except Exception as exc:
            logger.warning('EventBus.publish invoice.sent (create+issue) failed for invoice %s: %s', instance.pk, exc, exc_info=True)
        return instance

    @transaction.atomic
    def issue(self, invoice):
        """Move a draft invoice to issued status."""
        from core.exceptions import InvoiceStateError
        from accounting.models import Invoice
        # Re-fetch with row lock to prevent concurrent double-issue.
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
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
        except Exception as exc:
            logger.warning('EventBus.publish invoice.sent (issue) failed for invoice %s: %s', invoice.pk, exc, exc_info=True)
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

        # Re-fetch with row lock to prevent concurrent double-payment.
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
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

        # Re-fetch with row lock to prevent concurrent double-void.
        invoice = Invoice.objects.select_for_update().get(pk=invoice.pk)
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
        except Exception as exc:
            logger.warning('EventBus.publish invoice.cancelled failed for invoice %s: %s', invoice.pk, exc, exc_info=True)
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
