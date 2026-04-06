from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import TenantMembership
from customers.models import Customer
from inventory.models import Supplier
from parties.services import (
    resolve_or_create_customer_party,
    resolve_or_create_staff_party,
    resolve_or_create_supplier_party,
)


class Command(BaseCommand):
    help = 'Backfill Party records from existing Customer, Supplier, and Staff profiles (idempotent).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report what would be created/linked without writing changes.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional per-model limit for safer staged rollout (0 = no limit).',
        )

    def handle(self, *args, **options):
        dry_run = bool(options['dry_run'])
        limit = int(options['limit'] or 0)

        customer_qs = Customer.objects.select_related('tenant', 'party')
        supplier_qs = Supplier.objects.select_related('tenant', 'party')
        staff_qs = TenantMembership.objects.select_related('tenant', 'party', 'user')
        if limit > 0:
            customer_qs = customer_qs[:limit]
            supplier_qs = supplier_qs[:limit]
            staff_qs = staff_qs[:limit]

        customer_stats = Counter()
        supplier_stats = Counter()
        staff_stats = Counter()

        with transaction.atomic():
            for customer in customer_qs.iterator(chunk_size=200):
                result = resolve_or_create_customer_party(customer, dry_run=dry_run)
                customer_stats[result.action] += 1
                if result.reason:
                    self.stdout.write(
                        self.style.WARNING(f'Customer #{customer.pk}: {result.action} ({result.reason})')
                    )

            for supplier in supplier_qs.iterator(chunk_size=200):
                result = resolve_or_create_supplier_party(supplier, dry_run=dry_run)
                supplier_stats[result.action] += 1
                if result.reason:
                    self.stdout.write(
                        self.style.WARNING(f'Supplier #{supplier.pk}: {result.action} ({result.reason})')
                    )

            for membership in staff_qs.iterator(chunk_size=200):
                result = resolve_or_create_staff_party(membership, dry_run=dry_run)
                staff_stats[result.action] += 1
                if result.reason:
                    self.stdout.write(
                        self.style.WARNING(f'Staff membership #{membership.pk}: {result.action} ({result.reason})')
                    )

            if dry_run:
                transaction.set_rollback(True)

        mode = 'DRY-RUN' if dry_run else 'WRITE'
        self.stdout.write(self.style.SUCCESS(f'Party backfill completed ({mode}).'))
        self.stdout.write(f'Customers: {dict(customer_stats)}')
        self.stdout.write(f'Suppliers: {dict(supplier_stats)}')
        self.stdout.write(f'Staff: {dict(staff_stats)}')
