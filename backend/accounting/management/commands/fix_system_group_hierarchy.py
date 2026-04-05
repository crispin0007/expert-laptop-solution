from __future__ import annotations

from django.core.management.base import BaseCommand

from accounting.models import AccountGroup
from accounting.services.journal_service import _GROUP_DEFS, seed_account_groups
from tenants.models import Tenant


class Command(BaseCommand):
    help = (
        'Ensure system account-group hierarchy exists (type roots + child groups) '
        'for one tenant or all tenants.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant',
            type=str,
            default=None,
            help='Tenant slug to target. If omitted, all tenants are processed.',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply changes. Without this flag, runs as dry-run.',
        )

    def handle(self, *args, **options):
        tenant_slug = options.get('tenant')
        apply = bool(options.get('apply'))

        tenants = Tenant.objects.all().order_by('id')
        if tenant_slug:
            tenants = tenants.filter(slug=tenant_slug)

        if not tenants.exists():
            self.stdout.write(self.style.ERROR('No matching tenants found.'))
            return

        desired_by_slug = {d['slug']: d for d in _GROUP_DEFS}

        total_changes = 0
        mode = 'APPLY' if apply else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'System group hierarchy check ({mode})'))

        for tenant in tenants:
            self.stdout.write(f'\nTenant: {tenant.slug}')

            if apply:
                # Creates missing groups and patches metadata/parents.
                seed_account_groups(tenant)

            group_map = {
                g.slug: g
                for g in AccountGroup.objects.filter(tenant=tenant, is_system=True)
            }

            for slug, spec in desired_by_slug.items():
                grp = group_map.get(slug)
                if grp is None:
                    if apply:
                        self.stdout.write(self.style.ERROR(f'  MISSING after apply: {slug}'))
                    else:
                        self.stdout.write(f'  WOULD create missing system group: {slug}')
                        total_changes += 1
                    continue

                parent_slug = spec.get('parent_slug')
                desired_parent = group_map.get(parent_slug) if parent_slug else None
                current_parent_slug = grp.parent.slug if grp.parent else None
                desired_parent_slug = desired_parent.slug if desired_parent else None

                if current_parent_slug != desired_parent_slug:
                    if apply:
                        grp.parent = desired_parent
                        grp.save(update_fields=['parent'])
                        self.stdout.write(
                            self.style.SUCCESS(
                                f'  UPDATED parent: {slug} {current_parent_slug} -> {desired_parent_slug}'
                            )
                        )
                    else:
                        self.stdout.write(
                            f'  WOULD update parent: {slug} {current_parent_slug} -> {desired_parent_slug}'
                        )
                    total_changes += 1

        self.stdout.write(f'\nTotal hierarchy changes: {total_changes}')
        self.stdout.write(self.style.SUCCESS('Done.'))
