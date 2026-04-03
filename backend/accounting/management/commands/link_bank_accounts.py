"""
Management command: link_bank_accounts

For every BankAccount that has no linked_account, auto-create a Chart of
Accounts entry (type=asset, group=bank_accounts) and link it.

Usage:
    python manage.py link_bank_accounts
    python manage.py link_bank_accounts --tenant 3     # only one tenant
    python manage.py link_bank_accounts --dry-run      # preview, no writes
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Auto-create linked CoA Accounts for BankAccounts that have none.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=int, default=None,
                            help='Process only this tenant ID (default: all)')
        parser.add_argument('--dry-run', action='store_true',
                            help='Preview changes without writing to the DB')

    def handle(self, *args, **options):
        from accounting.models import Account, AccountGroup, BankAccount

        tenant_id = options['tenant']
        dry_run   = options['dry_run']

        qs = BankAccount.objects.filter(linked_account__isnull=True).select_related('tenant')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        if not qs.exists():
            self.stdout.write(self.style.SUCCESS('All bank accounts already have a linked_account. Nothing to do.'))
            return

        linked = 0
        skipped = 0

        for bank in qs:
            tenant = bank.tenant
            try:
                group = AccountGroup.objects.get(tenant=tenant, slug='bank_accounts')
            except AccountGroup.DoesNotExist:
                group = None

            existing = set(
                Account.objects.filter(tenant=tenant, code__regex=r'^11[5-9]\d$')
                .values_list('code', flat=True)
            )
            code = next(
                (str(n) for n in range(1150, 1200) if str(n) not in existing),
                None,
            )
            if code is None:
                self.stdout.write(
                    self.style.WARNING(
                        f'  SKIP  tenant={tenant_id} bank="{bank.name}" — bank account code range 1150–1199 exhausted'
                    )
                )
                skipped += 1
                continue

            self.stdout.write(
                f'  {"DRY " if dry_run else ""}LINK  tenant={tenant.id} bank="{bank.name}" → code {code}'
            )

            if not dry_run:
                account = Account.objects.create(
                    tenant=tenant,
                    code=code,
                    name=bank.name,
                    type=Account.TYPE_ASSET,
                    group=group,
                    description=f'Bank account: {bank.bank_name or bank.name}',
                    opening_balance=bank.opening_balance,
                    is_system=False,
                )
                bank.linked_account = account
                bank.save(update_fields=['linked_account'])

            linked += 1

        summary = f'{linked} linked, {skipped} skipped'
        if dry_run:
            self.stdout.write(self.style.WARNING(f'Dry run complete — {summary}'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Done — {summary}'))
