"""
journal_service.py
==================
Core double-entry bookkeeping engine.

All journal entry creation lives here — never put journal logic in views,
signals, or serializers.  Signals call these functions; views call signals
indirectly by changing model status fields.

System account codes (seeded per tenant on creation):
  1200 – Accounts Receivable (asset)
  2100 – Accounts Payable   (liability)
  2200 – VAT Payable        (liability)
  4100 – Service Revenue    (revenue)
  5100 – COGS               (expense)
  5200 – Salary Expense     (expense)
  1100 – Cash               (asset) — fallback when no BankAccount
"""
import logging
from decimal import Decimal
from django.utils import timezone

log = logging.getLogger(__name__)


def _get_account(tenant, code):
    """Fetch a system account by code; raises if missing."""
    from accounting.models import Account
    try:
        return Account.objects.get(tenant=tenant, code=code)
    except Account.DoesNotExist:
        raise ValueError(
            f"System account '{code}' not found for tenant {tenant.slug}. "
            "Run the seed migration or re-create the tenant."
        )


def _get_account_by_group(tenant, group_slug, fallback_code=None):
    """
    Look up the preferred active account for a given AccountGroup slug.

    Resolution order:
      1. Account matching fallback_code within the group (exact code preference)
      2. Active system account in the group (is_system=True first — most stable)
      3. Any other active account in the group
      4. Exact code lookup via _get_account(tenant, fallback_code) if provided

    The code-within-group preference (step 1) is critical when multiple accounts
    share a group (e.g. 4100 Service Revenue and 4200 Product Revenue are both
    in 'sales_accounts'). Passing fallback_code='4200' returns the right account.

    This lets tenants rename or add accounts without breaking automated journals —
    the journal engine finds accounts by role (group slug), not by hardcoded code.

    Raises ValueError if no matching account is found anywhere.
    """
    from accounting.models import Account
    qs = Account.objects.filter(
        tenant=tenant,
        group__slug=group_slug,
        is_active=True,
    )
    # Prefer the account whose code matches fallback_code (handles shared-group accounts)
    if fallback_code:
        exact = qs.filter(code=fallback_code).first()
        if exact:
            return exact
    # Otherwise take the best system account in the group
    account = qs.order_by('-is_system', 'code').first()
    if account:
        return account
    if fallback_code:
        return _get_account(tenant, fallback_code)
    raise ValueError(
        f"No active account in group '{group_slug}' for tenant {tenant.slug}. "
        "Seed the chart of accounts or assign an account to this group."
    )


def _get_party_account_or_fallback(*, tenant, party, group_slug, fallback_code):
    """Return party sub-ledger account when valid, else control/group fallback."""
    if party is not None and getattr(party, 'account_id', None):
        account = getattr(party, 'account', None)
        if account is not None and getattr(account, 'tenant_id', None) == tenant.id and account.is_active:
            return account
    return _get_account_by_group(tenant, group_slug, fallback_code)


def _incoming_contra_account(payment, tenant):
    party = getattr(payment, 'party', None)
    if party is None and payment.invoice_id and payment.invoice:
        party = getattr(payment.invoice, 'party', None)
    return _get_party_account_or_fallback(
        tenant=tenant,
        party=party,
        group_slug='sundry_debtors',
        fallback_code='1200',
    )


def _bill_clear_account(payment, tenant):
    party = getattr(payment, 'party', None)
    if party is None and payment.bill:
        party = getattr(payment.bill, 'party', None)
    return _get_party_account_or_fallback(
        tenant=tenant,
        party=party,
        group_slug='sundry_creditors',
        fallback_code='2100',
    )


def _make_entry(tenant, created_by, date, description, reference_type, reference_id, lines,
                purpose='', reversal_reason='', reversed_by_user=None, reversal_timestamp=None):
    """
    Create a JournalEntry + JournalLines and immediately post it.

    Idempotent: if a posted entry for (tenant, reference_type, reference_id, purpose)
    already exists, returns the existing entry instead of creating a duplicate.
    This makes it safe to call from retried Celery tasks.

    On a race condition (two tasks call simultaneously), the second writer will
    hit the UniqueConstraint and receive an IntegrityError that we catch here,
    rolling back its transaction and returning the winner's entry.

    Wrapped in transaction.atomic so that a DB error on any JournalLine
    creation (or a balance failure in post()) rolls back the entire entry —
    preventing partial / unbalanced journal entries from persisting.

    lines    : list of (account, debit, credit, description)
    purpose  : JournalEntry.PURPOSE_* constant — part of idempotency key
    reversal_reason / reversed_by_user / reversal_timestamp : B5 metadata,
               set only on reversal entries to record who voided and why.
    """
    from accounting.models import JournalEntry, JournalLine
    from django.db import transaction, IntegrityError

    # B16 — Block posting into a closed fiscal year period.
    # A FiscalYearClose row existing for the BS year of `date` means the FY is sealed.
    from accounting.models import FiscalYearClose
    from core.nepali_date import ad_to_bs
    try:
        bs_year = ad_to_bs(date).year
        closed = FiscalYearClose.objects.filter(tenant=tenant, fy_year=bs_year).exists()
    except Exception:
        closed = False  # date out of supported BS range — do not block
    if closed:
        raise ValueError(
            f"Cannot post journal entry dated {date}: fiscal year {bs_year} is closed. "
            "Re-open the period in Settings → Fiscal Year before posting."
        )

    # B3 — Idempotency: return existing posted entry rather than duplicating.
    if reference_id is not None and reference_type not in ('manual', 'fiscal_year_close',
                                                            'vat_remittance', 'tds_remittance'):
        existing = JournalEntry.objects.filter(
            tenant=tenant,
            reference_type=reference_type,
            reference_id=reference_id,
            purpose=purpose,
            is_posted=True,
        ).first()
        if existing:
            log.debug(
                'Idempotent skip: posted journal already exists for %s id=%s purpose=%s (entry %s)',
                reference_type, reference_id, purpose, existing.entry_number,
            )
            return existing

    try:
        with transaction.atomic():
            entry = JournalEntry.objects.create(
                tenant=tenant,
                created_by=created_by,
                date=date,
                description=description,
                reference_type=reference_type,
                reference_id=reference_id,
                purpose=purpose,
                reversal_reason=reversal_reason or '',
                reversed_by_user=reversed_by_user,
                reversal_timestamp=reversal_timestamp,
            )
            for account, debit, credit, line_desc in lines:
                JournalLine.objects.create(
                    entry=entry,
                    account=account,
                    debit=debit,
                    credit=credit,
                    description=line_desc,
                )
            entry.post()   # validates balance, sets is_posted=True
            # B25 — audit trail: log every automated journal creation.
            from accounting.models import log_journal_change, JournalEntryAuditLog
            log_journal_change(
                entry,
                action=JournalEntryAuditLog.ACTION_CREATE,
                changed_by=created_by,
            )
    except IntegrityError:
        # Race condition: concurrent task won the insert — fetch and return that entry.
        existing = JournalEntry.objects.filter(
            tenant=tenant,
            reference_type=reference_type,
            reference_id=reference_id,
            purpose=purpose,
            is_posted=True,
        ).first()
        if existing:
            log.warning(
                'Race condition caught for %s id=%s purpose=%s — returning existing entry %s',
                reference_type, reference_id, purpose, existing.entry_number,
            )
            return existing
        raise  # Different integrity error — propagate
    return entry


def _split_revenue(line_items, stored_subtotal):
    """
    Split stored_subtotal between service revenue and product revenue
    proportionally based on line_type in line_items.

    Returns (service_total, product_total) that sum exactly to stored_subtotal.
    This avoids re-computing totals and guarantees the journal balances.
    """
    service_raw = Decimal('0')
    product_raw = Decimal('0')
    for item in (line_items or []):
        qty       = Decimal(str(item.get('qty', 1)))
        price     = Decimal(str(item.get('unit_price', '0')))
        pct_disc  = Decimal(str(item.get('discount', '0'))) / Decimal('100')
        line_net  = max(qty * price * (1 - pct_disc), Decimal('0'))
        if item.get('line_type') == 'product':
            product_raw += line_net
        else:
            service_raw += line_net

    raw_total = service_raw + product_raw
    if raw_total == Decimal('0'):
        # No computable lines; entire stored subtotal goes to service revenue.
        return stored_subtotal, Decimal('0')

    # Scale proportionally to stored_subtotal (handles doc-level discounts + rounding).
    ratio         = stored_subtotal / raw_total
    service_total = (service_raw * ratio).quantize(Decimal('0.01'))
    product_total = stored_subtotal - service_total   # remainder ensures exact sum
    return service_total, product_total


# ─── Invoice ──────────────────────────────────────────────────────────────────

def create_invoice_journal(invoice, created_by=None):
    """
    Invoice issued:
      Dr  Accounts Receivable 1200  (total)
      Cr  Service Revenue     4100  (service-line portion of subtotal)
      Cr  Product Revenue     4200  (product-line portion of subtotal, if any)
      Cr  VAT Payable         2200  (vat_amount)

    Uses stored invoice.subtotal / invoice.total as ground truth so the entry
    always balances, regardless of document-level discounts or rounding.
    """
    tenant   = invoice.tenant
    ar       = _get_party_account_or_fallback(
        tenant=tenant,
        party=getattr(invoice, 'party', None),
        group_slug='sundry_debtors',
        fallback_code='1200',
    )
    svc_rev  = _get_account_by_group(tenant, 'sales_accounts',   '4100')
    prod_rev = _get_account_by_group(tenant, 'sales_accounts',   '4200')
    vat_pay  = _get_account_by_group(tenant, 'duties_taxes_vat', '2200')

    service_total, product_total = _split_revenue(invoice.line_items, invoice.subtotal)

    lines = [
        (ar, invoice.total, Decimal('0'), f"AR – {invoice.invoice_number}"),
    ]
    if service_total:
        lines.append((svc_rev, Decimal('0'), service_total,
                      f"Service Revenue – {invoice.invoice_number}"))
    if product_total:
        lines.append((prod_rev, Decimal('0'), product_total,
                      f"Product Revenue – {invoice.invoice_number}"))
    if invoice.vat_amount:
        lines.append((vat_pay, Decimal('0'), invoice.vat_amount,
                      f"VAT – {invoice.invoice_number}"))

    # Use explicit voucher date; fall back to created_at then today.
    voucher_date = invoice.date or (invoice.created_at.date() if invoice.created_at else timezone.localdate())
    return _make_entry(
        tenant, created_by, voucher_date,
        f"Invoice {invoice.invoice_number} issued",
        'invoice', invoice.pk, lines,
        purpose='revenue',
    )


def reverse_invoice_journal(invoice, created_by=None):
    """
    Invoice voided: exact mirror of create_invoice_journal — each Cr becomes Dr.
      Dr  Service Revenue  4100  (service portion of subtotal)
      Dr  Product Revenue  4200  (product portion, if any)
      Dr  VAT Payable      2200  (vat_amount)
      Cr  Accounts Receivable 1200 (total)
    """
    tenant   = invoice.tenant
    ar       = _get_party_account_or_fallback(
        tenant=tenant,
        party=getattr(invoice, 'party', None),
        group_slug='sundry_debtors',
        fallback_code='1200',
    )
    svc_rev  = _get_account_by_group(tenant, 'sales_accounts',   '4100')
    prod_rev = _get_account_by_group(tenant, 'sales_accounts',   '4200')
    vat_pay  = _get_account_by_group(tenant, 'duties_taxes_vat', '2200')

    service_total, product_total = _split_revenue(invoice.line_items, invoice.subtotal)

    lines = [
        (ar, Decimal('0'), invoice.total, f"VOID AR – {invoice.invoice_number}"),
    ]
    if service_total:
        lines.append((svc_rev, service_total, Decimal('0'),
                      f"VOID Service Revenue – {invoice.invoice_number}"))
    if product_total:
        lines.append((prod_rev, product_total, Decimal('0'),
                      f"VOID Product Revenue – {invoice.invoice_number}"))
    if invoice.vat_amount:
        lines.append((vat_pay, invoice.vat_amount, Decimal('0'),
                      f"VOID VAT – {invoice.invoice_number}"))

    # B5 — Use the invoice's own voucher date, not today, so the reversal
    # lands in the same fiscal period as the original entry.
    reversal_date = invoice.date or (invoice.created_at.date() if invoice.created_at else timezone.localdate())
    return _make_entry(
        tenant, created_by, reversal_date,
        f"Invoice {invoice.invoice_number} voided (reversal)",
        'invoice', invoice.pk, lines,
        purpose='reversal',
    )


# ─── Bill ─────────────────────────────────────────────────────────────────────

def create_bill_journal(bill, created_by=None):
    """
    Bill approved:
      Dr  Other Expenses (5300)   (subtotal excl. VAT)
      Dr  VAT Payable    (2200)   (vat_amount — input VAT reduces output VAT liability)
      Cr  Accounts Payable (2100) (total incl. VAT)

    NOTE: 5100 COGS is reserved exclusively for inventory sold on invoices.
    Supplier bills for services, rent, utilities etc. go to 5300 Other Expenses.
    If a specific expense account is needed, create it under 5300 and journal manually.
    """
    tenant  = bill.tenant
    expense = _get_account_by_group(tenant, 'indirect_expense',  '5300')  # Other Expenses — NOT 5100 COGS
    ap      = _get_party_account_or_fallback(
        tenant=tenant,
        party=getattr(bill, 'party', None),
        group_slug='sundry_creditors',
        fallback_code='2100',
    )
    vat_pay = _get_account_by_group(tenant, 'duties_taxes_vat',  '2200')

    lines = [
        (expense, bill.subtotal, Decimal('0'), f"Expense – {bill.bill_number}"),
        (ap,      Decimal('0'),  bill.total,   f"AP – {bill.bill_number}"),
    ]
    if bill.vat_amount:
        # Input VAT debits VAT Payable — reduces the net VAT we owe IRD
        lines.append(
            (vat_pay, bill.vat_amount, Decimal('0'), f"Input VAT – {bill.bill_number}")
        )
    # Use explicit bill date (supplier's invoice date); fall back to approval date then today.
    voucher_date = bill.date or (bill.approved_at.date() if bill.approved_at else timezone.localdate())
    return _make_entry(
        tenant, created_by, voucher_date,
        f"Bill {bill.bill_number} approved",
        'bill', bill.pk, lines,
        purpose='payment',
    )


# ─── Payment ─────────────────────────────────────────────────────────────────

def create_payment_journal(payment, created_by=None):
    """
    Incoming payment (customer pays invoice):
      Dr  Cash / Bank Account  (amount)
      Cr  Accounts Receivable  (amount)

    Outgoing payment — supplier bill (has payment.bill linked):
      Dr  Accounts Payable     (amount)
      Cr  Cash / Bank Account  (amount)

    Outgoing payment — salary / direct expense (no bill linked):
      Dr  Salary Expense 5200  (amount)
      Cr  Cash / Bank Account  (amount)

      Salary goes directly to Salary Expense — there is no AP accrual step
      for payroll in this system.  Using AP for salary would incorrectly inflate
      Accounts Payable (a supplier-debt account) with unrelated staff costs.
    """
    tenant = payment.tenant

    # Determine cash/bank account to use
    if payment.bank_account and payment.bank_account.linked_account:
        cash_acc = payment.bank_account.linked_account
    else:
        cash_acc = _get_account_by_group(tenant, 'cash_in_hand', '1100')  # fallback: Cash

    if payment.type == 'incoming':
        if payment.account_id:
            # Standalone receipt: Dr Cash/Bank → Cr named ledger (e.g. Other Income 4300)
            contra_acc = payment.account
            cr_desc = f"Receipt – {payment.payment_number} ({contra_acc.name})"
        else:
            # Standard: Dr Cash/Bank → Cr Accounts Receivable (clears invoice)
            contra_acc = _incoming_contra_account(payment, tenant)
            cr_desc = f"Clear AR – {payment.payment_number}"
        lines = [
            (cash_acc,   payment.amount, Decimal('0'), f"Receipt – {payment.payment_number}"),
            (contra_acc, Decimal('0'),   payment.amount, cr_desc),
        ]
        desc = f"Receipt {payment.payment_number}"
    elif payment.bill_id:
        # Outgoing: supplier bill payment — clears Accounts Payable
        ap = _bill_clear_account(payment, tenant)
        lines = [
            (ap,       payment.amount, Decimal('0'), f"Clear AP – {payment.payment_number}"),
            (cash_acc, Decimal('0'),   payment.amount, f"Payment – {payment.payment_number}"),
        ]
        desc = f"Bill payment {payment.payment_number}"
    else:
        # Outgoing: direct payment (standalone)
        # Use explicitly assigned account if set; fall back to Other Expenses 5300.
        if payment.account_id:
            dr_acc = payment.account
        else:
            dr_acc = _get_account_by_group(tenant, 'indirect_expense', '5300')
        narr = payment.notes or payment.reference or payment.payment_number
        lines = [
            (dr_acc,   payment.amount, Decimal('0'), f"Payment – {narr}"),
            (cash_acc, Decimal('0'),   payment.amount, f"Paid – {payment.payment_number}"),
        ]
        desc = f"Payment {payment.payment_number} ({narr})"

    return _make_entry(
        tenant, created_by, payment.date,
        desc, 'payment', payment.pk, lines,
        purpose='payment',
    )


# ─── Credit Note ─────────────────────────────────────────────────────────────

def create_credit_note_journal(credit_note, created_by=None):
    """
    Credit note issued — exact mirror of the relevant Invoice journal lines.
      Dr  Service Revenue  4100  (service portion of credit_note.subtotal)
      Dr  Product Revenue  4200  (product portion, if any)
      Dr  VAT Payable      2200  (vat_amount  — reduces what we collected)
      Cr  Accounts Receivable 1200 (total      — customer owes us less)
    """
    tenant   = credit_note.tenant
    ar       = _get_party_account_or_fallback(
        tenant=tenant,
        party=getattr(getattr(credit_note, 'invoice', None), 'party', None),
        group_slug='sundry_debtors',
        fallback_code='1200',
    )
    svc_rev  = _get_account_by_group(tenant, 'sales_accounts',   '4100')
    prod_rev = _get_account_by_group(tenant, 'sales_accounts',   '4200')
    vat_pay  = _get_account_by_group(tenant, 'duties_taxes_vat', '2200')

    service_total, product_total = _split_revenue(
        credit_note.line_items, credit_note.subtotal
    )

    lines = [
        (ar, Decimal('0'), credit_note.total, f"CN AR – {credit_note.credit_note_number}"),
    ]
    if service_total:
        lines.append((svc_rev, service_total, Decimal('0'),
                      f"CN Service Rev – {credit_note.credit_note_number}"))
    if product_total:
        lines.append((prod_rev, product_total, Decimal('0'),
                      f"CN Product Rev – {credit_note.credit_note_number}"))
    if credit_note.vat_amount:
        lines.append((vat_pay, credit_note.vat_amount, Decimal('0'),
                      f"CN VAT – {credit_note.credit_note_number}"))

    voucher_date = credit_note.issued_at.date() if credit_note.issued_at else timezone.localdate()
    return _make_entry(
        tenant, created_by, voucher_date,
        f"Credit Note {credit_note.credit_note_number} issued",
        'credit_note', credit_note.pk, lines,
        purpose='reversal',
    )


def reverse_credit_note_journal(credit_note, created_by=None):
    """
    Credit note voided after being issued — mirror of create_credit_note_journal.
    Restores AR and reverses the revenue / VAT reductions:

      Dr  Accounts Receivable  1200  (total      — customer owes us again)
      Cr  Service Revenue      4100  (service portion, if any)
      Cr  Product Revenue      4200  (product portion, if any)
      Cr  VAT Payable          2200  (vat_amount — restore the VAT liability)
    """
    tenant   = credit_note.tenant
    ar       = _get_party_account_or_fallback(
        tenant=tenant,
        party=getattr(getattr(credit_note, 'invoice', None), 'party', None),
        group_slug='sundry_debtors',
        fallback_code='1200',
    )
    svc_rev  = _get_account_by_group(tenant, 'sales_accounts',   '4100')
    prod_rev = _get_account_by_group(tenant, 'sales_accounts',   '4200')
    vat_pay  = _get_account_by_group(tenant, 'duties_taxes_vat', '2200')

    service_total, product_total = _split_revenue(
        credit_note.line_items, credit_note.subtotal
    )

    lines = [
        (ar, credit_note.total, Decimal('0'), f"VOID CN AR – {credit_note.credit_note_number}"),
    ]
    if service_total:
        lines.append((svc_rev, Decimal('0'), service_total,
                      f"VOID CN Service Rev – {credit_note.credit_note_number}"))
    if product_total:
        lines.append((prod_rev, Decimal('0'), product_total,
                      f"VOID CN Product Rev – {credit_note.credit_note_number}"))
    if credit_note.vat_amount:
        lines.append((vat_pay, Decimal('0'), credit_note.vat_amount,
                      f"VOID CN VAT – {credit_note.credit_note_number}"))

    # B5 — Use the credit note's own issue date, not today.
    reversal_date = credit_note.issued_at.date() if credit_note.issued_at else timezone.localdate()
    return _make_entry(
        tenant, created_by, reversal_date,
        f"Credit Note {credit_note.credit_note_number} voided (reversal)",
        'credit_note', credit_note.pk, lines,
        purpose='reversal',
    )


def reverse_debit_note_journal(debit_note, created_by=None):
    """
    Debit note voided after being issued — mirror of create_debit_note_journal.
    Reversal restores AP and the supplier expense / VAT:

      Dr  Other Expenses  5300  (restore expense, subtype of Dr AP reversal)
      Dr  VAT Payable     2200  (restore input VAT we can still reclaim)
      Cr  Accounts Payable 2100 (restore what we owe the supplier)
    """
    t = debit_note.tenant
    ap_acc      = _get_party_account_or_fallback(
        tenant=t,
        party=getattr(getattr(debit_note, 'bill', None), 'party', None),
        group_slug='sundry_creditors',
        fallback_code='2100',
    )
    expense_acc = _get_account_by_group(t, 'indirect_expense',  '5300')
    vat_acc     = _get_account_by_group(t, 'duties_taxes_vat',  '2200')

    lines = [
        (expense_acc, debit_note.subtotal, Decimal('0'),   'VOID DN – Expense restore'),
        (ap_acc,      Decimal('0'),        debit_note.total, 'VOID DN – AP restore'),
    ]
    if debit_note.vat_amount:
        lines.append(
            (vat_acc, debit_note.vat_amount, Decimal('0'), 'VOID DN – VAT restore')
        )

    # B5 — Use the debit note's own issue date, not today.
    reversal_date = debit_note.issued_at.date() if debit_note.issued_at else timezone.localdate()
    return _make_entry(
        t, created_by, reversal_date,
        f"Debit Note {debit_note.debit_note_number} voided (reversal)",
        'debit_note', debit_note.pk, lines,
        purpose='reversal',
    )


# ─── Payslip ─────────────────────────────────────────────────────────────────

def create_payslip_journal(payslip, created_by=None):
    """
    Full payslip double-entry (B1 — corrected and fully balanced).

    Journal structure:
      Dr  Salary Expense  5200   gross          ← total cost to the business
      Cr  TDS Payable     2300   tds_amount     ← IRD liability (Nepal mandatory)
      Cr  <deduction acc> varies per line       ← per-type deduction (PF, CIT, loans …)
      Cr  Cash / Bank     1100   cash_credit    ← net disbursed (computed, NOT raw net_pay)

    Balance invariant (always enforced):
      gross == tds_amount + sum(deduction_credits) + cash_credit

    Deduction resolution:
      1. payslip.deduction_breakdown — list of
            {"label": str, "amount": "500.00", "account_code": "2310 (optional)"}
         Each item is credited to its own account. account_code uses _get_account();
         if absent or not found the item falls back to loans_advances_asset (1400).
      2. If deduction_breakdown is empty/absent, falls back to the aggregate
         payslip.deductions field — posted as a single line to loans_advances_asset.

    cash_credit is DERIVED as gross - tds - sum(deduction_credits) so the journal
    always balances even when net_pay has a rounding difference.  A ValidationError
    is raised when cash_credit would be negative (deductions exceed gross).

    Called by handle_payslip_paid signal.  The Payment record from mark_paid is for
    cash-flow / bank reconciliation only — handle_payment_created skips the journal
    when the reference starts with 'PAYSLIP-'.
    """
    from django.core.exceptions import ValidationError

    tenant   = payslip.tenant
    salary   = _get_account_by_group(tenant, 'indirect_expense', '5200')

    # Resolve disbursement account from linked bank account or default cash
    if getattr(payslip, 'bank_account', None) and payslip.bank_account.linked_account:
        cash_acc = payslip.bank_account.linked_account
    else:
        cash_acc = _get_account_by_group(tenant, 'cash_in_hand', '1100')

    tds_amnt  = payslip.tds_amount or Decimal('0')

    # B1 — Compute TRUE gross: fixed (base_salary + bonus) + variable (coin earnings).
    #
    # gross_amount stores ONLY the coin-earnings component (coins × rate).
    # base_salary and bonus are the fixed components stored as separate fields.
    # Total salary expense = base_salary + bonus + gross_amount(coins).
    #
    # Payslip.update() confirms the definition:
    #   net_pay = base_salary + bonus + gross_amount − tds − deductions
    # So the salary debit line must equal base_salary + bonus + gross_amount.
    #
    # Never use net_pay+tds as gross — silently loses deduction amounts.
    base_salary  = getattr(payslip, 'base_salary',  None) or Decimal('0')
    bonus        = getattr(payslip, 'bonus',         None) or Decimal('0')
    gross_amount = getattr(payslip, 'gross_amount',  None) or Decimal('0')
    deductions   = getattr(payslip, 'deductions',    None) or Decimal('0')

    if base_salary > Decimal('0') or gross_amount > Decimal('0'):
        # Normal path: total gross = fixed salary + coin earnings component
        gross = base_salary + bonus + gross_amount
    else:
        # Last-resort reconstruction for legacy payslips with only net_pay stored.
        gross = (payslip.net_pay or Decimal('0')) + tds_amnt + deductions

    if gross <= Decimal('0'):
        return None   # zero payslip — nothing to post

    # --- Build deduction credit lines ---
    deduction_lines = []
    deduction_breakdown = getattr(payslip, 'deduction_breakdown', None) or []

    if deduction_breakdown:
        loans_fallback = None  # lazy-load only if a line needs the fallback
        for item in deduction_breakdown:
            raw_amount = item.get('amount', '0')
            try:
                item_amount = Decimal(str(raw_amount))
            except Exception:
                raise ValidationError(
                    f"Payslip {payslip.pk}: deduction_breakdown item has invalid amount "
                    f"'{raw_amount}' — must be a numeric string."
                )
            if item_amount <= Decimal('0'):
                continue
            item_label = item.get('label') or 'Salary deduction'
            item_code  = item.get('account_code', '')
            if item_code:
                try:
                    ded_acc = _get_account(tenant, item_code)
                except ValueError:
                    # account code not yet created in this tenant's COA — use loans fallback
                    if loans_fallback is None:
                        loans_fallback = _get_account_by_group(tenant, 'loans_advances_asset', '1400')
                    ded_acc = loans_fallback
            else:
                if loans_fallback is None:
                    loans_fallback = _get_account_by_group(tenant, 'loans_advances_asset', '1400')
                ded_acc = loans_fallback
            deduction_lines.append(
                (ded_acc, Decimal('0'), item_amount,
                 f"{item_label} – {payslip.staff} {payslip.period_start}")
            )
    elif deductions > Decimal('0'):
        # Aggregate fallback: single line to Loans & Advances (legacy / simple payslips)
        loans_acc = _get_account_by_group(tenant, 'loans_advances_asset', '1400')
        deduction_lines.append(
            (loans_acc, Decimal('0'), deductions,
             f"Salary deduction – {payslip.staff} {payslip.period_start}")
        )

    total_deduction_credits = sum(line[2] for line in deduction_lines)

    # Derive cash credit to guarantee exact balance (never trust raw net_pay for this).
    cash_credit = gross - tds_amnt - total_deduction_credits
    if cash_credit < Decimal('0'):
        raise ValidationError(
            f"Payslip {payslip.pk}: deductions ({total_deduction_credits}) + TDS ({tds_amnt}) "
            f"exceed gross ({gross}).  Correct the payslip before posting the journal."
        )

    # Assemble final lines: debit first, then all credits
    lines = [
        (salary,   gross,        Decimal('0'), f"Gross salary – {payslip.staff} {payslip.period_start}"),
    ]
    if tds_amnt > Decimal('0'):
        tds_acc = _get_account_by_group(tenant, 'duties_taxes_tds', '2300')
        lines.append(
            (tds_acc, Decimal('0'), tds_amnt, f"TDS withheld – {payslip.staff} {payslip.period_start}")
        )
    lines.extend(deduction_lines)
    lines.append(
        (cash_acc, Decimal('0'), cash_credit, f"Net pay – {payslip.staff} {payslip.period_start}")
    )

    # Sanity check — must always pass; belt-and-suspenders
    total_debits  = sum(line[1] for line in lines)
    total_credits = sum(line[2] for line in lines)
    if total_debits != total_credits:  # pragma: no cover
        raise ValidationError(
            f"Payslip {payslip.pk}: journal imbalance detected "
            f"(Dr {total_debits} ≠ Cr {total_credits}). This is a bug — report it."
        )

    payslip_date = getattr(payslip, 'paid_at', None)
    voucher_date = (
        payslip_date.date() if payslip_date and hasattr(payslip_date, 'date')
        else payslip_date if payslip_date
        else timezone.localdate()
    )
    return _make_entry(
        tenant, created_by, voucher_date,
        f"Payslip paid – {payslip.staff} {payslip.period_start}→{payslip.period_end}",
        'payslip', payslip.pk, lines,
        purpose='payslip',
    )


def create_cogs_journal(invoice, created_by=None):
    """
    Record Cost of Goods Sold for product lines on an issued invoice.

      Dr  COGS            5100   (cost_price × qty per product line)
      Cr  Inventory Asset 1300   (cost_price × qty)

    Requires line_items to contain 'product_id' and 'line_type': 'product'.

    B4 — Raises ValidationError (not a silent skip) when:
      • A line has line_type='product' but no product_id (inventory linkage broken).
      • A product's cost_price or cost_price_snapshot is zero / negative.
    This prevents inventory overstatement from silently entering the books.

    Returns None when there are no product lines at all.
    """
    from django.core.exceptions import ValidationError
    from inventory.models import Product
    tenant     = invoice.tenant
    inv_num    = getattr(invoice, 'invoice_number', invoice.pk)
    total_cost = Decimal('0')

    for item in (invoice.line_items or []):
        if item.get('line_type') != 'product':
            continue
        product_id = item.get('product_id')
        if not product_id:
            # B4 — product line must reference a product; fail loudly.
            raise ValidationError(
                f"Invoice {inv_num}: a 'product' line is missing product_id. "
                "Set product_id on all product lines before issuing the invoice."
            )
        # B24 — Prefer cost_price_snapshot captured at invoice creation time.
        snapshot_cost = item.get('cost_price_snapshot')
        if snapshot_cost is not None:
            cost = Decimal(str(snapshot_cost))
        else:
            try:
                product = Product.objects.get(pk=product_id, tenant=tenant)
            except Product.DoesNotExist:
                raise ValidationError(
                    f"Invoice {inv_num}: product_id={product_id} does not exist. "
                    "Remove the line or correct the product reference."
                )
            cost = product.cost_price or Decimal('0')
            if cost <= Decimal('0'):
                # B4 — zero cost is an accounting error, not a warning.
                raise ValidationError(
                    f"Invoice {inv_num}: product_id={product_id} ({getattr(product, 'name', '?')}) "
                    "has cost_price=0. Set a positive cost price in Inventory before issuing "
                    "invoices that include this product."
                )
        if cost <= Decimal('0'):
            raise ValidationError(
                f"Invoice {inv_num}: cost_price_snapshot for product_id={product_id} is 0 "
                "or negative. Re-snapshot the cost price and re-issue the invoice."
            )
        qty = Decimal(str(item.get('qty', 1)))
        total_cost += (cost * qty).quantize(Decimal('0.01'))

    if total_cost <= Decimal('0'):
        return None  # no product lines — perfectly valid for service-only invoices

    cogs_acc = _get_account_by_group(tenant, 'purchase_accounts', '5100')
    inv_acc  = _get_account_by_group(tenant, 'stock_in_hand',      '1300')
    lines = [
        (cogs_acc, total_cost,       Decimal('0'), f"COGS – {inv_num}"),
        (inv_acc,  Decimal('0'),     total_cost,   f"Inventory out – {inv_num}"),
    ]
    return _make_entry(
        tenant, created_by,
        invoice.created_at.date() if invoice.created_at else timezone.localdate(),
        f"COGS – {inv_num}",
        'cogs', invoice.pk, lines,
        purpose='cogs',
    )


def record_vat_remittance(tenant, amount, period, created_by=None):
    """
    Record VAT payment to IRD — clears VAT Payable:

      Dr  VAT Payable  2200   (amount)
      Cr  Cash         1100   (amount)

    Call when tenant submits monthly VAT return to IRD.

    N2 fix — Period-based idempotency guard: raises ConflictError if a VAT
    remittance entry for this period already exists so the view can return a
    meaningful error rather than silently double-posting.
    """
    from accounting.models import JournalEntry
    from core.exceptions import ConflictError

    if not amount or amount <= Decimal('0'):
        raise ValueError('VAT remittance amount must be > 0.')

    # N2 fix: block double-remittance for the same period.
    period_str = str(period)
    duplicate = JournalEntry.objects.filter(
        tenant=tenant,
        reference_type=JournalEntry.REF_VAT_REM,
        description__icontains=period_str,
        is_posted=True,
    ).first()
    if duplicate:
        raise ConflictError(
            f'VAT remittance for period "{period_str}" already recorded '
            f'(entry {duplicate.entry_number}).'
        )

    vat_acc  = _get_account_by_group(tenant, 'duties_taxes_vat', '2200')
    cash_acc = _get_account_by_group(tenant, 'cash_in_hand',      '1100')
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"VAT remittance to IRD – {period}",
        'vat_remittance', 0,
        [
            (vat_acc,  amount,         Decimal('0'), f"VAT Payable cleared – {period}"),
            (cash_acc, Decimal('0'),   amount,       f"IRD payment – {period}"),
        ],
        purpose='vat',
    )


def record_tds_remittance(tenant, amount, period, created_by=None):
    """
    Record TDS deposit to IRD — clears TDS Payable:

      Dr  TDS Payable  2300   (amount)
      Cr  Cash         1100   (amount)

    Call when tenant deposits withheld TDS (salary or supplier) to IRD.

    N2 fix — Period-based idempotency guard: raises ConflictError if a TDS
    deposit entry for this period already exists so the view returns a
    meaningful error rather than silently double-posting.
    """
    from accounting.models import JournalEntry
    from core.exceptions import ConflictError

    if not amount or amount <= Decimal('0'):
        raise ValueError('TDS remittance amount must be > 0.')

    # N2 fix: block double-remittance for the same period.
    period_str = str(period)
    duplicate = JournalEntry.objects.filter(
        tenant=tenant,
        reference_type=JournalEntry.REF_TDS_REM,
        description__icontains=period_str,
        is_posted=True,
    ).first()
    if duplicate:
        raise ConflictError(
            f'TDS deposit for period "{period_str}" already recorded '
            f'(entry {duplicate.entry_number}).'
        )

    tds_acc  = _get_account_by_group(tenant, 'duties_taxes_tds', '2300')
    cash_acc = _get_account_by_group(tenant, 'cash_in_hand',      '1100')
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"TDS deposit to IRD – {period}",
        'tds_remittance', 0,
        [
            (tds_acc,  amount,         Decimal('0'), f"TDS Payable cleared – {period}"),
            (cash_acc, Decimal('0'),   amount,       f"IRD payment – {period}"),
        ],
        purpose='tds',
    )


# ─── Default Chart of Accounts seed ──────────────────────────────────────────

# Tally-style primary groups for Nepal SME accounting.
# (slug, name, type, report_section, affects_gross_profit, normal_balance, order)
DEFAULT_GROUPS = [
    # ── Balance Sheet: Assets ────────────────────────────────────────────────
    ('fixed_assets',          'Fixed Assets',           'asset',     'bs_fixed_assets',       False, 'debit',  10),
    ('investments',           'Investments',            'asset',     'bs_investments',         False, 'debit',  20),
    ('stock_in_hand',         'Stock / Inventory',      'asset',     'bs_current_assets',      True,  'debit',  30),
    ('sundry_debtors',        'Sundry Debtors',         'asset',     'bs_current_assets',      False, 'debit',  40),
    ('bank_accounts',         'Bank Accounts',          'asset',     'bs_current_assets',      False, 'debit',  50),
    ('cash_in_hand',          'Cash in Hand',           'asset',     'bs_current_assets',      False, 'debit',  60),
    ('loans_advances_asset',  'Loans & Advances (Asset)', 'asset',   'bs_current_assets',      False, 'debit',  70),
    ('other_current_assets',  'Other Current Assets',   'asset',     'bs_current_assets',      False, 'debit',  80),
    # ── Balance Sheet: Equity ────────────────────────────────────────────────
    ('capital_account',       'Capital Account',        'equity',    'bs_capital',             False, 'credit', 100),
    ('reserves_surplus',      'Reserves & Surplus',     'equity',    'bs_capital',             False, 'credit', 110),
    # ── Balance Sheet: Liabilities ────────────────────────────────────────────
    ('bank_od',               'Bank OD Accounts',       'liability', 'bs_loans',               False, 'credit', 120),
    ('loans_liability',       'Loans (Liability)',       'liability', 'bs_loans',               False, 'credit', 130),
    ('sundry_creditors',      'Sundry Creditors',       'liability', 'bs_current_liabilities',  False, 'credit', 140),
    ('duties_taxes_vat',      'Duties & Taxes (VAT)',   'liability', 'bs_current_liabilities',  False, 'credit', 150),
    ('duties_taxes_tds',      'Duties & Taxes (TDS)',   'liability', 'bs_current_liabilities',  False, 'credit', 160),
    ('current_liabilities',   'Other Current Liabilities', 'liability', 'bs_current_liabilities', False, 'credit', 170),
    # ── P&L: Gross Profit section ────────────────────────────────────────────
    ('sales_accounts',        'Sales / Revenue',        'revenue',   'pnl_gross',              True,  'credit', 200),
    ('direct_income',         'Direct Income',          'revenue',   'pnl_gross',              True,  'credit', 210),
    ('purchase_accounts',     'Purchases / COGS',       'expense',   'pnl_gross',              True,  'debit',  220),
    ('direct_expense',        'Direct Expenses',        'expense',   'pnl_gross',              True,  'debit',  230),
    # ── P&L: Net Profit section ──────────────────────────────────────────────
    ('indirect_income',       'Indirect Income',        'revenue',   'pnl_net',                False, 'credit', 300),
    ('indirect_expense',      'Indirect Expenses',      'expense',   'pnl_net',                False, 'debit',  310),
]

DEFAULT_ACCOUNTS = [
    # (code, name, type, parent_code, is_system)
    ('1000', 'Assets',               'asset',     None,   True),
    ('1100', 'Cash',                 'asset',     '1000', True),
    ('1150', 'Bank Accounts',        'asset',     '1000', True),
    ('1200', 'Accounts Receivable',  'asset',     '1000', True),
    ('1300', 'Inventory Asset',      'asset',     '1000', True),
    ('2000', 'Liabilities',          'liability', None,   True),
    ('2100', 'Accounts Payable',     'liability', '2000', True),
    ('2200', 'VAT Payable',          'liability', '2000', True),
    ('2300', 'TDS Payable',          'liability', '2000', True),   # ← salary + supplier TDS owed to IRD
    ('3000', 'Equity',               'equity',    None,   True),
    ('3100', 'Capital Account',      'equity',    '3000', True),
    ('3200', 'Retained Earnings',    'equity',    '3000', True),
    ('4000', 'Revenue',              'revenue',   None,   True),
    ('4100', 'Service Revenue',      'revenue',   '4000', True),
    ('4200', 'Product Revenue',      'revenue',   '4000', True),
    ('5000', 'Expenses',             'expense',   None,   True),
    ('5100', 'Cost of Goods Sold',   'expense',   '5000', True),   # debited only via create_cogs_journal
    ('5200', 'Salary Expense',       'expense',   '5000', True),
    ('5300', 'Other Expenses',       'expense',   '5000', True),   # supplier bills go here
]


def seed_account_groups(tenant, created_by=None):
    """
    Create the default AccountGroups for a tenant.
    Safe to call multiple times — uses get_or_create.
    Returns a dict of slug → AccountGroup.
    """
    from accounting.models import AccountGroup

    group_map = {}
    for slug, name, acct_type, report_section, affects_gp, normal_balance, order in DEFAULT_GROUPS:
        group, _ = AccountGroup.objects.get_or_create(
            tenant=tenant,
            slug=slug,
            defaults={
                'name':                name,
                'type':                acct_type,
                'report_section':      report_section,
                'affects_gross_profit': affects_gp,
                'normal_balance':      normal_balance,
                'order':               order,
                'is_system':           True,
                'created_by':          created_by,
            },
        )
        group_map[slug] = group
    return group_map


def seed_chart_of_accounts(tenant, created_by=None):
    """
    Create the default Chart of Accounts for a tenant.
    Safe to call multiple times — uses get_or_create.

    Groups are seeded first so that each account can be linked to its group
    immediately, enabling automated journal routing via group slug from day 1.
    """
    from accounting.models import Account

    # Seed groups first — accounts reference them
    group_map = seed_account_groups(tenant, created_by)

    created_map = {}   # code → Account instance

    for code, name, acct_type, parent_code, is_system in DEFAULT_ACCOUNTS:
        parent = created_map.get(parent_code) if parent_code else None
        group  = group_map.get(ACCOUNT_CODE_TO_GROUP.get(code))  # None for header accounts
        account, _ = Account.objects.get_or_create(
            tenant=tenant,
            code=code,
            defaults={
                'name':      name,
                'type':      acct_type,
                'parent':    parent,
                'group':     group,
                'is_system': is_system,
                'created_by': created_by,
            },
        )
        # Patch group on existing (pre-migration) seeded accounts that lack it
        if account.group_id is None and group is not None:
            account.group = group
            account.save(update_fields=['group'])
        created_map[code] = account

    return created_map


def ensure_bank_control_account(tenant, created_by=None):
    """Ensure tenant has Bank Accounts control ledger (1150) under Assets (1000)."""
    from accounting.models import Account, AccountGroup

    assets_parent = Account.objects.filter(tenant=tenant, code='1000').first()
    group = AccountGroup.objects.filter(tenant=tenant, slug='bank_accounts').first()

    control, _ = Account.objects.get_or_create(
        tenant=tenant,
        code='1150',
        defaults={
            'name': 'Bank Accounts',
            'type': Account.TYPE_ASSET,
            'parent': assets_parent,
            'group': group,
            'is_system': True,
            'created_by': created_by,
        },
    )

    update_fields = []
    if control.parent_id != getattr(assets_parent, 'id', None):
        control.parent = assets_parent
        update_fields.append('parent')
    if group is not None and control.group_id != group.id:
        control.group = group
        update_fields.append('group')
    if control.type != Account.TYPE_ASSET:
        control.type = Account.TYPE_ASSET
        update_fields.append('type')
    if control.name != 'Bank Accounts':
        control.name = 'Bank Accounts'
        update_fields.append('name')
    # 1150 is a control ledger, not a specific bank account.
    if control.description:
        control.description = ''
        update_fields.append('description')
    if not control.is_active:
        control.is_active = True
        update_fields.append('is_active')
    if not control.is_system:
        control.is_system = True
        update_fields.append('is_system')

    if update_fields:
        control.save(update_fields=update_fields)

    return control


# ─── Debit Note journal (purchase return to supplier) ────────────────────────

def create_debit_note_journal(debit_note, created_by=None):
    """
    Issued Debit Note → reverse the original Bill's journal entry.
    Dr  AP          (reduces what we owe the supplier)
    Cr  Expense     (reduces the expense we recorded)
    Cr  VAT Payable (reduces VAT we can reclaim — since goods returned)

    Mirror image of create_bill_journal.
    """
    from accounting.models import Account
    t = debit_note.tenant

    ap_acc      = _get_party_account_or_fallback(
        tenant=t,
        party=getattr(getattr(debit_note, 'bill', None), 'party', None),
        group_slug='sundry_creditors',
        fallback_code='2100',
    )
    expense_acc = _get_account_by_group(t, 'indirect_expense', '5300')
    vat_acc     = _get_account_by_group(t, 'duties_taxes_vat', '2200')

    lines = [
        (ap_acc,      debit_note.total,       Decimal('0'),       'Debit Note – AP reversal'),
        (expense_acc, Decimal('0'),            debit_note.subtotal, 'Debit Note – Expense reversal'),
    ]
    if debit_note.vat_amount:
        lines.append(
            (vat_acc, Decimal('0'), debit_note.vat_amount, 'Debit Note – VAT reversal'),
        )

    voucher_date = debit_note.issued_at.date() if debit_note.issued_at else timezone.localdate()
    return _make_entry(
        t, created_by, voucher_date,
        f"Debit Note {debit_note.debit_note_number}",
        'debit_note', debit_note.pk, lines,
        purpose='reversal',
    )


# ─── Recurring Journal runner ─────────────────────────────────────────────────

def run_recurring_journal(recurring, triggered_by=None):
    """
    Create a JournalEntry from a RecurringJournal template, then advance next_date.
    Raises ValueError if template_lines empty or accounts missing.

    B14 — Wrapped in transaction.atomic() so that a missing account or balance
    failure rolls back the entire entry (including the next_date advance) rather
    than leaving a partial entry or orphaned JournalLines in the database.

    N1 fix — Idempotent: uses reference_type='recurring' + reference_id=recurring.pk
    so that the DB UniqueConstraint (acc_journal_one_recurring_per_date) prevents
    duplicate entries if the Celery task retries or fires twice for the same day.
    An app-layer pre-check is also performed for fast-path detection without relying
    solely on catching IntegrityError.
    """
    from accounting.models import Account, JournalEntry, JournalLine
    from datetime import date
    from dateutil.relativedelta import relativedelta
    import django.utils.timezone as tz
    from django.db import transaction, IntegrityError

    if not recurring.template_lines:
        raise ValueError("Template has no lines.")

    t = recurring.tenant
    today = date.today()

    # N1 fix — app-layer idempotency check: skip if already posted for today.
    existing = JournalEntry.objects.filter(
        tenant=t,
        reference_type=JournalEntry.REF_RECURRING,
        reference_id=recurring.pk,
        date=today,
        is_posted=True,
    ).first()
    if existing:
        return existing

    with transaction.atomic():
        try:
            entry = JournalEntry.objects.create(
                tenant=t,
                date=today,
                description=recurring.name,
                reference_type=JournalEntry.REF_RECURRING,
                reference_id=recurring.pk,
                purpose=JournalEntry.PURPOSE_RECURRING,
                created_by=triggered_by,
            )
        except IntegrityError:
            # Concurrent Celery worker already created the entry — fetch and return it.
            return JournalEntry.objects.filter(
                tenant=t,
                reference_type=JournalEntry.REF_RECURRING,
                reference_id=recurring.pk,
                date=today,
                is_posted=True,
            ).first()

        for item in recurring.template_lines:
            code = item.get('account_code', '')
            try:
                account = Account.objects.get(tenant=t, code=code)
            except Account.DoesNotExist:
                # Raise — transaction.atomic() will roll back the entry automatically.
                raise ValueError(f"Account code {code!r} not found in Chart of Accounts.")
            JournalLine.objects.create(
                entry=entry,
                account=account,
                debit=Decimal(str(item.get('debit', '0'))),
                credit=Decimal(str(item.get('credit', '0'))),
                description=item.get('description', ''),
            )

        entry.post()

        # Advance next_date inside the same transaction so both changes are atomic.
        freq = recurring.frequency
        freq_map = {
            'daily':   relativedelta(days=1),
            'weekly':  relativedelta(weeks=1),
            'monthly': relativedelta(months=1),
            'yearly':  relativedelta(years=1),
        }
        delta = freq_map.get(freq, relativedelta(months=1))
        recurring.next_date   = recurring.next_date + delta
        recurring.last_run_at = tz.now()
        recurring.save(update_fields=['next_date', 'last_run_at'])

    return entry


# ─────────────────────────────────────────────────────────────────────────────
# Contra Entry  (cash ↔ bank transfer shortcut)
# ─────────────────────────────────────────────────────────────────────────────

def create_contra_entry(tenant, created_by, date, from_account_id, to_account_id, amount, description='Contra entry'):
    """
    Create a balanced contra journal entry (DR to_account / CR from_account).

    Typical use: Cash → Bank deposit or Bank → Cash withdrawal.
    The entry is immediately posted.

    Raises ValueError if accounts belong to a different tenant or amount ≤ 0.
    """
    from accounting.models import Account, JournalEntry
    from django.utils.dateparse import parse_date as _parse_date

    amount = Decimal(str(amount))
    if amount <= 0:
        raise ValueError('Amount must be greater than zero.')

    date_val = _parse_date(str(date)) if isinstance(date, str) else date
    if date_val is None:
        raise ValueError(f"Invalid date: {date!r}")

    try:
        from_acct = Account.objects.get(tenant=tenant, pk=from_account_id)
        to_acct   = Account.objects.get(tenant=tenant, pk=to_account_id)
    except Account.DoesNotExist as exc:
        raise ValueError(f'Account not found: {exc}')

    if from_acct.pk == to_acct.pk:
        raise ValueError('From and To accounts must be different.')

    entry = _make_entry(
        tenant=tenant,
        created_by=created_by,
        date=date_val,
        description=description,
        reference_type=JournalEntry.REF_MANUAL,
        reference_id=None,
        lines=[
            (to_acct,   amount, Decimal('0'), description),   # DR to_account
            (from_acct, Decimal('0'), amount, description),   # CR from_account
        ],
    )
    return entry


# ─────────────────────────────────────────────────────────────────────────────
# Reversing Entry  (immediate DR↔CR mirror of a posted entry)
# ─────────────────────────────────────────────────────────────────────────────

def create_reversing_entry(original_entry, reversal_date, created_by,
                            reversal_reason='', reversed_by_user=None):
    """
    Create and post a mirror-image reversing journal entry for *original_entry*.

    Each line's DR and CR are swapped.  The new entry is linked back to the
    original via ``original_entry.reversed_by``.

    B5 — Pass reversal_reason and reversed_by_user to record who voided and why.
         These are stored on the *reversal* entry and back-patched onto the
         *original* entry's reversal_reason / reversed_by_user fields so auditors
         can see the reason on either side of the pair.

    Raises ValueError if original_entry is not posted or has no lines.
    Raises ConflictError if already reversed.
    """
    from accounting.models import JournalEntry, JournalLine
    from django.db import transaction
    from django.utils import timezone as tz

    if not original_entry.is_posted:
        raise ValueError('Only posted entries can be reversed.')
    if original_entry.reversed_by_id:
        raise ValueError('Entry has already been reversed.')

    lines = list(original_entry.lines.all())
    if not lines:
        raise ValueError('Original entry has no lines — cannot reverse.')

    now = tz.now()

    with transaction.atomic():
        reversal = JournalEntry.objects.create(
            tenant=original_entry.tenant,
            created_by=created_by,
            date=reversal_date,
            description=f'Reversal of {original_entry.entry_number}',
            reference_type=JournalEntry.REF_MANUAL,
            reference_id=original_entry.pk,
            is_reversal=True,
            purpose=JournalEntry.PURPOSE_REVERSAL,
            reversal_reason=reversal_reason or '',
            reversed_by_user=reversed_by_user,
            reversal_timestamp=now,
        )
        for line in lines:
            JournalLine.objects.create(
                entry=reversal,
                account=line.account,
                debit=line.credit,    # swap
                credit=line.debit,    # swap
                description=line.description or '',
                cost_centre=line.cost_centre,
            )
        reversal.post()

        # B25 — log the new reversing entry.
        from accounting.models import log_journal_change, JournalEntryAuditLog, capture_entry_snapshot
        log_journal_change(
            reversal,
            action=JournalEntryAuditLog.ACTION_CREATE,
            changed_by=created_by,
            reason=reversal_reason or '',
        )

        # Capture original before back-patch so field_changes diff is correct.
        original_before = capture_entry_snapshot(original_entry)

        # Link original → reversal, and back-patch reversal audit fields.
        original_entry.reversed_by         = reversal
        original_entry.reversal_reason      = reversal_reason or ''
        original_entry.reversed_by_user     = reversed_by_user
        original_entry.reversal_timestamp   = now
        original_entry.save(update_fields=[
            'reversed_by', 'reversal_reason', 'reversed_by_user', 'reversal_timestamp',
        ])

        # B25 — log the back-patch on the original entry.
        log_journal_change(
            original_entry,
            action=JournalEntryAuditLog.ACTION_UPDATE,
            changed_by=created_by,
            reason=f'Reversed by entry {reversal.entry_number}',
            before_snapshot=original_before,
        )

    return reversal


# ─── Chart of Accounts Group Seeding ─────────────────────────────────────────

# Standard Nepal CoA: account code numeric prefix → AccountGroup slug.
# Used by seed_account_groups() and assign_account_groups management command.
ACCOUNT_CODE_TO_GROUP = {
    # Cash in Hand (1000–1149)
    '1000': 'cash_in_hand', '1050': 'cash_in_hand', '1100': 'cash_in_hand',
    '1110': 'cash_in_hand', '1120': 'cash_in_hand', '1130': 'cash_in_hand',
    # Bank Accounts (1150–1299 BUT 1200 = AR)
    '1150': 'bank_accounts', '1160': 'bank_accounts', '1170': 'bank_accounts',
    '1180': 'bank_accounts', '1190': 'bank_accounts',
    # Accounts Receivable / Sundry Debtors
    '1200': 'sundry_debtors', '1210': 'sundry_debtors', '1220': 'sundry_debtors',
    '1230': 'sundry_debtors', '1240': 'sundry_debtors', '1250': 'sundry_debtors',
    # Stock / Inventory
    '1300': 'stock_in_hand', '1310': 'stock_in_hand', '1320': 'stock_in_hand',
    '1330': 'stock_in_hand',
    # Loans & Advances given
    '1400': 'loans_advances_asset', '1410': 'loans_advances_asset',
    '1420': 'loans_advances_asset', '1430': 'loans_advances_asset',
    # Other Current Assets
    '1500': 'other_current_assets', '1510': 'other_current_assets',
    '1520': 'other_current_assets', '1530': 'other_current_assets',
    # Investments
    '1600': 'investments', '1610': 'investments', '1620': 'investments',
    # Fixed Assets (1650–1999)
    '1650': 'fixed_assets', '1700': 'fixed_assets', '1710': 'fixed_assets',
    '1720': 'fixed_assets', '1730': 'fixed_assets', '1740': 'fixed_assets',
    '1750': 'fixed_assets', '1800': 'fixed_assets', '1810': 'fixed_assets',
    '1820': 'fixed_assets', '1830': 'fixed_assets', '1900': 'fixed_assets',
    # Accounts Payable / Sundry Creditors
    '2000': 'sundry_creditors', '2100': 'sundry_creditors',
    '2110': 'sundry_creditors', '2120': 'sundry_creditors',
    # Duties & Taxes — VAT
    '2200': 'duties_taxes_vat', '2210': 'duties_taxes_vat', '2220': 'duties_taxes_vat',
    # Duties & Taxes — TDS
    '2250': 'duties_taxes_tds', '2300': 'duties_taxes_tds', '2310': 'duties_taxes_tds',
    # Other Current Liabilities
    '2350': 'current_liabilities', '2400': 'current_liabilities',
    '2410': 'current_liabilities', '2420': 'current_liabilities',
    '2500': 'current_liabilities',
    # Bank OD / Overdraft
    '2600': 'bank_od', '2610': 'bank_od', '2620': 'bank_od',
    # Loans (liability)
    '2700': 'loans_liability', '2710': 'loans_liability', '2720': 'loans_liability',
    '2800': 'loans_liability', '2900': 'loans_liability',
    # Capital Account
    '3000': 'capital_account', '3010': 'capital_account',
    '3100': 'capital_account', '3110': 'capital_account',
    # Reserves & Surplus
    '3200': 'reserves_surplus', '3210': 'reserves_surplus',
    '3300': 'reserves_surplus', '3400': 'reserves_surplus',
    # Sales / Revenue (4000–4199) + Product Revenue (4200)
    '4000': 'sales_accounts', '4010': 'sales_accounts',
    '4100': 'sales_accounts', '4110': 'sales_accounts', '4120': 'sales_accounts',
    '4200': 'sales_accounts',
    # Direct Income (4210+)
    '4210': 'direct_income', '4220': 'direct_income',
    # Indirect Income / Other Income
    '4300': 'indirect_income', '4310': 'indirect_income', '4320': 'indirect_income',
    '4400': 'indirect_income', '4500': 'indirect_income',
    # Purchase / COGS
    '5000': 'purchase_accounts', '5010': 'purchase_accounts',
    '5100': 'purchase_accounts', '5110': 'purchase_accounts', '5120': 'purchase_accounts',
    # B6 fix — Salary (5200) and Other Expenses (5300) are indirect for service companies.
    # Previously mapped to 'direct_expense' which placed them in Gross Profit section.
    '5200': 'indirect_expense', '5210': 'indirect_expense', '5220': 'indirect_expense',
    '5300': 'indirect_expense', '5310': 'indirect_expense',
    # Indirect Expenses (salaries, rent, admin, depreciation …)
    '5400': 'indirect_expense', '5410': 'indirect_expense', '5420': 'indirect_expense',
    '5500': 'indirect_expense', '5510': 'indirect_expense',
    '5600': 'indirect_expense', '5610': 'indirect_expense',
    '5700': 'indirect_expense', '5800': 'indirect_expense', '5900': 'indirect_expense',
    '6000': 'indirect_expense', '6100': 'indirect_expense', '6200': 'indirect_expense',
    '6300': 'indirect_expense', '6400': 'indirect_expense', '6500': 'indirect_expense',
}

# ── GROUP_DEFS ────────────────────────────────────────────────────────────────
# 22 standard Tally-style groups seeded per tenant.
_GROUP_DEFS = [
    # Revenue
    {'slug': 'sales_accounts',       'name': 'Sales Accounts',            'type': 'revenue',
     'report_section': 'pnl_gross', 'normal_balance': 'credit', 'affects_gross_profit': True,  'order': 10},
    {'slug': 'direct_income',        'name': 'Direct Income',             'type': 'revenue',
     'report_section': 'pnl_gross', 'normal_balance': 'credit', 'affects_gross_profit': True,  'order': 11},
    {'slug': 'indirect_income',      'name': 'Indirect Income',           'type': 'revenue',
     'report_section': 'pnl_net',   'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 12},
    # Expense
    {'slug': 'purchase_accounts',    'name': 'Purchase Accounts',         'type': 'expense',
     'report_section': 'pnl_gross', 'normal_balance': 'debit',  'affects_gross_profit': True,  'order': 20},
    {'slug': 'direct_expense',       'name': 'Direct Expenses',           'type': 'expense',
     'report_section': 'pnl_gross', 'normal_balance': 'debit',  'affects_gross_profit': True,  'order': 21},
    {'slug': 'indirect_expense',     'name': 'Indirect Expenses',         'type': 'expense',
     'report_section': 'pnl_net',   'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 22},
    # Assets
    {'slug': 'fixed_assets',         'name': 'Fixed Assets',              'type': 'asset',
     'report_section': 'bs_fixed_assets',       'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 30},
    {'slug': 'investments',          'name': 'Investments',               'type': 'asset',
     'report_section': 'bs_investments',        'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 31},
    {'slug': 'stock_in_hand',        'name': 'Stock in Hand',             'type': 'asset',
     'report_section': 'bs_current_assets',     'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 32},
    {'slug': 'sundry_debtors',       'name': 'Sundry Debtors',            'type': 'asset',
     'report_section': 'bs_current_assets',     'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 33},
    {'slug': 'bank_accounts',        'name': 'Bank Accounts',             'type': 'asset',
     'report_section': 'bs_current_assets',     'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 34},
    {'slug': 'cash_in_hand',         'name': 'Cash in Hand',              'type': 'asset',
     'report_section': 'bs_current_assets',     'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 35},
    {'slug': 'loans_advances_asset', 'name': 'Loans & Advances (Asset)',  'type': 'asset',
     'report_section': 'bs_current_assets',     'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 36},
    {'slug': 'other_current_assets', 'name': 'Other Current Assets',      'type': 'asset',
     'report_section': 'bs_current_assets',     'normal_balance': 'debit',  'affects_gross_profit': False, 'order': 37},
    # Liabilities
    {'slug': 'sundry_creditors',     'name': 'Sundry Creditors',          'type': 'liability',
     'report_section': 'bs_current_liabilities', 'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 40},
    {'slug': 'duties_taxes_vat',     'name': 'Duties & Taxes (VAT)',      'type': 'liability',
     'report_section': 'bs_current_liabilities', 'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 41},
    {'slug': 'duties_taxes_tds',     'name': 'Duties & Taxes (TDS)',      'type': 'liability',
     'report_section': 'bs_current_liabilities', 'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 42},
    {'slug': 'current_liabilities',  'name': 'Current Liabilities',       'type': 'liability',
     'report_section': 'bs_current_liabilities', 'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 43},
    {'slug': 'bank_od',              'name': 'Bank OD & Overdraft',       'type': 'liability',
     'report_section': 'bs_loans',              'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 44},
    {'slug': 'loans_liability',      'name': 'Loans (Liability)',          'type': 'liability',
     'report_section': 'bs_loans',              'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 45},
    # Equity
    {'slug': 'capital_account',      'name': 'Capital Account',           'type': 'equity',
     'report_section': 'bs_capital',            'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 50},
    {'slug': 'reserves_surplus',     'name': 'Reserves & Surplus',        'type': 'equity',
     'report_section': 'bs_capital',            'normal_balance': 'credit', 'affects_gross_profit': False, 'order': 51},
]


def _slug_for_code(code: str, acct_type: str) -> str | None:
    """
    Map an account code → AccountGroup slug using Nepal-standard code ranges.
    Falls back to account type if the code is non-numeric or out of range.
    """
    try:
        n = int(''.join(c for c in code if c.isdigit())[:4] or '0')
    except (ValueError, AttributeError):
        n = 0

    # Revenue (4xxx–4xxx)
    if 4000 <= n <= 4099 or 4100 <= n <= 4199 or n == 4200: return 'sales_accounts'
    if 4210 <= n <= 4299: return 'direct_income'
    if 4300 <= n <= 4999: return 'indirect_income'
    # Expenses (5xxx–6xxx)
    if 5000 <= n <= 5199: return 'purchase_accounts'
    # B6 — 5200 (Salary) and 5300 (Other Expenses) are INDIRECT expenses for
    # service/IT companies: they do NOT affect gross profit.  Mapping them to
    # direct_expense was causing salary to appear in the Gross Profit section
    # of P&L (incorrect). Only raw-material / production costs should be direct.
    if 5200 <= n <= 5399: return 'indirect_expense'
    if 5400 <= n <= 6999: return 'indirect_expense'
    # Assets (1xxx)
    if 1000 <= n <= 1149: return 'cash_in_hand'
    if 1150 <= n <= 1199: return 'bank_accounts'
    if 1200 <= n <= 1299: return 'sundry_debtors'
    if 1300 <= n <= 1399: return 'stock_in_hand'
    if 1400 <= n <= 1499: return 'loans_advances_asset'
    if 1500 <= n <= 1649: return 'other_current_assets'
    if 1650 <= n <= 1699: return 'investments'
    if 1700 <= n <= 1999: return 'fixed_assets'
    # Liabilities (2xxx)
    if 2000 <= n <= 2199: return 'sundry_creditors'
    if 2200 <= n <= 2249: return 'duties_taxes_vat'
    if 2250 <= n <= 2349: return 'duties_taxes_tds'
    if 2350 <= n <= 2599: return 'current_liabilities'
    if 2600 <= n <= 2699: return 'bank_od'
    if 2700 <= n <= 2999: return 'loans_liability'
    # Equity (3xxx)
    if 3000 <= n <= 3199: return 'capital_account'
    if 3200 <= n <= 3999: return 'reserves_surplus'

    # Type-based fallback
    _type_fallback = {
        'asset': 'other_current_assets', 'liability': 'current_liabilities',
        'equity': 'capital_account', 'revenue': 'indirect_income', 'expense': 'indirect_expense',
    }
    return _type_fallback.get(acct_type)


def seed_account_groups(tenant, created_by=None) -> dict:
    """
    Idempotently create the 22 standard AccountGroups for a tenant.
    Also backfills Account.group FK for any account that doesn't have one yet,
    using code-range matching (_slug_for_code).

    Returns {slug: AccountGroup} — the complete group map for the tenant.
    Called by:
      - assign_account_groups management command (manual backfill)
      - Tenant post-save signal (auto-seed on tenant creation)
      - seed_chart_of_accounts (passes created_by, which is accepted but unused here)
    """
    from accounting.models import AccountGroup, Account

    group_map: dict = {}
    for d in _GROUP_DEFS:
        grp, _ = AccountGroup.objects.get_or_create(
            tenant=tenant,
            slug=d['slug'],
            defaults={
                'name':                 d['name'],
                'type':                 d['type'],
                'report_section':       d['report_section'],
                'normal_balance':       d['normal_balance'],
                'affects_gross_profit': d['affects_gross_profit'],
                'order':                d['order'],
                'is_system':            True,
                'is_active':            True,
            },
        )
        group_map[d['slug']] = grp

    # Backfill unassigned accounts using code-range matching
    unassigned = Account.objects.filter(tenant=tenant, group__isnull=True, is_active=True)
    for acct in unassigned:
        slug = _slug_for_code(acct.code, acct.type)
        if slug and slug in group_map:
            acct.group = group_map[slug]
            acct.save(update_fields=['group'])

    return group_map


# ─────────────────────────────────────────────────────────────────────────────
# B21 — Fixed Asset Depreciation Journal
# ─────────────────────────────────────────────────────────────────────────────

def create_depreciation_journal(asset, period_date, created_by=None):
    """
    Post one period's depreciation for *asset*.

      Dr  Depreciation Expense        (indirect_expense)
      Cr  Accumulated Depreciation    (fixed_assets — contra asset)

    *period_date*: the last day of the period being depreciated (e.g. 2081-12-30 in BS).

    Raises ValueError if:
      - The asset is not active / fully depreciated already
      - No depreciation expense account is configured
      - Net book value is already at or below residual value
    """
    from accounting.models import FixedAsset

    if asset.status != FixedAsset.STATUS_ACTIVE:
        raise ValueError(
            f"Asset '{asset.name}' is {asset.status} — cannot post depreciation."
        )

    nbv = asset.net_book_value
    if nbv <= asset.residual_value:
        raise ValueError(
            f"Asset '{asset.name}' is fully depreciated (NBV={nbv}, residual={asset.residual_value})."
        )

    # Compute charge for this period
    if asset.method == FixedAsset.METHOD_SLM:
        charge = asset.monthly_slm_charge()
    else:
        # WDV: annual rate ÷ 12 months
        annual = asset.wdv_charge_for_period()
        charge = (annual / Decimal('12')).quantize(Decimal('0.01'))

    if charge <= Decimal('0'):
        return None

    # Cap charge so we never depreciate below residual value
    max_charge = (nbv - asset.residual_value).quantize(Decimal('0.01'))
    charge = min(charge, max_charge)

    tenant = asset.tenant

    # Depreciation expense account (indirect_expense group, default 5400)
    if asset.depr_expense_account_id:
        expense_acc = asset.depr_expense_account
    else:
        expense_acc = _get_account_by_group(tenant, 'indirect_expense', '5400')

    # Accumulated depreciation account (fixed_assets group, contra asset)
    if asset.accum_depr_account_id:
        accum_acc = asset.accum_depr_account
    else:
        accum_acc = _get_account_by_group(tenant, 'fixed_assets', '1710')

    lines = [
        (expense_acc, charge,          Decimal('0'), f"Depreciation – {asset.name} {period_date}"),
        (accum_acc,   Decimal('0'),     charge,       f"Acc. Depr – {asset.name} {period_date}"),
    ]
    entry = _make_entry(
        tenant, created_by, period_date,
        f"Depreciation – {asset.name}",
        'depreciation', asset.pk, lines,
        purpose='depreciation',
    )

    # Update asset running totals (outside the atomic block — entry is committed)
    new_total = asset.total_depreciated + charge
    new_status = asset.status
    if new_total >= (asset.purchase_cost - asset.residual_value):
        new_status = FixedAsset.STATUS_FULLY_DEPRECIATED
    asset.__class__.objects.filter(pk=asset.pk).update(
        total_depreciated=new_total,
        last_depreciation_date=period_date,
        status=new_status,
    )
    return entry


# ─────────────────────────────────────────────────────────────────────────────
# B20 — Foreign Exchange Gain / Loss Journal
# ─────────────────────────────────────────────────────────────────────────────

def create_fx_gain_loss_journal(
    tenant, amount, is_gain, description, reference_id, created_by=None
):
    """
    Record a realized FX gain or loss on settlement of a foreign-currency
    receivable or payable.

    Gain (amount > 0, is_gain=True):
      Dr  Forex Gain / Loss account  (indirect_income)  — credit to income

    Loss (amount > 0, is_gain=False):
      Dr  Forex Gain / Loss account  (indirect_expense)  — debit to expense

    Both entries use a single "Forex Adjustment" contra-account in indirect_income
    or indirect_expense (the sign / section dictates gain vs loss on reports).

    *reference_id* should be the settlement Payment PK so the entry is traceable.
    """
    from django.utils import timezone as tz

    if amount <= Decimal('0'):
        return None

    if is_gain:
        # Credit indirect income  ← gain is income
        acc = _get_account_by_group(tenant, 'indirect_income', '4300')
        lines = [
            (_get_account_by_group(tenant, 'sundry_debtors', '1200'),
             amount, Decimal('0'), description),
            (acc, Decimal('0'), amount, description),
        ]
    else:
        # Debit indirect expense  ← loss is expense
        acc = _get_account_by_group(tenant, 'indirect_expense', '5400')
        lines = [
            (acc, amount, Decimal('0'), description),
            (_get_account_by_group(tenant, 'sundry_debtors', '1200'),
             Decimal('0'), amount, description),
        ]

    return _make_entry(
        tenant, created_by, tz.localdate(),
        description,
        'fx_gain_loss', reference_id, lines,
        purpose='fx_gain_loss',
    )


# ─── Cheque bounce reversal ───────────────────────────────────────────────────

def reverse_payment_journal(payment, reason='', reversed_by_user=None):
    """
    Create a full reversal of the original payment journal entry.
    Used when a cheque bounces — swaps every Dr / Cr line from the original.

    Incoming cheque bounce: Dr AR / Cr Bank  (undoes Dr Bank / Cr AR)
    Outgoing cheque bounce: Dr Bank / Cr AP  (undoes Dr AP / Cr Bank)
    """
    from accounting.models import JournalEntry
    from django.utils import timezone as tz

    original = JournalEntry.objects.filter(
        tenant=payment.tenant,
        reference_type='payment',
        reference_id=payment.pk,
        purpose='payment',
        is_posted=True,
    ).first()

    if not original:
        raise ValueError(
            f"No posted payment journal found for payment {payment.pk}. "
            "Cannot reverse a payment that was never journalised."
        )

    reversal_lines = [
        (line.account, line.credit, line.debit, f"Bounce reversal: {line.description}")
        for line in original.lines.select_related('account').all()
    ]

    return _make_entry(
        payment.tenant,
        reversed_by_user,
        tz.localdate(),
        f"Cheque bounce reversal – {payment.payment_number}",
        'payment',
        payment.pk,
        reversal_lines,
        purpose='payment_bounce_reversal',
        reversal_reason=reason or f"Cheque bounced – {payment.payment_number}",
        reversed_by_user=reversed_by_user,
        reversal_timestamp=tz.now(),
    )


def create_bank_charge_journal(payment, amount, charge_account=None, created_by=None):
    """
    Post an expense journal for a bank charge on a bounced cheque.
      Dr  Bank Charges (charge_account or indirect_expense 5300)
      Cr  Bank / Cash  (same bank account as the payment)
    """
    from django.utils import timezone as tz

    tenant = payment.tenant

    if payment.bank_account and payment.bank_account.linked_account:
        bank_acc = payment.bank_account.linked_account
    else:
        bank_acc = _get_account_by_group(tenant, 'cash_in_hand', '1100')

    if charge_account is None:
        charge_account = _get_account_by_group(tenant, 'indirect_expense', '5300')

    return _make_entry(
        tenant, created_by, tz.localdate(),
        f"Bank charge – bounced cheque {payment.payment_number}",
        'payment', payment.pk,
        [
            (charge_account, amount, Decimal('0'), f"Bank charge – {payment.payment_number}"),
            (bank_acc, Decimal('0'), amount, f"Bank charge deducted – {payment.payment_number}"),
        ],
        purpose='payment_bank_charge',
    )
