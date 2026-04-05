import datetime
import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from django.db.models import Sum
from rest_framework.request import Request as DrfRequest
from rest_framework.test import APIRequestFactory

from accounts.models import TenantMembership
from accounting.models import (
    Account,
    AccountGroup,
    BankAccount,
    BankReconciliation,
    Bill,
    CoinTransaction,
    CostCentre,
    CreditNote,
    DebitNote,
    Expense,
    Invoice,
    JournalEntry,
    JournalLine,
    Payment,
    PaymentAllocation,
    Payslip,
    Quotation,
    RecurringJournal,
    StaffSalaryProfile,
    TDSEntry,
)
from accounting.services.report_service import balance_sheet, trial_balance
from accounting.views import (
    AccountGroupViewSet,
    AccountViewSet,
    BankAccountViewSet,
    BankReconciliationViewSet,
    BillViewSet,
    CoinTransactionViewSet,
    CostCentreViewSet,
    CreditNoteViewSet,
    DebitNoteViewSet,
    ExpenseViewSet,
    InvoiceViewSet,
    JournalEntryViewSet,
    PaymentAllocationViewSet,
    PaymentViewSet,
    PayslipViewSet,
    QuotationViewSet,
    RecurringJournalViewSet,
    StaffSalaryProfileViewSet,
    TDSEntryViewSet,
)
from tenants.models import Tenant


@pytest.fixture
def tenant(db):
    return Tenant.objects.create(
        name="Isolation Co",
        slug=f"isol-{uuid.uuid4().hex[:8]}",
        vat_enabled=True,
        vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
    )


@pytest.fixture
def other_tenant(db):
    return Tenant.objects.create(
        name="Isolation Other Co",
        slug=f"isol-other-{uuid.uuid4().hex[:8]}",
        vat_enabled=True,
        vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
    )


@pytest.fixture
def admin_user(db, tenant):
    user = get_user_model().objects.create_user(
        username=f"isol_admin_{uuid.uuid4().hex[:6]}",
        email=f"isol-admin-{uuid.uuid4().hex[:6]}@example.com",
        password="testpassword",
    )
    TenantMembership.objects.create(user=user, tenant=tenant, role="admin", is_active=True)
    return user


@pytest.fixture
def other_user(db, other_tenant):
    user = get_user_model().objects.create_user(
        username=f"isol_other_{uuid.uuid4().hex[:6]}",
        email=f"isol-other-{uuid.uuid4().hex[:6]}@example.com",
        password="testpassword",
    )
    TenantMembership.objects.create(user=user, tenant=other_tenant, role="admin", is_active=True)
    return user


def _drf_request(tenant, user, params=None):
    raw = APIRequestFactory().get("/api/v1/accounting/", data=params or {})
    req = DrfRequest(raw)
    req.tenant = tenant
    req.user = user
    return req


def _build_view(viewset_cls, tenant, user, action="list", params=None):
    view = viewset_cls()
    view.request = _drf_request(tenant, user, params=params)
    view.tenant = tenant
    view.action = action
    view.kwargs = {}
    return view


def _pick_account(tenant, acct_type=None, group_slug=None):
    qs = Account.objects.filter(tenant=tenant, is_active=True)
    if acct_type:
        qs = qs.filter(type=acct_type)
    if group_slug:
        qs = qs.filter(group__slug=group_slug)
    acc = qs.order_by("code").first()
    assert acc is not None, f"No account found for tenant={tenant.id}, type={acct_type}, group={group_slug}"
    return acc


def _post_entry(tenant, user, on_date, line_defs):
    entry = JournalEntry.objects.create(
        tenant=tenant,
        created_by=user,
        date=on_date,
        description=f"Parity test {on_date}",
        reference_type=JournalEntry.REF_MANUAL,
        purpose=JournalEntry.PURPOSE_ADJUSTMENT,
    )
    for account, debit, credit in line_defs:
        JournalLine.objects.create(entry=entry, account=account, debit=debit, credit=credit)
    entry.post()
    return entry


def _create_invoice(tenant, user, total=Decimal("100.00")):
    return Invoice.objects.create(
        tenant=tenant,
        created_by=user,
        date=datetime.date(2026, 3, 10),
        line_items=[],
        subtotal=total,
        discount=Decimal("0.00"),
        vat_rate=Decimal("0.00"),
        vat_amount=Decimal("0.00"),
        total=total,
        status=Invoice.STATUS_ISSUED,
    )


def _create_bill(tenant, user, total=Decimal("80.00")):
    return Bill.objects.create(
        tenant=tenant,
        created_by=user,
        supplier_name="Isolation Supplier",
        date=datetime.date(2026, 3, 11),
        line_items=[],
        subtotal=total,
        discount=Decimal("0.00"),
        vat_rate=Decimal("0.00"),
        vat_amount=Decimal("0.00"),
        total=total,
        status=Bill.STATUS_DRAFT,
    )


def _create_instance(kind, tenant, user):
    today = datetime.date(2026, 3, 20)

    if kind == "account_group":
        return AccountGroup.objects.create(
            tenant=tenant,
            created_by=user,
            slug=f"grp-{uuid.uuid4().hex[:8]}",
            name=f"Group {uuid.uuid4().hex[:4]}",
            type=AccountGroup.TYPE_ASSET,
            report_section=AccountGroup.SECTION_BS_CURRENT,
            normal_balance=AccountGroup.NORMAL_DEBIT,
            is_active=True,
        )

    if kind == "account":
        group = AccountGroup.objects.filter(tenant=tenant, type=AccountGroup.TYPE_ASSET).order_by("id").first()
        assert group is not None
        return Account.objects.create(
            tenant=tenant,
            created_by=user,
            code=f"X{uuid.uuid4().hex[:8]}",
            name=f"Acct {uuid.uuid4().hex[:4]}",
            type=Account.TYPE_ASSET,
            group=group,
            is_active=True,
        )

    if kind == "bank_account":
        return BankAccount.objects.create(
            tenant=tenant,
            created_by=user,
            name=f"Bank {uuid.uuid4().hex[:6]}",
            bank_name="Isolation Bank",
            opening_balance=Decimal("0.00"),
        )

    if kind == "journal_entry":
        return JournalEntry.objects.create(
            tenant=tenant,
            created_by=user,
            date=today,
            description="Isolation journal",
            reference_type=JournalEntry.REF_MANUAL,
            purpose=JournalEntry.PURPOSE_ADJUSTMENT,
            is_posted=False,
        )

    if kind == "bill":
        return _create_bill(tenant, user)

    if kind == "payment":
        return Payment.objects.create(
            tenant=tenant,
            created_by=user,
            date=today,
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=Decimal("25.00"),
        )

    if kind == "credit_note":
        invoice = _create_invoice(tenant, user)
        return CreditNote.objects.create(
            tenant=tenant,
            created_by=user,
            invoice=invoice,
            line_items=[],
            subtotal=Decimal("10.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("10.00"),
            status=CreditNote.STATUS_DRAFT,
        )

    if kind == "invoice":
        return _create_invoice(tenant, user)

    if kind == "quotation":
        return Quotation.objects.create(
            tenant=tenant,
            created_by=user,
            line_items=[],
            subtotal=Decimal("50.00"),
            discount=Decimal("0.00"),
            vat_rate=Decimal("0.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("50.00"),
            status=Quotation.STATUS_DRAFT,
        )

    if kind == "debit_note":
        bill = _create_bill(tenant, user)
        return DebitNote.objects.create(
            tenant=tenant,
            created_by=user,
            bill=bill,
            line_items=[],
            subtotal=Decimal("10.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("10.00"),
            status=DebitNote.STATUS_DRAFT,
        )

    if kind == "tds":
        return TDSEntry.objects.create(
            tenant=tenant,
            created_by=user,
            supplier_name="TDS Supplier",
            taxable_amount=Decimal("1000.00"),
            tds_rate=Decimal("0.10"),
            period_month=1,
            period_year=2082,
        )

    if kind == "bank_reconciliation":
        bank = _create_instance("bank_account", tenant, user)
        return BankReconciliation.objects.create(
            tenant=tenant,
            created_by=user,
            bank_account=bank,
            statement_date=today,
            opening_balance=Decimal("100.00"),
            closing_balance=Decimal("100.00"),
        )

    if kind == "recurring_journal":
        exp = _pick_account(tenant, acct_type="expense")
        cash = _pick_account(tenant, acct_type="asset")
        return RecurringJournal.objects.create(
            tenant=tenant,
            created_by=user,
            name=f"Recurring {uuid.uuid4().hex[:4]}",
            frequency=RecurringJournal.FREQ_MONTHLY,
            start_date=today,
            next_date=today,
            template_lines=[
                {"account_code": exp.code, "debit": "10.00", "credit": "0.00", "description": "Dr"},
                {"account_code": cash.code, "debit": "0.00", "credit": "10.00", "description": "Cr"},
            ],
        )

    if kind == "expense":
        exp_account = _pick_account(tenant, acct_type="expense")
        return Expense.objects.create(
            tenant=tenant,
            created_by=user,
            submitted_by=user,
            description="Office expense",
            amount=Decimal("30.00"),
            date=today,
            category=Expense.CATEGORY_OFFICE,
            account=exp_account,
            status=Expense.STATUS_DRAFT,
        )

    if kind == "cost_centre":
        return CostCentre.objects.create(
            tenant=tenant,
            created_by=user,
            name=f"CC {uuid.uuid4().hex[:4]}",
            code=f"CC{uuid.uuid4().hex[:6]}",
            is_active=True,
        )

    if kind == "payment_allocation":
        invoice = _create_invoice(tenant, user)
        payment = Payment.objects.create(
            tenant=tenant,
            created_by=user,
            date=today,
            type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=Decimal("100.00"),
            invoice=invoice,
        )
        return PaymentAllocation.objects.create(
            tenant=tenant,
            created_by=user,
            payment=payment,
            invoice=invoice,
            amount=Decimal("50.00"),
        )

    if kind == "salary_profile":
        return StaffSalaryProfile.objects.create(
            tenant=tenant,
            created_by=user,
            staff=user,
            base_salary=Decimal("30000.00"),
            tds_rate=Decimal("0.10"),
            effective_from=today,
        )

    if kind == "payslip":
        return Payslip.objects.create(
            tenant=tenant,
            created_by=user,
            staff=user,
            period_start=datetime.date(2026, 3, 1),
            period_end=datetime.date(2026, 3, 31),
            base_salary=Decimal("30000.00"),
            bonus=Decimal("0.00"),
            tds_amount=Decimal("3000.00"),
            deductions=Decimal("0.00"),
            net_pay=Decimal("27000.00"),
            gross_amount=Decimal("0.00"),
            status=Payslip.STATUS_DRAFT,
        )

    if kind == "coin_transaction":
        return CoinTransaction.objects.create(
            tenant=tenant,
            created_by=user,
            staff=user,
            amount=Decimal("10.00"),
            source_type=CoinTransaction.SOURCE_MANUAL,
            status=CoinTransaction.STATUS_PENDING,
        )

    raise AssertionError(f"Unknown factory kind: {kind}")


class _TenantScopedViewSetTest:
    viewset_cls = None
    model_kind = None

    def _assert_scoped(self, tenant, other_tenant, admin_user, other_user):
        own = _create_instance(self.model_kind, tenant, admin_user)
        other = _create_instance(self.model_kind, other_tenant, other_user)

        list_view = _build_view(self.viewset_cls, tenant, admin_user, action="list")
        list_ids = set(list_view.get_queryset().values_list("id", flat=True))
        assert own.id in list_ids
        assert other.id not in list_ids

        retrieve_view = _build_view(self.viewset_cls, tenant, admin_user, action="retrieve")
        retrieve_qs = retrieve_view.get_queryset()
        assert retrieve_qs.filter(pk=own.pk).exists()
        assert not retrieve_qs.filter(pk=other.pk).exists()


class TestS2AccountGroupViewSet(_TenantScopedViewSetTest):
    viewset_cls = AccountGroupViewSet
    model_kind = "account_group"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2AccountViewSet(_TenantScopedViewSetTest):
    viewset_cls = AccountViewSet
    model_kind = "account"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2BankAccountViewSet(_TenantScopedViewSetTest):
    viewset_cls = BankAccountViewSet
    model_kind = "bank_account"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2JournalEntryViewSet(_TenantScopedViewSetTest):
    viewset_cls = JournalEntryViewSet
    model_kind = "journal_entry"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2BillViewSet(_TenantScopedViewSetTest):
    viewset_cls = BillViewSet
    model_kind = "bill"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2PaymentViewSet(_TenantScopedViewSetTest):
    viewset_cls = PaymentViewSet
    model_kind = "payment"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2CreditNoteViewSet(_TenantScopedViewSetTest):
    viewset_cls = CreditNoteViewSet
    model_kind = "credit_note"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2CoinTransactionViewSet(_TenantScopedViewSetTest):
    viewset_cls = CoinTransactionViewSet
    model_kind = "coin_transaction"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2StaffSalaryProfileViewSet(_TenantScopedViewSetTest):
    viewset_cls = StaffSalaryProfileViewSet
    model_kind = "salary_profile"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2PayslipViewSet(_TenantScopedViewSetTest):
    viewset_cls = PayslipViewSet
    model_kind = "payslip"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2InvoiceViewSet(_TenantScopedViewSetTest):
    viewset_cls = InvoiceViewSet
    model_kind = "invoice"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2QuotationViewSet(_TenantScopedViewSetTest):
    viewset_cls = QuotationViewSet
    model_kind = "quotation"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2DebitNoteViewSet(_TenantScopedViewSetTest):
    viewset_cls = DebitNoteViewSet
    model_kind = "debit_note"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2TDSEntryViewSet(_TenantScopedViewSetTest):
    viewset_cls = TDSEntryViewSet
    model_kind = "tds"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2BankReconciliationViewSet(_TenantScopedViewSetTest):
    viewset_cls = BankReconciliationViewSet
    model_kind = "bank_reconciliation"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2RecurringJournalViewSet(_TenantScopedViewSetTest):
    viewset_cls = RecurringJournalViewSet
    model_kind = "recurring_journal"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2ExpenseViewSet(_TenantScopedViewSetTest):
    viewset_cls = ExpenseViewSet
    model_kind = "expense"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2CostCentreViewSet(_TenantScopedViewSetTest):
    viewset_cls = CostCentreViewSet
    model_kind = "cost_centre"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS2PaymentAllocationViewSet(_TenantScopedViewSetTest):
    viewset_cls = PaymentAllocationViewSet
    model_kind = "payment_allocation"

    @pytest.mark.django_db
    def test_list_and_retrieve_tenant_isolation(self, tenant, other_tenant, admin_user, other_user):
        self._assert_scoped(tenant, other_tenant, admin_user, other_user)


class TestS3ReconciliationParity:

    @pytest.mark.django_db
    def test_posted_journal_vs_trial_balance_vs_balance_sheet_mixed_period(self, tenant, admin_user):
        """Cross-check journal-derived balances against Trial Balance and Balance Sheet as-of values."""
        start = datetime.date(2026, 3, 1)
        end = datetime.date(2026, 3, 31)

        cash = _pick_account(tenant, acct_type="asset", group_slug="cash_in_hand")
        capital = _pick_account(tenant, acct_type="equity")
        revenue = _pick_account(tenant, acct_type="revenue")
        expense = _pick_account(tenant, acct_type="expense")

        _post_entry(
            tenant,
            admin_user,
            datetime.date(2026, 1, 10),
            [
                (cash, Decimal("1000.00"), Decimal("0.00")),
                (capital, Decimal("0.00"), Decimal("1000.00")),
            ],
        )
        _post_entry(
            tenant,
            admin_user,
            datetime.date(2026, 3, 10),
            [
                (cash, Decimal("200.00"), Decimal("0.00")),
                (revenue, Decimal("0.00"), Decimal("200.00")),
            ],
        )
        _post_entry(
            tenant,
            admin_user,
            datetime.date(2026, 3, 20),
            [
                (expense, Decimal("50.00"), Decimal("0.00")),
                (cash, Decimal("0.00"), Decimal("50.00")),
            ],
        )
        _post_entry(
            tenant,
            admin_user,
            datetime.date(2026, 4, 15),
            [
                (cash, Decimal("999.00"), Decimal("0.00")),
                (capital, Decimal("0.00"), Decimal("999.00")),
            ],
        )

        tb = trial_balance(tenant, start, end)
        bs = balance_sheet(tenant, end)

        lines = (
            JournalLine.objects
            .filter(entry__tenant=tenant, entry__is_posted=True, entry__date__lte=end)
            .values("account_id")
            .annotate(total_debit=Sum("debit"), total_credit=Sum("credit"))
        )
        journal_map = {
            row["account_id"]: {
                "dr": row["total_debit"] or Decimal("0"),
                "cr": row["total_credit"] or Decimal("0"),
            }
            for row in lines
        }

        tb_rows = {row["id"]: row for row in tb["accounts"]}
        for account in Account.objects.filter(tenant=tenant, is_active=True):
            posted = journal_map.get(account.pk, {"dr": Decimal("0"), "cr": Decimal("0")})
            ob = account.opening_balance or Decimal("0")
            if account.type in ("asset", "expense"):
                journal_signed = ob + posted["dr"] - posted["cr"]
            else:
                journal_signed = ob + posted["cr"] - posted["dr"]

            if journal_signed == Decimal("0"):
                continue

            assert account.pk in tb_rows, f"TB missing non-zero account {account.code}"
            row = tb_rows[account.pk]
            if account.type in ("asset", "expense"):
                tb_signed = row["closing_dr"] - row["closing_cr"]
            else:
                tb_signed = row["closing_cr"] - row["closing_dr"]
            assert tb_signed == journal_signed, (
                f"Mismatch for {account.code}: journal={journal_signed} tb={tb_signed}"
            )

        assert tb["total_closing_dr"] == tb["total_closing_cr"], "Trial Balance should be balanced"

        asset_total_tb = Decimal("0")
        liab_equity_profit_tb = Decimal("0")
        for row in tb["accounts"]:
            if row["type"] in ("asset", "expense"):
                signed = row["closing_dr"] - row["closing_cr"]
            else:
                signed = row["closing_cr"] - row["closing_dr"]

            if row["type"] == "asset":
                asset_total_tb += signed
            if row["type"] == "liability":
                liab_equity_profit_tb += signed
            if row["type"] == "equity":
                liab_equity_profit_tb += signed
            if row["type"] == "revenue":
                liab_equity_profit_tb += signed
            if row["type"] == "expense":
                liab_equity_profit_tb -= signed

        assert bs["total_assets"] == asset_total_tb
        assert bs["total_equity_and_liabilities"] == liab_equity_profit_tb
        assert bs["balanced"] is True
