from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from accounting.models import Bill, Invoice, Payment, Quotation


class Command(BaseCommand):
    help = (
        'Backfill missing party links on accounting documents using customer/supplier '
        'relations. Safe for production; defaults to dry-run.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=str, default=None, help='Tenant slug (optional).')
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist changes. Without this flag, command runs in dry-run mode.',
        )

    @staticmethod
    def _resolve_invoice_party_id(invoice: Invoice) -> int | None:
        if invoice.party_id:
            return invoice.party_id
        customer = getattr(invoice, 'customer', None)
        if customer is not None and getattr(customer, 'party_id', None):
            return customer.party_id
        return None

    @staticmethod
    def _resolve_bill_party_id(bill: Bill) -> int | None:
        if bill.party_id:
            return bill.party_id
        supplier = getattr(bill, 'supplier', None)
        if supplier is not None and getattr(supplier, 'party_id', None):
            return supplier.party_id
        return None

    def _resolve_payment_party_id(self, payment: Payment) -> int | None:
        if payment.party_id:
            return payment.party_id

        if payment.invoice_id and payment.invoice is not None:
            party_id = self._resolve_invoice_party_id(payment.invoice)
            if party_id:
                return party_id

        if payment.bill_id and payment.bill is not None:
            party_id = self._resolve_bill_party_id(payment.bill)
            if party_id:
                return party_id

        return None

    def _set_party(self, obj, party_id: int, *, apply: bool, stats: Counter, label: str):
        if not party_id:
            stats[f'{label}.unresolved'] += 1
            return
        if obj.party_id == party_id:
            stats[f'{label}.already_ok'] += 1
            return
        if apply:
            obj.party_id = party_id
            obj.save(update_fields=['party', 'updated_at'])
            stats[f'{label}.updated'] += 1
        else:
            stats[f'{label}.would_update'] += 1

    @transaction.atomic
    def handle(self, *args, **options):
        tenant_slug = options.get('tenant')
        apply = bool(options.get('apply'))
        stats = Counter()

        mode = 'WRITE' if apply else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'Document party backfill started ({mode}).'))

        invoice_qs = Invoice.objects.filter(party__isnull=True).select_related('tenant', 'customer')
        bill_qs = Bill.objects.filter(party__isnull=True).select_related('tenant', 'supplier')
        payment_qs = Payment.objects.filter(party__isnull=True).select_related(
            'tenant',
            'invoice', 'invoice__customer',
            'bill', 'bill__supplier',
        )
        quotation_qs = Quotation.objects.filter(party__isnull=True).select_related('tenant', 'customer')

        if tenant_slug:
            invoice_qs = invoice_qs.filter(tenant__slug=tenant_slug)
            bill_qs = bill_qs.filter(tenant__slug=tenant_slug)
            payment_qs = payment_qs.filter(tenant__slug=tenant_slug)
            quotation_qs = quotation_qs.filter(tenant__slug=tenant_slug)

        for invoice in invoice_qs.iterator(chunk_size=200):
            party_id = self._resolve_invoice_party_id(invoice)
            self._set_party(invoice, party_id, apply=apply, stats=stats, label='invoice')

        for bill in bill_qs.iterator(chunk_size=200):
            party_id = self._resolve_bill_party_id(bill)
            self._set_party(bill, party_id, apply=apply, stats=stats, label='bill')

        for payment in payment_qs.iterator(chunk_size=200):
            party_id = self._resolve_payment_party_id(payment)
            self._set_party(payment, party_id, apply=apply, stats=stats, label='payment')

        for quotation in quotation_qs.iterator(chunk_size=200):
            party_id = None
            if quotation.customer is not None and getattr(quotation.customer, 'party_id', None):
                party_id = quotation.customer.party_id
            self._set_party(quotation, party_id, apply=apply, stats=stats, label='quotation')

        if not apply:
            transaction.set_rollback(True)

        if not stats:
            stats['none'] = 1

        self.stdout.write(self.style.SUCCESS(f'Document party backfill completed ({mode}).'))
        for key in sorted(stats.keys()):
            self.stdout.write(f'{key}: {stats[key]}')
