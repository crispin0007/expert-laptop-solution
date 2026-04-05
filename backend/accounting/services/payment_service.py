"""
payment_service.py
==================
Business logic for recording payments and auto-settling invoices/bills.
"""
import logging
from decimal import Decimal
from django.utils import timezone

log = logging.getLogger(__name__)


def _resolve_party_id_from_invoice(invoice):
    party_id = getattr(invoice, 'party_id', None)
    if party_id is None and getattr(invoice, 'customer', None) is not None:
        return getattr(invoice.customer, 'party_id', None)
    return party_id


def _resolve_party_id_from_bill(bill):
    party_id = getattr(bill, 'party_id', None)
    if party_id is None and getattr(bill, 'supplier', None) is not None:
        return getattr(bill.supplier, 'party_id', None)
    return party_id


def _publish_invoice_paid_event(*, tenant, invoice, payment_amount):
    try:
        from core.events import EventBus
        EventBus.publish('invoice.paid', {
            'id': invoice.pk,
            'tenant_id': tenant.id,
            'customer_id': invoice.customer_id,
            'amount': str(payment_amount),
            'paid_at': invoice.paid_at.isoformat(),
        }, tenant=tenant)
    except Exception as exc:
        log.warning('EventBus.publish invoice.paid failed for invoice %s: %s', invoice.pk, exc, exc_info=True)


def _mark_invoice_paid_if_settled(*, tenant, invoice, payment_amount):
    if not invoice or invoice.amount_due > Decimal('0'):
        return

    invoice.status = 'paid'
    invoice.paid_at = timezone.now()
    invoice.save(update_fields=['status', 'paid_at', 'updated_at'])
    _publish_invoice_paid_event(tenant=tenant, invoice=invoice, payment_amount=payment_amount)


def _mark_bill_paid_if_settled(*, bill):
    if not bill or bill.amount_due > Decimal('0'):
        return

    bill.status = 'paid'
    bill.paid_at = timezone.now()
    bill.save(update_fields=['status', 'paid_at', 'updated_at'])


def _allocate_to_invoice(*, payment, tenant, invoice):
    from accounting.models import Invoice, Payment
    from core.exceptions import AppValidationError, ConflictError
    from django.utils import timezone as tz

    if payment.type != Payment.TYPE_INCOMING:
        raise AppValidationError({'detail': 'Only incoming payments can be linked to invoices.'})
    if payment.invoice_id is not None:
        raise ConflictError('Payment is already linked to an invoice.')

    payment.invoice = invoice
    payment.party_id = _resolve_party_id_from_invoice(invoice)
    payment.save(update_fields=['invoice', 'party', 'updated_at'])

    if invoice.amount_due <= Decimal('0'):
        invoice.status = Invoice.STATUS_PAID
        invoice.paid_at = tz.now()
        invoice.save(update_fields=['status', 'paid_at', 'updated_at'])
        _publish_invoice_paid_event(tenant=tenant, invoice=invoice, payment_amount=payment.amount)


def _allocate_to_bill(*, payment, bill):
    from accounting.models import Bill, Payment
    from core.exceptions import AppValidationError, ConflictError
    from django.utils import timezone as tz

    if payment.type != Payment.TYPE_OUTGOING:
        raise AppValidationError({'detail': 'Only outgoing payments can be linked to bills.'})
    if payment.bill_id is not None:
        raise ConflictError('Payment is already linked to a bill.')

    payment.bill = bill
    payment.party_id = _resolve_party_id_from_bill(bill)
    payment.save(update_fields=['bill', 'party', 'updated_at'])

    if bill.amount_due <= Decimal('0'):
        bill.status = Bill.STATUS_PAID
        bill.paid_at = tz.now()
        bill.save(update_fields=['status', 'paid_at', 'updated_at'])


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

    if invoice and payment_type != Payment.TYPE_INCOMING:
        raise ValueError('Invoice-linked payments must use type="incoming".')

    if bill and payment_type != Payment.TYPE_OUTGOING:
        raise ValueError('Bill-linked payments must use type="outgoing".')

    if invoice and getattr(invoice, 'tenant_id', None) != tenant.id:
        raise ValueError('Invoice does not belong to this workspace.')

    if bill and getattr(bill, 'tenant_id', None) != tenant.id:
        raise ValueError('Bill does not belong to this workspace.')

    if bank_account and getattr(bank_account, 'tenant_id', None) != tenant.id:
        raise ValueError('Bank account does not belong to this workspace.')

    party_id = _resolve_party_id_from_invoice(invoice) if invoice is not None else None
    if party_id is None and bill is not None:
        party_id = _resolve_party_id_from_bill(bill)

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
        party_id=party_id,
        reference=reference,
        notes=notes,
        party_name=party_name,
        cheque_status=cheque_status,
    )

    # Auto-mark invoice/bill as paid when amount_due reaches 0
    _mark_invoice_paid_if_settled(tenant=tenant, invoice=invoice, payment_amount=payment.amount)
    _mark_bill_paid_if_settled(bill=bill)

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
    from core.exceptions import AppValidationError
    if invoice and bill:
        raise AppValidationError({'detail': 'Provide either invoice or bill, not both.'})

    if invoice:
        _allocate_to_invoice(
            payment=payment,
            tenant=tenant,
            invoice=invoice,
        )

    elif bill:
        _allocate_to_bill(
            payment=payment,
            bill=bill,
        )

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
        inv.save(update_fields=['status', 'paid_at', 'updated_at'])
        log.info('Cheque bounce: reopened invoice %s', inv.pk)

    if payment.bill_id:
        bill = payment.bill
        bill.status = 'approved'
        bill.paid_at = None
        bill.save(update_fields=['status', 'paid_at', 'updated_at'])
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
    payment.save(update_fields=['cheque_status', 'updated_at'])
    log.info('Cheque bounce complete: payment=%s', payment.payment_number)

    return payment
