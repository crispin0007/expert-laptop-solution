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
from decimal import Decimal
from django.utils import timezone


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


def _make_entry(tenant, created_by, date, description, reference_type, reference_id, lines):
    """
    Create a JournalEntry + JournalLines and immediately post it.

    Wrapped in transaction.atomic so that a DB error on any JournalLine
    creation (or a balance failure in post()) rolls back the entire entry —
    preventing partial / unbalanced journal entries from persisting.

    lines : list of (account, debit, credit, description)
    """
    from accounting.models import JournalEntry, JournalLine
    from django.db import transaction

    with transaction.atomic():
        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=created_by,
            date=date,
            description=description,
            reference_type=reference_type,
            reference_id=reference_id,
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
    ar       = _get_account(tenant, '1200')
    svc_rev  = _get_account(tenant, '4100')
    prod_rev = _get_account(tenant, '4200')
    vat_pay  = _get_account(tenant, '2200')

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

    return _make_entry(
        tenant, created_by,
        invoice.created_at.date() if invoice.created_at else timezone.localdate(),
        f"Invoice {invoice.invoice_number} issued",
        'invoice', invoice.pk, lines,
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
    ar       = _get_account(tenant, '1200')
    svc_rev  = _get_account(tenant, '4100')
    prod_rev = _get_account(tenant, '4200')
    vat_pay  = _get_account(tenant, '2200')

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

    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Invoice {invoice.invoice_number} voided (reversal)",
        'invoice', invoice.pk, lines,
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
    expense = _get_account(tenant, '5300')   # Other Expenses — NOT 5100 COGS
    ap      = _get_account(tenant, '2100')
    vat_pay = _get_account(tenant, '2200')

    lines = [
        (expense, bill.subtotal, Decimal('0'), f"Expense – {bill.bill_number}"),
        (ap,      Decimal('0'),  bill.total,   f"AP – {bill.bill_number}"),
    ]
    if bill.vat_amount:
        # Input VAT debits VAT Payable — reduces the net VAT we owe IRD
        lines.append(
            (vat_pay, bill.vat_amount, Decimal('0'), f"Input VAT – {bill.bill_number}")
        )
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Bill {bill.bill_number} approved",
        'bill', bill.pk, lines,
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
        cash_acc = _get_account(tenant, '1100')   # fallback: Cash

    if payment.type == 'incoming':
        ar = _get_account(tenant, '1200')
        lines = [
            (cash_acc, payment.amount, Decimal('0'), f"Receipt – {payment.payment_number}"),
            (ar,       Decimal('0'),   payment.amount, f"Clear AR – {payment.payment_number}"),
        ]
        desc = f"Payment received {payment.payment_number}"
    elif payment.bill_id:
        # Outgoing: supplier bill payment — clears Accounts Payable
        ap = _get_account(tenant, '2100')
        lines = [
            (ap,       payment.amount, Decimal('0'), f"Clear AP – {payment.payment_number}"),
            (cash_acc, Decimal('0'),   payment.amount, f"Payment sent – {payment.payment_number}"),
        ]
        desc = f"Bill payment sent {payment.payment_number}"
    else:
        # Outgoing: salary / direct cash payment — no AP to clear
        salary = _get_account(tenant, '5200')
        lines = [
            (salary,   payment.amount, Decimal('0'), f"Salary – {payment.notes or payment.reference or payment.payment_number}"),
            (cash_acc, Decimal('0'),   payment.amount, f"Paid – {payment.payment_number}"),
        ]
        desc = f"Salary payment {payment.payment_number} ({payment.reference or 'direct'})"

    return _make_entry(
        tenant, created_by, payment.date,
        desc, 'payment', payment.pk, lines,
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
    ar       = _get_account(tenant, '1200')
    svc_rev  = _get_account(tenant, '4100')
    prod_rev = _get_account(tenant, '4200')
    vat_pay  = _get_account(tenant, '2200')

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

    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Credit Note {credit_note.credit_note_number} issued",
        'credit_note', credit_note.pk, lines,
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
    ar       = _get_account(tenant, '1200')
    svc_rev  = _get_account(tenant, '4100')
    prod_rev = _get_account(tenant, '4200')
    vat_pay  = _get_account(tenant, '2200')

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

    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Credit Note {credit_note.credit_note_number} voided (reversal)",
        'credit_note', credit_note.pk, lines,
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
    ap_acc      = _get_account(t, '2100')
    expense_acc = _get_account(t, '5300')
    vat_acc     = _get_account(t, '2200')

    lines = [
        (expense_acc, debit_note.subtotal, Decimal('0'),   'VOID DN – Expense restore'),
        (ap_acc,      Decimal('0'),        debit_note.total, 'VOID DN – AP restore'),
    ]
    if debit_note.vat_amount:
        lines.append(
            (vat_acc, debit_note.vat_amount, Decimal('0'), 'VOID DN – VAT restore')
        )

    return _make_entry(
        t, created_by, timezone.localdate(),
        f"Debit Note {debit_note.debit_note_number} voided (reversal)",
        'debit_note', debit_note.pk, lines,
    )


# ─── Payslip ─────────────────────────────────────────────────────────────────

def create_payslip_journal(payslip, created_by=None):
    """
    Correct payslip double-entry:

      Dr  Salary Expense  5200   gross_salary  (base + bonus + coin_value)
      Cr  TDS Payable     2300   tds_amount    ← liability to IRD (Nepal mandatory)
      Cr  Cash / Bank            net_pay       ← actually paid to employee

    gross_salary = net_pay + tds_amount

    This replaces the old incorrect entry (Dr Salary net_pay / Cr Cash net_pay)
    which understated salary expense by tds_amount and never recorded the IRD liability.

    Called by handle_payslip_paid signal for ALL payslips (including non-zero).
    The Payment record created by mark_paid is only for cash-flow / bank reconciliation —
    its signal (handle_payment_created) skips the journal when reference starts with 'PAYSLIP-'.
    """
    tenant   = payslip.tenant
    salary   = _get_account(tenant, '5200')

    # Use the bank account linked to the payslip if one was selected
    if payslip.bank_account and payslip.bank_account.linked_account:
        cash_acc = payslip.bank_account.linked_account
    else:
        cash_acc = _get_account(tenant, '1100')

    net_pay   = payslip.net_pay   or Decimal('0')
    tds_amnt  = payslip.tds_amount or Decimal('0')
    gross     = net_pay + tds_amnt

    if gross <= Decimal('0'):
        return None   # nothing to post (fully deducted or zero payslip)

    lines = [
        (salary,   gross,          Decimal('0'), f"Gross salary – {payslip.staff} {payslip.period_start}"),
        (cash_acc, Decimal('0'),   net_pay,      f"Net pay – {payslip.staff} {payslip.period_start}"),
    ]
    if tds_amnt > Decimal('0'):
        tds_acc = _get_account(tenant, '2300')   # TDS Payable (liability to IRD)
        lines.append(
            (tds_acc, Decimal('0'), tds_amnt, f"TDS withheld – {payslip.staff} {payslip.period_start}")
        )

    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Payslip paid – {payslip.staff} {payslip.period_start}→{payslip.period_end}",
        'payslip', payslip.pk, lines,
    )


def create_cogs_journal(invoice, created_by=None):
    """
    Record Cost of Goods Sold for product lines on an issued invoice.

      Dr  COGS            5100   (cost_price × qty per product line)
      Cr  Inventory Asset 1300   (cost_price × qty)

    Requires line_items to contain 'product_id' and 'line_type': 'product'.
    Lines without product_id or with cost_price=0 are silently skipped.
    Returns None when no COGS can be computed.
    """
    from inventory.models import Product
    tenant     = invoice.tenant
    total_cost = Decimal('0')

    for item in (invoice.line_items or []):
        if item.get('line_type') != 'product':
            continue
        product_id = item.get('product_id')
        if not product_id:
            continue
        try:
            product = Product.objects.get(pk=product_id, tenant=tenant)
        except Product.DoesNotExist:
            continue
        cost = product.cost_price or Decimal('0')
        if cost <= 0:
            continue
        qty = Decimal(str(item.get('qty', 1)))
        total_cost += (cost * qty).quantize(Decimal('0.01'))

    if total_cost <= Decimal('0'):
        return None

    cogs_acc = _get_account(tenant, '5100')
    inv_acc  = _get_account(tenant, '1300')
    lines = [
        (cogs_acc, total_cost,       Decimal('0'), f"COGS – {invoice.invoice_number}"),
        (inv_acc,  Decimal('0'),     total_cost,   f"Inventory out – {invoice.invoice_number}"),
    ]
    return _make_entry(
        tenant, created_by,
        invoice.created_at.date() if invoice.created_at else timezone.localdate(),
        f"COGS – {invoice.invoice_number}",
        'cogs', invoice.pk, lines,
    )


def record_vat_remittance(tenant, amount, period, created_by=None):
    """
    Record VAT payment to IRD — clears VAT Payable:

      Dr  VAT Payable  2200   (amount)
      Cr  Cash         1100   (amount)

    Call when tenant submits monthly VAT return to IRD.
    """
    if not amount or amount <= Decimal('0'):
        raise ValueError('VAT remittance amount must be > 0.')
    vat_acc  = _get_account(tenant, '2200')
    cash_acc = _get_account(tenant, '1100')
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"VAT remittance to IRD – {period}",
        'vat_remittance', 0,
        [
            (vat_acc,  amount,         Decimal('0'), f"VAT Payable cleared – {period}"),
            (cash_acc, Decimal('0'),   amount,       f"IRD payment – {period}"),
        ],
    )


def record_tds_remittance(tenant, amount, period, created_by=None):
    """
    Record TDS deposit to IRD — clears TDS Payable:

      Dr  TDS Payable  2300   (amount)
      Cr  Cash         1100   (amount)

    Call when tenant deposits withheld TDS (salary or supplier) to IRD.
    """
    if not amount or amount <= Decimal('0'):
        raise ValueError('TDS remittance amount must be > 0.')
    tds_acc  = _get_account(tenant, '2300')
    cash_acc = _get_account(tenant, '1100')
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"TDS deposit to IRD – {period}",
        'tds_remittance', 0,
        [
            (tds_acc,  amount,         Decimal('0'), f"TDS Payable cleared – {period}"),
            (cash_acc, Decimal('0'),   amount,       f"IRD payment – {period}"),
        ],
    )


# ─── Default Chart of Accounts seed ──────────────────────────────────────────

DEFAULT_ACCOUNTS = [
    # (code, name, type, parent_code, is_system)
    ('1000', 'Assets',               'asset',     None,   True),
    ('1100', 'Cash',                 'asset',     '1000', True),
    ('1200', 'Accounts Receivable',  'asset',     '1000', True),
    ('1300', 'Inventory Asset',      'asset',     '1000', True),
    ('2000', 'Liabilities',          'liability', None,   True),
    ('2100', 'Accounts Payable',     'liability', '2000', True),
    ('2200', 'VAT Payable',          'liability', '2000', True),
    ('2300', 'TDS Payable',          'liability', '2000', True),   # ← salary + supplier TDS owed to IRD
    ('3000', 'Equity',               'equity',    None,   True),
    ('3100', 'Retained Earnings',    'equity',    '3000', True),
    ('4000', 'Revenue',              'revenue',   None,   True),
    ('4100', 'Service Revenue',      'revenue',   '4000', True),
    ('4200', 'Product Revenue',      'revenue',   '4000', True),
    ('5000', 'Expenses',             'expense',   None,   True),
    ('5100', 'Cost of Goods Sold',   'expense',   '5000', True),   # debited only via create_cogs_journal
    ('5200', 'Salary Expense',       'expense',   '5000', True),
    ('5300', 'Other Expenses',       'expense',   '5000', True),   # supplier bills go here
]


def seed_chart_of_accounts(tenant, created_by=None):
    """
    Create the default Chart of Accounts for a tenant.
    Safe to call multiple times — uses get_or_create.
    """
    from accounting.models import Account

    created_map = {}   # code → Account instance

    for code, name, acct_type, parent_code, is_system in DEFAULT_ACCOUNTS:
        parent = created_map.get(parent_code) if parent_code else None
        account, _ = Account.objects.get_or_create(
            tenant=tenant,
            code=code,
            defaults={
                'name':      name,
                'type':      acct_type,
                'parent':    parent,
                'is_system': is_system,
                'created_by': created_by,
            },
        )
        created_map[code] = account

    return created_map


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

    ap_acc      = _get_account(t, '2100')  # Accounts Payable
    expense_acc = _get_account(t, '5300')  # Other Expenses (or use a lookup)
    vat_acc     = _get_account(t, '2200')  # VAT Payable

    lines = [
        (ap_acc,      debit_note.total,       Decimal('0'),       'Debit Note – AP reversal'),
        (expense_acc, Decimal('0'),            debit_note.subtotal, 'Debit Note – Expense reversal'),
    ]
    if debit_note.vat_amount:
        lines.append(
            (vat_acc, Decimal('0'), debit_note.vat_amount, 'Debit Note – VAT reversal'),
        )

    return _make_entry(
        t, created_by, timezone.localdate(),
        f"Debit Note {debit_note.debit_note_number}",
        'debit_note', debit_note.pk, lines,
    )


# ─── Recurring Journal runner ─────────────────────────────────────────────────

def run_recurring_journal(recurring, triggered_by=None):
    """
    Create a JournalEntry from a RecurringJournal template, then advance next_date.
    Raises ValueError if template_lines empty or accounts missing.
    """
    from accounting.models import Account, JournalEntry, JournalLine
    from datetime import date
    from dateutil.relativedelta import relativedelta
    import django.utils.timezone as tz

    if not recurring.template_lines:
        raise ValueError("Template has no lines.")

    t = recurring.tenant
    entry = JournalEntry(
        tenant=t,
        date=date.today(),
        description=recurring.name,
        reference_type='manual',
        created_by=triggered_by,
    )
    entry.save()

    for item in recurring.template_lines:
        code = item.get('account_code', '')
        try:
            account = Account.objects.get(tenant=t, code=code)
        except Account.DoesNotExist:
            entry.delete()
            raise ValueError(f"Account code {code!r} not found in Chart of Accounts.")
        JournalLine.objects.create(
            entry=entry,
            account=account,
            debit=Decimal(str(item.get('debit', '0'))),
            credit=Decimal(str(item.get('credit', '0'))),
            description=item.get('description', ''),
        )

    entry.post()

    # Advance next_date
    freq = recurring.frequency
    freq_map = {
        'daily':   relativedelta(days=1),
        'weekly':  relativedelta(weeks=1),
        'monthly': relativedelta(months=1),
        'yearly':  relativedelta(years=1),
    }
    delta = freq_map.get(freq, relativedelta(months=1))
    recurring.next_date  = recurring.next_date + delta
    recurring.last_run_at = tz.now()
    recurring.save(update_fields=['next_date', 'last_run_at'])

    return entry
