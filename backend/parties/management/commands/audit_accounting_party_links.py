from __future__ import annotations

from collections import Counter, defaultdict

from django.core.management.base import BaseCommand

from accounting.models import Bill, Invoice, Payment, Quotation


def _classify_invoice(invoice) -> tuple[str, str]:
    if invoice.customer_id and invoice.customer:
        if invoice.customer.party_id:
            return 'linkable', 'customer.party'
        return 'missing-source', 'customer-without-party'

    if invoice.project_id and invoice.project:
        if invoice.project.customer_id and invoice.project.customer:
            if invoice.project.customer.party_id:
                return 'linkable', 'project.customer.party'
            return 'missing-source', 'project-customer-without-party'
        return 'missing-source', 'project-without-customer'

    return 'missing-source', 'no-customer-or-project'


def _classify_bill(bill) -> tuple[str, str]:
    if bill.supplier_id and bill.supplier:
        if bill.supplier.party_id:
            return 'linkable', 'supplier.party'
        return 'missing-source', 'supplier-without-party'

    return 'missing-source', 'no-supplier'


def _classify_quotation(quotation) -> tuple[str, str]:
    if quotation.customer_id and quotation.customer:
        if quotation.customer.party_id:
            return 'linkable', 'customer.party'
        return 'missing-source', 'customer-without-party'

    if quotation.project_id and quotation.project:
        if quotation.project.customer_id and quotation.project.customer:
            if quotation.project.customer.party_id:
                return 'linkable', 'project.customer.party'
            return 'missing-source', 'project-customer-without-party'
        return 'missing-source', 'project-without-customer'

    return 'missing-source', 'no-customer-or-project'


def _classify_payment_from_invoice(payment) -> tuple[str, str]:
    if not payment.invoice_id or not payment.invoice:
        return '', ''

    if payment.invoice.party_id:
        return 'linkable', 'invoice.party'
    if payment.invoice.customer_id and payment.invoice.customer:
        if payment.invoice.customer.party_id:
            return 'linkable', 'invoice.customer.party'
        return 'missing-source', 'invoice-customer-without-party'
    return 'missing-source', 'invoice-without-customer-or-party'


def _classify_payment_from_bill(payment) -> tuple[str, str]:
    if not payment.bill_id or not payment.bill:
        return '', ''

    if payment.bill.party_id:
        return 'linkable', 'bill.party'
    if payment.bill.supplier_id and payment.bill.supplier:
        if payment.bill.supplier.party_id:
            return 'linkable', 'bill.supplier.party'
        return 'missing-source', 'bill-supplier-without-party'
    return 'missing-source', 'bill-without-supplier-or-party'


def _classify_payment(payment) -> tuple[str, str]:
    status, reason = _classify_payment_from_invoice(payment)
    if status:
        return status, reason

    status, reason = _classify_payment_from_bill(payment)
    if status:
        return status, reason

    return 'missing-source', 'no-invoice-or-bill'


class Command(BaseCommand):
    help = 'Audit accounting records missing Party links with root-cause categories and sample IDs.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--sample',
            type=int,
            default=10,
            help='How many IDs to print per root-cause bucket (default: 10).',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional per-model limit for staged analysis (0 = no limit).',
        )

    def _audit_queryset(self, queryset, classify_fn, *, sample: int):
        stats = Counter()
        reason_counts = Counter()
        reason_samples = defaultdict(list)

        for obj in queryset.iterator(chunk_size=200):
            status, reason = classify_fn(obj)
            stats[status] += 1
            reason_counts[reason] += 1
            if sample > 0 and len(reason_samples[reason]) < sample:
                reason_samples[reason].append(obj.pk)

        return stats, reason_counts, reason_samples

    def _print_model_report(self, *, title: str, stats: Counter, reason_counts: Counter, reason_samples: dict):
        total_missing_party = stats.get('linkable', 0) + stats.get('missing-source', 0)
        self.stdout.write(self.style.SUCCESS(f'{title}: total_missing_party={total_missing_party}'))
        self.stdout.write(f'  linkable={stats.get("linkable", 0)}')
        self.stdout.write(f'  missing_source={stats.get("missing-source", 0)}')

        if not reason_counts:
            return

        self.stdout.write('  root_causes:')
        for reason, count in reason_counts.most_common():
            ids = reason_samples.get(reason, [])
            self.stdout.write(f'    - {reason}: count={count}, sample_ids={ids}')

    def handle(self, *args, **options):
        sample = max(int(options['sample'] or 10), 0)
        limit = max(int(options['limit'] or 0), 0)

        invoice_qs = Invoice.objects.filter(party__isnull=True).select_related('customer', 'project__customer')
        bill_qs = Bill.objects.filter(party__isnull=True).select_related('supplier')
        quotation_qs = Quotation.objects.filter(party__isnull=True).select_related('customer', 'project__customer')
        payment_qs = Payment.objects.filter(party__isnull=True).select_related('invoice__customer', 'bill__supplier', 'invoice', 'bill')

        if limit > 0:
            invoice_qs = invoice_qs[:limit]
            bill_qs = bill_qs[:limit]
            quotation_qs = quotation_qs[:limit]
            payment_qs = payment_qs[:limit]

        self.stdout.write(self.style.SUCCESS('Accounting Party Link Audit'))
        self.stdout.write(f'Options: sample={sample}, limit={limit or "none"}')

        invoice_report = self._audit_queryset(invoice_qs, _classify_invoice, sample=sample)
        bill_report = self._audit_queryset(bill_qs, _classify_bill, sample=sample)
        quotation_report = self._audit_queryset(quotation_qs, _classify_quotation, sample=sample)
        payment_report = self._audit_queryset(payment_qs, _classify_payment, sample=sample)

        self._print_model_report(
            title='Invoice',
            stats=invoice_report[0],
            reason_counts=invoice_report[1],
            reason_samples=invoice_report[2],
        )
        self._print_model_report(
            title='Bill',
            stats=bill_report[0],
            reason_counts=bill_report[1],
            reason_samples=bill_report[2],
        )
        self._print_model_report(
            title='Quotation',
            stats=quotation_report[0],
            reason_counts=quotation_report[1],
            reason_samples=quotation_report[2],
        )
        self._print_model_report(
            title='Payment',
            stats=payment_report[0],
            reason_counts=payment_report[1],
            reason_samples=payment_report[2],
        )
