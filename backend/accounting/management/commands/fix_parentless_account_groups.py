from __future__ import annotations

from django.core.management.base import BaseCommand

from accounting.models import AccountGroup
from tenants.models import Tenant


PREFERRED_PARENT_SLUG = {
    'asset': 'other_current_assets',
    'liability': 'current_liabilities',
    'equity': 'capital_account',
    'revenue': 'indirect_income',
    'expense': 'indirect_expense',
}


class Command(BaseCommand):
    help = (
        'Fix custom active account groups that have no parent by attaching them '
        'to a suitable system parent per type.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help='Tenant slug to process. If omitted, all tenants are processed.',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply changes. Without this flag, command runs in dry-run mode.',
        )

    def _choose_parent(self, tenant: Tenant, group_type: str):
        preferred_slug = PREFERRED_PARENT_SLUG[group_type]
        preferred = AccountGroup.objects.filter(
            tenant=tenant,
            slug=preferred_slug,
            is_active=True,
        ).first()
        if preferred:
            return preferred

        return AccountGroup.objects.filter(
            tenant=tenant,
            type=group_type,
            is_system=True,
            is_active=True,
        ).order_by('order', 'id').first()

    def handle(self, *args, **options):
        tenant_slug = options.get('tenant')
        apply = bool(options.get('apply'))

        tenants = Tenant.objects.all().order_by('id')
        if tenant_slug:
            tenants = tenants.filter(slug=tenant_slug)

        if not tenants.exists():
            self.stdout.write(self.style.ERROR('No matching tenants found.'))
            return

        mode = 'APPLY' if apply else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'Starting parentless account-group fix ({mode}).'))

        updated = 0
        skipped = 0
        checked = 0

        for tenant in tenants:
            targets = AccountGroup.objects.filter(
                tenant=tenant,
                is_active=True,
                is_system=False,
                parent__isnull=True,
            ).order_by('type', 'order', 'id')

            if not targets.exists():
                continue

            self.stdout.write(f'\nTenant: {tenant.slug}')
            for group in targets:
                checked += 1
                parent = self._choose_parent(tenant, group.type)

                if not parent or parent.id == group.id:
                    skipped += 1
                    self.stdout.write(
                        self.style.WARNING(
                            f'  SKIP   {group.id} {group.name} ({group.type}) -> no suitable parent'
                        )
                    )
                    continue

                if apply:
                    group.parent = parent
                    group.save(update_fields=['parent'])
                    updated += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'  UPDATE {group.id} {group.name} ({group.type}) -> '
                            f'{parent.id} {parent.name} [{parent.slug}]'
                        )
                    )
                else:
                    updated += 1
                    self.stdout.write(
                        f'  WOULD  {group.id} {group.name} ({group.type}) -> '
                        f'{parent.id} {parent.name} [{parent.slug}]'
                    )

        self.stdout.write('\nSummary')
        self.stdout.write(f'  checked: {checked}')
        self.stdout.write(f'  changes: {updated}')
        self.stdout.write(f'  skipped: {skipped}')
        self.stdout.write(self.style.SUCCESS('Done.'))
