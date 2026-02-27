"""
ticket_invoice_service.py
=========================
Full ticket billing → finance approval → coin award flow.

Flow
----
1. Staff generates invoice:
     generate_ticket_invoice(ticket, tenant, created_by)
     → Invoice (draft, finance_status=draft) with service + product line items

2. Customer pays on-site. Staff records it:
     submit_invoice_payment(invoice, collected_by, method, amount, bank_account=None)
     → Payment created (journal auto-fires via signal: Dr Cash/Bank  Cr AR)
     → invoice.finance_status = 'submitted'

3. Finance reviews (approve or reject):
     finance_approve_invoice(invoice, reviewed_by, notes='')
     → invoice.status = 'issued'  (journal auto-fires: Dr AR  Cr Revenue + VAT)
     → ticket.status  = 'closed'
     → CoinTransaction(pending) created for assigned staff
     → invoice.finance_status = 'approved'

     finance_reject_invoice(invoice, reviewed_by, notes='')
     → invoice.finance_status = 'rejected'
     → async notification sent to staff

Double-entry net result after approve:
  Dr  Cash/Bank          (payment amount)
  Cr  Service Revenue    (service charge excl. VAT)
  Cr  Product Revenue    (product total excl. VAT)
  Cr  VAT Payable        (VAT portion)
"""
from decimal import Decimal
from django.db import transaction
from django.utils import timezone


# ─── Generate invoice from ticket ────────────────────────────────────────────

def generate_ticket_invoice(ticket, tenant, due_date=None, notes='', created_by=None):
    """
    Build a DRAFT Invoice from the ticket.

    Line items carry a 'line_type' key:
      'service'  → service_charge on Ticket
      'product'  → each TicketProduct

    VAT rate is snapshotted from tenant at generation time (audit requirement).
    Raises ValueError if ticket already has an active invoice.
    """
    from tickets.models import TicketProduct
    from accounting.models import Invoice
    from accounting.services.invoice_service import compute_invoice_totals

    # Guard: only one active invoice per ticket
    existing = Invoice.objects.filter(
        ticket=ticket, tenant=tenant
    ).exclude(status=Invoice.STATUS_VOID).first()
    if existing:
        raise ValueError(
            f"Ticket already has an active invoice ({existing.invoice_number}). "
            "Void it first if you need to regenerate."
        )

    ticket_type = ticket.ticket_type
    is_free     = ticket_type.is_free_service if ticket_type else False

    line_items = []

    # ── Service charge line ───────────────────────────────────────────────────
    service_value = Decimal(str(ticket.service_charge or '0'))
    if service_value > 0:
        line_items.append({
            'line_type':   'service',
            'description': f"Service Charge – {ticket.ticket_number}",
            'qty':         1,
            'unit_price':  str(service_value),
            'discount':    '0',
        })

    # ── Product lines ─────────────────────────────────────────────────────────
    for tp in TicketProduct.objects.filter(ticket=ticket).select_related('product'):
        line_items.append({
            'line_type':   'product',
            'product_id':  tp.product.pk,    # stored for COGS journal lookup
            'description': tp.product.name,
            'qty':         tp.quantity,
            'unit_price':  str(tp.unit_price),
            'discount':    str(tp.discount),
        })

    if not line_items and not is_free:
        raise ValueError(
            "Ticket has no service charge and no products. "
            "Set a service charge or add products before generating an invoice."
        )

    vat_rate   = tenant.vat_rate if tenant.vat_enabled else Decimal('0')
    subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)

    return Invoice.objects.create(
        tenant=tenant,
        created_by=created_by,
        customer=ticket.customer,
        ticket=ticket,
        line_items=line_items,
        subtotal=subtotal,
        discount=Decimal('0'),
        vat_rate=vat_rate,
        vat_amount=vat_amount,
        total=total,
        status=Invoice.STATUS_DRAFT,
        finance_status=Invoice.FINANCE_DRAFT,
        due_date=due_date,
        notes=notes or f"Ticket invoice – {ticket.ticket_number}",
    )


# ─── Staff records payment ────────────────────────────────────────────────────

def submit_invoice_payment(
    invoice,
    collected_by,
    method,           # 'cash' | 'bank_transfer' | 'esewa' | 'khalti' | 'cheque'
    amount,
    bank_account=None,
    reference='',
    notes='',
):
    """
    Staff has collected payment from customer.

    1. Creates Payment record (Dr Cash/Bank  Cr AR journal auto-fires via signal).
    2. Marks invoice.finance_status = 'submitted' for finance queue.

    Raises ValueError if invoice is not in draft or rejected state.
    """
    from accounting.services.payment_service import record_payment

    if invoice.finance_status not in ('draft', 'rejected'):
        raise ValueError(
            f"Invoice is in '{invoice.finance_status}' state — cannot re-submit. "
            "Contact finance to reset it."
        )

    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError("Payment amount must be positive.")

    payment = record_payment(
        tenant=invoice.tenant,
        created_by=collected_by,
        payment_type='incoming',
        method=method,
        amount=amount,
        date=timezone.localdate(),
        invoice=invoice,
        bank_account=bank_account,
        reference=reference or invoice.invoice_number,
        notes=notes or f"Payment collected for {invoice.invoice_number}",
    )

    invoice.payment_received    = True
    invoice.payment_method      = method
    invoice.payment_received_at = timezone.now()
    invoice.payment_received_by = collected_by
    invoice.finance_status      = 'submitted'
    invoice.save(update_fields=[
        'payment_received', 'payment_method', 'payment_received_at',
        'payment_received_by', 'finance_status', 'updated_at',
    ])

    return payment


# ─── Finance approves ─────────────────────────────────────────────────────────

def finance_approve_invoice(invoice, reviewed_by, notes=''):
    """
    Finance approves the invoice.

    1. invoice.status = 'issued'  → handle_invoice_status_change signal fires
       → Dr AR / Cr Service Revenue + Product Revenue + VAT Payable.
    2. invoice.finance_status = 'approved'.
    3. Ticket closed.
    4. CoinTransaction(pending) created for assigned staff.

    Raises ValueError if invoice is not in 'submitted' state.
    """
    if invoice.finance_status != 'submitted':
        raise ValueError(
            f"Invoice must be in 'submitted' state to approve. "
            f"Current: '{invoice.finance_status}'."
        )

    # All three steps must succeed together.  If _close_ticket or
    # _create_coin_transaction raises, the invoice.save() is rolled back so
    # the invoice never gets stuck in 'approved'/'issued' with an open ticket.
    with transaction.atomic():
        now = timezone.now()
        invoice.finance_status      = 'approved'
        invoice.finance_reviewed_by = reviewed_by
        invoice.finance_reviewed_at = now
        invoice.finance_notes       = notes
        invoice.status              = 'issued'   # triggers accounting journal signal
        invoice.save(update_fields=[
            'finance_status', 'finance_reviewed_by', 'finance_reviewed_at',
            'finance_notes', 'status', 'updated_at',
        ])

        ticket = invoice.ticket
        if ticket and ticket.status not in ('closed', 'cancelled'):
            _close_ticket(ticket, closed_by=reviewed_by,
                          reason=f"Closed after finance approval of {invoice.invoice_number}")

        if ticket and ticket.assigned_to_id:
            coins = calculate_ticket_coins(ticket, invoice)
            if coins > 0:
                _create_coin_transaction(ticket, reviewed_by, coins)

    return invoice


# ─── Finance rejects ──────────────────────────────────────────────────────────

def finance_reject_invoice(invoice, reviewed_by, notes=''):
    """
    Finance rejects the invoice. Ticket stays open for correction.

    Payment is NOT automatically reversed — finance must issue a CreditNote
    or handle manually.
    Raises ValueError if invoice is not in 'submitted' state.
    """
    if invoice.finance_status != 'submitted':
        raise ValueError(
            f"Invoice must be in 'submitted' state to reject. "
            f"Current: '{invoice.finance_status}'."
        )

    invoice.finance_status      = 'rejected'
    invoice.finance_reviewed_by = reviewed_by
    invoice.finance_reviewed_at = timezone.now()
    invoice.finance_notes       = notes
    invoice.save(update_fields=[
        'finance_status', 'finance_reviewed_by', 'finance_reviewed_at',
        'finance_notes', 'updated_at',
    ])

    try:
        from notifications.tasks import notify_invoice_rejected
        notify_invoice_rejected.delay(invoice.pk)
    except Exception:
        pass  # notification failure must never break the rejection flow

    return invoice


# ─── Coin calculation ─────────────────────────────────────────────────────────

def calculate_ticket_coins(ticket, invoice):
    """
    Calculate coin amount from TicketType rates and invoice line items.

    Rate source: ticket.ticket_type.coin_service_rate / coin_product_rate
    Never hardcoded — always read from TicketType.

    Returns Decimal.
    """
    ticket_type = ticket.ticket_type
    if not ticket_type:
        return Decimal('0')

    service_rate = Decimal(str(ticket_type.coin_service_rate)) / Decimal('100')
    product_rate = Decimal(str(ticket_type.coin_product_rate)) / Decimal('100')

    service_value = Decimal('0')
    product_value = Decimal('0')

    for item in invoice.line_items:
        qty        = Decimal(str(item.get('qty', 1)))
        unit_price = Decimal(str(item.get('unit_price', '0')))
        pct_disc   = Decimal(str(item.get('discount', '0'))) / Decimal('100')
        line_total = max(qty * unit_price * (1 - pct_disc), Decimal('0'))

        if item.get('line_type') == 'service':
            service_value += line_total
        elif item.get('line_type') == 'product':
            product_value += line_total

    coins = (service_value * service_rate) + (product_value * product_rate)
    return coins.quantize(Decimal('0.01'))


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _close_ticket(ticket, closed_by, reason=''):
    """Close ticket and write a timeline event."""
    from tickets.models import TicketTimeline

    prev_status = ticket.status
    ticket.status    = 'closed'
    ticket.closed_at = timezone.now()
    ticket.save(update_fields=['status', 'closed_at', 'updated_at'])

    TicketTimeline.objects.create(
        tenant=ticket.tenant,
        ticket=ticket,
        event_type=TicketTimeline.EVENT_STATUS_CHANGE,
        description=(
            f"Ticket closed after finance approval by "
            f"{closed_by.get_full_name() or closed_by.email}. {reason}".strip()
        ),
        actor=closed_by,
        created_by=closed_by,
        metadata={'from': prev_status, 'to': 'closed', 'reason': reason},
    )


def _create_coin_transaction(ticket, awarded_by, coins):
    """Create a pending CoinTransaction for the assigned staff (admin queue)."""
    from accounting.models import CoinTransaction

    if CoinTransaction.objects.filter(
        tenant=ticket.tenant,
        source_type=CoinTransaction.SOURCE_TICKET,
        source_id=ticket.pk,
    ).exists():
        return None

    return CoinTransaction.objects.create(
        tenant=ticket.tenant,
        created_by=awarded_by,
        staff=ticket.assigned_to,
        amount=coins,
        source_type=CoinTransaction.SOURCE_TICKET,
        source_id=ticket.pk,
        status=CoinTransaction.STATUS_PENDING,
        note=(
            f"Auto-calculated: {coins} coins for ticket {ticket.ticket_number}. "
            f"Pending admin approval."
        ),
    )
