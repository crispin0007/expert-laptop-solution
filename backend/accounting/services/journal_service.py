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

    lines : list of (account, debit, credit, description)
    """
    from accounting.models import JournalEntry, JournalLine

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


# ─── Invoice ──────────────────────────────────────────────────────────────────

def create_invoice_journal(invoice, created_by=None):
    """
    Invoice issued:
      Dr  Accounts Receivable   (total)
      Cr  Service Revenue       (subtotal after discount)
      Cr  VAT Payable           (vat_amount)
    """
    tenant = invoice.tenant
    ar      = _get_account(tenant, '1200')
    revenue = _get_account(tenant, '4100')
    vat_pay = _get_account(tenant, '2200')

    lines = [
        (ar,      invoice.total,      Decimal('0'),       f"AR – {invoice.invoice_number}"),
        (revenue, Decimal('0'),       invoice.subtotal,   f"Revenue – {invoice.invoice_number}"),
    ]
    if invoice.vat_amount:
        lines.append(
            (vat_pay, Decimal('0'), invoice.vat_amount, f"VAT – {invoice.invoice_number}")
        )
    return _make_entry(
        tenant, created_by, invoice.created_at.date() if invoice.created_at else timezone.localdate(),
        f"Invoice {invoice.invoice_number} issued",
        'invoice', invoice.pk, lines,
    )


def reverse_invoice_journal(invoice, created_by=None):
    """
    Invoice voided: reverse the original entry (credit AR, debit Revenue/VAT).
    """
    tenant = invoice.tenant
    ar      = _get_account(tenant, '1200')
    revenue = _get_account(tenant, '4100')
    vat_pay = _get_account(tenant, '2200')

    lines = [
        (ar,      Decimal('0'),       invoice.total,      f"VOID AR – {invoice.invoice_number}"),
        (revenue, invoice.subtotal,   Decimal('0'),       f"VOID Revenue – {invoice.invoice_number}"),
    ]
    if invoice.vat_amount:
        lines.append(
            (vat_pay, invoice.vat_amount, Decimal('0'), f"VOID VAT – {invoice.invoice_number}")
        )
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Invoice {invoice.invoice_number} voided (reversal)",
        'invoice', invoice.pk, lines,
    )


# ─── Bill ─────────────────────────────────────────────────────────────────────

def create_bill_journal(bill, created_by=None):
    """
    Bill approved:
      Dr  Expense (5100 COGS or first expense account)   (subtotal)
      Dr  VAT Receivable / Input VAT  (vat_amount) → posted to VAT Payable credit side
      Cr  Accounts Payable            (total)
    Note: Input VAT reduces VAT Payable (debit side).
    """
    tenant  = bill.tenant
    expense = _get_account(tenant, '5100')
    ap      = _get_account(tenant, '2100')
    vat_pay = _get_account(tenant, '2200')

    lines = [
        (expense, bill.subtotal,   Decimal('0'), f"Expense – {bill.bill_number}"),
        (ap,      Decimal('0'),    bill.total,   f"AP – {bill.bill_number}"),
    ]
    if bill.vat_amount:
        # Input VAT: debit VAT Payable (reduces liability)
        lines.append(
            (vat_pay, bill.vat_amount, Decimal('0'), f"Input VAT – {bill.bill_number}")
        )
        # Adjust AP to exclude VAT already debited via VAT Payable offset
        # The AP credit equals total (subtotal + vat); the debit splits across expense+vat_pay
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

    Outgoing payment (we pay supplier bill):
      Dr  Accounts Payable     (amount)
      Cr  Cash / Bank Account  (amount)
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
    else:
        ap = _get_account(tenant, '2100')
        lines = [
            (ap,       payment.amount, Decimal('0'), f"Clear AP – {payment.payment_number}"),
            (cash_acc, Decimal('0'),   payment.amount, f"Payment sent – {payment.payment_number}"),
        ]
        desc = f"Payment sent {payment.payment_number}"

    return _make_entry(
        tenant, created_by, payment.date,
        desc, 'payment', payment.pk, lines,
    )


# ─── Credit Note ─────────────────────────────────────────────────────────────

def create_credit_note_journal(credit_note, created_by=None):
    """
    Credit note issued — reversal of revenue + VAT, reduce AR.
      Dr  Service Revenue  (subtotal)
      Dr  VAT Payable      (vat_amount)
      Cr  Accounts Receivable (total)
    """
    tenant  = credit_note.tenant
    ar      = _get_account(tenant, '1200')
    revenue = _get_account(tenant, '4100')
    vat_pay = _get_account(tenant, '2200')

    lines = [
        (revenue, credit_note.subtotal,   Decimal('0'),             f"CN revenue – {credit_note.credit_note_number}"),
        (ar,      Decimal('0'),           credit_note.total,        f"CN AR – {credit_note.credit_note_number}"),
    ]
    if credit_note.vat_amount:
        lines.append(
            (vat_pay, credit_note.vat_amount, Decimal('0'), f"CN VAT – {credit_note.credit_note_number}")
        )
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Credit Note {credit_note.credit_note_number} issued",
        'credit_note', credit_note.pk, lines,
    )


# ─── Payslip ─────────────────────────────────────────────────────────────────

def create_payslip_journal(payslip, created_by=None):
    """
    Payslip paid:
      Dr  Salary Expense   (net_pay)
      Cr  Cash / Bank      (net_pay)
    """
    tenant   = payslip.tenant
    salary   = _get_account(tenant, '5200')
    cash_acc = _get_account(tenant, '1100')

    amount = payslip.net_pay or payslip.gross_amount
    lines = [
        (salary,   amount,         Decimal('0'), f"Salary – {payslip.staff} {payslip.period_start}"),
        (cash_acc, Decimal('0'),   amount,       f"Paid – {payslip.staff} {payslip.period_start}"),
    ]
    return _make_entry(
        tenant, created_by, timezone.localdate(),
        f"Payslip paid – {payslip.staff} {payslip.period_start}→{payslip.period_end}",
        'payslip', payslip.pk, lines,
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
    ('3000', 'Equity',               'equity',    None,   True),
    ('3100', 'Retained Earnings',    'equity',    '3000', True),
    ('4000', 'Revenue',              'revenue',   None,   True),
    ('4100', 'Service Revenue',      'revenue',   '4000', True),
    ('4200', 'Product Revenue',      'revenue',   '4000', True),
    ('5000', 'Expenses',             'expense',   None,   True),
    ('5100', 'Cost of Goods Sold',   'expense',   '5000', True),
    ('5200', 'Salary Expense',       'expense',   '5000', True),
    ('5300', 'Other Expenses',       'expense',   '5000', True),
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
