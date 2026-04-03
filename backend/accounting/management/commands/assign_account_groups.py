"""
Management command: assign_account_groups

Backfills AccountGroup assignments for all existing tenants.

For each tenant:
  1. Seeds missing AccountGroups (idempotent via get_or_create).
  2. Looks up each seeded account by code and assigns it the correct group
     if it doesn't already have one.

Run once after the 0015_accountgroup migration is applied to existing deployments:

    python manage.py assign_account_groups
    python manage.py assign_account_groups --tenant=myslug   # single tenant
    python manage.py assign_account_groups --dry-run         # preview only
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Seed AccountGroups and backfill group assignments for all existing tenant accounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help='Process only the tenant with this slug.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Preview changes without saving.',
        )

    def handle(self, *args, **options):
        from tenants.models import Tenant
        from accounting.models import Account, AccountGroup
        from accounting.services.journal_service import (
            seed_account_groups,
            ACCOUNT_CODE_TO_GROUP,
        )

        slug_filter = options['tenant']
        dry_run     = options['dry_run']

        qs = Tenant.objects.filter(is_deleted=False)
        if slug_filter:
            qs = qs.filter(slug=slug_filter)

        if not qs.exists():
            self.stdout.write(self.style.WARNING('No tenants found.'))
            return

        total_groups_created = 0
        total_accounts_patched = 0

        for tenant in qs.iterator():
            self.stdout.write(f'\nTenant: {tenant.slug} ({tenant.name})')

            try:
                with transaction.atomic():
                    # Step 1: seed groups
                    group_map = seed_account_groups(tenant)
                    new_groups = len(group_map)
                    self.stdout.write(f'  Groups available: {new_groups}')
                    total_groups_created += new_groups

                    # Step 2: patch accounts that have no group
                    patched = 0
                    for code, group_slug in ACCOUNT_CODE_TO_GROUP.items():
                        try:
                            acct = Account.objects.get(tenant=tenant, code=code)
                        except Account.DoesNotExist:
                            continue
                        if acct.group_id is not None:
                            continue  # already assigned
                        group = group_map.get(group_slug)
                        if not group:
                            self.stdout.write(
                                self.style.WARNING(f'  [WARN] Group {group_slug} not found — skipping {code}')
                            )
                            continue
                        if not dry_run:
                            acct.group = group
                            acct.save(update_fields=['group'])
                        self.stdout.write(f'  {"[DRY]" if dry_run else "[OK]"} {code} → {group_slug}')
                        patched += 1

                    total_accounts_patched += patched
                    self.stdout.write(f'  Accounts patched: {patched}')

                    if dry_run:
                        raise transaction.TransactionManagementError('dry-run rollback')

            except transaction.TransactionManagementError:
                pass  # expected dry-run rollback
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'  ERROR on {tenant.slug}: {exc}'))

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Tenants processed: {qs.count()}  |  '
            f'Accounts patched: {total_accounts_patched}'
            f'{" (DRY RUN — no changes saved)" if dry_run else ""}'
        ))
