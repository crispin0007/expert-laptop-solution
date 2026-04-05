from __future__ import annotations

import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from accounting.models import Bill, Invoice, Payment, Quotation


CSV_HEADERS = [
    'model',
    'id',
    'tenant_id',
    'document_number',
    'status',
    'root_cause',
    'suggested_party_type',
    'name_hint',
    'recommended_fix',
    'customer_id',
    'supplier_id',
    'project_id',
    'invoice_id',
    'bill_id',
]


def _row(**kwargs):
    return {key: kwargs.get(key, '') for key in CSV_HEADERS}


def _resolution_for_customer(customer, *, with_profile: str) -> tuple[str, str, str, str]:
    if customer.party_id:
        return 'linkable', f'{with_profile}.party', 'customer', customer.name or ''
    return 'missing-source', f'{with_profile}-without-party', 'customer', customer.name or ''


def _resolution_for_project_customer(project) -> tuple[str, str, str, str]:
    if project.customer_id and project.customer:
        return _resolution_for_customer(project.customer, with_profile='project.customer')
    return 'missing-source', 'project-without-customer', 'customer', ''


def _invoice_resolution(invoice) -> tuple[str, str, str, str]:
    if invoice.customer_id and invoice.customer:
        return _resolution_for_customer(invoice.customer, with_profile='customer')

    if invoice.project_id and invoice.project:
        return _resolution_for_project_customer(invoice.project)

    return 'missing-source', 'no-customer-or-project', 'customer', ''


def _bill_resolution(bill) -> tuple[str, str, str, str]:
    if bill.supplier_id and bill.supplier:
        if bill.supplier.party_id:
            return 'linkable', 'supplier.party', 'supplier', bill.supplier.name or ''
        return 'missing-source', 'supplier-without-party', 'supplier', bill.supplier.name or ''

    name_hint = (bill.supplier_name or '').strip()
    return 'missing-source', 'no-supplier', 'supplier', name_hint


def _quotation_resolution(quotation) -> tuple[str, str, str, str]:
    if quotation.customer_id and quotation.customer:
        return _resolution_for_customer(quotation.customer, with_profile='customer')

    if quotation.project_id and quotation.project:
        return _resolution_for_project_customer(quotation.project)

    return 'missing-source', 'no-customer-or-project', 'customer', ''


def _payment_from_invoice_resolution(payment) -> tuple[str, str, str, str]:
    if not payment.invoice_id or not payment.invoice:
        return '', '', '', ''

    if payment.invoice.party_id:
        return 'linkable', 'invoice.party', 'customer', payment.party_name or ''
    if payment.invoice.customer_id and payment.invoice.customer:
        if payment.invoice.customer.party_id:
            return 'linkable', 'invoice.customer.party', 'customer', payment.invoice.customer.name or ''
        return 'missing-source', 'invoice-customer-without-party', 'customer', payment.invoice.customer.name or ''
    return 'missing-source', 'invoice-without-customer-or-party', 'customer', payment.party_name or ''


def _payment_from_bill_resolution(payment) -> tuple[str, str, str, str]:
    if not payment.bill_id or not payment.bill:
        return '', '', '', ''

    if payment.bill.party_id:
        return 'linkable', 'bill.party', 'supplier', payment.party_name or ''
    if payment.bill.supplier_id and payment.bill.supplier:
        if payment.bill.supplier.party_id:
            return 'linkable', 'bill.supplier.party', 'supplier', payment.bill.supplier.name or ''
        return 'missing-source', 'bill-supplier-without-party', 'supplier', payment.bill.supplier.name or ''
    return 'missing-source', 'bill-without-supplier-or-party', 'supplier', payment.party_name or ''


def _payment_resolution(payment) -> tuple[str, str, str, str]:
    resolution = _payment_from_invoice_resolution(payment)
    if resolution[0]:
        return resolution

    resolution = _payment_from_bill_resolution(payment)
    if resolution[0]:
        return resolution

    expected = 'customer' if payment.type == Payment.TYPE_INCOMING else 'supplier'
    return 'missing-source', 'no-invoice-or-bill', expected, (payment.party_name or '').strip()


def _recommended_fix(root_cause: str, suggested_party_type: str) -> str:
    if root_cause in {
        'customer-without-party',
        'supplier-without-party',
        'project-customer-without-party',
        'invoice-customer-without-party',
        'bill-supplier-without-party',
    }:
        return 'Backfill party on related profile, then rerun accounting backfill.'
    if root_cause in {'project-without-customer', 'no-customer-or-project', 'no-supplier'}:
        return 'Attach the correct profile (customer/supplier) to document, then rerun backfill.'
    if root_cause in {'no-invoice-or-bill'}:
        return f'Set invoice/bill reference or set party directly using a verified {suggested_party_type}.'
    if root_cause in {'invoice-without-customer-or-party', 'bill-without-supplier-or-party'}:
        return 'Attach the missing source relation or set party directly after verification.'
    return 'Review source relation and set party on the document after verification.'


class Command(BaseCommand):
    help = 'Export accounting records with missing Party links to CSV for manual remediation.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--output',
            type=str,
            default='accounting_party_link_gaps.csv',
            help='Output CSV file path. Default: accounting_party_link_gaps.csv',
        )
        parser.add_argument(
            '--include-linkable',
            action='store_true',
            help='Include records that are linkable (not just missing-source) for review.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional per-model limit for staged export (0 = no limit).',
        )

    def _should_write(self, status: str, include_linkable: bool) -> bool:
        if status == 'missing-source':
            return True
        return include_linkable and status == 'linkable'

    def _write_invoices(self, writer, *, include_linkable: bool, limit: int) -> int:
        qs = Invoice.objects.filter(party__isnull=True).select_related('customer', 'project__customer', 'tenant')
        if limit > 0:
            qs = qs[:limit]

        count = 0
        for obj in qs.iterator(chunk_size=200):
            status, cause, party_type, name_hint = _invoice_resolution(obj)
            if not self._should_write(status, include_linkable):
                continue
            writer.writerow(_row(
                model='invoice',
                id=obj.pk,
                tenant_id=obj.tenant_id,
                document_number=obj.invoice_number,
                status=status,
                root_cause=cause,
                suggested_party_type=party_type,
                name_hint=name_hint,
                recommended_fix=_recommended_fix(cause, party_type),
                customer_id=obj.customer_id or '',
                project_id=obj.project_id or '',
            ))
            count += 1
        return count

    def _write_bills(self, writer, *, include_linkable: bool, limit: int) -> int:
        qs = Bill.objects.filter(party__isnull=True).select_related('supplier', 'tenant')
        if limit > 0:
            qs = qs[:limit]

        count = 0
        for obj in qs.iterator(chunk_size=200):
            status, cause, party_type, name_hint = _bill_resolution(obj)
            if not self._should_write(status, include_linkable):
                continue
            writer.writerow(_row(
                model='bill',
                id=obj.pk,
                tenant_id=obj.tenant_id,
                document_number=obj.bill_number,
                status=status,
                root_cause=cause,
                suggested_party_type=party_type,
                name_hint=name_hint,
                recommended_fix=_recommended_fix(cause, party_type),
                supplier_id=obj.supplier_id or '',
            ))
            count += 1
        return count

    def _write_quotations(self, writer, *, include_linkable: bool, limit: int) -> int:
        qs = Quotation.objects.filter(party__isnull=True).select_related('customer', 'project__customer', 'tenant')
        if limit > 0:
            qs = qs[:limit]

        count = 0
        for obj in qs.iterator(chunk_size=200):
            status, cause, party_type, name_hint = _quotation_resolution(obj)
            if not self._should_write(status, include_linkable):
                continue
            writer.writerow(_row(
                model='quotation',
                id=obj.pk,
                tenant_id=obj.tenant_id,
                document_number=obj.quotation_number,
                status=status,
                root_cause=cause,
                suggested_party_type=party_type,
                name_hint=name_hint,
                recommended_fix=_recommended_fix(cause, party_type),
                customer_id=obj.customer_id or '',
                project_id=obj.project_id or '',
            ))
            count += 1
        return count

    def _write_payments(self, writer, *, include_linkable: bool, limit: int) -> int:
        qs = Payment.objects.filter(party__isnull=True).select_related('invoice__customer', 'bill__supplier', 'tenant')
        if limit > 0:
            qs = qs[:limit]

        count = 0
        for obj in qs.iterator(chunk_size=200):
            status, cause, party_type, name_hint = _payment_resolution(obj)
            if not self._should_write(status, include_linkable):
                continue
            writer.writerow(_row(
                model='payment',
                id=obj.pk,
                tenant_id=obj.tenant_id,
                document_number=obj.payment_number,
                status=status,
                root_cause=cause,
                suggested_party_type=party_type,
                name_hint=name_hint,
                recommended_fix=_recommended_fix(cause, party_type),
                invoice_id=obj.invoice_id or '',
                bill_id=obj.bill_id or '',
            ))
            count += 1
        return count

    def handle(self, *args, **options):
        output = Path(options['output']).expanduser()
        include_linkable = bool(options['include_linkable'])
        limit = max(int(options['limit'] or 0), 0)

        output.parent.mkdir(parents=True, exist_ok=True)

        with output.open('w', newline='', encoding='utf-8') as fh:
            writer = csv.DictWriter(fh, fieldnames=CSV_HEADERS)
            writer.writeheader()

            invoice_count = self._write_invoices(writer, include_linkable=include_linkable, limit=limit)
            bill_count = self._write_bills(writer, include_linkable=include_linkable, limit=limit)
            quotation_count = self._write_quotations(writer, include_linkable=include_linkable, limit=limit)
            payment_count = self._write_payments(writer, include_linkable=include_linkable, limit=limit)

        total = invoice_count + bill_count + quotation_count + payment_count
        self.stdout.write(self.style.SUCCESS(f'Export complete: {output}'))
        self.stdout.write(f'invoices={invoice_count} bills={bill_count} quotations={quotation_count} payments={payment_count} total={total}')
