from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from accounting.models import Account, BankAccount
from accounting.services.journal_service import ensure_bank_control_account
from parties.models import Party


class Command(BaseCommand):
    help = 'Audit (and optionally repair) CoA integrity for bank and party ledgers.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--repair',
            action='store_true',
            help='Apply safe repairs where possible. Default is audit-only.',
        )

    def _control_accounts(self, tenant):
        return {
            'assets': Account.objects.filter(tenant=tenant, code='1000').first(),
            'bank': Account.objects.filter(tenant=tenant, code='1150').first(),
            'ar': Account.objects.filter(tenant=tenant, code='1200').first(),
            'ap': Account.objects.filter(tenant=tenant, code='2100').first(),
        }

    def _repair_bank_link(self, bank: BankAccount, bank_control: Account, *, stats: Counter):
        acct = bank.linked_account
        if acct is None:
            stats['bank.missing_link'] += 1
            return

        if acct.code == '1150':
            stats['bank.linked_to_control'] += 1
            return

        changed = False
        if acct.type != Account.TYPE_ASSET:
            acct.type = Account.TYPE_ASSET
            changed = True
        if acct.group is None or acct.group.slug != 'bank_accounts':
            group = acct.group
            if group is None or group.slug != 'bank_accounts':
                from accounting.models import AccountGroup
                acct.group = AccountGroup.objects.filter(tenant=bank.tenant, slug='bank_accounts').first()
                changed = True
        if acct.parent_id != bank_control.id:
            acct.parent = bank_control
            changed = True

        if changed:
            acct.save(update_fields=['type', 'group', 'parent'])
            stats['bank.repaired'] += 1

    def _audit_party_account(self, party: Party, controls: dict[str, Account], *, repair: bool, stats: Counter):
        acct = party.account
        if acct is None:
            stats['party.missing_account'] += 1
            return

        expected = None
        if party.party_type == Party.TYPE_CUSTOMER:
            expected = ('sundry_debtors', controls.get('ar'), Account.TYPE_ASSET)
        elif party.party_type == Party.TYPE_SUPPLIER:
            expected = ('sundry_creditors', controls.get('ap'), Account.TYPE_LIABILITY)

        if expected is None:
            return

        expected_group_slug, expected_parent, expected_type = expected
        group_ok = acct.group is not None and acct.group.slug == expected_group_slug
        parent_ok = expected_parent is not None and acct.parent_id == expected_parent.id
        type_ok = acct.type == expected_type

        if group_ok and parent_ok and type_ok:
            stats['party.ok'] += 1
            return

        stats['party.invalid_structure'] += 1
        if not repair:
            return

        changed = False
        if not type_ok:
            acct.type = expected_type
            changed = True
        if not group_ok:
            from accounting.models import AccountGroup
            acct.group = AccountGroup.objects.filter(tenant=party.tenant, slug=expected_group_slug).first()
            changed = True
        if not parent_ok and expected_parent is not None:
            acct.parent = expected_parent
            changed = True

        if changed:
            acct.save(update_fields=['type', 'group', 'parent'])
            stats['party.repaired'] += 1

    def handle(self, *args, **options):
        repair = bool(options['repair'])
        stats = Counter()

        tenant_ids = set(Account.objects.values_list('tenant_id', flat=True))
        mode = 'REPAIR' if repair else 'AUDIT'
        self.stdout.write(self.style.SUCCESS(f'CoA integrity {mode} started.'))

        with transaction.atomic():
            for tenant_id in tenant_ids:
                if tenant_id is None:
                    continue
                tenant = Account.objects.filter(tenant_id=tenant_id).values_list('tenant', flat=True).first()
                if tenant is None:
                    continue

                controls = self._control_accounts(Account.objects.filter(tenant_id=tenant_id).first().tenant)

                if repair:
                    bank_control = ensure_bank_control_account(Account.objects.filter(tenant_id=tenant_id).first().tenant)
                    controls['bank'] = bank_control

                bank_control = controls.get('bank')
                if bank_control is None:
                    stats['bank.missing_control'] += 1
                else:
                    stats['bank.control_ok'] += 1

                bank_qs = BankAccount.objects.filter(tenant_id=tenant_id, linked_account__isnull=False).select_related('linked_account__group', 'linked_account__parent', 'tenant')
                for bank in bank_qs:
                    acct = bank.linked_account
                    if acct is None:
                        stats['bank.missing_link'] += 1
                        continue
                    if acct.code == '1150':
                        stats['bank.linked_to_control'] += 1
                    if acct.group is None or acct.group.slug != 'bank_accounts':
                        stats['bank.wrong_group'] += 1
                    if bank_control is not None and acct.parent_id != bank_control.id:
                        stats['bank.wrong_parent'] += 1
                    if acct.type != Account.TYPE_ASSET:
                        stats['bank.wrong_type'] += 1
                    if repair and bank_control is not None:
                        self._repair_bank_link(bank, bank_control, stats=stats)

                party_qs = Party.objects.filter(tenant_id=tenant_id).select_related('account__group', 'account__parent', 'tenant')
                for party in party_qs:
                    self._audit_party_account(party, controls, repair=repair, stats=stats)

            if not repair:
                transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS(f'CoA integrity {mode} completed.'))
        for key in sorted(stats.keys()):
            self.stdout.write(f'{key}: {stats[key]}')
