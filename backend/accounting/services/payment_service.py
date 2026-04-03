"""
payment_service.py
==================
Business logic for recording payments and auto-settling invoices/bills.
"""
import logging
from decimal import Decimal
from django.utils import timezone

log = logging.getLogger(__name__)


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
        except Exception as exc:
            log.warning('EventBus.publish invoice.paid failed for invoice %s: %s', invoice.pk, exc, exc_info=True)

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


def allocate_payment(payment, *, tenant, invoice=None, bill=None):
    """
    Link an unallocated payment to an invoice or bill.
    Publishes invoice.paid / bill.paid events when the document is fully settled.
    """
    from accounting.models import Invoice, Bill, Payment
    from core.exceptions import AppValidationError, ConflictError, NotFoundError
    from django.utils import timezone as tz

    if invoice and bill:
        raise AppValidationError({'detail': 'Provide either invoice or bill, not both.'})

    if invoice:
        if payment.type != Payment.TYPE_INCOMING:
            raise AppValidationError({'detail': 'Only incoming payments can be linked to invoices.'})
        if payment.invoice_id is not None:
            raise ConflictError('Payment is already linked to an invoice.')
        payment.invoice = invoice
        payment.save(update_fields=['invoice'])
        if invoice.amount_due <= Decimal('0'):
            invoice.status = Invoice.STATUS_PAID
            invoice.paid_at = tz.now()
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
            except Exception as exc:
                log.warning('EventBus.publish invoice.paid failed for invoice %s: %s', invoice.pk, exc, exc_info=True)

    elif bill:
        if payment.type != Payment.TYPE_OUTGOING:
            raise AppValidationError({'detail': 'Only outgoing payments can be linked to bills.'})
        if payment.bill_id is not None:
            raise ConflictError('Payment is already linked to a bill.')
        payment.bill = bill
        payment.save(update_fields=['bill'])
        if bill.amount_due <= Decimal('0'):
            bill.status = Bill.STATUS_PAID
            bill.paid_at = tz.now()
            bill.save(update_fields=['status', 'paid_at'])

    else:
        raise AppValidationError({'detail': 'Provide invoice or bill to allocate.'})

    return payment


# ─── Cheque bounce ─────────────────────────────────────────────────────────────

def bounce_cheque(payment, *, reason='', bank_charge_amount=None, bank_charge_account=None, user=None):
    """
    Handle a bounced cheque — Odoo-style automation:

    1. Reverse the original payment journal entry (undoes cash movement)
    2. Reopen the linked invoice (→ 'issued') or bill (→ 'approved')
    3. Optionally post a bank charges expense journal entry
    4. Set cheque_status = 'bounced'

    Idempotent: reverse_payment_journal uses _make_entry with a distinct
    purpose='payment_bounce_reversal', so re-running is safe.
    """
    from accounting.models import Payment
    from accounting.services.journal_service import (
        reverse_payment_journal,
        create_bank_charge_journal,
    )

    if payment.method != Payment.METHOD_CHEQUE:
        raise ValueError('Only cheque payments can be bounced.')

    if payment.cheque_status == Payment.CHEQUE_STATUS_BOUNCED:
        raise ValueError('Cheque is already marked as bounced.')

    # 1. Reverse the payment journal (Dr Bank / Cr AR → Dr AR / Cr Bank)
    reverse_payment_journal(payment, reason=reason, reversed_by_user=user)

    # 2. Reopen the linked document
    if payment.invoice_id:
        inv = payment.invoice
        inv.status = 'issued'
        inv.paid_at = None
        inv.save(update_fields=['status', 'paid_at'])
        log.info('Cheque bounce: reopened invoice %s', inv.pk)

    if payment.bill_id:
        bill = payment.bill
        bill.status = 'approved'
        bill.paid_at = None
        bill.save(update_fields=['status', 'paid_at'])
        log.info('Cheque bounce: reopened bill %s', bill.pk)

    # 3. Bank charge (optional)
    if bank_charge_amount and Decimal(str(bank_charge_amount)) > Decimal('0'):
        create_bank_charge_journal(
            payment,
            amount=Decimal(str(bank_charge_amount)),
            charge_account=bank_charge_account,
            created_by=user,
        )
        log.info('Cheque bounce: bank charge %s posted for payment %s', bank_charge_amount, payment.pk)

    # 4. Mark bounced
    payment.cheque_status = Payment.CHEQUE_STATUS_BOUNCED
    payment.save(update_fields=['cheque_status'])
    log.info('Cheque bounce complete: payment=%s', payment.payment_number)

    return payment
