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
    line_items: list of dicts with unit_price, qty, discount keys.
    """
    subtotal = sum(
        Decimal(str(item.get('unit_price', 0))) * int(item.get('qty', 1))
        - Decimal(str(item.get('discount', 0)))
        for item in line_items
    )
    subtotal = max(subtotal - Decimal(str(discount)), Decimal('0'))
    vat_amount = (subtotal * Decimal(str(vat_rate))).quantize(Decimal('0.01'))
    total = subtotal + vat_amount
    return subtotal, vat_amount, total


def generate_from_ticket(ticket, tenant, due_date=None, notes='', created_by=None):
    """
    Auto-build and issue an Invoice from a ticket's products.
    Returns the created Invoice instance.
    """
    from tickets.models import TicketProduct
    from accounting.models import Invoice

    ticket_products = TicketProduct.objects.filter(ticket=ticket).select_related('product')
    if not ticket_products.exists():
        raise ValueError("Ticket has no products. Add products first.")

    line_items = [
        {
            'description': tp.product.name,
            'qty': tp.quantity,
            'unit_price': str(tp.unit_price),
            'discount': str(tp.discount),
        }
        for tp in ticket_products
    ]

    vat_rate = tenant.vat_rate if tenant.vat_enabled else Decimal('0')
    subtotal, vat_amount, total = compute_invoice_totals(line_items, Decimal('0'), vat_rate)

    invoice = Invoice.objects.create(
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
        status=Invoice.STATUS_ISSUED,
        due_date=due_date,
        notes=notes or f"Auto-generated from Ticket #{ticket.pk}",
    )
    return invoice


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
