"""
invoice_service.py
==================
Business logic for Invoice lifecycle.
"""
from decimal import Decimal
from django.utils import timezone


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
