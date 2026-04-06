"""
test_invoice_lifecycle.py
=========================
Integration tests for the full Invoice lifecycle:
  create → issue → mark-paid → void
  create → mark-paid directly (skipping issue)
  PDF endpoint
  Journal entry auto-creation on issue
  Payment signal clears AR

Run inside Docker:
  docker exec nexusbms-web-1 python -m pytest accounting/tests/test_invoice_lifecycle.py -v
"""
import datetime
import pytest
from decimal import Decimal
from django.utils import timezone
from core.nepali_date import current_fiscal_year, fiscal_year_of, fiscal_year_date_range


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def tenant(db):
    """Create a minimal tenant. CoA is seeded by post_save signal on Tenant."""
    from tenants.models import Tenant
    t = Tenant.objects.create(
        name="Test Co", slug="testco",
        vat_enabled=True, vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
    )
    return t


@pytest.fixture
def admin_user(db, tenant):
    """Create an admin user with tenant membership."""
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user(
        "testadmin",
        email="admin@testco.com",
        password="testpassword",
    )
    TenantMembership.objects.create(
        user=user, tenant=tenant, role="admin", is_active=True,
    )
    return user


# ─── Tests ───────────────────────────────────────────────────────────────────

class TestInvoiceLifecycle:
    """Step-by-step invoice lifecycle tests without HTTP server."""

    def _make_invoice(self, tenant, user):
        """Create a draft invoice directly via service functions."""
        from accounting.models import Invoice
        from accounting.services.invoice_service import compute_invoice_totals

        line_items = [
            {"description": "IT Support 1hr", "qty": 2, "unit_price": "5000.00",
             "discount": "10", "line_type": "service"},
            {"description": "Network Cable",  "qty": 5, "unit_price": "200.00",
             "discount": "0",  "line_type": "product"},
        ]
        subtotal, vat_amount, total = compute_invoice_totals(
            line_items, Decimal("0"), tenant.vat_rate
        )
        return Invoice.objects.create(
            tenant=tenant, created_by=user,
            line_items=line_items,
            subtotal=subtotal, vat_rate=tenant.vat_rate,
            vat_amount=vat_amount, total=total,
            status=Invoice.STATUS_DRAFT,
        )

    # ── 1. Totals are computed correctly ─────────────────────────────────────
    @pytest.mark.django_db
    def test_compute_totals_correct(self, tenant):
        from accounting.services.invoice_service import compute_invoice_totals
        lines = [
            {"qty": 2, "unit_price": "5000.00", "discount": "10"},   # 10000 * 0.9 = 9000
            {"qty": 5, "unit_price": "200.00",  "discount": "0"},    # 1000
        ]
        subtotal, vat_amount, total = compute_invoice_totals(lines, Decimal("0"), Decimal("0.13"))
        assert subtotal   == Decimal("10000.00"), f"Expected 10000, got {subtotal}"
        assert vat_amount == Decimal("1300.00"),  f"Expected 1300, got {vat_amount}"
        assert total      == Decimal("11300.00"), f"Expected 11300, got {total}"

    # ── 2. Create → draft ────────────────────────────────────────────────────
    @pytest.mark.django_db
    def test_create_invoice_is_draft(self, tenant, admin_user):
        from accounting.models import Invoice
        inv = self._make_invoice(tenant, admin_user)
        assert inv.status == Invoice.STATUS_DRAFT
        assert inv.invoice_number.startswith("INV-")
        assert inv.total > 0

    @pytest.mark.django_db
    def test_invoice_number_uses_fiscal_year_prefix(self, tenant, admin_user):
        from accounting.models import Invoice

        fy_date = current_fiscal_year()
        start_ad, _ = fiscal_year_date_range(fy_date)
        invoice_date = start_ad + datetime.timedelta(days=1)
        fy = fiscal_year_of(invoice_date).bs_year

        inv = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=[
                {"description": "Service work", "qty": 1, "unit_price": "1000.00", "discount": "0", "line_type": "service"},
            ],
            subtotal=Decimal("1000.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("130.00"),
            total=Decimal("1130.00"),
            status=Invoice.STATUS_DRAFT,
            date=invoice_date,
        )

        assert inv.invoice_number.startswith(f"INV-{fy}-"), (
            f"Expected fiscal year prefix INV-{fy}-, got {inv.invoice_number}"
        )
        assert inv.invoice_number.endswith("-00001")

    @pytest.mark.django_db
    def test_invoice_number_resets_for_new_fiscal_year(self, tenant, admin_user):
        from accounting.models import Invoice

        fy_date = current_fiscal_year()
        start_ad, _ = fiscal_year_date_range(fy_date)
        prev_date = start_ad - datetime.timedelta(days=1)
        next_date = start_ad

        prev_fy = fiscal_year_of(prev_date).bs_year
        next_fy = fiscal_year_of(next_date).bs_year
        assert prev_fy != next_fy

        inv1 = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=[
                {"description": "Service work", "qty": 1, "unit_price": "1000.00", "discount": "0", "line_type": "service"},
            ],
            subtotal=Decimal("1000.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("130.00"),
            total=Decimal("1130.00"),
            status=Invoice.STATUS_DRAFT,
            date=prev_date,
        )
        inv2 = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=[
                {"description": "Service work", "qty": 1, "unit_price": "1000.00", "discount": "0", "line_type": "service"},
            ],
            subtotal=Decimal("1000.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("130.00"),
            total=Decimal("1130.00"),
            status=Invoice.STATUS_DRAFT,
            date=next_date,
        )

        assert inv1.invoice_number.startswith(f"INV-{prev_fy}-")
        assert inv2.invoice_number.startswith(f"INV-{next_fy}-")
        assert inv2.invoice_number.endswith("-00001")

    @pytest.mark.django_db
    def test_bill_number_uses_fiscal_year_prefix(self, tenant, admin_user):
        from accounting.models import Bill

        fy_date = current_fiscal_year()
        start_ad, _ = fiscal_year_date_range(fy_date)
        bill_date = start_ad + datetime.timedelta(days=2)
        fy = fiscal_year_of(bill_date).bs_year

        bill = Bill.objects.create(
            tenant=tenant,
            created_by=admin_user,
            supplier_name="Acme Supplies",
            line_items=[{"description": "Widgets", "qty": 10, "unit_price": "100.00", "discount": "0", "line_type": "product"}],
            subtotal=Decimal("1000.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("130.00"),
            total=Decimal("1130.00"),
            status=Bill.STATUS_DRAFT,
            date=bill_date,
        )

        assert bill.bill_number.startswith(f"BILL-{fy}-"), (
            f"Expected fiscal year prefix BILL-{fy}-, got {bill.bill_number}"
        )
        assert bill.bill_number.endswith("-00001")

    @pytest.mark.django_db
    def test_invoice_sequence_seeds_legacy_numbers_in_same_fiscal_year(self, tenant, admin_user):
        from accounting.models import Invoice

        fy_date = current_fiscal_year()
        start_ad, _ = fiscal_year_date_range(fy_date)
        invoice_date = start_ad + datetime.timedelta(days=2)
        fy = fiscal_year_of(invoice_date).bs_year

        Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=[{"description": "Test", "qty": 1, "unit_price": "100.00", "discount": "0", "line_type": "service"}],
            subtotal=Decimal("100.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("13.00"),
            total=Decimal("113.00"),
            status=Invoice.STATUS_DRAFT,
            date=invoice_date,
            invoice_number="INV-00003",
        )

        inv = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=[{"description": "Test", "qty": 1, "unit_price": "100.00", "discount": "0", "line_type": "service"}],
            subtotal=Decimal("100.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("13.00"),
            total=Decimal("113.00"),
            status=Invoice.STATUS_DRAFT,
            date=invoice_date,
        )

        assert inv.invoice_number == f"INV-{fy}-00004"

    @pytest.mark.django_db
    def test_credit_note_number_assigned_on_issue_uses_issued_at_fiscal_year(self, tenant, admin_user):
        from accounting.models import CreditNote, Invoice
        from accounting.services.credit_note_service import CreditNoteService

        invoice = Invoice.objects.create(
            tenant=tenant,
            created_by=admin_user,
            date=timezone.localdate(),
            line_items=[],
            subtotal=Decimal("100.00"),
            discount=Decimal("0.00"),
            vat_rate=Decimal("0.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("100.00"),
            status=Invoice.STATUS_DRAFT,
        )

        cn = CreditNote.objects.create(
            tenant=tenant,
            created_by=admin_user,
            invoice=invoice,
            line_items=[],
            subtotal=Decimal("10.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("10.00"),
            status=CreditNote.STATUS_DRAFT,
        )

        service = CreditNoteService(tenant=tenant, user=admin_user)
        cn = service.issue(cn)

        assert cn.credit_note_number.startswith(
            f"CN-{fiscal_year_of(cn.issued_at.date()).bs_year}-"
        )

    @pytest.mark.django_db
    def test_debit_note_number_assigned_on_issue_uses_issued_at_fiscal_year(self, tenant, admin_user):
        from accounting.models import DebitNote, Bill

        fy_date = current_fiscal_year()
        start_ad, _ = fiscal_year_date_range(fy_date)
        bill_date = start_ad + datetime.timedelta(days=2)
        bill = Bill.objects.create(
            tenant=tenant,
            created_by=admin_user,
            supplier_name='Supplier',
            line_items=[],
            subtotal=Decimal("100.00"),
            vat_rate=tenant.vat_rate,
            vat_amount=Decimal("0.00"),
            total=Decimal("100.00"),
            status=Bill.STATUS_DRAFT,
            date=bill_date,
        )

        dn = DebitNote.objects.create(
            tenant=tenant,
            created_by=admin_user,
            bill=bill,
            line_items=[],
            subtotal=Decimal("10.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("10.00"),
            status=DebitNote.STATUS_DRAFT,
        )

        issue_date = timezone.now()
        dn.status = DebitNote.STATUS_ISSUED
        dn.issued_at = issue_date
        dn.save(update_fields=['status', 'issued_at', 'debit_note_number'])

        assert dn.debit_note_number.startswith(f"DN-{fiscal_year_of(issue_date.date()).bs_year}-")

    @pytest.mark.django_db
    def test_quotation_number_uses_accept_sent_or_creation_date_for_fiscal_year(self, tenant, admin_user):
        from accounting.models import Quotation

        accepted_at = datetime.datetime(2024, 11, 12, 12, 0, 0, tzinfo=timezone.get_current_timezone())
        q = Quotation.objects.create(
            tenant=tenant,
            created_by=admin_user,
            line_items=[],
            subtotal=Decimal("10.00"),
            discount=Decimal("0.00"),
            vat_rate=Decimal("0.00"),
            vat_amount=Decimal("0.00"),
            total=Decimal("10.00"),
            status=Quotation.STATUS_ACCEPTED,
            accepted_at=accepted_at,
        )

        assert q.quotation_number.startswith(
            f"QUO-{fiscal_year_of(accepted_at.date()).bs_year}-"
        )

    # ── 3. Issue → journal created ───────────────────────────────────────────
    @pytest.mark.django_db
    def test_issue_creates_journal_entry(self, tenant, admin_user):
        from accounting.models import Invoice, JournalEntry
        inv = self._make_invoice(tenant, admin_user)

        # Simulate the issue action
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=["status"])

        # Signal should have created a posted journal entry
        entries = JournalEntry.objects.filter(
            tenant=tenant, reference_type="invoice", reference_id=inv.pk, is_posted=True
        )
        assert entries.exists(), "No journal entry created on invoice issue"
        entry = entries.first()
        assert entry.total_debit == entry.total_credit, \
            f"Journal not balanced: Dr={entry.total_debit} Cr={entry.total_credit}"
        assert entry.total_debit == inv.total, \
            f"Dr AR ({entry.total_debit}) ≠ invoice total ({inv.total})"

    # ── 4. Journal balance: Dr AR == Cr Revenue + Cr VAT ────────────────────
    @pytest.mark.django_db
    def test_journal_line_split(self, tenant, admin_user):
        from accounting.models import Invoice, JournalEntry
        inv = self._make_invoice(tenant, admin_user)
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=["status"])

        entry = JournalEntry.objects.get(
            tenant=tenant, reference_type="invoice", reference_id=inv.pk
        )
        lines = list(entry.lines.select_related("account"))
        ar_lines      = [l for l in lines if l.account.code == "1200"]
        svc_lines     = [l for l in lines if l.account.code == "4100"]
        prod_lines    = [l for l in lines if l.account.code == "4200"]
        vat_lines     = [l for l in lines if l.account.code == "2200"]

        # Must have AR debit line
        assert ar_lines, "No AR (1200) debit line"
        # Must have service revenue credit (line_type=service)
        assert svc_lines, "No Service Revenue (4100) credit line"
        # Must have product revenue credit (line_type=product)
        assert prod_lines, "No Product Revenue (4200) credit line — check line_type in line_items"
        # Must have VAT
        assert vat_lines, "No VAT Payable (2200) credit line"

        dr_total = sum(l.debit for l in lines)
        cr_total = sum(l.credit for l in lines)
        assert dr_total == cr_total, f"Journal imbalanced: Dr={dr_total} Cr={cr_total}"

    # ── 5. Mark paid → AR cleared ────────────────────────────────────────────
    @pytest.mark.django_db
    def test_mark_paid_creates_payment_and_clears_ar(self, tenant, admin_user):
        from accounting.models import Invoice, Payment, JournalEntry
        from accounting.services.payment_service import record_payment

        inv = self._make_invoice(tenant, admin_user)
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=["status"])

        # Issue the payment
        record_payment(
            tenant=tenant,
            created_by=admin_user,
            payment_type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=inv.amount_due,
            date=None,
            invoice=inv,
        )
        inv.refresh_from_db()
        assert inv.status == Invoice.STATUS_PAID, f"Invoice not paid: {inv.status}"
        assert inv.amount_due == Decimal("0"), f"amount_due not zero: {inv.amount_due}"

        # Payment journal must exist
        pay_entry = JournalEntry.objects.filter(
            tenant=tenant, reference_type="payment"
        ).last()
        assert pay_entry is not None, "No payment journal entry"
        assert pay_entry.total_debit == pay_entry.total_credit, "Payment journal imbalanced"

    # ── 6. Void → reversal journal ───────────────────────────────────────────
    @pytest.mark.django_db
    def test_void_creates_reversal_journal(self, tenant, admin_user):
        from accounting.models import Invoice, JournalEntry
        inv = self._make_invoice(tenant, admin_user)
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=["status"])

        # Now void it
        inv.status = Invoice.STATUS_VOID
        inv.save(update_fields=["status"])

        # Two posted entries: original + reversal (both keyed to same reference_id)
        entries = JournalEntry.objects.filter(
            tenant=tenant, reference_type="invoice", reference_id=inv.pk, is_posted=True
        )
        assert entries.count() == 2, \
            f"Expected 2 journal entries (issue + void), got {entries.count()}"

    # ── 7. Double-issue guard (signal idempotent) ────────────────────────────
    @pytest.mark.django_db
    def test_double_issue_does_not_create_duplicate_journal(self, tenant, admin_user):
        from accounting.models import Invoice, JournalEntry
        inv = self._make_invoice(tenant, admin_user)
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=["status"])
        # Trigger signal again (simulating a double-save)
        inv.save(update_fields=["status"])

        entries = JournalEntry.objects.filter(
            tenant=tenant, reference_type="invoice",
            reference_id=inv.pk, is_posted=True,
        )
        issue_entries = [e for e in entries if "void" not in e.description.lower()]
        assert len(issue_entries) == 1, \
            f"Duplicate journal entries created: {len(issue_entries)}"

    # ── 8. Compute totals: bad input raises ValueError ───────────────────────
    @pytest.mark.django_db
    def test_bad_line_item_raises_value_error(self, tenant):
        from accounting.services.invoice_service import compute_invoice_totals
        with pytest.raises(ValueError):
            compute_invoice_totals(
                [{"qty": "bad", "unit_price": "abc", "discount": "0"}],
                Decimal("0"), Decimal("0.13"),
            )

    # ── 9. Amount due property is correct ────────────────────────────────────
    @pytest.mark.django_db
    def test_amount_due_property(self, tenant, admin_user):
        from accounting.models import Invoice, Payment
        from accounting.services.payment_service import record_payment

        inv = self._make_invoice(tenant, admin_user)
        inv.status = Invoice.STATUS_ISSUED
        inv.save(update_fields=["status"])

        partial = inv.total / 2
        record_payment(
            tenant=tenant, created_by=admin_user,
            payment_type=Payment.TYPE_INCOMING,
            method=Payment.METHOD_CASH,
            amount=partial, date=None, invoice=inv,
        )
        inv.refresh_from_db()
        assert inv.status == Invoice.STATUS_ISSUED, "Partial payment should not fully close invoice"
        assert abs(inv.amount_due - (inv.total - partial)) < Decimal("0.01")

    # ── 10. VAT disabled tenant: vat_amount == 0 ─────────────────────────────
    @pytest.mark.django_db
    def test_no_vat_when_disabled(self, db):
        from tenants.models import Tenant
        from accounting.services.invoice_service import compute_invoice_totals
        t = Tenant.objects.create(
            name="No VAT Co", slug="novatco",
            vat_enabled=False, vat_rate=Decimal("0.13"),
        )
        lines = [{"qty": 1, "unit_price": "1000.00", "discount": "0"}]
        vat_rate = t.vat_rate if t.vat_enabled else Decimal("0")
        subtotal, vat_amount, total = compute_invoice_totals(lines, Decimal("0"), vat_rate)
        assert vat_amount == Decimal("0"), "VAT should be 0 when disabled"
        assert total == subtotal == Decimal("1000.00")