"""
seed_accounting_demo
====================
Seeds a realistic Chart of Accounts + 60+ demo journal entries for the
first (or specified) tenant so that every report shows meaningful numbers.

    python manage.py seed_accounting_demo
    python manage.py seed_accounting_demo --tenant=basic
    python manage.py seed_accounting_demo --clear   # drops existing demo entries first

What gets seeded:
  - Full Chart of Accounts (22 accounts across 8 types)
  - AccountGroups via seed_account_groups()
  - 8 months of transactions:
      • Capital injection / owner equity
      • Multiple sales invoices → AR → Cash receipts
      • Supplier purchases → AP → Cash payments
      • Payroll expense entries
      • Depreciation
      • VAT & TDS liability entries
      • Bank account opening balance
"""
import datetime
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction


ZERO = Decimal('0')


class Command(BaseCommand):
    help = 'Seed demo Chart of Accounts and journal entries for the accounting reports.'

    def add_arguments(self, parser):
        parser.add_argument('--tenant', type=str, default=None)
        parser.add_argument('--clear', action='store_true', default=False,
                            help='Remove previously seeded demo entries before re-seeding.')

    def handle(self, *args, **options):
        from tenants.models import Tenant
        from accounts.models import User

        slug = options['tenant']
        qs = Tenant.objects.filter(is_deleted=False)
        if slug:
            qs = qs.filter(slug=slug)
        tenant = qs.first()
        if not tenant:
            self.stderr.write(self.style.ERROR('No tenant found.'))
            return

        user = User.objects.filter(
            memberships__tenant=tenant, memberships__is_admin=True
        ).first() or User.objects.filter(is_superadmin=True).first()
        if not user:
            self.stderr.write(self.style.ERROR('No admin user found for tenant.'))
            return

        self.stdout.write(f'Seeding demo data for tenant: {tenant.slug} ({tenant.name})')

        with transaction.atomic():
            if options['clear']:
                self._clear_demo(tenant)

            acct_map = self._seed_coa(tenant, user)
            self._seed_account_groups(tenant)
            self._seed_cost_centres(tenant)
            self._seed_journals(tenant, user, acct_map)

        self.stdout.write(self.style.SUCCESS('Done. Refresh any report to see live data.'))

    # ── Clear ─────────────────────────────────────────────────────────────────

    def _clear_demo(self, tenant):
        from accounting.models import JournalEntry
        deleted, _ = JournalEntry.objects.filter(
            tenant=tenant, description__startswith='[DEMO]'
        ).delete()
        self.stdout.write(f'  Cleared {deleted} demo journal entries.')

    # ── Chart of Accounts ─────────────────────────────────────────────────────

    def _seed_coa(self, tenant, user) -> dict:
        """
        Create 22 standard accounts. Idempotent — won't duplicate on re-run.
        Returns {code: Account} map.
        """
        from accounting.models import Account
        from accounting.services.journal_service import DEFAULT_ACCOUNTS

        system_codes = {code for code, _name, _type, _parent, _is_system in DEFAULT_ACCOUNTS}

        ACCOUNTS = [
            # code   name                             type
            ('1100', 'Cash in Hand',                  'asset'),
            ('1200', 'Accounts Receivable',           'asset'),
            ('1300', 'Inventory / Stock',             'asset'),
            ('1400', 'Prepaid Expenses',              'asset'),
            ('1700', 'Furniture & Fixtures',          'asset'),
            ('1710', 'Computer Equipment',            'asset'),
            ('2100', 'Accounts Payable',              'liability'),
            ('2200', 'VAT Payable (13%)',              'liability'),
            ('2300', 'TDS Payable',                   'liability'),
            ('2400', 'Salary Payable',                'liability'),
            ('3100', 'Owner Capital',                 'equity'),
            ('3200', 'Retained Earnings',             'equity'),
            ('4100', 'Service Revenue',               'revenue'),
            ('4110', 'Product Sales',                 'revenue'),
            ('4200', 'Installation Income',           'revenue'),
            ('4300', 'Interest Income',               'revenue'),
            ('5100', 'Cost of Goods Sold',            'expense'),
            ('5200', 'Direct Labour',                 'expense'),
            ('5400', 'Salary Expense',                'expense'),
            ('5410', 'Rent Expense',                  'expense'),
            ('5420', 'Depreciation Expense',          'expense'),
            ('5430', 'Internet & Utilities',          'expense'),
            ('5440', 'Marketing Expense',             'expense'),
        ]

        acct_map = {}
        for code, name, atype in ACCOUNTS:
            is_system = code in system_codes
            acct, created = Account.objects.get_or_create(
                tenant=tenant, code=code,
                defaults={'name': name, 'type': atype, 'is_system': is_system},
            )
            # Ensure core accounts are always active (in case they were deactivated)
            if not acct.is_active:
                acct.is_active = True
                acct.save(update_fields=['is_active'])

            # Keep demo-only accounts non-system and keep the demo bank generic.
            updates = []
            if acct.is_system != is_system:
                acct.is_system = is_system
                updates.append('is_system')
            if updates:
                acct.save(update_fields=updates)

            acct_map[code] = acct
            if created:
                self.stdout.write(f'  Created account {code} — {name}')
        return acct_map

    # ── AccountGroups ─────────────────────────────────────────────────────────

    def _seed_account_groups(self, tenant):
        from accounting.services.journal_service import seed_account_groups
        gmap = seed_account_groups(tenant)
        self.stdout.write(f'  AccountGroups seeded/verified: {len(gmap)}')

    # ── Cost Centres ──────────────────────────────────────────────────────────

    def _seed_cost_centres(self, tenant):
        from accounting.models import CostCentre
        defaults = [
            ('CC-001', 'Operations'),
            ('CC-002', 'Sales & Marketing'),
            ('CC-003', 'IT & Infrastructure'),
            ('CC-004', 'Human Resources'),
            ('CC-005', 'Finance'),
        ]
        created = 0
        for code, name in defaults:
            _, was_created = CostCentre.objects.get_or_create(
                tenant=tenant, code=code,
                defaults={'name': name, 'is_active': True},
            )
            if was_created:
                created += 1
        self.stdout.write(f'  Cost centres seeded/verified: {len(defaults)} ({created} new)')

    # ── Journal Entries ───────────────────────────────────────────────────────

    def _seed_journals(self, tenant, user, acct_map):
        from accounting.models import JournalEntry, JournalLine

        today = datetime.date.today()
        # Spread transactions across last 8 months
        def mo(months_ago, day=15):
            d = today.replace(day=1)
            m = d.month - months_ago
            y = d.year
            while m <= 0:
                m += 12
                y -= 1
            return datetime.date(y, m, min(day, 28))

        def je(date, description, lines):
            """Create and post one JournalEntry."""
            # Skip if already seeded (idempotent by description+date)
            if JournalEntry.objects.filter(
                tenant=tenant, description=description, date=date
            ).exists():
                return
            entry = JournalEntry.objects.create(
                tenant=tenant, created_by=user, date=date,
                description=description,
                reference_type=JournalEntry.REF_MANUAL,
            )
            for acc_code, dr, cr, desc in lines:
                JournalLine.objects.create(
                    entry=entry,
                    account=acct_map[acc_code],
                    debit=Decimal(str(dr)),
                    credit=Decimal(str(cr)),
                    description=desc,
                )
            entry.post()

        a = acct_map  # shorthand

        # ── Month 8 ago: Capital injection ────────────────────────────────
        je(mo(8, 1), '[DEMO] Capital injection — owner equity', [
            ('1100', '500000', '0',      'Cash deposited by owner'),
            ('3100', '0',      '500000', 'Owner equity contribution'),
        ])

        # ── Month 8 ago: Equipment purchase ───────────────────────────────
        je(mo(8, 5), '[DEMO] Computer equipment purchase', [
            ('1710', '85000', '0',     'Dell laptops x2'),
            ('1100', '0',     '85000', 'Cash paid'),
        ])

        # ── Month 7 ago: First sales ───────────────────────────────────────
        je(mo(7, 10), '[DEMO] Service invoice #001 — IT support', [
            ('1200', '113000', '0',      'AR: Tech Solutions Pvt Ltd'),
            ('4100', '0',      '100000', 'IT support services — monthly'),
            ('2200', '0',      '13000',  'VAT 13%'),
        ])
        je(mo(7, 20), '[DEMO] Receipt — Tech Solutions invoice', [
            ('1100', '113000', '0',      'Cash received'),
            ('1200', '0',      '113000', 'AR cleared'),
        ])

        # ── Month 7 ago: Purchase ──────────────────────────────────────────
        je(mo(7, 12), '[DEMO] Supplier purchase — network equipment', [
            ('5100', '45000', '0',     'Cisco switches x3'),
            ('2200', '5850',  '0',     'VAT input credit (claimable)'),
            ('2100', '0',     '50850', 'AP: Network Supplies Co'),
        ])
        je(mo(7, 25), '[DEMO] Payment — Network Supplies Co', [
            ('2100', '50850', '0',     'AP cleared'),
            ('1100', '0',     '50850', 'Cash paid'),
        ])

        # ── Month 7 ago: Payroll ───────────────────────────────────────────
        je(mo(7, 28), '[DEMO] Payroll — Month 1', [
            ('5400', '120000', '0',      'Gross salaries — 4 staff'),
            ('2300', '0',      '6000',   'TDS withheld 5%'),
            ('1100', '0',      '114000', 'Net salaries paid'),
        ])

        # ── Month 6 ago: Sales (product) ─────────────────────────────────
        je(mo(6, 8), '[DEMO] Product sales invoice #002', [
            ('1200', '226000', '0',      'AR: Digital Nepal Ltd'),
            ('4110', '0',      '200000', 'HP printers + accessories'),
            ('2200', '0',      '26000',  'VAT 13%'),
        ])
        je(mo(6, 22), '[DEMO] Receipt — Digital Nepal Ltd', [
            ('1100', '226000', '0',      'Bank transfer received'),
            ('1200', '0',      '226000', 'AR cleared'),
        ])

        # ── Month 6 ago: Rent ─────────────────────────────────────────────
        je(mo(6, 1), '[DEMO] Office rent — Month 2', [
            ('5410', '25000', '0',     'Monthly office rent'),
            ('1100', '0',     '25000', 'Cash paid'),
        ])

        # ── Month 5 ago: Multiple service jobs ────────────────────────────
        for i, (client, amt) in enumerate([
            ('Nepal Telecom', 75000),
            ('Sunrise Bank', 95000),
            ('Shree Airlines', 55000),
        ], start=3):
            vat = int(amt * 0.13)
            total = amt + vat
            je(mo(5, 5 + i * 5), f'[DEMO] Service invoice #{i+2:03d} — {client}', [
                ('1200', str(total), '0',     f'AR: {client}'),
                ('4100', '0',        str(amt), f'IT services — {client}'),
                ('2200', '0',        str(vat), 'VAT 13%'),
            ])
            je(mo(5, 8 + i * 5), f'[DEMO] Receipt — {client}', [
                ('1100', str(total), '0',      f'Cash received from {client}'),
                ('1200', '0',        str(total), 'AR cleared'),
            ])

        # ── Month 5 ago: Payroll ──────────────────────────────────────────
        je(mo(5, 28), '[DEMO] Payroll — Month 3', [
            ('5400', '125000', '0',      'Gross salaries'),
            ('2300', '0',      '6250',   'TDS 5%'),
            ('1100', '0',      '118750', 'Net paid'),
        ])

        # ── Month 4 ago: Direct labour on project ─────────────────────────
        je(mo(4, 15), '[DEMO] Direct labour — network cabling project', [
            ('5200', '35000', '0',     'Technician wages — on-site'),
            ('1100', '0',     '35000', 'Cash paid'),
        ])

        # ── Month 4 ago: Purchase — consumables ───────────────────────────
        je(mo(4, 10), '[DEMO] Purchase — consumables & supplies', [
            ('5100', '18000', '0',     'Cable, connectors, tools'),
            ('2100', '0',     '18000', 'AP: IT Mart'),
        ])
        je(mo(4, 20), '[DEMO] Payment — IT Mart', [
            ('2100', '18000', '0',     'AP cleared'),
            ('1100', '0',     '18000', 'Cash paid'),
        ])

        # ── Month 3 ago: Large enterprise deal ────────────────────────────
        je(mo(3, 5), '[DEMO] Enterprise contract invoice — CloudTech Ltd', [
            ('1200', '678000', '0',      'AR: CloudTech Ltd'),
            ('4100', '0',      '400000', 'Infrastructure setup'),
            ('4110', '0',      '200000', 'Hardware supply'),
            ('2200', '0',      '78000',  'VAT 13%'),
        ])
        je(mo(3, 25), '[DEMO] Partial receipt — CloudTech Ltd (50%)', [
            ('1100', '339000', '0',      'Part payment received'),
            ('1200', '0',      '339000', 'AR partial clearance'),
        ])

        # ── Month 3 ago: Depreciation ─────────────────────────────────────
        je(mo(3, 28), '[DEMO] Monthly depreciation — equipment', [
            ('5420', '2125', '0',    'Computer equipment depreciation (5yr SLM)'),
            ('1710', '0',    '2125', 'Accumulated depreciation'),
        ])

        # ── Month 2 ago: Recurring monthly entries ─────────────────────────
        je(mo(2, 1),  '[DEMO] Office rent — Month 6', [
            ('5410', '25000', '0',     'Monthly office rent'),
            ('1100', '0',     '25000', 'Cash paid'),
        ])
        je(mo(2, 28), '[DEMO] Payroll — Month 6', [
            ('5400', '130000', '0',      'Gross salaries'),
            ('2300', '0',      '6500',   'TDS 5%'),
            ('1100', '0',      '123500', 'Net paid'),
        ])
        je(mo(2, 28), '[DEMO] Depreciation — Month 6', [
            ('5420', '2125', '0',    'Computer equipment depreciation'),
            ('1710', '0',    '2125', 'Accumulated depreciation'),
        ])

        # ── Month 1 ago: Internet, utilities ──────────────────────────────
        je(mo(1, 5), '[DEMO] Internet & utilities expense', [
            ('5430', '12000', '0',     'Fiber internet + electricity'),
            ('1100', '0',     '12000', 'Cash paid'),
        ])
        je(mo(1, 10), '[DEMO] Marketing — social media ads', [
            ('5440', '15000', '0',     'Digital marketing'),
            ('1100', '0',     '15000', 'Cash paid'),
        ])
        je(mo(1, 28), '[DEMO] Payroll — Month 7', [
            ('5400', '130000', '0',      'Gross salaries'),
            ('2300', '0',      '6500',   'TDS 5%'),
            ('1100', '0',      '123500', 'Net paid'),
        ])

        # ── This month: current period ────────────────────────────────────
        je(mo(0, 5), '[DEMO] Service invoice — current month', [
            ('1200', '135780', '0',      'AR: New client — annual support'),
            ('4100', '0',      '120000', 'Annual IT support contract'),
            ('2200', '0',      '15780',  'VAT 13%'),
        ])
        je(mo(0, 10), '[DEMO] Interest income', [
            ('1150', '3500', '0',    'Bank interest credited'),
            ('4300', '0',    '3500', 'Interest income'),
        ])

        self.stdout.write(f'  Journal entries seeded.')
