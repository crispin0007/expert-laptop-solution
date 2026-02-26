#!/usr/bin/env python
"""
NEXUS BMS — CA Audit Script
============================
Runs end-to-end tests of the entire accounting module as a CA auditor would.
Tests every workflow, checks every journal is balanced, and validates reports.

Run inside Docker:
    docker compose exec web python ca_audit.py

Or directly (with venv active):
    cd backend && python ca_audit.py
"""

import os
import sys
import datetime
from decimal import Decimal

# ── Django bootstrap ──────────────────────────────────────────────────────────
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')

import django
django.setup()

# ── Imports after setup ───────────────────────────────────────────────────────
from django.db.models import Sum
from django.utils import timezone

from tenants.models import Tenant
from accounts.models import User
from customers.models import Customer
from accounting.models import (
    Account, BankAccount, JournalEntry, JournalLine,
    Invoice, Bill, Payment, CreditNote, Quotation, DebitNote, TDSEntry,
)
from accounting.services import report_service

# ── Output helpers ────────────────────────────────────────────────────────────
PASS = "\033[92m✅\033[0m"
FAIL = "\033[91m❌\033[0m"
WARN = "\033[93m⚠️ \033[0m"
errors   = []
warnings = []

def check(condition, msg):
    if condition:
        print(f"    {PASS} {msg}")
    else:
        print(f"    {FAIL} {msg}")
        errors.append(msg)

def warn(msg):
    print(f"    {WARN} {msg}")
    warnings.append(msg)

def section(title):
    print(f"\n{'═'*64}")
    print(f"  {title}")
    print(f"{'═'*64}")

def journal_for(reference_type, reference_id, tenant):
    """Return the first posted JournalEntry for a document, or None."""
    return JournalEntry.objects.filter(
        tenant=tenant,
        reference_type=reference_type,
        reference_id=reference_id,
        is_posted=True,
    ).first()

def assert_journal_balanced(je, label):
    """Assert a JournalEntry's debit totals equal credit totals."""
    if je is None:
        check(False, f"{label}: journal entry not found / not posted")
        return None, None
    dr = je.lines.aggregate(t=Sum('debit'))['t']  or Decimal('0')
    cr = je.lines.aggregate(t=Sum('credit'))['t'] or Decimal('0')
    check(je.is_posted, f"{label}: journal #{je.entry_number} is posted")
    check(abs(dr - cr) < Decimal('0.01'), f"{label}: balanced (DR={dr}  CR={cr})")
    return dr, cr


# ══════════════════════════════════════════════════════════════════════════════
#  1 · SETUP
# ══════════════════════════════════════════════════════════════════════════════
section("1 · Setup — Tenant & Admin User")

tenant = Tenant.objects.filter(slug='pro').first()
check(tenant is not None, "Tenant 'pro' exists")
if not tenant:
    print("\n  FATAL: Cannot continue without tenant. Exiting.")
    sys.exit(1)

admin = User.objects.filter(email='admin@pro.nexus').first()
check(admin is not None, "Admin user 'admin@pro.nexus' exists")
if not admin:
    print("\n  FATAL: Cannot continue without admin user. Exiting.")
    sys.exit(1)

print(f"    → Tenant : {tenant.name}  (id={tenant.pk})")
print(f"    → Admin  : {admin.get_full_name()}  (id={admin.pk})")

VAT_RATE = Decimal('0.13')   # Nepal default — read from tenant in production


# ══════════════════════════════════════════════════════════════════════════════
#  2 · CHART OF ACCOUNTS
# ══════════════════════════════════════════════════════════════════════════════
section("2 · Chart of Accounts")

coa = Account.objects.filter(tenant=tenant)

# Auto-seed if the tenant was created before the signal was wired up
if coa.count() == 0:
    warn("CoA is empty — running seed_chart_of_accounts() now...")
    from accounting.services.journal_service import seed_chart_of_accounts
    seed_chart_of_accounts(tenant, created_by=admin)
    coa = Account.objects.filter(tenant=tenant)
    check(coa.count() >= 10, f"CoA seeded on-demand: {coa.count()} accounts")
else:
    check(coa.count() >= 10, f"CoA seeded: {coa.count()} accounts (expected ≥ 10)")

REQUIRED_CODES = {
    '1100': ('Cash', Account.TYPE_ASSET),
    '1200': ('Accounts Receivable', Account.TYPE_ASSET),
    '2100': ('Accounts Payable', Account.TYPE_LIABILITY),
    '2200': ('VAT Payable', Account.TYPE_LIABILITY),
    '3100': ('Equity / Capital', Account.TYPE_EQUITY),
    '4100': ('Revenue / Sales', Account.TYPE_REVENUE),
    '5100': ('Expense', Account.TYPE_EXPENSE),
}
for code, (expected_name, expected_type) in REQUIRED_CODES.items():
    acc = coa.filter(code=code).first()
    if acc:
        check(acc is not None, f"Account {code} ({acc.name}): found")
        check(acc.type == expected_type, f"Account {code} type='{expected_type}' (actual='{acc.type}')")
    else:
        check(False, f"Account {code} ({expected_name}): MISSING")

bank_acc = BankAccount.objects.filter(tenant=tenant, is_active=True).first()
if bank_acc:
    check(True, f"Active BankAccount: {bank_acc.name}")
else:
    warn("No active BankAccount — payments will omit bank_account FK (still valid)")


# ══════════════════════════════════════════════════════════════════════════════
#  3 · CUSTOMER
# ══════════════════════════════════════════════════════════════════════════════
section("3 · Customer")

customer, created = Customer.objects.get_or_create(
    tenant=tenant,
    email='ca.audit@testcustomer.com',
    defaults={
        'name': 'CA Audit Test Customer',
        'phone': '9800000001',
        'created_by': admin,
    },
)
check(customer is not None,
      f"Customer ready: {customer.name} ({'created' if created else 'existing'})")


# ══════════════════════════════════════════════════════════════════════════════
#  4 · QUOTATION LIFECYCLE
# ══════════════════════════════════════════════════════════════════════════════
section("4 · Quotation: draft → sent → accepted → converted to Invoice")

LINE_ITEMS = [
    {"description": "IT Consultation", "qty": 2, "unit_price": "5000.00", "discount": "0"},
    {"description": "Server Setup",    "qty": 1, "unit_price": "15000.00", "discount": "500.00"},
]
SUBTOTAL   = Decimal('24500.00')   # 2×5000 + 15000 − 500
VAT_AMOUNT = (SUBTOTAL * VAT_RATE).quantize(Decimal('0.01'))
TOTAL      = SUBTOTAL + VAT_AMOUNT

quo = Quotation.objects.create(
    tenant=tenant,
    customer=customer,
    line_items=LINE_ITEMS,
    subtotal=SUBTOTAL,
    discount=Decimal('500.00'),
    vat_rate=VAT_RATE,
    vat_amount=VAT_AMOUNT,
    total=TOTAL,
    status=Quotation.STATUS_DRAFT,
    notes='Generated by CA Audit script',
    created_by=admin,
)
check(quo.pk is not None, "Quotation created in DB")
check(quo.quotation_number.startswith('QUO-'),
      f"Quotation number auto-assigned: {quo.quotation_number}")

# draft → sent
quo.status = Quotation.STATUS_SENT
quo.sent_at = timezone.now()
quo.save()
check(quo.status == 'sent', "Quotation moved to SENT")

# sent → accepted
quo.status = Quotation.STATUS_ACCEPTED
quo.accepted_at = timezone.now()
quo.save()
check(quo.status == 'accepted', "Quotation moved to ACCEPTED")

# Convert accepted quotation to Invoice (mirrors QuotationViewSet.convert logic)
inv = Invoice.objects.create(
    tenant=tenant,
    customer=quo.customer,
    line_items=quo.line_items,
    subtotal=quo.subtotal,
    discount=quo.discount,
    vat_rate=quo.vat_rate,
    vat_amount=quo.vat_amount,
    total=quo.total,
    status=Invoice.STATUS_DRAFT,
    payment_terms=30,
    notes=f'Converted from {quo.quotation_number}',
    created_by=admin,
)
quo.converted_invoice = inv
quo.save()

check(inv.invoice_number.startswith('INV-'),
      f"Invoice number auto-assigned: {inv.invoice_number}")
check(quo.converted_invoice_id == inv.pk,
      "Quotation.converted_invoice FK points to new invoice")


# ══════════════════════════════════════════════════════════════════════════════
#  5 · INVOICE LIFECYCLE  (signal creates journal on status → issued)
# ══════════════════════════════════════════════════════════════════════════════
section("5 · Invoice: draft → issued (signal auto-creates journal)")

je_before = JournalEntry.objects.filter(tenant=tenant).count()

inv.status = Invoice.STATUS_ISSUED
inv.save()   # ← handle_invoice_status_change signal fires here

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before,
      f"Journal entry created on issue ({je_before} → {je_after})")

inv_jnl = journal_for('invoice', inv.pk, tenant)
dr, cr = assert_journal_balanced(inv_jnl, f"Invoice {inv.invoice_number}")

if inv_jnl and dr is not None:
    check(
        abs(dr - inv.total) < Decimal('0.01'),
        f"Invoice journal DR ({dr}) matches invoice total ({inv.total})"
    )


# ══════════════════════════════════════════════════════════════════════════════
#  6 · INCOMING PAYMENT  (signal creates journal on post_save, created=True)
# ══════════════════════════════════════════════════════════════════════════════
section("6 · Payment: Incoming from customer (signal auto-creates journal)")

je_before = JournalEntry.objects.filter(tenant=tenant).count()

pay_in = Payment.objects.create(
    tenant=tenant,
    date=datetime.date.today(),
    type=Payment.TYPE_INCOMING,
    method=Payment.METHOD_BANK,
    amount=inv.total,
    bank_account=bank_acc,
    invoice=inv,
    reference=inv.invoice_number,
    notes='Full settlement — CA Audit',
    created_by=admin,
)  # ← handle_payment_created signal fires on CREATE

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before, f"Journal entry created on payment ({je_before} → {je_after})")
check(pay_in.payment_number.startswith('PAY-'),
      f"Payment number auto-assigned: {pay_in.payment_number}")

pay_in_jnl = journal_for('payment', pay_in.pk, tenant)
assert_journal_balanced(pay_in_jnl, f"Incoming payment {pay_in.payment_number}")

# Mark invoice paid
inv.status = Invoice.STATUS_PAID
inv.paid_at = timezone.now()
inv.save()
check(inv.status == 'paid', "Invoice status → PAID")
check(
    abs(inv.amount_paid - inv.total) < Decimal('0.01'),
    f"Invoice fully settled: amount_paid={inv.amount_paid}  total={inv.total}"
)


# ══════════════════════════════════════════════════════════════════════════════
#  7 · BILL LIFECYCLE  (signal creates journal on status → approved)
# ══════════════════════════════════════════════════════════════════════════════
section("7 · Bill: draft → approved (signal auto-creates journal)")

BILL_SUB = Decimal('5000.00')
BILL_VAT = (BILL_SUB * VAT_RATE).quantize(Decimal('0.01'))
BILL_TOT = BILL_SUB + BILL_VAT

bill = Bill.objects.create(
    tenant=tenant,
    supplier_name='Audit Supplier Pvt. Ltd.',
    line_items=[{"description": "Office Supplies",
                 "qty": 10, "unit_price": "500.00", "discount": "0"}],
    subtotal=BILL_SUB,
    discount=Decimal('0'),
    vat_rate=VAT_RATE,
    vat_amount=BILL_VAT,
    total=BILL_TOT,
    status=Bill.STATUS_DRAFT,
    notes='CA Audit supplier bill',
    created_by=admin,
)
check(bill.bill_number.startswith('BILL-'),
      f"Bill number auto-assigned: {bill.bill_number}")

je_before = JournalEntry.objects.filter(tenant=tenant).count()

bill.status = Bill.STATUS_APPROVED
bill.approved_at = timezone.now()
bill.save()   # ← handle_bill_status_change signal fires here

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before, f"Journal entry created on bill approval ({je_before} → {je_after})")

bill_jnl = journal_for('bill', bill.pk, tenant)
assert_journal_balanced(bill_jnl, f"Bill {bill.bill_number}")


# ══════════════════════════════════════════════════════════════════════════════
#  8 · OUTGOING PAYMENT FOR BILL
# ══════════════════════════════════════════════════════════════════════════════
section("8 · Payment: Outgoing to supplier (signal auto-creates journal)")

je_before = JournalEntry.objects.filter(tenant=tenant).count()

pay_out = Payment.objects.create(
    tenant=tenant,
    date=datetime.date.today(),
    type=Payment.TYPE_OUTGOING,
    method=Payment.METHOD_BANK,
    amount=bill.total,
    bank_account=bank_acc,
    bill=bill,
    reference=bill.bill_number,
    notes='Full bill settlement — CA Audit',
    created_by=admin,
)

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before, f"Journal entry created on bill payment ({je_before} → {je_after})")
check(pay_out.payment_number.startswith('PAY-'),
      f"Payment number auto-assigned: {pay_out.payment_number}")

pay_out_jnl = journal_for('payment', pay_out.pk, tenant)
assert_journal_balanced(pay_out_jnl, f"Outgoing payment {pay_out.payment_number}")

bill.status = Bill.STATUS_PAID
bill.paid_at = timezone.now()
bill.save()
check(bill.status == 'paid', "Bill status → PAID")


# ══════════════════════════════════════════════════════════════════════════════
#  9 · CREDIT NOTE  (signal creates journal on status → issued)
# ══════════════════════════════════════════════════════════════════════════════
section("9 · Credit Note: draft → issued (signal auto-creates journal)")

# Create and issue a second invoice to attach the credit note to
CN_SUB = Decimal('2000.00')
CN_VAT = (CN_SUB * VAT_RATE).quantize(Decimal('0.01'))
CN_TOT = CN_SUB + CN_VAT

inv2 = Invoice.objects.create(
    tenant=tenant,
    customer=customer,
    line_items=[{"description": "Support Service",
                 "qty": 1, "unit_price": "2000.00", "discount": "0"}],
    subtotal=CN_SUB,
    discount=Decimal('0'),
    vat_rate=VAT_RATE,
    vat_amount=CN_VAT,
    total=CN_TOT,
    status=Invoice.STATUS_DRAFT,
    created_by=admin,
)
inv2.status = Invoice.STATUS_ISSUED
inv2.save()
check(journal_for('invoice', inv2.pk, tenant) is not None,
      f"Invoice {inv2.invoice_number} journal created (base for credit note)")

cn = CreditNote.objects.create(
    tenant=tenant,
    invoice=inv2,
    line_items=[{"description": "Support Service — full refund",
                 "qty": 1, "unit_price": "2000.00"}],
    subtotal=CN_SUB,
    vat_amount=CN_VAT,
    total=CN_TOT,
    reason='CA Audit: service not rendered, full credit issued',
    status=CreditNote.STATUS_DRAFT,
    created_by=admin,
)
check(cn.credit_note_number.startswith('CN-'),
      f"Credit note number auto-assigned: {cn.credit_note_number}")

je_before = JournalEntry.objects.filter(tenant=tenant).count()

cn.status = CreditNote.STATUS_ISSUED
cn.issued_at = timezone.now()
cn.save()   # ← handle_credit_note_issued signal fires here

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before, f"Journal entry created on credit note issue ({je_before} → {je_after})")

cn_jnl = journal_for('credit_note', cn.pk, tenant)
assert_journal_balanced(cn_jnl, f"Credit note {cn.credit_note_number}")


# ══════════════════════════════════════════════════════════════════════════════
#  10 · DEBIT NOTE  (signal creates journal on status → issued)
# ══════════════════════════════════════════════════════════════════════════════
section("10 · Debit Note: draft → issued (signal auto-creates journal)")

DN_SUB = Decimal('1000.00')
DN_VAT = (DN_SUB * VAT_RATE).quantize(Decimal('0.01'))
DN_TOT = DN_SUB + DN_VAT

dn = DebitNote.objects.create(
    tenant=tenant,
    bill=bill,
    line_items=[{"description": "Returned office supplies",
                 "qty": 2, "unit_price": "500.00"}],
    subtotal=DN_SUB,
    vat_amount=DN_VAT,
    total=DN_TOT,
    reason='CA Audit: 2 units returned to supplier',
    status=DebitNote.STATUS_DRAFT,
    created_by=admin,
)
check(dn.debit_note_number.startswith('DN-'),
      f"Debit note number auto-assigned: {dn.debit_note_number}")

je_before = JournalEntry.objects.filter(tenant=tenant).count()

dn.status = DebitNote.STATUS_ISSUED
dn.issued_at = timezone.now()
dn.save()   # ← handle_debit_note_issued signal fires here

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before, f"Journal entry created on debit note issue ({je_before} → {je_after})")

dn_jnl = journal_for('debit_note', dn.pk, tenant)
assert_journal_balanced(dn_jnl, f"Debit note {dn.debit_note_number}")


# ══════════════════════════════════════════════════════════════════════════════
#  11 · INVOICE VOID  (reversal journal auto-created by signal)
# ══════════════════════════════════════════════════════════════════════════════
section("11 · Invoice Void: reversal journal auto-created by signal")

inv3 = Invoice.objects.create(
    tenant=tenant,
    customer=customer,
    line_items=[{"description": "Voided test service",
                 "qty": 1, "unit_price": "1000.00", "discount": "0"}],
    subtotal=Decimal('1000.00'),
    discount=Decimal('0'),
    vat_rate=VAT_RATE,
    vat_amount=(Decimal('1000.00') * VAT_RATE).quantize(Decimal('0.01')),
    total=(Decimal('1000.00') * (1 + VAT_RATE)).quantize(Decimal('0.01')),
    status=Invoice.STATUS_DRAFT,
    created_by=admin,
)
inv3.status = Invoice.STATUS_ISSUED
inv3.save()   # creates invoice journal

je_before = JournalEntry.objects.filter(tenant=tenant).count()
inv3.status = Invoice.STATUS_VOID
inv3.save()   # ← reversal signal fires

je_after = JournalEntry.objects.filter(tenant=tenant).count()
check(je_after > je_before, f"Reversal journal created on void ({je_before} → {je_after})")

all_inv3_jnls = JournalEntry.objects.filter(
    tenant=tenant, reference_type='invoice', reference_id=inv3.pk,
)
check(all_inv3_jnls.count() >= 2,
      f"Original + reversal journals for voided invoice (found {all_inv3_jnls.count()})")


# ══════════════════════════════════════════════════════════════════════════════
#  12 · GLOBAL JOURNAL INTEGRITY
# ══════════════════════════════════════════════════════════════════════════════
section("12 · Journal Integrity — Every posted entry must balance")

all_jnls = JournalEntry.objects.filter(tenant=tenant)
unposted  = all_jnls.filter(is_posted=False)

print(f"    → Total journal entries : {all_jnls.count()}")
print(f"    → Unposted              : {unposted.count()}")
check(unposted.count() == 0,
      f"All {all_jnls.count()} journal entries are posted")

imbalanced = []
for je in all_jnls.prefetch_related('lines'):
    dr = je.lines.aggregate(t=Sum('debit'))['t']  or Decimal('0')
    cr = je.lines.aggregate(t=Sum('credit'))['t'] or Decimal('0')
    if abs(dr - cr) >= Decimal('0.01'):
        imbalanced.append(f"#{je.entry_number}  DR={dr}  CR={cr}")

check(len(imbalanced) == 0,
      f"All journal entries are individually balanced")
if imbalanced:
    for item in imbalanced:
        print(f"       → {item}")


# ══════════════════════════════════════════════════════════════════════════════
#  13 · TRIAL BALANCE
# ══════════════════════════════════════════════════════════════════════════════
section("13 · Trial Balance")

today      = datetime.date.today()
year_start = datetime.date(today.year, 1, 1)

try:
    tb = report_service.trial_balance(tenant, year_start, today)
    check(tb is not None, "trial_balance() returned data")

    if isinstance(tb, list):
        total_dr = sum(Decimal(str(row.get('debit',  0))) for row in tb)
        total_cr = sum(Decimal(str(row.get('credit', 0))) for row in tb)
    elif isinstance(tb, dict):
        total_dr = Decimal(str(tb.get('total_debit',  0)))
        total_cr = Decimal(str(tb.get('total_credit', 0)))
    else:
        total_dr = total_cr = Decimal('0')

    print(f"    → Total Debits  : {total_dr}")
    print(f"    → Total Credits : {total_cr}")
    check(abs(total_dr - total_cr) < Decimal('0.01'),
          "Trial Balance BALANCED ✓")
    check(total_dr > 0, "Trial Balance has non-zero movement")

except Exception as exc:
    check(False, f"trial_balance() raised: {exc}")
    import traceback; traceback.print_exc()


# ══════════════════════════════════════════════════════════════════════════════
#  14 · FINANCIAL REPORTS
# ══════════════════════════════════════════════════════════════════════════════
section("14 · Financial Reports")

def run_report(name, fn, *args):
    try:
        result = fn(*args)
        check(result is not None, f"{name} returned data")
        return result
    except Exception as exc:
        check(False, f"{name} raised: {exc}")
        import traceback; traceback.print_exc()
        return None

pnl = run_report("Profit & Loss",        report_service.profit_and_loss,  tenant, year_start, today)
if isinstance(pnl, dict):
    print(f"    → Revenue : {pnl.get('total_revenue', '?')}")
    print(f"    → Expense : {pnl.get('total_expense', '?')}")
    print(f"    → Net P&L : {pnl.get('net_profit', pnl.get('net', '?'))}")

bs = run_report("Balance Sheet",         report_service.balance_sheet,    tenant, today)
if isinstance(bs, dict):
    print(f"    → Assets={bs.get('total_assets','?')}  "
          f"Liabilities={bs.get('total_liabilities','?')}  "
          f"Equity={bs.get('total_equity','?')}")
    check(bs.get('balanced') is True,
          f"Balance sheet equation holds: A = L + E  (balanced={bs.get('balanced')})")

vat = run_report("VAT Report",           report_service.vat_report,       tenant, year_start, today)
if isinstance(vat, dict):
    print(f"    → Output VAT={vat.get('output_vat','?')}  "
          f"Input VAT={vat.get('input_vat','?')}  "
          f"Net={vat.get('net_vat','?')}")

run_report("Aged Receivables",           report_service.aged_receivables, tenant, today)
run_report("Aged Payables",              report_service.aged_payables,    tenant, today)
run_report("Cash Flow",                  report_service.cash_flow,        tenant, year_start, today)

ledger = run_report("Ledger (AR 1200)",  report_service.ledger_report,    tenant, '1200', year_start, today)
day_bk = run_report("Day Book",          report_service.day_book,         tenant, today)
if isinstance(day_bk, list):
    print(f"    → Day Book entries: {len(day_bk)}")


# ══════════════════════════════════════════════════════════════════════════════
#  15 · DOUBLE-ENTRY PROOF  (raw DB cross-check)
# ══════════════════════════════════════════════════════════════════════════════
section("15 · Double-Entry Proof (raw DB aggregate)")

agg = JournalLine.objects.filter(
    entry__tenant=tenant,
    entry__is_posted=True,
).aggregate(total_dr=Sum('debit'), total_cr=Sum('credit'))

raw_dr = agg['total_dr'] or Decimal('0')
raw_cr = agg['total_cr'] or Decimal('0')

print(f"    → Raw DB total debits  : {raw_dr}")
print(f"    → Raw DB total credits : {raw_cr}")
check(
    abs(raw_dr - raw_cr) < Decimal('0.01'),
    "DOUBLE-ENTRY INTEGRITY CONFIRMED — every DR has a matching CR in the DB"
)


# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
section("AUDIT SUMMARY")

if warnings:
    print(f"\n  Warnings ({len(warnings)}):")
    for w in warnings:
        print(f"    {WARN} {w}")

if errors:
    print(f"\n  FAILURES ({len(errors)}):")
    for e in errors:
        print(f"    {FAIL} {e}")
    print(f"\n  ❌  {len(errors)} check(s) FAILED — fix these before sign-off.\n")
    sys.exit(1)
else:
    print(f"\n  ✅  ALL CHECKS PASSED — Accounting module is CA-ready!\n")
