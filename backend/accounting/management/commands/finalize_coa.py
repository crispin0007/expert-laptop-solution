from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from accounting.models import Account, AccountGroup, JournalEntry, JournalLine
from accounting.services.journal_service import seed_chart_of_accounts, seed_account_groups
from tenants.models import Tenant


@dataclass
class CanonicalSpec:
    code: str
    name: str
    group_slug: str


CANONICAL_EQUITY = [
    CanonicalSpec(code='3100', name='Capital Account', group_slug='capital_account'),
    CanonicalSpec(code='3200', name='Retained Earnings', group_slug='reserves_surplus'),
]


class Command(BaseCommand):
    help = (
        'Finalize canonical Chart of Accounts structure for equity codes and '
        'optionally apply safe repairs.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=str, default=None, help='Tenant slug to target (optional).')
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Apply changes. Without this flag, command runs in dry-run mode.',
        )
        parser.add_argument(
            '--create-reclass-entry',
            action='store_true',
            help=(
                'When applying, post a reclassification journal for 3100->3200 only if '
                '3100 is named Retained Earnings and 3200 currently has zero movement.'
            ),
        )

    def _account_net_movement(self, tenant, account: Account) -> Decimal:
        totals = JournalLine.objects.filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            account=account,
        ).aggregate(d=Sum('debit'), c=Sum('credit'))
        debit = totals['d'] or Decimal('0')
        credit = totals['c'] or Decimal('0')
        if account.type in (Account.TYPE_ASSET, Account.TYPE_EXPENSE):
            return debit - credit
        return credit - debit

    def _ensure_parent(self, tenant, account: Account, parent_3000: Account, *, apply: bool):
        if account.parent_id == parent_3000.id:
            return
        if apply:
            account.parent = parent_3000
            account.save(update_fields=['parent'])
        self.stdout.write(f"  - {tenant.slug}: set parent of {account.code} to 3000")

    def _safe_update_core_fields(self, tenant, account: Account, spec: CanonicalSpec, group_map: dict, *, apply: bool):
        fields = []
        if account.type != Account.TYPE_EQUITY:
            account.type = Account.TYPE_EQUITY
            fields.append('type')
        group = group_map.get(spec.group_slug)
        if group is not None and account.group_id != group.id:
            account.group = group
            fields.append('group')
        if not account.is_system:
            account.is_system = True
            fields.append('is_system')

        if fields:
            if apply:
                account.save(update_fields=fields)
            self.stdout.write(f"  - {tenant.slug}: normalized {account.code} fields ({', '.join(fields)})")

    def _safe_rename(self, tenant, account: Account, expected_name: str, *, apply: bool):
        if account.name == expected_name:
            return
        if apply:
            account.name = expected_name
            account.save(update_fields=['name'])
        self.stdout.write(f"  - {tenant.slug}: renamed {account.code} to '{expected_name}'")

    def _maybe_reclass_3100_to_3200(self, tenant, a3100: Account, a3200: Account, *, apply: bool):
        move_amount = self._account_net_movement(tenant, a3100)
        if move_amount == Decimal('0'):
            self.stdout.write(f"  - {tenant.slug}: no reclass needed (3100 movement is zero)")
            return

        target_amount = self._account_net_movement(tenant, a3200)
        if target_amount != Decimal('0'):
            self.stdout.write(
                self.style.WARNING(
                    f"  - {tenant.slug}: skipped reclass; 3200 already has movement ({target_amount})"
                )
            )
            return

        msg = (
            f"  - {tenant.slug}: {'would post' if not apply else 'posted'} reclass entry "
            f"for amount {move_amount} from 3100 to 3200"
        )

        if not apply:
            self.stdout.write(msg)
            return

        today = timezone.localdate()
        entry = JournalEntry.objects.create(
            tenant=tenant,
            date=today,
            description='CoA finalization: move legacy retained earnings from 3100 to 3200',
            reference_type=JournalEntry.REF_MANUAL,
            is_posted=False,
        )

        amt = abs(move_amount)
        if move_amount > 0:
            JournalLine.objects.create(entry=entry, account=a3100, debit=amt, credit=Decimal('0'))
            JournalLine.objects.create(entry=entry, account=a3200, debit=Decimal('0'), credit=amt)
        else:
            JournalLine.objects.create(entry=entry, account=a3100, debit=Decimal('0'), credit=amt)
            JournalLine.objects.create(entry=entry, account=a3200, debit=amt, credit=Decimal('0'))

        entry.post()
        self.stdout.write(msg)

    def _normalize_parentless_accounts(self, tenant, *, apply: bool):
        """
        Re-parent non-control accounts that currently have parent=None.

        Rules:
          1) Bank ledger accounts (group=bank_accounts, code!=1150) -> parent 1150
          2) Nearest code-based parent in same type (1712->1710, 1710->1700)
          3) Type control account fallback (asset->1000, liability->2000, ...)
        """
        controls_by_type = {
            Account.TYPE_ASSET: '1000',
            Account.TYPE_LIABILITY: '2000',
            Account.TYPE_EQUITY: '3000',
            Account.TYPE_REVENUE: '4000',
            Account.TYPE_EXPENSE: '5000',
        }
        control_codes = set(controls_by_type.values())
        bank_control_code = '1150'

        accounts = list(
            Account.objects.filter(tenant=tenant).select_related('group').order_by('code', 'id')
        )
        by_code = {}
        for acc in accounts:
            by_code.setdefault(acc.code, []).append(acc)

        def pick_by_code(code: str):
            items = by_code.get(code) or []
            if not items:
                return None
            # Prefer system rows for structural parents.
            items = sorted(items, key=lambda a: (not a.is_system, a.id))
            return items[0]

        def nearest_parent_for(account: Account):
            if account.code in control_codes:
                return None

            if account.group and account.group.slug == 'bank_accounts' and account.code != bank_control_code:
                parent = pick_by_code(bank_control_code)
                if parent and parent.id != account.id:
                    return parent

            numeric = ''.join(ch for ch in (account.code or '') if ch.isdigit())
            if len(numeric) >= 4:
                cands = []
                cands.append(f"{numeric[:3]}0")
                cands.append(f"{numeric[:2]}00")
                cands.append(f"{numeric[:1]}000")
                seen = set()
                for c in cands:
                    if c in seen:
                        continue
                    seen.add(c)
                    parent = pick_by_code(c)
                    if not parent or parent.id == account.id:
                        continue
                    if parent.type == account.type:
                        return parent

            control = pick_by_code(controls_by_type.get(account.type, ''))
            if control and control.id != account.id:
                return control

            return None

        for acc in accounts:
            if acc.parent_id is not None:
                continue
            parent = nearest_parent_for(acc)
            if parent is None:
                continue
            if apply:
                acc.parent = parent
                acc.save(update_fields=['parent'])
            self.stdout.write(f"  - {tenant.slug}: re-parented {acc.code} -> {parent.code}")

    def _process_tenant(self, tenant, *, apply: bool, create_reclass_entry: bool):
        self.stdout.write(f'Processing tenant: {tenant.slug}')

        seed_account_groups(tenant)
        seed_chart_of_accounts(tenant)

        group_map = {g.slug: g for g in AccountGroup.objects.filter(tenant=tenant)}

        parent_3000 = Account.objects.filter(tenant=tenant, code='3000').first()
        if parent_3000 is None:
            self.stdout.write(self.style.ERROR(f"  - {tenant.slug}: missing 3000 Equity account"))
            return

        acct = {a.code: a for a in Account.objects.filter(tenant=tenant, code__in=['3100', '3200'])}
        legacy_3100_was_retained = 'retained' in ((acct.get('3100').name if acct.get('3100') else '') or '').lower()
        for spec in CANONICAL_EQUITY:
            if spec.code not in acct:
                self.stdout.write(self.style.ERROR(f"  - {tenant.slug}: missing required account {spec.code}"))
                continue
            current = acct[spec.code]
            self._ensure_parent(tenant, current, parent_3000, apply=apply)
            self._safe_update_core_fields(tenant, current, spec, group_map, apply=apply)
            self._safe_rename(tenant, current, spec.name, apply=apply)

        a3100 = acct.get('3100')
        a3200 = acct.get('3200')
        if create_reclass_entry and a3100 and a3200 and legacy_3100_was_retained:
            self._maybe_reclass_3100_to_3200(tenant, a3100, a3200, apply=apply)

        self._normalize_parentless_accounts(tenant, apply=apply)

    @transaction.atomic
    def handle(self, *args, **options):
        tenant_slug = options.get('tenant')
        apply = bool(options.get('apply'))
        create_reclass_entry = bool(options.get('create_reclass_entry'))

        qs = Tenant.objects.all().order_by('id')
        if tenant_slug:
            qs = qs.filter(slug=tenant_slug)

        if not qs.exists():
            self.stdout.write(self.style.ERROR('No matching tenants found.'))
            return

        mode = 'APPLY' if apply else 'DRY-RUN'
        self.stdout.write(self.style.SUCCESS(f'CoA finalization started ({mode}).'))

        for tenant in qs:
            self._process_tenant(
                tenant,
                apply=apply,
                create_reclass_entry=create_reclass_entry,
            )

        if not apply:
            transaction.set_rollback(True)

        self.stdout.write(self.style.SUCCESS('CoA finalization completed.'))
