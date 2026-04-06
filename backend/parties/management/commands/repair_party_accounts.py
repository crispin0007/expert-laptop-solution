from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from parties.models import Party
from parties.services import _ensure_party_ledger_account


class Command(BaseCommand):
    help = 'Repair missing CoA ledger links for customer/supplier/staff Party rows.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be repaired without saving changes.',
        )
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help='Optional tenant slug to repair only one tenant.',
        )

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        tenant_slug = options.get('tenant')

        qs = Party.objects.filter(
            party_type__in=[Party.TYPE_CUSTOMER, Party.TYPE_SUPPLIER, Party.TYPE_STAFF],
            account__isnull=True,
            is_active=True,
        ).select_related('tenant', 'created_by')

        if tenant_slug:
            qs = qs.filter(tenant__slug=tenant_slug)

        stats = Counter()
        mode = 'DRY-RUN' if dry_run else 'WRITE'
        self.stdout.write(self.style.SUCCESS(f'Party account repair started ({mode}).'))

        with transaction.atomic():
            for party in qs.iterator(chunk_size=200):
                if dry_run:
                    stats['would-repair'] += 1
                    continue

                before = party.account_id
                _ensure_party_ledger_account(party, dry_run=False)
                party.refresh_from_db(fields=['account'])
                if party.account_id and party.account_id != before:
                    stats['repaired'] += 1
                else:
                    stats['skipped'] += 1

            if dry_run:
                transaction.set_rollback(True)

        if not stats:
            stats['none'] = 1

        self.stdout.write(self.style.SUCCESS(f'Party account repair completed ({mode}).'))
        for key in sorted(stats.keys()):
            self.stdout.write(f'{key}: {stats[key]}')
