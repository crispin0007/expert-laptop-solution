from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from accounting.models import Bill, Invoice, Payment, Quotation


def _counter_key(dry_run: bool) -> str:
    return 'would-link' if dry_run else 'linked'


def _link_invoice(invoice, *, dry_run: bool) -> str:
    party_id = None
    if invoice.customer_id and invoice.customer and invoice.customer.party_id:
        party_id = invoice.customer.party_id
    elif invoice.project_id and invoice.project and invoice.project.customer_id and invoice.project.customer and invoice.project.customer.party_id:
        party_id = invoice.project.customer.party_id

    if not party_id:
        return 'missing-source'
    if dry_run:
        return _counter_key(True)

    invoice.party_id = party_id
    invoice.save(update_fields=['party', 'updated_at'])
    return _counter_key(False)


def _link_bill(bill, *, dry_run: bool) -> str:
    party_id = bill.supplier.party_id if bill.supplier_id and bill.supplier else None
    if not party_id:
        return 'missing-source'
    if dry_run:
        return _counter_key(True)

    bill.party_id = party_id
    bill.save(update_fields=['party', 'updated_at'])
    return _counter_key(False)


def _link_quotation(quotation, *, dry_run: bool) -> str:
    party_id = None
    if quotation.customer_id and quotation.customer and quotation.customer.party_id:
        party_id = quotation.customer.party_id
    elif quotation.project_id and quotation.project and quotation.project.customer_id and quotation.project.customer and quotation.project.customer.party_id:
        party_id = quotation.project.customer.party_id

    if not party_id:
        return 'missing-source'
    if dry_run:
        return _counter_key(True)

    quotation.party_id = party_id
    quotation.save(update_fields=['party', 'updated_at'])
    return _counter_key(False)


def _link_payment(payment, *, dry_run: bool) -> str:
    party_id = None
    if payment.invoice_id and payment.invoice:
        party_id = payment.invoice.party_id or (
            payment.invoice.customer.party_id
            if payment.invoice.customer_id and payment.invoice.customer
            else None
        )
    elif payment.bill_id and payment.bill:
        party_id = payment.bill.party_id or (
            payment.bill.supplier.party_id
            if payment.bill.supplier_id and payment.bill.supplier
            else None
        )

    if not party_id:
        return 'missing-source'
    if dry_run:
        return _counter_key(True)

    payment.party_id = party_id
    payment.save(update_fields=['party', 'updated_at'])
    return _counter_key(False)


class Command(BaseCommand):
    help = 'Backfill Party links on accounting documents (Invoice/Bill/Quotation/Payment).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be updated without writing changes.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional per-model limit for staged rollout (0 = no limit).',
        )

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        limit = int(options['limit'] or 0)

        invoice_qs = Invoice.objects.filter(party__isnull=True).select_related('customer', 'project__customer')
        bill_qs = Bill.objects.filter(party__isnull=True).select_related('supplier')
        quotation_qs = Quotation.objects.filter(party__isnull=True).select_related('customer', 'project__customer')
        payment_qs = Payment.objects.filter(party__isnull=True).select_related('invoice__customer', 'bill__supplier')

        if limit > 0:
            invoice_qs = invoice_qs[:limit]
            bill_qs = bill_qs[:limit]
            quotation_qs = quotation_qs[:limit]
            payment_qs = payment_qs[:limit]

        stats = {
            'invoice': Counter(),
            'bill': Counter(),
            'quotation': Counter(),
            'payment': Counter(),
        }

        with transaction.atomic():
            for invoice in invoice_qs.iterator(chunk_size=200):
                stats['invoice'][_link_invoice(invoice, dry_run=dry_run)] += 1

            for bill in bill_qs.iterator(chunk_size=200):
                stats['bill'][_link_bill(bill, dry_run=dry_run)] += 1

            for quotation in quotation_qs.iterator(chunk_size=200):
                stats['quotation'][_link_quotation(quotation, dry_run=dry_run)] += 1

            for payment in payment_qs.iterator(chunk_size=200):
                stats['payment'][_link_payment(payment, dry_run=dry_run)] += 1

            if dry_run:
                transaction.set_rollback(True)

        mode = 'DRY-RUN' if dry_run else 'WRITE'
        self.stdout.write(self.style.SUCCESS(f'Accounting party backfill completed ({mode}).'))
        for key in ('invoice', 'bill', 'quotation', 'payment'):
            self.stdout.write(f'{key.title()}: {dict(stats[key])}')
