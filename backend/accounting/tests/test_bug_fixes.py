"""
test_bug_fixes.py
=================
Regression tests for accounting bug fixes B1–B25.

Each test is labelled with the bug ID it covers so failures are
immediately traceable back to the fix.

Run inside Docker:
    docker exec nexusbms-web-1 python -m pytest accounting/tests/test_bug_fixes.py -v
"""
import pytest
from decimal import Decimal
import datetime


# ─── Shared fixtures ─────────────────────────────────────────────────────────

@pytest.fixture
def tenant(db):
    """Create a minimal tenant. CoA is seeded by post_save signal on Tenant."""
    from tenants.models import Tenant
    t = Tenant.objects.create(
        name="BugTest Co", slug="bugtestco",
        vat_enabled=True, vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
    )
    return t


@pytest.fixture
def admin_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user(
        "bugtest_admin",
        email="admin@bugtestco.com",
        password="testpassword",
    )
    TenantMembership.objects.create(
        user=user, tenant=tenant, role="admin", is_active=True,
    )
    return user


@pytest.fixture
def coa_accounts(tenant):
    """Return a dict mapping account code → Account for easy test access."""
    from accounting.models import Account
    return {a.code: a for a in Account.objects.filter(tenant=tenant)}


# ─────────────────────────────────────────────────────────────────────────────
# B1 — Payslip journal uses true gross (base + bonus), not net + tds
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def payroll_accounts(db, tenant, admin_user):
    """
    Extra accounts required by payslip tests that are NOT in DEFAULT_ACCOUNTS:
      1400 — Loans & Advances (asset, loans_advances_asset group)
      2310 — PF Payable (liability, duties_taxes_tds group — Nepal provident fund)

    Idempotent: uses get_or_create so it is safe to call in multiple tests.
    """
    from accounting.models import Account, AccountGroup

    loans_group, _ = AccountGroup.objects.get_or_create(
        tenant=tenant, slug='loans_advances_asset',
        defaults={
            'name': 'Loans & Advances (Asset)', 'type': 'asset',
            'report_section': 'bs_current_assets', 'affects_gross_profit': False,
            'normal_balance': 'debit', 'order': 70, 'is_system': True,
        },
    )
    tds_group = AccountGroup.objects.get(tenant=tenant, slug='duties_taxes_tds')

    acc_1400, _ = Account.objects.get_or_create(
        tenant=tenant, code='1400',
        defaults={'name': 'Loans & Advances', 'type': 'asset',
                  'group': loans_group, 'is_system': True, 'created_by': admin_user},
    )
    acc_2310, _ = Account.objects.get_or_create(
        tenant=tenant, code='2310',
        defaults={'name': 'PF Payable', 'type': 'liability',
                  'group': tds_group, 'is_system': False, 'created_by': admin_user},
    )
    return {'1400': acc_1400, '2310': acc_2310}


# ─────────────────────────────────────────────────────────────────────────────
# B1 — Payslip journal: true gross, per-deduction accounts, guaranteed balance
# ─────────────────────────────────────────────────────────────────────────────

class TestB1PayslipGross:
    """
    B1 covers three related payslip journal fixes applied together:
      1. Dr Salary = gross_amount (or base+bonus), never net_pay+tds.
      2. deduction_breakdown routes each deduction to its own account.
      3. cash_credit is DERIVED (gross - tds - sum_deductions) for guaranteed balance.
      4. ValidationError raised when deductions + TDS exceed gross.
    """

    @pytest.mark.django_db
    def test_payslip_journal_uses_base_plus_bonus(self, tenant, admin_user, payroll_accounts):
        """Dr Salary line must equal base_salary + bonus (not net_pay + tds)."""
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 4, 1),
            period_end=datetime.date(2024, 4, 30),
            base_salary=Decimal("30000"),
            bonus=Decimal("5000"),
            tds_amount=Decimal("3500"),
            deductions=Decimal("1000"),
            net_pay=Decimal("30500"),   # gross(35000) - tds(3500) - ded(1000)
            gross_amount=Decimal("0"),  # intentionally zero → force base+bonus path
            status=Payslip.STATUS_PAID,
        )

        entry = create_payslip_journal(payslip, created_by=admin_user)

        assert entry is not None
        assert entry.total_debit == Decimal("35000"), (
            f"B1: Dr Salary expected 35000 (base+bonus), got {entry.total_debit}. "
            "Old bug gave 34000 (net_pay+tds, dropping the 1000 deduction)."
        )

    @pytest.mark.django_db
    def test_journal_always_balances(self, tenant, admin_user, payroll_accounts):
        """total_debit must equal total_credit for every payslip journal."""
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        # gross_amount stores only the coin-earnings component (coins × rate).
        # Here there are no coins, so gross_amount=0.
        # Total journal gross = base_salary(50000) + bonus(5000) + gross_amount(0) = 55000.
        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 6, 1),
            period_end=datetime.date(2024, 6, 30),
            base_salary=Decimal("50000"),
            bonus=Decimal("5000"),
            tds_amount=Decimal("5000"),
            deductions=Decimal("3000"),
            net_pay=Decimal("47000"),   # 55000 - 5000 - 3000
            gross_amount=Decimal("0"),   # no coin earnings
            status=Payslip.STATUS_PAID,
        )

        entry = create_payslip_journal(payslip, created_by=admin_user)

        assert entry is not None
        total_dr = sum(l.debit  for l in entry.lines.all())
        total_cr = sum(l.credit for l in entry.lines.all())
        assert total_dr == total_cr, (
            f"B1: Journal imbalance — Dr {total_dr} ≠ Cr {total_cr}"
        )
        assert total_dr == Decimal("55000")

    @pytest.mark.django_db
    def test_deduction_breakdown_routes_per_account(self, tenant, admin_user, payroll_accounts):
        """
        Each item in deduction_breakdown must produce its own credit line
        to the specified account (not a lump line to Loans & Advances).
        """
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        # gross_amount stores only the coin-earnings component (coins × rate).
        # Here there are no coins, so gross_amount=0.
        # Total journal gross = base_salary(40000) + bonus(0) + gross_amount(0) = 40000.
        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 7, 1),
            period_end=datetime.date(2024, 7, 31),
            base_salary=Decimal("40000"),
            bonus=Decimal("0"),
            tds_amount=Decimal("4000"),
            # deductions aggregate = PF(2000) + loan_repayment(1000) = 3000
            deductions=Decimal("3000"),
            deduction_breakdown=[
                {"label": "PF Contribution", "amount": "2000.00", "account_code": "2310"},
                {"label": "Loan Repayment",  "amount": "1000.00", "account_code": "1400"},
            ],
            net_pay=Decimal("33000"),   # 40000 - 4000 - 3000
            gross_amount=Decimal("0"),   # no coin earnings
            status=Payslip.STATUS_PAID,
        )

        entry = create_payslip_journal(payslip, created_by=admin_user)

        assert entry is not None
        lines = list(entry.lines.select_related('account').all())

        # Verify balance
        total_dr = sum(l.debit  for l in lines)
        total_cr = sum(l.credit for l in lines)
        assert total_dr == total_cr, f"Journal must balance — Dr {total_dr} ≠ Cr {total_cr}"
        assert total_dr == Decimal("40000")

        # Verify per-account routing: PF (2310) and Loans (1400) must appear as separate lines
        credit_accounts = {l.account.code for l in lines if l.credit > 0}
        assert '2310' in credit_accounts, (
            "B1: PF deduction (account 2310) missing from journal lines. "
            f"Credit accounts present: {credit_accounts}"
        )
        assert '1400' in credit_accounts, (
            "B1: Loan repayment deduction (account 1400) missing from journal lines. "
            f"Credit accounts present: {credit_accounts}"
        )

        # Must NOT be a single lump-sum line — each deduction must be separate
        deduction_credit_lines = [l for l in lines if l.credit > 0 and l.account.code in ('2310', '1400')]
        assert len(deduction_credit_lines) == 2, (
            f"Expected 2 separate deduction credit lines, got {len(deduction_credit_lines)}"
        )

    @pytest.mark.django_db
    def test_cash_credit_derived_not_raw_net_pay(self, tenant, admin_user, payroll_accounts):
        """
        cash_credit must equal gross - tds - sum_deductions, not the raw net_pay field.
        This ensures balance even when net_pay has a rounding difference.
        """
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        # Introduce a 1 paisa discrepancy in net_pay (common from frontend rounding)
        # gross_amount=0: no coin earnings; total gross = base_salary(30000) + bonus(0) + 0 = 30000.
        gross = Decimal("30000.00")
        tds   = Decimal("3000.00")
        ded   = Decimal("1500.00")
        expected_cash_credit = gross - tds - ded  # 25500.00

        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 8, 1),
            period_end=datetime.date(2024, 8, 31),
            base_salary=Decimal("30000"),
            bonus=Decimal("0"),
            tds_amount=tds,
            deductions=ded,
            net_pay=Decimal("25499.99"),    # 1 paisa off — rounding artifact
            gross_amount=Decimal("0"),       # no coin earnings
            status=Payslip.STATUS_PAID,
        )

        entry = create_payslip_journal(payslip, created_by=admin_user)

        assert entry is not None
        cash_lines = [
            l for l in entry.lines.select_related('account').all()
            if l.account.code == '1100'   # Cash / Bank
        ]
        assert len(cash_lines) == 1
        assert cash_lines[0].credit == expected_cash_credit, (
            f"B1: Cash credit should be derived ({expected_cash_credit}), "
            f"got {cash_lines[0].credit}. Using raw net_pay (25499.99) would leave journal unbalanced."
        )
        # And the journal still balances
        total_dr = sum(l.debit  for l in entry.lines.all())
        total_cr = sum(l.credit for l in entry.lines.all())
        assert total_dr == total_cr

    @pytest.mark.django_db
    def test_deductions_exceed_gross_raises_validation_error(self, tenant, admin_user, payroll_accounts):
        """
        ValidationError must be raised when deductions + TDS > gross.
        Posting such an entry would produce a negative cash_credit (bank account Dr).
        """
        from django.core.exceptions import ValidationError
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        # gross_amount=0: no coin earnings; total gross = base_salary(10000) + bonus(0) + 0 = 10000.
        # deductions(10000) + tds(1000) = 11000 > gross(10000) → must raise ValidationError.
        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 9, 1),
            period_end=datetime.date(2024, 9, 30),
            base_salary=Decimal("10000"),
            bonus=Decimal("0"),
            tds_amount=Decimal("1000"),
            deductions=Decimal("10000"),    # total deductions 11000 > gross 10000
            net_pay=Decimal("0"),
            gross_amount=Decimal("0"),       # no coin earnings
            status=Payslip.STATUS_PAID,
        )

        with pytest.raises(ValidationError, match="exceed gross"):
            create_payslip_journal(payslip, created_by=admin_user)

    @pytest.mark.django_db
    def test_deduction_breakdown_invalid_amount_raises(self, tenant, admin_user, payroll_accounts):
        """ValidationError when a breakdown item has a non-numeric amount."""
        from django.core.exceptions import ValidationError
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        # gross_amount=0: no coin earnings; total gross = base_salary(20000) + bonus(0) + 0 = 20000.
        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 10, 1),
            period_end=datetime.date(2024, 10, 31),
            base_salary=Decimal("20000"),
            bonus=Decimal("0"),
            tds_amount=Decimal("2000"),
            deductions=Decimal("1000"),
            deduction_breakdown=[
                {"label": "Bad item", "amount": "not-a-number", "account_code": "1400"},
            ],
            net_pay=Decimal("17000"),
            gross_amount=Decimal("0"),   # no coin earnings
            status=Payslip.STATUS_PAID,
        )

        with pytest.raises(ValidationError):
            create_payslip_journal(payslip, created_by=admin_user)

    @pytest.mark.django_db
    def test_empty_breakdown_falls_back_to_lump_deductions(self, tenant, admin_user, payroll_accounts):
        """When deduction_breakdown is empty, deductions posts as one line to Loans & Advances."""
        from accounting.models import Payslip
        from accounting.services.journal_service import create_payslip_journal

        # gross_amount=0: no coin earnings; total gross = base_salary(20000) + bonus(0) + 0 = 20000.
        payslip = Payslip.objects.create(
            tenant=tenant,
            staff=admin_user,
            period_start=datetime.date(2024, 11, 1),
            period_end=datetime.date(2024, 11, 30),
            base_salary=Decimal("20000"),
            bonus=Decimal("0"),
            tds_amount=Decimal("2000"),
            deductions=Decimal("3000"),
            deduction_breakdown=[],        # fallback path
            net_pay=Decimal("15000"),
            gross_amount=Decimal("0"),   # no coin earnings
            status=Payslip.STATUS_PAID,
        )

        entry = create_payslip_journal(payslip, created_by=admin_user)

        assert entry is not None
        lines = list(entry.lines.select_related('account').all())

        # 4 lines: Dr Salary, Cr TDS, Cr Loans, Cr Cash
        assert len(lines) == 4, f"Expected 4 lines, got {len(lines)}"
        loans_cr = [l for l in lines if l.account.code == '1400' and l.credit > 0]
        assert len(loans_cr) == 1, "Should have exactly one lump Loans & Advances credit"
        assert loans_cr[0].credit == Decimal("3000")

        total_dr = sum(l.debit  for l in lines)
        total_cr = sum(l.credit for l in lines)
        assert total_dr == total_cr


# ─────────────────────────────────────────────────────────────────────────────
# B2 — Trial balance bulk query (no N+1)
# ─────────────────────────────────────────────────────────────────────────────

class TestB2TrialBalancePerformance:
    @pytest.mark.django_db
    def test_trial_balance_uses_bulk_queries(self, tenant):
        """
        trial_balance() must fire exactly 2 GROUP BY queries regardless of
        account count — never one query per account.
        """
        from accounting.services.report_service import trial_balance
        from django.test.utils import CaptureQueriesContext
        from django.db import connection

        today = datetime.date.today()
        start = today.replace(day=1)

        with CaptureQueriesContext(connection) as ctx:
            result = trial_balance(tenant, start, today)

        # The function makes exactly 2 DB calls:
        # 1. SELECT accounts
        # 2. GROUP BY debit (all-time pre-period totals)
        # 3. GROUP BY credit (period totals)
        # Allow overhead for Django internals / transaction savepoints (max 10 total).
        query_count = len(ctx.captured_queries)
        assert query_count <= 10, (
            f"B2 FAIL: trial_balance fired {query_count} queries. "
            "Expected ≤10 (2 bulk GROUP BY + minimal overhead). "
            "N+1 pattern would fire 2×N queries for N accounts."
        )


# ─────────────────────────────────────────────────────────────────────────────
# B3 — UniqueConstraint prevents duplicate posted journal entries per document
# ─────────────────────────────────────────────────────────────────────────────

class TestB3DuplicateJournalConstraint:
    @pytest.mark.django_db
    def test_duplicate_posted_journal_raises_integrity_error(self, tenant, admin_user):
        """
        Two posted JournalEntries for the same (tenant, reference_type, reference_id)
        must be rejected by the DB-level UniqueConstraint.
        """
        from django.db import IntegrityError
        from accounting.models import JournalEntry

        common_kwargs = dict(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date.today(),
            description="Test entry",
            reference_type=JournalEntry.REF_INVOICE,
            reference_id=9999,
            is_posted=True,
        )
        JournalEntry.objects.create(**common_kwargs)
        with pytest.raises(IntegrityError):
            JournalEntry.objects.create(**common_kwargs)

    @pytest.mark.django_db
    def test_two_manual_entries_are_allowed(self, tenant, admin_user):
        """
        The constraint excludes REF_MANUAL entries — two manual journals should
        coexist without error.
        """
        from accounting.models import JournalEntry

        for _ in range(2):
            JournalEntry.objects.create(
                tenant=tenant,
                created_by=admin_user,
                date=datetime.date.today(),
                description="Manual journal",
                reference_type=JournalEntry.REF_MANUAL,
                reference_id=None,
                is_posted=True,
            )
        assert JournalEntry.objects.filter(
            tenant=tenant, reference_type=JournalEntry.REF_MANUAL
        ).count() == 2


# ─────────────────────────────────────────────────────────────────────────────
# B4 — create_cogs_journal raises ValidationError for zero-cost or missing product
# ─────────────────────────────────────────────────────────────────────────────

class TestB4CogsWarning:
    """
    B4 changed create_cogs_journal() from a silent log.warning+skip to a hard
    ValidationError.  This prevents inventory overstatement from silently
    entering the books.
    """

    @pytest.mark.django_db
    def test_cogs_zero_cost_snapshot_raises_validation_error(self, tenant, admin_user):
        """
        When cost_price_snapshot is present but zero, ValidationError must be raised.
        Old code: logged a warning and returned None (inventory overstatement entered silently).
        New code: raises ValidationError — the invoice cannot be issued with a zero-cost product.
        """
        from django.core.exceptions import ValidationError
        from accounting.models import Invoice
        from accounting.services.journal_service import create_cogs_journal
        from accounting.services.invoice_service import compute_invoice_totals

        line_items = [
            {
                "description": "Zero-cost item",
                "qty": 1,
                "unit_price": "500.00",
                "line_type": "product",
                "product_id": 99999,
                "cost_price_snapshot": "0",   # zero snapshot → ValidationError
            }
        ]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        invoice = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=line_items,
            subtotal=subtotal,
            vat_rate=tenant.vat_rate,
            vat_amount=vat_amount,
            total=total,
            status=Invoice.STATUS_ISSUED,
        )

        with pytest.raises(ValidationError, match="cost_price_snapshot"):
            create_cogs_journal(invoice, created_by=admin_user)

    @pytest.mark.django_db
    def test_cogs_missing_product_id_raises_validation_error(self, tenant, admin_user):
        """
        A product line with no product_id must raise ValidationError.
        The inventory linkage is broken — this should never silently pass.
        """
        from django.core.exceptions import ValidationError
        from accounting.models import Invoice
        from accounting.services.journal_service import create_cogs_journal
        from accounting.services.invoice_service import compute_invoice_totals

        line_items = [
            {
                "description": "Orphaned product line",
                "qty": 2,
                "unit_price": "300.00",
                "line_type": "product",
                # product_id intentionally absent
            }
        ]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        invoice = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=line_items,
            subtotal=subtotal,
            vat_rate=tenant.vat_rate,
            vat_amount=vat_amount,
            total=total,
            status=Invoice.STATUS_ISSUED,
        )

        with pytest.raises(ValidationError, match="product_id"):
            create_cogs_journal(invoice, created_by=admin_user)

    @pytest.mark.django_db
    def test_service_only_invoice_returns_none(self, tenant, admin_user):
        """Service-only invoices (no product lines) must return None — no COGS entry."""
        from accounting.models import Invoice
        from accounting.services.journal_service import create_cogs_journal
        from accounting.services.invoice_service import compute_invoice_totals

        line_items = [
            {"description": "Consultation", "qty": 1, "unit_price": "1000.00",
             "discount": "0", "line_type": "service"}
        ]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        invoice = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=line_items,
            subtotal=subtotal,
            vat_rate=tenant.vat_rate,
            vat_amount=vat_amount,
            total=total,
            status=Invoice.STATUS_ISSUED,
        )

        result = create_cogs_journal(invoice, created_by=admin_user)
        assert result is None, "Service-only invoices should produce no COGS entry"


# ─────────────────────────────────────────────────────────────────────────────
# B5 — Void reversal uses invoice date, not today
# ─────────────────────────────────────────────────────────────────────────────

class TestB5VoidReversalDate:
    @pytest.mark.django_db
    def test_reversal_entry_date_matches_invoice_date(self, tenant, admin_user):
        """
        reverse_invoice_journal() must use the invoice's own date, not
        timezone.localdate() — the old bug would put the reversal in the
        wrong fiscal period when the invoice was from a previous month.
        """
        from accounting.models import Invoice, JournalEntry
        from accounting.services.journal_service import (
            create_invoice_journal,
            reverse_invoice_journal,
        )
        from accounting.services.invoice_service import compute_invoice_totals

        invoice_date = datetime.date(2024, 1, 15)   # January — different from today
        line_items = [
            {"description": "Service", "qty": 1, "unit_price": "1000.00",
             "discount": "0", "line_type": "service"}
        ]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        invoice = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=invoice_date,
            line_items=line_items,
            subtotal=subtotal,
            vat_rate=tenant.vat_rate,
            vat_amount=vat_amount,
            total=total,
            status=Invoice.STATUS_ISSUED,
        )

        # Create the original journal for the invoice
        original_entry = create_invoice_journal(invoice, created_by=admin_user)

        # Now reverse it (void)
        reversal_entry = reverse_invoice_journal(invoice, created_by=admin_user)

        assert reversal_entry is not None, "Reversal entry should be created"
        assert reversal_entry.date == invoice_date, (
            f"B5 FAIL: Reversal date {reversal_entry.date} ≠ invoice date {invoice_date}. "
            "Old bug would use today's date, crossing fiscal period boundary."
        )


# ─────────────────────────────────────────────────────────────────────────────
# B6 — Account code 5200 maps to indirect_expense (not direct_expense)
# ─────────────────────────────────────────────────────────────────────────────

class TestB6AccountGroupMapping:
    def test_5200_maps_to_indirect_expense(self):
        """Salary expense (5200) must be indirect — does not affect gross profit."""
        from accounting.services.journal_service import _slug_for_code
        assert _slug_for_code("5200", "expense") == "indirect_expense", (
            "B6 FAIL: 5200 mapped to direct_expense. "
            "Salary would appear in Gross Profit section of P&L (incorrect)."
        )

    def test_5300_maps_to_indirect_expense(self):
        """Other expenses (5300) must also be indirect."""
        from accounting.services.journal_service import _slug_for_code
        assert _slug_for_code("5300", "expense") == "indirect_expense"

    def test_5100_maps_to_purchase_accounts(self):
        """COGS / purchases (5100) should be purchase_accounts (direct cost)."""
        from accounting.services.journal_service import _slug_for_code
        result = _slug_for_code("5100", "expense")
        assert result == "purchase_accounts", (
            f"B6 sanity: 5100 should be purchase_accounts, got {result}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# B7 — Bill TDS entry uses BS calendar (Bikram Sambat) period
# ─────────────────────────────────────────────────────────────────────────────

class TestB7TdsBsCalendar:
    @pytest.mark.django_db
    def test_tds_entry_period_month_is_valid_bs_month(self, tenant, admin_user):
        """
        Auto-created TDSEntry for an approved Bill must record period_month in
        the Bikram Sambat calendar.

        BS months run 1–12, where month 1 = Baisakh (≈ April).
        The key assertion is that period_month is in 1..12 and that the
        TDSEntry was actually created (not silently skipped).
        """
        from accounting.models import Bill, TDSEntry
        from core.nepali_date import ad_to_bs

        bill = Bill.objects.create(
            tenant=tenant,
            created_by=admin_user,
            supplier_name="Test Supplier",
            line_items=[{"description": "Service", "qty": 1, "unit_price": "10000.00"}],
            subtotal=Decimal("10000"),
            total=Decimal("10000"),
            tds_rate=Decimal("0.10"),
            status=Bill.STATUS_DRAFT,
        )
        # Trigger the handle_bill_tds signal by setting status → approved
        bill.status = Bill.STATUS_APPROVED
        bill.save(update_fields=["status"])

        entry = TDSEntry.objects.filter(tenant=tenant, bill=bill).first()
        assert entry is not None, "TDSEntry should be auto-created on Bill approval"

        today_bs = ad_to_bs(datetime.date.today())
        assert entry.period_month == today_bs.month, (
            f"B7 FAIL: period_month={entry.period_month} but BS month={today_bs.month}. "
            f"(AD month={datetime.date.today().month})"
        )
        assert entry.period_year == today_bs.year, (
            f"B7 FAIL: period_year={entry.period_year} but BS year={today_bs.year}."
        )


# ─────────────────────────────────────────────────────────────────────────────
# B11 — PaymentAllocation serializer rejects over-allocations
# ─────────────────────────────────────────────────────────────────────────────

class TestB11PaymentAllocationValidation:
    @pytest.mark.django_db
    def test_over_allocation_raises_validation_error(self, tenant, admin_user):
        """
        Allocating more than Payment.amount across all allocations must raise
        a DRF ValidationError from the serializer.
        """
        from rest_framework.exceptions import ValidationError
        from accounting.models import Invoice, Payment
        from accounting.serializers import PaymentAllocationSerializer
        from accounting.services.invoice_service import compute_invoice_totals

        line_items = [{"description": "Service", "qty": 1, "unit_price": "1000.00",
                       "discount": "0", "line_type": "service"}]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        invoice = Invoice.objects.create(
            tenant=tenant, created_by=admin_user,
            line_items=line_items,
            subtotal=subtotal, vat_rate=tenant.vat_rate,
            vat_amount=vat_amount, total=total,
            status=Invoice.STATUS_ISSUED,
        )
        payment = Payment.objects.create(
            tenant=tenant, created_by=admin_user,
            date=datetime.date.today(),
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=Decimal("800"),
            invoice=invoice,
        )

        serializer = PaymentAllocationSerializer(
            data={
                "payment": payment.pk,
                "invoice": invoice.pk,
                "amount": "900",   # > payment.amount (800)
            },
            context={"tenant": tenant},
        )
        assert not serializer.is_valid(), "Serializer should reject over-allocation"
        assert "amount" in serializer.errors or any(
            "exceed" in str(e).lower() or "payment" in str(e).lower()
            for errors in serializer.errors.values()
            for e in (errors if isinstance(errors, list) else [errors])
        ), f"B11 FAIL: Expected over-allocation error, got: {serializer.errors}"

    @pytest.mark.django_db
    def test_valid_allocation_passes(self, tenant, admin_user):
        """Allocation within payment amount should pass validation."""
        from accounting.models import Invoice, Payment
        from accounting.serializers import PaymentAllocationSerializer
        from accounting.services.invoice_service import compute_invoice_totals

        line_items = [{"description": "Service", "qty": 1, "unit_price": "1000.00",
                       "discount": "0", "line_type": "service"}]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        invoice = Invoice.objects.create(
            tenant=tenant, created_by=admin_user,
            line_items=line_items,
            subtotal=subtotal, vat_rate=tenant.vat_rate,
            vat_amount=vat_amount, total=total,
            status=Invoice.STATUS_ISSUED,
        )
        # Do NOT set invoice= on the Payment — that FK auto-reduces amount_due and
        # would leave only (total - 800) remaining, making a valid 800 allocation fail.
        payment = Payment.objects.create(
            tenant=tenant, created_by=admin_user,
            date=datetime.date.today(),
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=Decimal("800"),
        )

        serializer = PaymentAllocationSerializer(
            data={
                "payment": payment.pk,
                "invoice": invoice.pk,
                "amount": "800",   # exactly payment.amount — should pass
            },
            context={"tenant": tenant},
        )
        assert serializer.is_valid(), f"Valid allocation should pass: {serializer.errors}"


# ─────────────────────────────────────────────────────────────────────────────
# B12 — TDSEntry is immutable once deposited
# ─────────────────────────────────────────────────────────────────────────────

class TestB12TdsImmutability:
    @pytest.mark.django_db
    def test_deposited_tds_entry_blocks_field_mutation(self, tenant, admin_user):
        """
        Once a TDSEntry status == STATUS_DEPOSITED, saving with modified financial
        fields must raise ValueError (not silently corrupt the IRD deposit record).
        """
        from accounting.models import TDSEntry

        entry = TDSEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            supplier_name="Test Supplier",
            taxable_amount=Decimal("10000"),
            tds_rate=Decimal("0.10"),
            period_month=4,
            period_year=2081,
            status=TDSEntry.STATUS_DEPOSITED,
        )

        # Attempt to mutate tds_amount on a deposited entry
        entry.tds_amount = Decimal("9999")  # tampered amount
        with pytest.raises(ValueError, match="deposited"):
            entry.save()

    @pytest.mark.django_db
    def test_pending_tds_entry_can_be_updated(self, tenant, admin_user):
        """Pending TDS entries (not yet deposited) may still be corrected."""
        from accounting.models import TDSEntry

        entry = TDSEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            supplier_name="Test Supplier",
            taxable_amount=Decimal("10000"),
            tds_rate=Decimal("0.10"),
            period_month=4,
            period_year=2081,
            status=TDSEntry.STATUS_PENDING,
        )
        entry.supplier_name = "Corrected Supplier"
        entry.save()  # should NOT raise
        entry.refresh_from_db()
        assert entry.supplier_name == "Corrected Supplier"


# ─────────────────────────────────────────────────────────────────────────────
# B14 — Recurring journal rolls back atomically on bad account
# ─────────────────────────────────────────────────────────────────────────────

class TestB14RecurringJournalAtomic:
    @pytest.mark.django_db
    def test_bad_account_rolls_back_entire_entry(self, tenant, admin_user):
        """
        When a RecurringJournal template references a non-existent account,
        ValueError must be raised and NO JournalEntry rows should remain
        (transaction.atomic rollback).
        """
        from accounting.models import JournalEntry, RecurringJournal
        from accounting.services.journal_service import run_recurring_journal

        recurring = RecurringJournal.objects.create(
            tenant=tenant,
            name="Test Recurring",
            frequency=RecurringJournal.FREQ_MONTHLY,
            start_date=datetime.date.today(),
            next_date=datetime.date.today(),
            is_active=True,
            template_lines=[
                {"account_code": "NONEXISTENT_CODE", "debit": "1000", "credit": "0",
                 "description": "Dr side"},
                {"account_code": "ALSO_NONEXISTENT", "debit": "0", "credit": "1000",
                 "description": "Cr side"},
            ],
        )

        before_count = JournalEntry.objects.filter(tenant=tenant).count()

        with pytest.raises(ValueError):
            run_recurring_journal(recurring, triggered_by=admin_user)

        after_count = JournalEntry.objects.filter(tenant=tenant).count()
        assert after_count == before_count, (
            f"B14 FAIL: {after_count - before_count} orphaned JournalEntry rows were "
            "left after the rollback. transaction.atomic() should have cleaned them up."
        )

    @pytest.mark.django_db
    def test_bad_account_does_not_advance_next_date(self, tenant, admin_user):
        """On failure, next_date must NOT advance (atomically rolled back)."""
        from accounting.models import RecurringJournal
        from accounting.services.journal_service import run_recurring_journal

        original_next = datetime.date.today()
        recurring = RecurringJournal.objects.create(
            tenant=tenant,
            name="Date Test Recurring",
            frequency=RecurringJournal.FREQ_MONTHLY,
            start_date=original_next,
            next_date=original_next,
            template_lines=[
                {"account_code": "FAKE", "debit": "100", "credit": "0"},
                {"account_code": "FAKE2", "debit": "0", "credit": "100"},
            ],
        )

        with pytest.raises(ValueError):
            run_recurring_journal(recurring, triggered_by=admin_user)

        recurring.refresh_from_db()
        assert recurring.next_date == original_next, (
            f"B14 FAIL: next_date advanced to {recurring.next_date} despite failure. "
            "Should still be {original_next}."
        )


# ─────────────────────────────────────────────────────────────────────────────
# B16 — _make_entry raises ValueError for closed fiscal year
# ─────────────────────────────────────────────────────────────────────────────

class TestB16FiscalYearLock:
    @pytest.mark.django_db
    def test_posting_into_closed_year_raises_value_error(self, tenant, admin_user, coa_accounts):
        """
        Creating a journal entry whose date falls within a closed fiscal year
        must raise ValueError (not silently post into a locked period).
        """
        from accounting.models import FiscalYearClose
        from accounting.services.journal_service import create_contra_entry
        from core.nepali_date import ad_to_bs

        # Use a past date in BS 2080 — Jan 2024 AD ≈ Poush 2080 BS
        target_date = datetime.date(2024, 1, 15)
        bs_year = ad_to_bs(target_date).year   # 2080

        # Seal the fiscal year
        FiscalYearClose.objects.create(
            tenant=tenant,
            fy_year=bs_year,
            closed_by=admin_user,
            retained_earnings_amount=Decimal("0"),
        )

        # Find two valid accounts for the contra entry
        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        with pytest.raises(ValueError, match="closed"):
            create_contra_entry(
                tenant=tenant,
                created_by=admin_user,
                date=target_date,
                from_account_id=accounts[0].pk,
                to_account_id=accounts[1].pk,
                amount=Decimal("100"),
                description="Should fail",
            )

    @pytest.mark.django_db
    def test_posting_into_open_year_succeeds(self, tenant, admin_user, coa_accounts):
        """No FiscalYearClose → entry should post normally."""
        from accounting.services.journal_service import create_contra_entry

        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        # No FiscalYearClose exists → should succeed
        entry = create_contra_entry(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date.today(),
            from_account_id=accounts[0].pk,
            to_account_id=accounts[1].pk,
            amount=Decimal("100"),
            description="Open year entry",
        )
        assert entry.is_posted is True


# ─────────────────────────────────────────────────────────────────────────────
# B24 — Invoice creation snapshots cost_price at creation time
# ─────────────────────────────────────────────────────────────────────────────

class TestB24CostPriceSnapshot:
    @pytest.mark.django_db
    def test_invoice_create_snapshots_current_cost_price(self, tenant, admin_user):
        """
        After InvoiceService.create(), each product line must have a
        'cost_price_snapshot' key equal to the product's cost_price at that
        moment — NOT a later price after restocking.
        """
        from inventory.models import Product
        from accounting.services.invoice_service import InvoiceService

        product = Product.objects.create(
            tenant=tenant,
            name="Snapshot Product",
            cost_price=Decimal("500"),
            unit_price=Decimal("800"),
        )

        service = InvoiceService(tenant=tenant, user=admin_user)
        invoice = service.create({
            "line_items": [
                {
                    "description": "Snapshot Product",
                    "qty": 2,
                    "unit_price": "800.00",
                    "discount": "0",
                    "line_type": "product",
                    "product_id": product.pk,
                }
            ],
            "discount": Decimal("0"),
        })

        # Verify snapshot was captured
        line = invoice.line_items[0]
        assert "cost_price_snapshot" in line, (
            "B24 FAIL: 'cost_price_snapshot' key missing from line_items after create()"
        )
        assert Decimal(line["cost_price_snapshot"]) == Decimal("500"), (
            f"B24 FAIL: snapshot={line['cost_price_snapshot']}, expected 500 "
            "(product cost at creation time)."
        )

    @pytest.mark.django_db
    def test_later_cost_change_does_not_affect_snapshot(self, tenant, admin_user):
        """
        Changing product cost_price after invoice creation must NOT change the
        already-snapshotted value stored in line_items.
        """
        from inventory.models import Product
        from accounting.models import Invoice
        from accounting.services.invoice_service import InvoiceService

        product = Product.objects.create(
            tenant=tenant,
            name="Restocked Product",
            cost_price=Decimal("300"),
            unit_price=Decimal("600"),
        )

        service = InvoiceService(tenant=tenant, user=admin_user)
        invoice = service.create({
            "line_items": [
                {
                    "description": "Restocked Product",
                    "qty": 1,
                    "unit_price": "600.00",
                    "discount": "0",
                    "line_type": "product",
                    "product_id": product.pk,
                }
            ],
            "discount": Decimal("0"),
        })

        # Restock at a different price
        product.cost_price = Decimal("450")
        product.save(update_fields=["cost_price"])

        # Reload the invoice — snapshot should still be the original cost
        invoice.refresh_from_db()
        line = invoice.line_items[0]
        assert Decimal(line["cost_price_snapshot"]) == Decimal("300"), (
            f"B24 FAIL: After cost change, snapshot={line['cost_price_snapshot']} "
            "but original cost was 300. COGS would be misstated."
        )

    @pytest.mark.django_db
    def test_generate_issued_snapshots_cost_price(self, tenant, admin_user):
        """
        InvoiceService.generate_issued() must also capture cost_price_snapshot.
        Old code: no snapshot — COGS would use live product cost, not historical cost.
        """
        from inventory.models import Product
        from accounting.services.invoice_service import InvoiceService

        product = Product.objects.create(
            tenant=tenant,
            name="Issued Product",
            cost_price=Decimal("200"),
            unit_price=Decimal("400"),
        )

        service = InvoiceService(tenant=tenant, user=admin_user)
        invoice = service.generate_issued({
            "line_items": [
                {
                    "description": "Issued Product",
                    "qty": 1,
                    "unit_price": "400.00",
                    "discount": "0",
                    "line_type": "product",
                    "product_id": product.pk,
                }
            ],
            "discount": Decimal("0"),
        })

        line = invoice.line_items[0]
        assert "cost_price_snapshot" in line, (
            "B24 FAIL: generate_issued() did not capture cost_price_snapshot. "
            "COGS journal will fall through to live product cost lookup."
        )
        assert Decimal(line["cost_price_snapshot"]) == Decimal("200"), (
            f"B24 FAIL: snapshot={line['cost_price_snapshot']}, expected 200."
        )

    @pytest.mark.django_db
    def test_draft_update_re_snapshots_new_product_lines(self, tenant, admin_user):
        """
        When a draft invoice is updated to add new product lines, those new
        lines must receive a cost_price_snapshot.  Previously-snapshotted lines
        must remain unchanged (idempotent).
        """
        from inventory.models import Product
        from accounting.services.invoice_service import InvoiceService

        product_a = Product.objects.create(
            tenant=tenant, name="Product A",
            cost_price=Decimal("100"), unit_price=Decimal("200"),
        )
        product_b = Product.objects.create(
            tenant=tenant, name="Product B",
            cost_price=Decimal("300"), unit_price=Decimal("500"),
        )

        service = InvoiceService(tenant=tenant, user=admin_user)
        invoice = service.create({
            "line_items": [
                {"description": "A", "qty": 1, "unit_price": "200.00",
                 "discount": "0", "line_type": "product", "product_id": product_a.pk}
            ],
            "discount": Decimal("0"),
        })

        original_snapshot = Decimal(invoice.line_items[0]["cost_price_snapshot"])
        assert original_snapshot == Decimal("100")

        # Simulate restocking A at a higher price before the draft is edited
        product_a.cost_price = Decimal("999")
        product_a.save(update_fields=["cost_price"])

        # Update adds product B; product A line already has a snapshot so must
        # NOT be re-snapshotted to 999
        updated_invoice = service.update(invoice, {
            "line_items": [
                {
                    "description": "A", "qty": 1, "unit_price": "200.00",
                    "discount": "0", "line_type": "product", "product_id": product_a.pk,
                    "cost_price_snapshot": "100",   # original snapshot carried forward
                },
                {
                    "description": "B", "qty": 1, "unit_price": "500.00",
                    "discount": "0", "line_type": "product", "product_id": product_b.pk,
                    # no snapshot yet — new line
                },
            ],
        })

        updated_invoice.refresh_from_db()
        line_a = next(l for l in updated_invoice.line_items if l["product_id"] == product_a.pk)
        line_b = next(l for l in updated_invoice.line_items if l["product_id"] == product_b.pk)

        assert Decimal(line_a["cost_price_snapshot"]) == Decimal("100"), (
            f"B24 FAIL: existing snapshot on A was overwritten "
            f"(got {line_a['cost_price_snapshot']}, expected 100, current product cost is 999)."
        )
        assert "cost_price_snapshot" in line_b, (
            "B24 FAIL: new product line B has no cost_price_snapshot after update()."
        )
        assert Decimal(line_b["cost_price_snapshot"]) == Decimal("300"), (
            f"B24 FAIL: line B snapshot={line_b['cost_price_snapshot']}, expected 300."
        )

    @pytest.mark.django_db
    def test_ticket_invoice_snapshots_product_costs(self, tenant, admin_user):
        """
        generate_ticket_invoice() must snapshot cost_price for product lines.
        Ticket invoices previously had no snapshot — COGS would always use live cost.
        """
        from inventory.models import Product
        from accounting.services.ticket_invoice_service import generate_ticket_invoice

        # Minimal objects for a ticket invoice
        from customers.models import Customer
        from tickets.models import Ticket, TicketProduct

        product = Product.objects.create(
            tenant=tenant, name="Repair Part",
            cost_price=Decimal("150"), unit_price=Decimal("250"),
        )
        customer = Customer.objects.create(
            tenant=tenant, name="Test Customer",
            created_by=admin_user,
        )
        ticket = Ticket.objects.create(
            tenant=tenant,
            customer=customer,
            created_by=admin_user,
            title="Repair Job",
            service_charge=Decimal("500"),
        )
        TicketProduct.objects.create(
            tenant=tenant, ticket=ticket, product=product, quantity=2,
            unit_price=Decimal("250"), discount=Decimal("0"),
        )

        invoice = generate_ticket_invoice(ticket, tenant, created_by=admin_user)

        product_lines = [l for l in invoice.line_items if l.get("line_type") == "product"]
        assert len(product_lines) == 1

        line = product_lines[0]
        assert "cost_price_snapshot" in line, (
            "B24 FAIL: generate_ticket_invoice() did not capture cost_price_snapshot "
            "for product line. COGS journal will fall through to live product cost."
        )
        assert Decimal(line["cost_price_snapshot"]) == Decimal("150"), (
            f"B24 FAIL: ticket invoice snapshot={line['cost_price_snapshot']}, expected 150."
        )


# ─────────────────────────────────────────────────────────────────────────────
# B25 — JournalEntryAuditLog records changes
# ─────────────────────────────────────────────────────────────────────────────

class TestB25AuditLog:
    @pytest.mark.django_db
    def test_log_journal_change_creates_audit_row(self, tenant, admin_user, coa_accounts):
        """
        log_journal_change() must create a JournalEntryAuditLog row with the
        correct action, entry reference, and changed_by user.
        """
        from accounting.models import JournalEntry, JournalEntryAuditLog, log_journal_change

        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date.today(),
            description="Audit test entry",
            reference_type=JournalEntry.REF_MANUAL,
        )

        before_count = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=entry
        ).count()

        log_journal_change(
            entry,
            action=JournalEntryAuditLog.ACTION_UPDATE,
            changed_by=admin_user,
            reason="Unit test mutation",
            before_snapshot={"description": "Old description"},
        )

        after_count = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=entry
        ).count()

        assert after_count == before_count + 1, (
            f"B25 FAIL: Expected 1 new audit row, got {after_count - before_count}"
        )

    @pytest.mark.django_db
    def test_audit_log_records_field_changes(self, tenant, admin_user):
        """Audit log field_changes dict must capture before/after values."""
        from accounting.models import JournalEntry, JournalEntryAuditLog, log_journal_change

        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date.today(),
            description="Before",
            reference_type=JournalEntry.REF_MANUAL,
        )
        entry.description = "After"
        entry.save(update_fields=["description"])

        log_journal_change(
            entry,
            action=JournalEntryAuditLog.ACTION_UPDATE,
            changed_by=admin_user,
            before_snapshot={"description": "Before"},
        )

        audit = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=entry
        ).latest("id")

        assert "description" in audit.field_changes, (
            "B25 FAIL: field_changes should record the 'description' change"
        )
        diff = audit.field_changes["description"]
        assert diff["before"] == "Before"
        assert diff["after"] == "After"

    @pytest.mark.django_db
    def test_make_entry_auto_logs_create(self, tenant, admin_user, coa_accounts):
        """
        _make_entry() must produce a JournalEntryAuditLog ACTION_CREATE row.
        Covers all automated journal types that delegate to _make_entry().
        """
        from accounting.models import JournalEntryAuditLog
        from accounting.services.journal_service import create_contra_entry

        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        before_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()
        entry = create_contra_entry(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date.today(),
            from_account_id=accounts[0].pk,
            to_account_id=accounts[1].pk,
            amount=Decimal("250"),
            description="B25 wiring test",
        )
        after_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()

        assert after_count == before_count + 1, (
            "B25 FAIL: _make_entry() did not create an audit log row"
        )
        audit = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=entry
        ).latest("id")
        assert audit.action == JournalEntryAuditLog.ACTION_CREATE, (
            f"B25 FAIL: expected ACTION_CREATE, got {audit.action}"
        )

    @pytest.mark.django_db
    def test_reversing_entry_logs_both_sides(self, tenant, admin_user, coa_accounts):
        """
        create_reversing_entry() must create two audit rows:
          1. ACTION_CREATE for the new reversing entry
          2. ACTION_UPDATE for the original entry (back-patch of reversed_by)
        """
        from accounting.models import JournalEntryAuditLog
        from accounting.services.journal_service import (
            create_contra_entry, create_reversing_entry,
        )

        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        original = create_contra_entry(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date.today(),
            from_account_id=accounts[0].pk,
            to_account_id=accounts[1].pk,
            amount=Decimal("500"),
            description="Original entry for reversal audit",
        )

        before_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()
        reversal = create_reversing_entry(
            original_entry=original,
            reversal_date=datetime.date.today(),
            created_by=admin_user,
            reversal_reason="Test reversal",
        )
        after_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()

        # Expect exactly 2 new rows: CREATE for reversal + UPDATE for original.
        assert after_count == before_count + 2, (
            f"B25 FAIL: expected 2 audit rows from reversal, got {after_count - before_count}"
        )

        reversal_log = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=reversal
        ).latest("id")
        assert reversal_log.action == JournalEntryAuditLog.ACTION_CREATE, (
            "B25 FAIL: reversal entry audit row should be ACTION_CREATE"
        )

        original_log = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=original
        ).latest("id")
        assert original_log.action == JournalEntryAuditLog.ACTION_UPDATE, (
            "B25 FAIL: original entry audit row should be ACTION_UPDATE (back-patch)"
        )
        assert "Reversed by entry" in original_log.reason, (
            "B25 FAIL: reversal entry number not recorded on original entry audit log reason. "
            f"Got: '{original_log.reason}'"
        )

    @pytest.mark.django_db
    def test_view_create_manual_journal_logs_create(self, tenant, admin_user, coa_accounts):
        """
        POST /journals/ (manual entry via JournalEntryViewSet.create) must
        produce a JournalEntryAuditLog ACTION_CREATE row.
        """
        from accounting.models import JournalEntry, JournalEntryAuditLog
        from accounting.views import JournalEntryViewSet
        from rest_framework.test import APIRequestFactory

        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        acc_a, acc_b = accounts[0], accounts[1]
        payload = {
            "date": str(datetime.date.today()),
            "description": "Manual journal B25 view test",
            "lines": [
                {"account": acc_a.pk, "debit": "100.00", "credit": "0.00", "description": "Dr side"},
                {"account": acc_b.pk, "debit": "0.00", "credit": "100.00", "description": "Cr side"},
            ],
        }

        from rest_framework.test import force_authenticate
        factory = APIRequestFactory()
        request = factory.post("/api/v1/journals/", payload, format="json")
        request.tenant = tenant
        # Use superuser to bypass module-gate check (test verifies audit wiring, not module gating)
        admin_user.is_superuser = True
        force_authenticate(request, user=admin_user)

        view = JournalEntryViewSet.as_view({"post": "create"})
        before_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()
        response = view(request)
        after_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()

        assert response.status_code in (200, 201), (
            f"B25 FAIL: create view returned {response.status_code}: {getattr(response, 'data', '')}"
        )
        assert after_count == before_count + 1, (
            "B25 FAIL: view create() did not produce an audit log row"
        )
        latest = JournalEntryAuditLog.objects.filter(tenant=tenant).latest("id")
        assert latest.action == JournalEntryAuditLog.ACTION_CREATE

    @pytest.mark.django_db
    def test_view_post_entry_logs_update(self, tenant, admin_user, coa_accounts):
        """
        POST /journals/{id}/post/ must produce a JournalEntryAuditLog ACTION_UPDATE
        row with reason='Manually posted' and is_posted True in the snapshot.
        """
        from accounting.models import JournalEntry, JournalEntryAuditLog
        from accounting.views import JournalEntryViewSet
        from rest_framework.test import APIRequestFactory

        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        # Create an unposted draft directly (bypassing service so it stays unposted).
        from accounting.models import JournalLine
        entry = JournalEntry.objects.create(
            tenant=tenant, created_by=admin_user,
            date=datetime.date.today(), description="Draft for post_entry test",
            reference_type=JournalEntry.REF_MANUAL,
        )
        JournalLine.objects.create(entry=entry, account=accounts[0], debit=Decimal("200"), credit=Decimal("0"))
        JournalLine.objects.create(entry=entry, account=accounts[1], debit=Decimal("0"), credit=Decimal("200"))

        from rest_framework.test import force_authenticate
        factory = APIRequestFactory()
        request = factory.post(f"/api/v1/journals/{entry.pk}/post/")
        request.tenant = tenant
        admin_user.is_superuser = True  # bypass module-gate check (test verifies audit wiring)
        force_authenticate(request, user=admin_user)

        view = JournalEntryViewSet.as_view({"post": "post_entry"})
        before_count = JournalEntryAuditLog.objects.filter(tenant=tenant, journal_entry=entry).count()
        response = view(request, pk=entry.pk)
        after_count = JournalEntryAuditLog.objects.filter(tenant=tenant, journal_entry=entry).count()

        assert response.status_code == 200, (
            f"B25 FAIL: post_entry returned {response.status_code}"
        )
        assert after_count == before_count + 1, (
            "B25 FAIL: post_entry() did not produce an audit log row"
        )
        audit = JournalEntryAuditLog.objects.filter(
            tenant=tenant, journal_entry=entry
        ).latest("id")
        assert audit.action == JournalEntryAuditLog.ACTION_UPDATE
        assert audit.reason == "Manually posted", (
            f"B25 FAIL: reason should be 'Manually posted', got '{audit.reason}'"
        )
        assert audit.field_changes.get("is_posted", {}).get("before") in (False, "False"), (
            "B25 FAIL: field_changes should show is_posted False→True"
        )

    @pytest.mark.django_db
    def test_view_destroy_logs_delete_before_deletion(self, tenant, admin_user, coa_accounts):
        """
        DELETE /journals/{id}/ must create a JournalEntryAuditLog ACTION_DELETE row
        BEFORE the entry is removed.  The audit row must survive after entry deletion
        because the FK is SET_NULL — the entry_number snapshot preserves identity.
        """
        from accounting.models import JournalEntry, JournalEntryAuditLog, JournalLine
        from accounting.views import JournalEntryViewSet
        from rest_framework.test import APIRequestFactory

        accounts = list(coa_accounts.values())
        if len(accounts) < 2:
            pytest.skip("CoA not seeded — need at least 2 accounts")

        entry = JournalEntry.objects.create(
            tenant=tenant, created_by=admin_user,
            date=datetime.date.today(), description="Draft to delete",
            reference_type=JournalEntry.REF_MANUAL,
        )
        entry_pk = entry.pk
        # Capture the auto-assigned entry_number before deletion.
        entry.refresh_from_db()
        snapped_entry_number = entry.entry_number
        JournalLine.objects.create(entry=entry, account=accounts[0], debit=Decimal("50"), credit=Decimal("0"))
        JournalLine.objects.create(entry=entry, account=accounts[1], debit=Decimal("0"), credit=Decimal("50"))

        from rest_framework.test import force_authenticate
        factory = APIRequestFactory()
        request = factory.delete(f"/api/v1/journals/{entry.pk}/")
        request.tenant = tenant
        admin_user.is_superuser = True  # bypass module-gate check (test verifies audit wiring)
        force_authenticate(request, user=admin_user)

        view = JournalEntryViewSet.as_view({"delete": "destroy"})
        before_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()
        response = view(request, pk=entry.pk)
        after_count = JournalEntryAuditLog.objects.filter(tenant=tenant).count()

        assert response.status_code in (204, 200), (
            f"B25 FAIL: destroy returned {response.status_code}"
        )
        # Entry must be gone.
        assert not JournalEntry.objects.filter(pk=entry_pk).exists(), (
            "B25 FAIL: entry was not deleted"
        )
        # One new audit row created.
        assert after_count == before_count + 1, (
            "B25 FAIL: destroy() did not produce an audit log row"
        )
        # Audit row must have ACTION_DELETE and the entry_number snapshot.
        delete_log = JournalEntryAuditLog.objects.filter(tenant=tenant).latest("id")
        assert delete_log.action == JournalEntryAuditLog.ACTION_DELETE, (
            f"B25 FAIL: expected ACTION_DELETE, got {delete_log.action}"
        )
        assert delete_log.entry_number == snapped_entry_number, (
            f"B25 FAIL: entry_number snapshot '{delete_log.entry_number}' "
            f"!= original '{snapped_entry_number}'"
        )
        # FK is SET_NULL after deletion — audit row outlives the entry.
        assert delete_log.journal_entry_id is None, (
            "B25 FAIL: journal_entry FK should be NULL after entry deletion"
        )


# ─────────────────────────────────────────────────────────────────────────────
# B10 — AccountViewSet annotates balance (no N+1 per account)
# ─────────────────────────────────────────────────────────────────────────────

class TestB10AccountBalanceAnnotation:
    @pytest.mark.django_db
    def test_get_queryset_annotates_debit_credit(self, tenant, admin_user):
        """
        AccountViewSet.get_queryset() must annotate _annotated_debit and
        _annotated_credit on every Account instance in the queryset.
        """
        from accounting.views import AccountViewSet
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request as DrfRequest

        factory = APIRequestFactory()
        raw_request = factory.get("/api/v1/accounts/")
        # Wrap in DRF Request so .query_params is available (bypasses full dispatch)
        request = DrfRequest(raw_request)
        request.user = admin_user
        request.tenant = tenant

        view = AccountViewSet()
        view.request = request
        view.tenant = tenant   # set directly — initial() is not called in unit tests
        view.format_kwarg = None
        view.action = "list"
        view.kwargs = {}

        qs = view.get_queryset()
        first = qs.first()

        if first is None:
            pytest.skip("CoA not seeded — no accounts to test")

        assert hasattr(first, "_annotated_debit"), (
            "B10 FAIL: _annotated_debit annotation missing from queryset"
        )
        assert hasattr(first, "_annotated_credit"), (
            "B10 FAIL: _annotated_credit annotation missing from queryset"
        )

    @pytest.mark.django_db
    def test_account_balance_uses_annotation_when_present(self, tenant):
        """
        Account.balance must read from _annotated_debit/_annotated_credit when
        they are present, bypassing the per-row DB query.
        """
        from accounting.models import Account

        account = Account.objects.filter(tenant=tenant).first()
        if account is None:
            pytest.skip("CoA not seeded — no accounts to test")

        # Manually inject annotations (simulating queryset annotation)
        account._annotated_debit = Decimal("5000")
        account._annotated_credit = Decimal("2000")

        # For an asset account: balance = opening + debit - credit
        opening_balance = account.opening_balance or Decimal("0")
        if account.type in ("asset", "expense"):
            expected = opening_balance + Decimal("5000") - Decimal("2000")
        else:
            expected = opening_balance + Decimal("2000") - Decimal("5000")

        assert account.balance == expected, (
            f"B10 FAIL: balance={account.balance}, expected={expected}. "
            "Account.balance should read from annotation, not fire a new query."
        )

    @pytest.mark.django_db
    def test_account_list_query_count_bounded(self, tenant, admin_user):
        """
        Account list endpoint must not fire N queries for N accounts.
        A seeded CoA typically has 50+ accounts — without annotation,
        this would fire 100+ queries.
        """
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        from accounting.views import AccountViewSet
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request as DrfRequest

        factory = APIRequestFactory()
        raw_request = factory.get("/api/v1/accounts/")
        # Wrap in DRF Request so .query_params is available
        request = DrfRequest(raw_request)
        request.user = admin_user
        request.tenant = tenant

        view = AccountViewSet()
        view.request = request
        view.tenant = tenant   # set directly — initial() is not called in unit tests
        view.format_kwarg = None
        view.action = "list"
        view.kwargs = {}

        with CaptureQueriesContext(connection) as ctx:
            qs = list(view.get_queryset())   # evaluate queryset

        query_count = len(ctx.captured_queries)
        # Should be 1 annotated query, not 1 + 2×N queries
        assert query_count <= 5, (
            f"B10 FAIL: get_queryset() fired {query_count} queries for "
            f"{len(qs)} accounts. Expected ≤5 (1 annotated JOIN query)."
        )


# ─────────────────────────────────────────────────────────────────────────────
# Cash Flow Statement — indirect method
# ─────────────────────────────────────────────────────────────────────────────

class TestCashFlowStatement:
    """
    Tests for the indirect-method Cash Flow Statement implemented in
    accounting/services/report_service.py::cash_flow().

    Each test seeds minimal data to exercise a specific section or property,
    using the auto-seeded CoA from the tenant fixture.
    """

    @pytest.mark.django_db
    def test_cash_flow_returns_required_keys(self, tenant, admin_user, coa_accounts):
        """
        cash_flow() must return a dict containing every required top-level key.
        An empty period is valid — amounts will be zero but keys must exist.
        """
        from accounting.services.report_service import cash_flow

        today = datetime.date.today()
        result = cash_flow(tenant, today, today)

        required_top = {
            'date_from', 'date_to', 'period',
            'operating', 'investing', 'financing',
            'net_change', 'opening_cash', 'closing_cash',
            'expected_closing', 'difference', 'balanced',
            # legacy aliases
            'net_cash_flow', 'by_method', 'total_incoming', 'total_outgoing',
        }
        missing = required_top - result.keys()
        assert not missing, f"CFS FAIL: missing top-level keys: {missing}"

        required_operating = {'net_profit', 'depreciation', 'working_capital_changes',
                               'working_capital_total', 'total'}
        missing_op = required_operating - result['operating'].keys()
        assert not missing_op, f"CFS FAIL: operating section missing keys: {missing_op}"

        assert 'items' in result['investing'], "CFS FAIL: investing section missing 'items'"
        assert 'total' in result['investing'], "CFS FAIL: investing section missing 'total'"
        assert 'items' in result['financing'], "CFS FAIL: financing section missing 'items'"
        assert 'total' in result['financing'], "CFS FAIL: financing section missing 'total'"

    @pytest.mark.django_db
    def test_reconciliation_holds_for_empty_period(self, tenant, admin_user, coa_accounts):
        """
        For a period with no transactions, opening == closing cash and
        net_change == 0.  The balanced flag must be True and difference == 0.
        """
        from accounting.services.report_service import cash_flow

        # Use a date range far in the future but within BS calendar range (≤ 2105 BS ≈ 2048 AD).
        future = datetime.date(2030, 1, 1)
        result = cash_flow(tenant, future, future)

        assert result['balanced'] is True, (
            f"CFS FAIL: balanced=False for empty period. difference={result['difference']}"
        )
        assert Decimal(result['difference']) == Decimal("0"), (
            f"CFS FAIL: difference should be 0 for empty period, got {result['difference']}"
        )
        net = Decimal(result['net_change'])
        assert net == Decimal("0"), (
            f"CFS FAIL: net_change should be 0 for empty period, got {net}"
        )

    @pytest.mark.django_db
    def test_cash_inflow_from_sales_shows_in_operating(self, tenant, admin_user, coa_accounts):
        """
        Posting a sales invoice and receiving payment must result in a positive
        operating net_profit and a visible cash increase (closing_cash > opening_cash).
        """
        from accounting.services.journal_service import create_contra_entry
        from accounting.services.report_service import cash_flow

        # Simulate a cash sale: Dr Cash/Bank, Cr Sales
        cash_account = next(
            (a for code, a in coa_accounts.items() if code.startswith('1') and a.type == 'asset'
             and 'cash' in a.name.lower()), None
        )
        sales_account = next(
            (a for code, a in coa_accounts.items() if a.type == 'revenue'), None
        )
        if not cash_account or not sales_account:
            pytest.skip("CoA not seeded with cash + sales accounts")

        today = datetime.date.today()

        # Post a contra entry: Dr cash, Cr sales (simplified cash sale)
        create_contra_entry(
            tenant=tenant,
            created_by=admin_user,
            date=today,
            from_account_id=sales_account.pk,  # Cr sales
            to_account_id=cash_account.pk,      # Dr cash
            amount=Decimal("10000"),
            description="Test cash sale",
        )

        result = cash_flow(tenant, today, today)
        net_profit = Decimal(result['operating']['net_profit'])
        closing_cash = Decimal(result['closing_cash'])
        opening_cash = Decimal(result['opening_cash'])

        assert net_profit > Decimal("0"), (
            f"CFS FAIL: net_profit should be positive after a cash sale, got {net_profit}"
        )
        assert closing_cash > opening_cash, (
            f"CFS FAIL: closing_cash ({closing_cash}) should be > opening_cash ({opening_cash})"
        )

    @pytest.mark.django_db
    def test_bulk_group_balances_uses_two_queries(self, tenant, coa_accounts):
        """
        _bulk_group_balances() must fire at most 2 SQL queries regardless of
        how many group slugs are requested — never O(N) per group.
        """
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        from accounting.services.report_service import _bulk_group_balances

        slugs = [
            'cash_in_hand', 'bank_accounts', 'sundry_debtors', 'stock_in_hand',
            'loans_advances_asset', 'other_current_assets', 'sundry_creditors',
            'duties_taxes_vat', 'duties_taxes_tds', 'current_liabilities',
            'fixed_assets', 'investments', 'bank_od', 'loans_liability',
            'capital_account', 'reserves_surplus',
        ]

        with CaptureQueriesContext(connection) as ctx:
            result = _bulk_group_balances(tenant, datetime.date.today(), slugs)

        assert len(ctx.captured_queries) <= 2, (
            f"CFS FAIL: _bulk_group_balances fired {len(ctx.captured_queries)} queries "
            f"for {len(slugs)} groups. Expected ≤2."
        )
        assert set(result.keys()) == set(slugs), (
            "CFS FAIL: _bulk_group_balances must return a key for every requested slug"
        )
        for slug, balance in result.items():
            assert isinstance(balance, Decimal), (
                f"CFS FAIL: balance for '{slug}' should be Decimal, got {type(balance)}"
            )

    @pytest.mark.django_db
    def test_cash_flow_query_count_bounded(self, tenant, admin_user, coa_accounts):
        """
        cash_flow() as a whole must not fire an unbounded number of queries.
        With the bulk helpers, the expected ceiling is ≈15 queries total
        (2× bulk balances + P&L sub-queries + depreciation + FY-close check + payments).
        """
        from django.test.utils import CaptureQueriesContext
        from django.db import connection
        from accounting.services.report_service import cash_flow

        today = datetime.date.today()
        start = today.replace(day=1)

        with CaptureQueriesContext(connection) as ctx:
            cash_flow(tenant, start, today)

        assert len(ctx.captured_queries) <= 25, (
            f"CFS FAIL: cash_flow fired {len(ctx.captured_queries)} queries. "
            "Expected ≤25. N+1 per account-group would be much higher."
        )

    @pytest.mark.django_db
    def test_net_change_equals_operating_plus_investing_plus_financing(
        self, tenant, admin_user, coa_accounts
    ):
        """
        net_change must always equal operating.total + investing.total + financing.total.
        This is a mathematical identity — must hold for any data.
        """
        from accounting.services.report_service import cash_flow

        today = datetime.date.today()
        result = cash_flow(tenant, today, today)

        op  = Decimal(result['operating']['total'])
        inv = Decimal(result['investing']['total'])
        fin = Decimal(result['financing']['total'])
        net = Decimal(result['net_change'])

        assert op + inv + fin == net, (
            f"CFS FAIL: {op} + {inv} + {fin} = {op+inv+fin} != net_change={net}"
        )

    @pytest.mark.django_db
    def test_depreciation_detected_by_reference_type(self, tenant, admin_user, coa_accounts):
        """
        Depreciation journal entries (reference_type='depreciation') must be
        picked up as the add-back in operating activities.
        """
        from accounting.models import JournalEntry, JournalLine
        from accounting.services.report_service import cash_flow

        # Find a valid expense account and an asset account in fixed_assets group.
        expense_acc = next(
            (a for a in coa_accounts.values() if a.type == 'expense'), None
        )
        asset_acc = next(
            (a for a in coa_accounts.values() if a.type == 'asset'), None
        )
        if not expense_acc or not asset_acc:
            pytest.skip("CoA not seeded with both expense and asset accounts")

        today = datetime.date.today()

        # Manually create a posted depreciation journal entry.
        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=today,
            description="Test depreciation",
            reference_type=JournalEntry.REF_DEPRECIATION,
            purpose=JournalEntry.PURPOSE_DEPRECIATION,
        )
        JournalLine.objects.create(entry=entry, account=expense_acc, debit=Decimal("5000"), credit=Decimal("0"))
        JournalLine.objects.create(entry=entry, account=asset_acc,   debit=Decimal("0"), credit=Decimal("5000"))
        entry.post()

        result = cash_flow(tenant, today, today)
        dep_addback = Decimal(result['operating']['depreciation'])

        assert dep_addback >= Decimal("5000"), (
            f"CFS FAIL: depreciation add-back should be ≥5000, got {dep_addback}. "
            "Entries with reference_type='depreciation' must be detected."
        )

    @pytest.mark.django_db
    def test_period_block_includes_bs_dates(self, tenant, coa_accounts):
        """
        The 'period' block must include Nepali (BS) date information for
        frontend display — same structure as other financial reports.
        """
        from accounting.services.report_service import cash_flow

        today = datetime.date.today()
        result = cash_flow(tenant, today, today)

        period = result['period']
        assert 'date_from' in period, "CFS FAIL: period.date_from missing"
        assert 'date_to'   in period, "CFS FAIL: period.date_to missing"
        assert 'date_from_bs' in period, "CFS FAIL: period.date_from_bs missing"
        assert 'date_to_bs'   in period, "CFS FAIL: period.date_to_bs missing"


# ─────────────────────────────────────────────────────────────────────────────
# R1 — Reporting regressions (sales/AR date + amount correctness)
# ─────────────────────────────────────────────────────────────────────────────

class TestR1ReportRegressions:

    @pytest.mark.django_db
    def test_sales_by_customer_accumulates_outstanding_per_invoice(self, tenant, admin_user):
        """Outstanding must be computed per invoice row, not reused from a prior loop row."""
        from customers.models import Customer
        from accounting.models import Invoice, Payment
        from accounting.services.report_service import sales_by_customer

        customer = Customer.objects.create(
            tenant=tenant,
            created_by=admin_user,
            name='Acme Reporting',
            type=Customer.TYPE_ORGANIZATION,
        )

        inv1 = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            customer=customer,
            date=datetime.date(2026, 1, 5),
            line_items=[],
            subtotal=Decimal('100.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            status=Invoice.STATUS_ISSUED,
        )
        inv2 = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            customer=customer,
            date=datetime.date(2026, 1, 6),
            line_items=[],
            subtotal=Decimal('200.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('200.00'),
            status=Invoice.STATUS_ISSUED,
        )

        # Distinct paid amount on inv2 ensures per-row outstanding differs.
        Payment.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 1, 7),
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=Decimal('40.00'),
            invoice=inv2,
        )

        out = sales_by_customer(tenant, datetime.date(2026, 1, 1), datetime.date(2026, 1, 31))
        row = next(r for r in out['rows'] if r['customer_id'] == customer.id)

        # expected: inv1 outstanding 100 + inv2 outstanding 160 = 260
        assert row['outstanding'] == Decimal('260.00'), (
            f"R1 FAIL: expected outstanding 260.00, got {row['outstanding']}"
        )

    @pytest.mark.django_db
    def test_sales_by_item_computes_amount_when_line_amount_missing(self, tenant, admin_user):
        """sales_by_item must derive amount from qty/unit_price/discount when amount key is absent."""
        from accounting.models import Invoice
        from accounting.services.report_service import sales_by_item

        Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 2, 1),
            line_items=[{
                'description': 'Service Plan',
                'qty': 2,
                'unit_price': '100',
                'discount': '10',
            }],
            subtotal=Decimal('180.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('180.00'),
            status=Invoice.STATUS_ISSUED,
        )

        out = sales_by_item(tenant, datetime.date(2026, 2, 1), datetime.date(2026, 2, 28))
        row = next(r for r in out['rows'] if r['description'] == 'Service Plan')
        assert row['total_amount'] == Decimal('180'), (
            f"R1 FAIL: expected derived amount 180, got {row['total_amount']}"
        )

    @pytest.mark.django_db
    def test_sales_reports_use_voucher_date_not_created_at(self, tenant, admin_user):
        """Period filtering must follow invoice.date with legacy created_at fallback."""
        from accounting.models import Invoice
        from accounting.services.report_service import sales_by_customer
        from django.utils import timezone

        in_period = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 3, 10),
            line_items=[],
            subtotal=Decimal('50.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('50.00'),
            status=Invoice.STATUS_ISSUED,
        )
        out_of_period = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2025, 12, 31),
            line_items=[],
            subtotal=Decimal('70.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('70.00'),
            status=Invoice.STATUS_ISSUED,
        )

        # Force created_at values to the opposite period to prove voucher-date behavior.
        Invoice.objects.filter(pk=in_period.pk).update(
            created_at=timezone.make_aware(datetime.datetime(2025, 12, 30, 12, 0, 0))
        )
        Invoice.objects.filter(pk=out_of_period.pk).update(
            created_at=timezone.make_aware(datetime.datetime(2026, 3, 11, 12, 0, 0))
        )

        out = sales_by_customer(tenant, datetime.date(2026, 3, 1), datetime.date(2026, 3, 31))
        assert out['grand_total'] == Decimal('50.00'), (
            f"R1 FAIL: expected only voucher-dated invoice in range, got grand_total={out['grand_total']}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# S1 — Security: tenant isolation on accounting viewsets
# ─────────────────────────────────────────────────────────────────────────────

class TestS1TenantIsolation:

    @pytest.mark.django_db
    def test_tds_queryset_is_tenant_scoped(self, tenant, admin_user):
        """TDSEntryViewSet.get_queryset() must never return entries from other tenants."""
        from tenants.models import Tenant
        from accounting.models import TDSEntry
        from accounting.views import TDSEntryViewSet
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request as DrfRequest

        other_tenant = Tenant.objects.create(name='Other Co', slug='otherco')

        TDSEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            supplier_name='Tenant A Supplier',
            taxable_amount=Decimal('1000.00'),
            tds_rate=Decimal('0.10'),
            period_month=1,
            period_year=2082,
        )
        TDSEntry.objects.create(
            tenant=other_tenant,
            created_by=admin_user,
            supplier_name='Tenant B Supplier',
            taxable_amount=Decimal('2000.00'),
            tds_rate=Decimal('0.10'),
            period_month=1,
            period_year=2082,
        )

        factory = APIRequestFactory()
        raw = factory.get('/api/v1/accounting/tds/')
        request = DrfRequest(raw)
        request.user = admin_user
        request.tenant = tenant

        view = TDSEntryViewSet()
        view.request = request
        view.tenant = tenant
        view.action = 'list'

        rows = list(view.get_queryset())

        assert len(rows) == 1, f"S1 FAIL: expected 1 tenant row, got {len(rows)}"
        assert rows[0].tenant_id == tenant.id, (
            f"S1 FAIL: leaked cross-tenant TDS row tenant_id={rows[0].tenant_id}, expected {tenant.id}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# G1 — Custom account group management (Tally-like)
# ─────────────────────────────────────────────────────────────────────────────

class TestG1CustomAccountGroupManagement:

    @pytest.mark.django_db
    def test_account_group_create_update_soft_delete(self, tenant, admin_user):
        from accounting.views import AccountGroupViewSet
        from accounting.models import AccountGroup
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request as DrfRequest
        from rest_framework.parsers import JSONParser

        factory = APIRequestFactory()

        raw_create = factory.post('/api/v1/accounting/account-groups/', {
            'slug': 'custom_current_assets',
            'name': 'Custom Current Assets',
            'type': 'asset',
            'report_section': 'bs_current_assets',
            'normal_balance': 'debit',
            'is_active': True,
        }, format='json')
        req_create = DrfRequest(raw_create, parsers=[JSONParser()])
        req_create.user = admin_user
        req_create.tenant = tenant

        create_view = AccountGroupViewSet()
        create_view.request = req_create
        create_view.tenant = tenant
        create_view.action = 'create'
        create_view.format_kwarg = None
        create_resp = create_view.create(req_create)
        assert create_resp.status_code == 201

        group_id = create_resp.data['data']['id']
        group = AccountGroup.objects.get(pk=group_id)
        assert group.tenant_id == tenant.id
        assert group.is_system is False

        raw_update = factory.patch(
            f'/api/v1/accounting/account-groups/{group_id}/',
            {'name': 'Custom Current Assets Updated'},
            format='json',
        )
        req_update = DrfRequest(raw_update, parsers=[JSONParser()])
        req_update.user = admin_user
        req_update.tenant = tenant

        update_view = AccountGroupViewSet()
        update_view.request = req_update
        update_view.tenant = tenant
        update_view.action = 'partial_update'
        update_view.kwargs = {'pk': str(group_id)}
        update_view.format_kwarg = None
        update_resp = update_view.update(req_update, pk=str(group_id), partial=True)
        assert update_resp.status_code == 200

        raw_delete = factory.delete(f'/api/v1/accounting/account-groups/{group_id}/')
        req_delete = DrfRequest(raw_delete)
        req_delete.user = admin_user
        req_delete.tenant = tenant

        delete_view = AccountGroupViewSet()
        delete_view.request = req_delete
        delete_view.tenant = tenant
        delete_view.action = 'destroy'
        delete_view.kwargs = {'pk': str(group_id)}
        delete_view.format_kwarg = None
        delete_resp = delete_view.destroy(req_delete, pk=str(group_id))
        assert delete_resp.status_code == 204

        group.refresh_from_db()
        assert group.is_active is False

    @pytest.mark.django_db
    def test_system_group_cannot_be_deleted(self, tenant, admin_user):
        from accounting.views import AccountGroupViewSet
        from accounting.models import AccountGroup
        from core.exceptions import ConflictError
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request as DrfRequest
        from rest_framework.parsers import JSONParser

        system_group = AccountGroup.objects.filter(tenant=tenant, is_system=True).first()
        assert system_group is not None

        factory = APIRequestFactory()
        raw_delete = factory.delete(f'/api/v1/accounting/account-groups/{system_group.pk}/')
        req_delete = DrfRequest(raw_delete, parsers=[JSONParser()])
        req_delete.user = admin_user
        req_delete.tenant = tenant

        view = AccountGroupViewSet()
        view.request = req_delete
        view.tenant = tenant
        view.action = 'destroy'
        view.kwargs = {'pk': str(system_group.pk)}
        view.format_kwarg = None

        with pytest.raises(ConflictError):
            view.destroy(req_delete, pk=str(system_group.pk))


# ─────────────────────────────────────────────────────────────────────────────
# N1 — run_recurring_journal is idempotent (no duplicate entries on Celery retry)
# ─────────────────────────────────────────────────────────────────────────────

class TestN1RecurringJournalIdempotency:

    @pytest.fixture
    def recurring(self, db, tenant, coa_accounts):
        """Create a simple recurring journal template (rent expense)."""
        from accounting.models import RecurringJournal
        import datetime

        cash_code = next(
            (c for c, a in coa_accounts.items() if a.group and a.group.slug == 'cash_in_hand'),
            '1100',
        )
        exp_code = next(
            (c for c, a in coa_accounts.items() if a.group and a.group.slug == 'indirect_expense'),
            '5200',
        )
        today = datetime.date.today()
        return RecurringJournal.objects.create(
            tenant=tenant,
            name="Monthly Rent",
            frequency=RecurringJournal.FREQ_MONTHLY,
            start_date=today,
            next_date=today,
            template_lines=[
                {"account_code": exp_code, "debit": "50000.00", "credit": "0.00", "description": "Rent expense"},
                {"account_code": cash_code, "debit": "0.00", "credit": "50000.00", "description": "Cash"},
            ],
        )

    @pytest.mark.django_db
    def test_recurring_uses_recurring_ref_type(self, tenant, recurring):
        """run_recurring_journal must store reference_type='recurring', not 'manual'."""
        from accounting.services.journal_service import run_recurring_journal
        from accounting.models import JournalEntry

        entry = run_recurring_journal(recurring)
        assert entry is not None
        assert entry.reference_type == JournalEntry.REF_RECURRING, (
            f"N1 FAIL: expected reference_type='recurring', got '{entry.reference_type}'"
        )
        assert entry.reference_id == recurring.pk, (
            f"N1 FAIL: expected reference_id={recurring.pk}, got {entry.reference_id}"
        )
        assert entry.purpose == JournalEntry.PURPOSE_RECURRING, (
            f"N1 FAIL: expected purpose='recurring', got '{entry.purpose}'"
        )

    @pytest.mark.django_db
    def test_second_call_same_day_returns_same_entry(self, tenant, recurring):
        """Calling run_recurring_journal twice on the same day returns the existing entry."""
        from accounting.services.journal_service import run_recurring_journal
        from accounting.models import JournalEntry

        entry1 = run_recurring_journal(recurring)
        entry2 = run_recurring_journal(recurring)

        assert entry1.pk == entry2.pk, (
            "N1 FAIL: second call on same day created a NEW entry (not idempotent). "
            f"entry1.pk={entry1.pk} entry2.pk={entry2.pk}"
        )
        count = JournalEntry.objects.filter(
            tenant=tenant,
            reference_type='recurring',
            reference_id=recurring.pk,
        ).count()
        assert count == 1, (
            f"N1 FAIL: expected 1 recurring entry, found {count}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# N2 — VAT/TDS remittance double-posting guard
# ─────────────────────────────────────────────────────────────────────────────

class TestN2RemittanceDedup:

    @pytest.mark.django_db
    def test_vat_remittance_double_posting_raises(self, tenant, admin_user):
        """Second VAT remittance for the same period must raise ConflictError."""
        from accounting.services.journal_service import record_vat_remittance
        from core.exceptions import ConflictError

        record_vat_remittance(tenant, Decimal("13000"), "2081-09", created_by=admin_user)

        with pytest.raises(ConflictError, match="2081-09"):
            record_vat_remittance(tenant, Decimal("5000"), "2081-09", created_by=admin_user)

    @pytest.mark.django_db
    def test_vat_remittance_different_periods_allowed(self, tenant, admin_user):
        """Two VAT remittances for DIFFERENT periods must both succeed."""
        from accounting.services.journal_service import record_vat_remittance
        from accounting.models import JournalEntry

        record_vat_remittance(tenant, Decimal("13000"), "2081-09", created_by=admin_user)
        record_vat_remittance(tenant, Decimal("7000"),  "2081-10", created_by=admin_user)

        count = JournalEntry.objects.filter(
            tenant=tenant, reference_type='vat_remittance', is_posted=True,
        ).count()
        assert count == 2, f"N2 FAIL: expected 2 VAT remittance entries, got {count}"

    @pytest.mark.django_db
    def test_tds_remittance_double_posting_raises(self, tenant, admin_user):
        """Second TDS remittance for the same period must raise ConflictError."""
        from accounting.services.journal_service import record_tds_remittance
        from core.exceptions import ConflictError

        record_tds_remittance(tenant, Decimal("5000"), "2081-09", created_by=admin_user)

        with pytest.raises(ConflictError, match="2081-09"):
            record_tds_remittance(tenant, Decimal("2000"), "2081-09", created_by=admin_user)


# ─────────────────────────────────────────────────────────────────────────────
# N3 — FY closing entry is balanced even when P&L accounts have opening_balance
# ─────────────────────────────────────────────────────────────────────────────

class TestN3FiscalYearCloseBalanced:

    @pytest.mark.django_db
    def test_fy_close_balanced_with_opening_balance(self, tenant, admin_user, coa_accounts):
        """
        If a revenue account has a non-zero opening_balance, the closing journal
        entry must still balance (total_debit == total_credit).

        Regression for N3: previously net_profit included OB via profit_and_loss()
        but per-account closing lines excluded OB → unbalanced entry.
        """
        from accounting.models import Account, JournalEntry, JournalLine
        from accounting.services.fiscal_year_service import close_fiscal_year
        from core.nepali_date import fiscal_year_date_range, FiscalYear
        import datetime

        # Find or pick a revenue account
        revenue_acct = Account.objects.filter(
            tenant=tenant, type='revenue', is_active=True,
        ).first()
        assert revenue_acct is not None, "Need at least one revenue account in CoA"

        # Set a non-zero opening balance on the revenue account
        revenue_acct.opening_balance = Decimal("10000.00")
        revenue_acct.save(update_fields=["opening_balance"])

        # Post a revenue journal in the FY period (2080 = a safe past BS year)
        fy_year = 2080
        fy = FiscalYear(bs_year=fy_year)
        start_ad, end_ad = fiscal_year_date_range(fy)

        # Find a cash account for the debit side
        cash_acct = Account.objects.filter(
            tenant=tenant, type='asset', is_active=True,
        ).first()
        assert cash_acct is not None

        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=start_ad,
            description="Revenue with OB test",
            reference_type='manual',
        )
        JournalLine.objects.create(
            entry=entry, account=cash_acct,
            debit=Decimal("50000"), credit=Decimal("0"),
        )
        JournalLine.objects.create(
            entry=entry, account=revenue_acct,
            debit=Decimal("0"), credit=Decimal("50000"),
        )
        entry.post()

        # Close the fiscal year — this should NOT raise a balance error
        fy_close = close_fiscal_year(
            tenant=tenant, fy_year=fy_year, closed_by=admin_user,
        )

        # Verify the closing entry itself is balanced
        closing_entry = fy_close.journal_entry
        assert closing_entry.total_debit == closing_entry.total_credit, (
            f"N3 FAIL: closing entry unbalanced. "
            f"total_debit={closing_entry.total_debit} "
            f"total_credit={closing_entry.total_credit}. "
            "Opening balances on revenue/expense accounts are not being included "
            "in the per-account closing lines."
        )


# ─────────────────────────────────────────────────────────────────────────────
# N4 — PaymentAllocation.save() enforces clean() via ORM
# ─────────────────────────────────────────────────────────────────────────────

class TestN4PaymentAllocationSave:

    @pytest.fixture
    def paid_invoice_and_payment(self, db, tenant, admin_user, coa_accounts):
        """Create an issued invoice + an incoming payment for 1000 NPR."""
        from accounting.models import Invoice, Payment
        import datetime

        inv = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            invoice_number="INV-N4-001",
            line_items=[{"description": "Service", "qty": 1, "unit_price": "1000.00"}],
            subtotal=Decimal("1000"),
            vat_rate=Decimal("0"),
            vat_amount=Decimal("0"),
            total=Decimal("1000"),
            status=Invoice.STATUS_ISSUED,
        )
        payment = Payment.objects.create(
            tenant=tenant,
            created_by=admin_user,
            invoice=inv,
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=Decimal("1000"),
            date=datetime.date.today(),
            reference=inv.invoice_number,
        )
        return inv, payment

    @pytest.mark.django_db
    def test_over_allocation_raises_via_orm_save(self, tenant, paid_invoice_and_payment):
        """
        Creating a PaymentAllocation via ORM save() that exceeds the payment
        amount must raise ValidationError (not silently over-allocate).
        """
        from django.core.exceptions import ValidationError
        from accounting.models import PaymentAllocation

        inv, payment = paid_invoice_and_payment

        # Partial allocation of 600 — this is fine
        alloc1 = PaymentAllocation(
            tenant=tenant,
            payment=payment,
            invoice=inv,
            amount=Decimal("600"),
        )
        alloc1.save()   # must succeed

        # Second allocation of 600 — would total 1200 > 1000 (over-allocation)
        alloc2 = PaymentAllocation(
            tenant=tenant,
            payment=payment,
            invoice=inv,
            amount=Decimal("600"),
        )
        with pytest.raises(ValidationError, match="above payment amount"):
            alloc2.save()   # N4 FAIL if no exception raised

    @pytest.mark.django_db
    def test_valid_allocation_saves_ok(self, tenant, paid_invoice_and_payment):
        """A valid allocation within the payment amount must save without error."""
        from accounting.models import PaymentAllocation

        inv, payment = paid_invoice_and_payment

        alloc = PaymentAllocation(
            tenant=tenant,
            payment=payment,
            invoice=inv,
            amount=Decimal("500"),
        )
        alloc.save()   # must NOT raise
        assert alloc.pk is not None


# ─────────────────────────────────────────────────────────────────────────────
# N5 — Payment direction invariants (incoming/invoice, outgoing/bill)
# ─────────────────────────────────────────────────────────────────────────────

class TestN5PaymentDirectionValidation:

    @pytest.fixture
    def invoice_and_bill(self, tenant, admin_user):
        from accounting.models import Invoice, Bill

        invoice = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 4, 1),
            line_items=[{'description': 'Service', 'qty': 1, 'unit_price': '100.00'}],
            subtotal=Decimal('100.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('100.00'),
            status=Invoice.STATUS_ISSUED,
        )
        bill = Bill.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 4, 1),
            supplier_name='Vendor A',
            line_items=[{'description': 'Purchase', 'qty': 1, 'unit_price': '80.00'}],
            subtotal=Decimal('80.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('80.00'),
            status=Bill.STATUS_APPROVED,
        )
        return invoice, bill

    @pytest.mark.django_db
    def test_service_rejects_outgoing_invoice_payment(self, tenant, admin_user, invoice_and_bill):
        from accounting.models import Payment
        from accounting.services.payment_service import record_payment

        invoice, _bill = invoice_and_bill
        with pytest.raises(ValueError, match='incoming'):
            record_payment(
                tenant=tenant,
                created_by=admin_user,
                payment_type=Payment.TYPE_OUTGOING,
                method=Payment.METHOD_CASH,
                amount=Decimal('10.00'),
                invoice=invoice,
            )

    @pytest.mark.django_db
    def test_service_rejects_incoming_bill_payment(self, tenant, admin_user, invoice_and_bill):
        from accounting.models import Payment
        from accounting.services.payment_service import record_payment

        _invoice, bill = invoice_and_bill
        with pytest.raises(ValueError, match='outgoing'):
            record_payment(
                tenant=tenant,
                created_by=admin_user,
                payment_type=Payment.TYPE_INCOMING,
                method=Payment.METHOD_CASH,
                amount=Decimal('10.00'),
                bill=bill,
            )


# ─────────────────────────────────────────────────────────────────────────────
# N6 — Bank reconciliation match integrity checks
# ─────────────────────────────────────────────────────────────────────────────

class TestN6BankReconciliationMatching:

    @pytest.mark.django_db
    def test_match_line_rejects_payment_from_different_bank_account(self, tenant, admin_user, coa_accounts):
        from accounting.models import BankAccount, Payment, BankReconciliation, BankReconciliationLine
        from accounting.views import BankReconciliationViewSet
        from core.exceptions import ValidationError as AppValidationError
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request as DrfRequest
        from rest_framework.parsers import JSONParser

        bank_a = BankAccount.objects.create(
            tenant=tenant,
            created_by=admin_user,
            name='Bank A',
            bank_name='A',
            account_number='A-001',
        )
        bank_b = BankAccount.objects.create(
            tenant=tenant,
            created_by=admin_user,
            name='Bank B',
            bank_name='B',
            account_number='B-001',
        )

        payment = Payment.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 4, 2),
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_BANK,
            amount=Decimal('50.00'),
            bank_account=bank_a,
        )

        rec = BankReconciliation.objects.create(
            tenant=tenant,
            created_by=admin_user,
            bank_account=bank_b,
            statement_date=datetime.date(2026, 4, 2),
            opening_balance=Decimal('0.00'),
            closing_balance=Decimal('0.00'),
        )
        line = BankReconciliationLine.objects.create(
            reconciliation=rec,
            date=datetime.date(2026, 4, 2),
            description='Incoming',
            amount=Decimal('50.00'),
        )

        factory = APIRequestFactory()
        raw = factory.post(
            f'/api/v1/accounting/bank-reconciliations/{rec.pk}/match-line/',
            {'line_id': line.pk, 'payment_id': payment.pk},
            format='json',
        )
        req = DrfRequest(raw, parsers=[JSONParser()])
        req.user = admin_user
        req.tenant = tenant

        view = BankReconciliationViewSet()
        view.request = req
        view.tenant = tenant
        view.action = 'match_line'
        view.kwargs = {'pk': str(rec.pk)}
        view.format_kwarg = None

        with pytest.raises(AppValidationError, match='does not match'):
            view.match_line(req, pk=str(rec.pk))


# ─────────────────────────────────────────────────────────────────────────────
# N7 — Cash book voucher lookup must be tenant-scoped
# ─────────────────────────────────────────────────────────────────────────────

class TestN7CashBookTenantSafety:

    @pytest.mark.django_db
    def test_cash_book_does_not_resolve_foreign_tenant_voucher_number(self, tenant, admin_user, coa_accounts):
        from tenants.models import Tenant
        from accounting.models import Invoice, JournalEntry, JournalLine, Account
        from accounting.services.report_service import cash_book

        other_tenant = Tenant.objects.create(name='Other Tenant', slug='other-tenant-n7')
        foreign_invoice = Invoice.objects.create(
            tenant=other_tenant,
            created_by=admin_user,
            date=datetime.date(2026, 4, 3),
            line_items=[{'description': 'Foreign', 'qty': 1, 'unit_price': '10.00'}],
            subtotal=Decimal('10.00'),
            discount=Decimal('0.00'),
            vat_rate=Decimal('0.00'),
            vat_amount=Decimal('0.00'),
            total=Decimal('10.00'),
            status=Invoice.STATUS_ISSUED,
            invoice_number='INV-FOREIGN-N7',
        )

        cash_account = coa_accounts.get('1100')
        revenue_account = Account.objects.filter(tenant=tenant, type='revenue', is_active=True).first()
        if cash_account is None or revenue_account is None:
            pytest.skip('Required cash/revenue accounts not available')

        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=datetime.date(2026, 4, 3),
            description='N7 test entry',
            reference_type='invoice',
            reference_id=foreign_invoice.pk,
        )
        JournalLine.objects.create(
            entry=entry,
            account=cash_account,
            debit=Decimal('10.00'),
            credit=Decimal('0.00'),
            description='Cash in',
        )
        JournalLine.objects.create(
            entry=entry,
            account=revenue_account,
            debit=Decimal('0.00'),
            credit=Decimal('10.00'),
            description='Revenue',
        )
        entry.post()

        result = cash_book(tenant, datetime.date(2026, 4, 3), datetime.date(2026, 4, 3))
        matched = [
            row for row in result['transactions']
            if row.get('reference_type') == 'invoice' and row.get('reference_id') == foreign_invoice.pk
        ]
        assert matched, 'N7 setup failed: expected at least one invoice-referenced cash-book row.'
        assert matched[0].get('voucher_number') == '', (
            'N7 FAIL: cash-book resolved invoice number from another tenant.'
        )
