"""
payment_service.py
==================
Business logic for recording payments and auto-settling invoices/bills.
"""
from decimal import Decimal
from django.utils import timezone


def record_payment(
    *,
    tenant,
    created_by,
    payment_type,   # 'incoming' | 'outgoing'
    method,
    amount,
    date=None,
    invoice=None,
    bill=None,
    bank_account=None,
    reference='',
    notes='',
    party_name='',
    cheque_status='',
):
    """
    Create a Payment and auto-settle the linked invoice/bill when fully paid.
    The journal entry is created by signals/post_save on Payment.
    """
    from accounting.models import Payment

    if amount <= Decimal('0'):
        raise ValueError("Payment amount must be positive.")

    if invoice and bill:
        raise ValueError("Payment can be linked to either an invoice or a bill, not both.")

    if invoice and getattr(invoice, 'tenant_id', None) != tenant.id:
        raise ValueError('Invoice does not belong to this workspace.')

    if bill and getattr(bill, 'tenant_id', None) != tenant.id:
        raise ValueError('Bill does not belong to this workspace.')

    if bank_account and getattr(bank_account, 'tenant_id', None) != tenant.id:
        raise ValueError('Bank account does not belong to this workspace.')

    payment = Payment.objects.create(
        tenant=tenant,
        created_by=created_by,
        date=date or timezone.localdate(),
        type=payment_type,
        method=method,
        amount=amount,
        bank_account=bank_account,
        invoice=invoice,
        bill=bill,
        reference=reference,
        notes=notes,
        party_name=party_name,
        cheque_status=cheque_status,
    )

    # Auto-mark invoice/bill as paid when amount_due reaches 0
    if invoice and invoice.amount_due <= Decimal('0'):
        invoice.status = 'paid'
        invoice.paid_at = timezone.now()
        invoice.save(update_fields=['status', 'paid_at'])
        try:
            from core.events import EventBus
            EventBus.publish('invoice.paid', {
                'id': invoice.pk,
                'tenant_id': tenant.id,
                'customer_id': invoice.customer_id,
                'amount': str(payment.amount),
                'paid_at': invoice.paid_at.isoformat(),
            }, tenant=tenant)
        except Exception:
            pass

    if bill and bill.amount_due <= Decimal('0'):
        bill.status = 'paid'
        bill.paid_at = timezone.now()
        bill.save(update_fields=['status', 'paid_at'])

    return payment


def get_invoice_balance(invoice):
    """Return (total, amount_paid, amount_due) for an invoice."""
    paid = invoice.amount_paid
    return invoice.total, paid, max(invoice.total - paid, Decimal('0'))


def get_bill_balance(bill):
    """Return (total, amount_paid, amount_due) for a bill."""
    paid = bill.amount_paid
    return bill.total, paid, max(bill.total - paid, Decimal('0'))
