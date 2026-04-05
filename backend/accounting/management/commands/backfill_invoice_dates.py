from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from accounting.models import Invoice, JournalEntry


class Command(BaseCommand):
    help = (
        'Backfill missing Invoice.date using accounting-safe priority: '
        'posted invoice revenue journal date, then first posted invoice journal date, '
        'then created_at date as final fallback.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=str, default=None, help='Optional tenant slug.')
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist updates. Without this flag, runs in dry-run mode.',
        )

    @staticmethod
    def _resolve_invoice_date(invoice: Invoice):
        # 1) Preferred: posted revenue journal for this invoice
        revenue_entry = JournalEntry.objects.filter(
            tenant=invoice.tenant,
            reference_type=JournalEntry.REF_INVOICE,
            reference_id=invoice.pk,
            purpose=JournalEntry.PURPOSE_REVENUE,
            is_posted=True,
        ).order_by('date', 'id').first()
        if revenue_entry and revenue_entry.date:
            return revenue_entry.date, 'journal.revenue'

        # 2) Fallback: any posted invoice journal
        any_invoice_entry = JournalEntry.objects.filter(
            tenant=invoice.tenant,
            reference_type=JournalEntry.REF_INVOICE,
            reference_id=invoice.pk,
            is_posted=True,
        ).order_by('date', 'id').first()
        if any_invoice_entry and any_invoice_entry.date:
            return any_invoice_entry.date, 'journal.any'

        # 3) Final fallback for legacy rows
        return invoice.created_at.date(), 'created_at'

    @transaction.atomic
    def handle(self, *args, **options):
        tenant_slug = options.get('tenant')
        apply = bool(options.get('apply'))
        stats = Counter()

        mode = 'WRITE' if apply else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'Invoice date backfill started ({mode}).'))

        qs = Invoice.objects.filter(date__isnull=True).select_related('tenant')
        if tenant_slug:
            qs = qs.filter(tenant__slug=tenant_slug)

        for invoice in qs.iterator(chunk_size=200):
            resolved_date, source = self._resolve_invoice_date(invoice)
            stats[f'source.{source}'] += 1

            if apply:
                invoice.date = resolved_date
                invoice.save(update_fields=['date', 'updated_at'])
                stats['updated'] += 1
            else:
                stats['would_update'] += 1

        if not apply:
            transaction.set_rollback(True)

        if not stats:
            stats['none'] = 1

        self.stdout.write(self.style.SUCCESS(f'Invoice date backfill completed ({mode}).'))
        for key in sorted(stats.keys()):
            self.stdout.write(f'{key}: {stats[key]}')
