"""
report_service.py
=================
Accounting reports derived from posted JournalLines.

All reports return plain Python dicts so views can serialize them directly.
Every report includes a ``period`` block with both BS and AD date info::

    "period": {
        "date_from":    "2024-07-17",
        "date_to":      "2025-07-16",
        "date_from_bs": {"bs": "2081-04-01", "bs_en": "1 Shrawan 2081", ...},
        "date_to_bs":   {"bs": "2082-03-32", "bs_en": "32 Ashadh 2082", ...},
        "fiscal_year":  "2081/082",
    }
"""
from decimal import Decimal
from django.db.models import Sum, Q


def _zero():
    return Decimal('0')


def _period_meta(date_from=None, date_to=None):
    """Return a period block with both AD and BS date information."""
    from core.nepali_date import date_to_bs_display, fiscal_year_of
    meta = {
        'date_from':    str(date_from) if date_from else None,
        'date_to':      str(date_to)   if date_to   else None,
        'date_from_bs': date_to_bs_display(date_from) if date_from else None,
        'date_to_bs':   date_to_bs_display(date_to)   if date_to   else None,
        'fiscal_year':  None,
    }
    # Attach fiscal year label when both dates are provided
    if date_from and date_to:
        try:
            meta['fiscal_year'] = str(fiscal_year_of(date_from))
        except Exception:
            pass
    return meta


def _account_balance(tenant, account_code, date_from=None, date_to=None):
    """
    Net balance for a single account code within a date range, including
    Account.opening_balance so migrated tenants with seeded opening balances
    show correct figures.  Returns debit-normal (dr - cr) for asset/expense
    and credit-normal (cr - dr) for liability/equity/revenue.
    """
    from accounting.models import Account, JournalLine
    try:
        acc = Account.objects.get(tenant=tenant, code=account_code)
    except Account.DoesNotExist:
        return _zero()
    qs = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        account=acc,
    )
    if date_from:
        qs = qs.filter(entry__date__gte=date_from)
    if date_to:
        qs = qs.filter(entry__date__lte=date_to)
    d = qs.aggregate(debit=Sum('debit'), credit=Sum('credit'))
    dr = d['debit']  or _zero()
    cr = d['credit'] or _zero()
    ob = acc.opening_balance or _zero()
    if acc.type in ('asset', 'expense'):
        return ob + dr - cr
    return ob + cr - dr


def _accounts_by_type(tenant, acct_type, date_from=None, date_to=None):
    """
    Return list of {code, name, balance} for all accounts of a given type.
    Balance sign: asset/expense = debit-credit; liability/equity/revenue = credit-debit.

    Includes ALL accounts of the given type — both parent/header accounts and
    leaf accounts — so that journal entries posted to any account in the hierarchy
    always appear in reports.  (Previously leaf-only filtering silently omitted
    entries posted to parent accounts or system accounts that gained custom children.)
    """
    from accounting.models import Account, JournalLine

    accounts = Account.objects.filter(
        tenant=tenant, type=acct_type, is_active=True
    ).order_by('code')  # all accounts, not just leaves

    result = []
    for acc in accounts:
        qs = JournalLine.objects.filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            account=acc,
        )
        if date_from:
            qs = qs.filter(entry__date__gte=date_from)
        if date_to:
            qs = qs.filter(entry__date__lte=date_to)

        d = qs.aggregate(debit=Sum('debit'), credit=Sum('credit'))
        dr = d['debit'] or _zero()
        cr = d['credit'] or _zero()

        # Include Account.opening_balance so migrated tenants with seeded
        # opening balances show correct figures in all reports.
        ob = acc.opening_balance or _zero()
        if acct_type in ('asset', 'expense'):
            balance = ob + dr - cr
        else:
            balance = ob + cr - dr

        result.append({'code': acc.code, 'name': acc.name, 'balance': balance})

    return result


# ─── Profit & Loss ───────────────────────────────────────────────────────────

def profit_and_loss(tenant, date_from, date_to):
    """
    Revenue minus Expenses for the given period.
    """
    revenue_lines  = _accounts_by_type(tenant, 'revenue',  date_from, date_to)
    expense_lines  = _accounts_by_type(tenant, 'expense',  date_from, date_to)

    total_revenue  = sum(r['balance'] for r in revenue_lines)
    total_expenses = sum(e['balance'] for e in expense_lines)
    net_profit     = total_revenue - total_expenses

    return {
        'period':         _period_meta(date_from, date_to),
        'date_from':      str(date_from),
        'date_to':        str(date_to),
        'revenue':        revenue_lines,
        'total_revenue':  total_revenue,
        'expenses':       expense_lines,
        'total_expenses': total_expenses,
        'net_profit':     net_profit,
    }


# ─── Balance Sheet ────────────────────────────────────────────────────────────

def balance_sheet(tenant, as_of_date):
    """
    Assets = Liabilities + Equity.  Cumulative (all dates up to as_of_date).

    Equity includes seeded/contributed capital accounts PLUS current-year net
    earnings (Revenue - Expense up to as_of_date).  Without this, the equation
    won't hold before year-end closing entries are posted.
    """
    assets      = _accounts_by_type(tenant, 'asset',     None, as_of_date)
    liabilities = _accounts_by_type(tenant, 'liability', None, as_of_date)
    equity      = _accounts_by_type(tenant, 'equity',    None, as_of_date)

    total_assets      = sum(a['balance'] for a in assets)
    total_liabilities = sum(l['balance'] for l in liabilities)
    total_equity      = sum(e['balance'] for e in equity)

    # Current-year earnings: Revenue − Expense up to as_of_date.
    # This is the "Retained Earnings (current period)" line that keeps the
    # balance sheet equation intact before formal closing entries are run.
    revenue_lines  = _accounts_by_type(tenant, 'revenue',  None, as_of_date)
    expense_lines  = _accounts_by_type(tenant, 'expense',  None, as_of_date)
    current_earnings = (
        sum(r['balance'] for r in revenue_lines)
        - sum(e['balance'] for e in expense_lines)
    )
    if current_earnings != _zero():
        equity = list(equity) + [{
            'code': 'EARNINGS',
            'name': 'Current Year Earnings',
            'balance': current_earnings,
        }]
        total_equity += current_earnings

    from core.nepali_date import date_to_bs_display
    return {
        'as_of_date':        str(as_of_date),
        'as_of_date_bs':     date_to_bs_display(as_of_date),
        'assets':            assets,
        'total_assets':      total_assets,
        'liabilities':       liabilities,
        'total_liabilities': total_liabilities,
        'equity':            equity,
        'total_equity':      total_equity,
        'balanced':          abs(total_assets - (total_liabilities + total_equity)) < _zero() + Decimal('0.01'),
    }


# ─── Trial Balance ────────────────────────────────────────────────────────────

def trial_balance(tenant, date_from, date_to):
    """All leaf accounts with their debit/credit totals."""
    from accounting.models import Account, JournalLine

    accounts = Account.objects.filter(
        tenant=tenant, is_active=True
    ).order_by('code')

    rows = []
    total_dr = _zero()
    total_cr = _zero()

    for acc in accounts:
        qs = JournalLine.objects.filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            account=acc,
            entry__date__gte=date_from,
            entry__date__lte=date_to,
        )
        d = qs.aggregate(debit=Sum('debit'), credit=Sum('credit'))
        dr = d['debit'] or _zero()
        cr = d['credit'] or _zero()

        # Bring in the account's opening balance so the trial balance
        # reflects all historical balances, not just the period movements.
        ob = acc.opening_balance or _zero()
        if acc.type in ('asset', 'expense'):
            dr += ob
        else:
            cr += ob

        if dr or cr:
            rows.append({'code': acc.code, 'name': acc.name, 'debit': dr, 'credit': cr})
            total_dr += dr
            total_cr += cr

    return {
        'date_from':    str(date_from),
        'date_to':      str(date_to),
        'accounts':     rows,
        'total_debit':  total_dr,
        'total_credit': total_cr,
        'balanced':     total_dr == total_cr,
    }


# ─── Aged Receivables ─────────────────────────────────────────────────────────

def aged_receivables(tenant, as_of_date):
    """Unpaid invoices bucketed by days overdue: current, 1-30, 31-60, 61-90, 90+."""
    from accounting.models import Invoice
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    # Annotate with total paid amount in a single JOIN query to avoid N+1.
    # .amount_due is a @property that calls payments.aggregate() per invoice.
    invoices = Invoice.objects.filter(
        tenant=tenant,
        status=Invoice.STATUS_ISSUED,
    ).select_related('customer').annotate(
        paid_sum=Coalesce(DSum('payments__amount'), Value(Decimal('0')), output_field=DecimalField()),
    )

    buckets = {'current': [], '1_30': [], '31_60': [], '61_90': [], '90_plus': []}

    for inv in invoices:
        due = inv.due_date
        remaining = float(max(inv.total - inv.paid_sum, Decimal('0')))
        entry = {
            'id':             inv.pk,
            'invoice_number': inv.invoice_number,
            'customer':       inv.customer.name if inv.customer else '',
            'due_date':       str(due) if due else None,
            'amount_due':     remaining,
        }
        if not due:
            buckets['current'].append(entry)
            continue
        days_overdue = (as_of_date - due).days
        if days_overdue <= 0:
            buckets['current'].append(entry)
        elif days_overdue <= 30:
            buckets['1_30'].append(entry)
        elif days_overdue <= 60:
            buckets['31_60'].append(entry)
        elif days_overdue <= 90:
            buckets['61_90'].append(entry)
        else:
            buckets['90_plus'].append(entry)

    def _total(bucket):
        return sum(e['amount_due'] for e in bucket if isinstance(e, dict))

    return {
        'as_of_date': str(as_of_date),
        'current':    {'items': buckets['current'],   'total': _total(buckets['current'])},
        '1_30':       {'items': buckets['1_30'],      'total': _total(buckets['1_30'])},
        '31_60':      {'items': buckets['31_60'],     'total': _total(buckets['31_60'])},
        '61_90':      {'items': buckets['61_90'],     'total': _total(buckets['61_90'])},
        '90_plus':    {'items': buckets['90_plus'],   'total': _total(buckets['90_plus'])},
        'grand_total': sum(_total(v) for v in buckets.values()),
    }


# ─── Aged Payables ────────────────────────────────────────────────────────────

def aged_payables(tenant, as_of_date):
    """Unpaid bills bucketed by days overdue."""
    from accounting.models import Bill
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    # Annotate with total paid amount in a single JOIN query to avoid N+1.
    bills = Bill.objects.filter(
        tenant=tenant,
        status=Bill.STATUS_APPROVED,
    ).select_related('supplier').annotate(
        paid_sum=Coalesce(DSum('payments__amount'), Value(Decimal('0')), output_field=DecimalField()),
    )

    buckets = {'current': [], '1_30': [], '31_60': [], '61_90': [], '90_plus': []}

    for bill in bills:
        due = bill.due_date
        remaining = float(max(bill.total - bill.paid_sum, Decimal('0')))
        entry = {
            'id':          bill.pk,
            'bill_number': bill.bill_number,
            'supplier':    bill.supplier.name if bill.supplier else bill.supplier_name,
            'due_date':    str(due) if due else '',
            'amount_due':  remaining,
        }
        if not due or (as_of_date - due).days <= 0:
            buckets['current'].append(entry)
        else:
            days_overdue = (as_of_date - due).days
            if days_overdue <= 30:
                buckets['1_30'].append(entry)
            elif days_overdue <= 60:
                buckets['31_60'].append(entry)
            elif days_overdue <= 90:
                buckets['61_90'].append(entry)
            else:
                buckets['90_plus'].append(entry)

    def _total(bucket):
        return sum(e['amount_due'] for e in bucket)

    return {
        'as_of_date': str(as_of_date),
        'current':    {'items': buckets['current'],   'total': _total(buckets['current'])},
        '1_30':       {'items': buckets['1_30'],      'total': _total(buckets['1_30'])},
        '31_60':      {'items': buckets['31_60'],     'total': _total(buckets['31_60'])},
        '61_90':      {'items': buckets['61_90'],     'total': _total(buckets['61_90'])},
        '90_plus':    {'items': buckets['90_plus'],   'total': _total(buckets['90_plus'])},
        'grand_total': sum(_total(v) for v in buckets.values()),
    }


# ─── VAT Report ───────────────────────────────────────────────────────────────

def vat_report(tenant, period_start, period_end):
    """
    VAT collected on sales (invoices) vs VAT reclaimable on purchases (bills).
    """
    from accounting.models import Invoice, Bill
    from django.db.models import Sum as DSum

    invoices = Invoice.objects.filter(
        tenant=tenant,
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID],
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )
    bills = Bill.objects.filter(
        tenant=tenant,
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    )

    vat_collected   = invoices.aggregate(t=DSum('vat_amount'))['t'] or _zero()
    vat_reclaimable = bills.aggregate(t=DSum('vat_amount'))['t']    or _zero()
    vat_payable     = vat_collected - vat_reclaimable

    return {
        'period':          _period_meta(period_start, period_end),
        'period_start':    str(period_start),
        'period_end':      str(period_end),
        'vat_collected':   vat_collected,   # from sales
        'vat_reclaimable': vat_reclaimable, # from purchases (input VAT)
        'vat_payable':     vat_payable,     # net amount to pay to tax authority
        'invoice_count':   invoices.count(),
        'bill_count':      bills.count(),
    }


# ─── Cash Flow ────────────────────────────────────────────────────────────────

def cash_flow(tenant, date_from, date_to):
    """Inflows and outflows from Payment records."""
    from accounting.models import Payment
    from django.db.models import Sum as DSum

    # credit_note payments are accounting settlements with no actual cash movement.
    # Exclude them so the cash flow statement reflects only real money in/out.
    payments = Payment.objects.filter(
        tenant=tenant,
        date__gte=date_from,
        date__lte=date_to,
    ).exclude(method='credit_note')

    incoming = payments.filter(type='incoming').aggregate(t=DSum('amount'))['t'] or _zero()
    outgoing = payments.filter(type='outgoing').aggregate(t=DSum('amount'))['t'] or _zero()

    by_method = {}
    for p in payments:
        by_method.setdefault(p.method, {'incoming': _zero(), 'outgoing': _zero()})
        by_method[p.method][p.type] += p.amount

    return {
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'total_incoming': incoming,
        'total_outgoing': outgoing,
        'net_cash_flow':  incoming - outgoing,
        'by_method':      [
            {'method': k, 'incoming': v['incoming'], 'outgoing': v['outgoing']}
            for k, v in by_method.items()
        ],
    }


# ─── Ledger Report ───────────────────────────────────────────────────────────────

def ledger_report(tenant, account_code, date_from, date_to):
    """
    Full transaction history for a single account within a date range.
    Returns rows sorted by date with running balance.
    """
    from accounting.models import Account, JournalLine

    try:
        account = Account.objects.get(tenant=tenant, code=account_code)
    except Account.DoesNotExist:
        return {'error': f'Account {account_code!r} not found'}

    lines = (
        JournalLine.objects
        .filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            account=account,
            entry__date__gte=date_from,
            entry__date__lte=date_to,
        )
        .select_related('entry')
        .order_by('entry__date', 'entry__id')
    )

    # Opening balance: all posted movements BEFORE date_from
    pre = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        account=account,
        entry__date__lt=date_from,
    ).aggregate(debit=Sum('debit'), credit=Sum('credit'))
    pre_dr = pre['debit']  or _zero()
    pre_cr = pre['credit'] or _zero()
    if account.type in ('asset', 'expense'):
        opening = pre_dr - pre_cr
    else:
        opening = pre_cr - pre_dr
    opening += account.opening_balance

    rows    = []
    running = opening
    for line in lines:
        if account.type in ('asset', 'expense'):
            running += line.debit - line.credit
        else:
            running += line.credit - line.debit
        rows.append({
            'date':         str(line.entry.date),
            'entry_number': line.entry.entry_number,
            'description':  line.description or line.entry.description,
            'debit':        line.debit,
            'credit':       line.credit,
            'balance':      running,
        })

    return {
        'account_code':  account.code,
        'account_name':  account.name,
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'opening_balance': opening,
        'closing_balance': running,
        'transactions':  rows,
    }


# ─── Day Book ────────────────────────────────────────────────────────────────────

def day_book(tenant, date):
    """
    All posted journal entries for a specific date with their lines.
    Equivalent to Tally's Day Book—useful for daily review and printing.
    """
    from accounting.models import JournalEntry

    entries = (
        JournalEntry.objects
        .filter(tenant=tenant, is_posted=True, date=date)
        .prefetch_related('lines__account')
        .order_by('entry_number')
    )

    result = []
    total_dr = _zero()
    total_cr = _zero()

    for entry in entries:
        lines = [
            {
                'account_code': line.account.code,
                'account_name': line.account.name,
                'description':  line.description,
                'debit':        line.debit,
                'credit':       line.credit,
            }
            for line in entry.lines.all()
        ]
        entry_dr = sum(l['debit']  for l in lines)
        entry_cr = sum(l['credit'] for l in lines)
        total_dr += entry_dr
        total_cr += entry_cr
        result.append({
            'entry_number':  entry.entry_number,
            'description':   entry.description,
            'reference_type': entry.reference_type,
            'total_debit':   entry_dr,
            'total_credit':  entry_cr,
            'lines':         lines,
        })

    return {
        'date':         str(date),
        'entries':      result,
        'total_debit':  total_dr,
        'total_credit': total_cr,
        'entry_count':  len(result),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 1 — GL Reports (General Ledger)
# ═════════════════════════════════════════════════════════════════════════════

def gl_summary(tenant, date_from, date_to):
    """
    General Ledger Summary — account balances grouped by type for the period.
    Returns each account type (asset/liability/equity/revenue/expense) with
    its constituent accounts and sub-total.
    """
    ACCT_TYPES = [
        ('asset',     'Assets'),
        ('liability', 'Liabilities'),
        ('equity',    'Capital / Equity'),
        ('revenue',   'Revenue'),
        ('expense',   'Expenses'),
    ]
    groups = {}
    for code, label in ACCT_TYPES:
        rows = _accounts_by_type(tenant, code, date_from, date_to)
        rows = [r for r in rows if r['balance']]  # omit zero-balance accounts
        total = sum(r['balance'] for r in rows)
        groups[code] = {'label': label, 'rows': rows, 'total': total}

    return {
        'period':   _period_meta(date_from, date_to),
        'date_from': str(date_from),
        'date_to':   str(date_to),
        'groups':    groups,
    }


def gl_master(tenant, date_from, date_to):
    """
    GL Master Report — every account with opening balance, period movements
    (debit/credit), and closing balance.  Mirrors Tally's Account Summary.
    """
    from accounting.models import Account, JournalLine
    from django.db.models import Sum

    accounts = Account.objects.filter(
        tenant=tenant, is_active=True
    ).order_by('type', 'code')

    rows = []
    for acc in accounts:
        # Period movements
        qs = JournalLine.objects.filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            account=acc,
            entry__date__gte=date_from,
            entry__date__lte=date_to,
        )
        d = qs.aggregate(debit=Sum('debit'), credit=Sum('credit'))
        dr = d['debit']  or _zero()
        cr = d['credit'] or _zero()
        ob = acc.opening_balance or _zero()

        if acc.type in ('asset', 'expense'):
            closing = ob + dr - cr
        else:
            closing = ob + cr - dr

        if not (ob or dr or cr or closing):
            continue  # skip completely untouched accounts

        rows.append({
            'code':             acc.code,
            'name':             acc.name,
            'type':             acc.type,
            'opening_balance':  ob,
            'period_debit':     dr,
            'period_credit':    cr,
            'closing_balance':  closing,
        })

    return {
        'period':   _period_meta(date_from, date_to),
        'date_from': str(date_from),
        'date_to':   str(date_to),
        'accounts':  rows,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 2 — Receivable Reports
# ═════════════════════════════════════════════════════════════════════════════

def customer_receivable_summary(tenant, as_of_date):
    """
    Per-customer summary: total invoiced, total collected, outstanding balance.
    Only invoices with status=issued|paid are included.
    Uses ORM annotation to avoid N+1 on amount_paid.
    """
    from accounting.models import Invoice
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    invoices = (
        Invoice.objects
        .filter(tenant=tenant, status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID],
                created_at__date__lte=as_of_date)
        .select_related('customer')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
    )

    summary: dict = {}
    for inv in invoices:
        cname = inv.customer.name if inv.customer else '(No Customer)'
        cid   = inv.customer_id or 0
        if cid not in summary:
            summary[cid] = {
                'customer_id':   cid,
                'customer_name': cname,
                'total_invoiced': _zero(),
                'total_paid':     _zero(),
                'outstanding':    _zero(),
                'invoice_count':  0,
            }
        outstanding = max(inv.total - inv.paid_sum, _zero())
        summary[cid]['total_invoiced'] += inv.total
        summary[cid]['total_paid']     += inv.paid_sum
        summary[cid]['outstanding']    += outstanding
        summary[cid]['invoice_count']  += 1

    rows = sorted(summary.values(), key=lambda r: r['outstanding'], reverse=True)
    grand_outstanding = sum(r['outstanding'] for r in rows)
    grand_invoiced    = sum(r['total_invoiced'] for r in rows)

    return {
        'as_of_date':     str(as_of_date),
        'rows':           rows,
        'grand_invoiced': grand_invoiced,
        'grand_paid':     grand_invoiced - grand_outstanding,
        'grand_outstanding': grand_outstanding,
    }


def invoice_age_detail(tenant, as_of_date):
    """
    Invoice Age — every outstanding invoice with customer, amount, due_date,
    days overdue and ageing bucket.  More granular than aged_receivables.
    """
    from accounting.models import Invoice
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    invoices = (
        Invoice.objects
        .filter(tenant=tenant, status=Invoice.STATUS_ISSUED,
                created_at__date__lte=as_of_date)
        .select_related('customer')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
        .order_by('due_date', 'created_at')
    )

    rows = []
    for inv in invoices:
        outstanding = float(max(inv.total - inv.paid_sum, _zero()))
        if outstanding <= 0:
            continue
        due = inv.due_date
        days = (as_of_date - due).days if due else 0
        if days <= 0:
            bucket = 'current'
        elif days <= 30:
            bucket = '1_30'
        elif days <= 60:
            bucket = '31_60'
        elif days <= 90:
            bucket = '61_90'
        else:
            bucket = '90_plus'
        rows.append({
            'invoice_number': inv.invoice_number,
            'customer':       inv.customer.name if inv.customer else '',
            'date':           str(inv.created_at.date()),
            'due_date':       str(due) if due else None,
            'days_overdue':   max(days, 0),
            'total':          float(inv.total),
            'paid':           float(inv.paid_sum),
            'outstanding':    outstanding,
            'bucket':         bucket,
        })

    return {
        'as_of_date': str(as_of_date),
        'rows':       rows,
        'grand_total': sum(r['outstanding'] for r in rows),
    }


def customer_statement(tenant, customer_id, date_from, date_to):
    """
    Customer Statement — full AR ledger for one customer in the period.
    Shows opening balance, every invoice/payment/credit note, running balance.
    """
    from accounting.models import Invoice, Payment, CreditNote
    from customers.models import Customer
    from django.db.models import Sum as DSum

    try:
        customer = Customer.objects.get(tenant=tenant, pk=customer_id)
    except Customer.DoesNotExist:
        raise ValueError(f"Customer {customer_id} not found")

    # Opening balance before date_from
    inv_before = Invoice.objects.filter(
        tenant=tenant, customer=customer,
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID],
        created_at__date__lt=date_from,
    ).aggregate(t=DSum('total'))['t'] or _zero()

    pay_before = Payment.objects.filter(
        tenant=tenant, invoice__customer=customer,
        type=Payment.TYPE_INCOMING,
        date__lt=date_from,
    ).exclude(method='credit_note').aggregate(t=DSum('amount'))['t'] or _zero()

    cn_before = CreditNote.objects.filter(
        tenant=tenant, invoice__customer=customer,
        status__in=[CreditNote.STATUS_ISSUED, CreditNote.STATUS_APPLIED],
        created_at__date__lt=date_from,
    ).aggregate(t=DSum('total'))['t'] or _zero()

    opening_balance = inv_before - pay_before - cn_before

    # Collect transactions in period
    txns = []

    for inv in Invoice.objects.filter(
        tenant=tenant, customer=customer,
        created_at__date__gte=date_from, created_at__date__lte=date_to,
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID, Invoice.STATUS_VOID],
    ).order_by('created_at'):
        txns.append({
            'sort_key': inv.created_at.isoformat(),
            'date':      str(inv.created_at.date()),
            'type':      'invoice',
            'reference': inv.invoice_number,
            'description': f"Invoice {inv.invoice_number}",
            'debit':     inv.total if inv.status != Invoice.STATUS_VOID else _zero(),
            'credit':    _zero(),
        })

    for pay in Payment.objects.filter(
        tenant=tenant, invoice__customer=customer,
        type=Payment.TYPE_INCOMING,
        date__gte=date_from, date__lte=date_to,
    ).exclude(method='credit_note').select_related('invoice').order_by('date', 'created_at'):
        inv_ref = f" — Inv {pay.invoice.invoice_number}" if pay.invoice else ''
        txns.append({
            'sort_key': str(pay.date),
            'date':      str(pay.date),
            'type':      'payment',
            'reference': pay.payment_number,
            'description': f"Payment {pay.payment_number}{inv_ref}",
            'debit':     _zero(),
            'credit':    pay.amount,
        })

    for cn in CreditNote.objects.filter(
        tenant=tenant, invoice__customer=customer,
        status__in=[CreditNote.STATUS_ISSUED, CreditNote.STATUS_APPLIED],
        created_at__date__gte=date_from, created_at__date__lte=date_to,
    ).select_related('invoice').order_by('created_at'):
        inv_ref = f" — Inv {cn.invoice.invoice_number}" if cn.invoice else ''
        txns.append({
            'sort_key': cn.created_at.isoformat(),
            'date':      str(cn.created_at.date()),
            'type':      'credit_note',
            'reference': cn.credit_note_number,
            'description': f"Credit Note {cn.credit_note_number}{inv_ref}",
            'debit':     _zero(),
            'credit':    cn.total,
        })

    txns.sort(key=lambda x: x['sort_key'])
    running = opening_balance
    for t in txns:
        running = running + t['debit'] - t['credit']
        t['balance'] = running
        del t['sort_key']

    return {
        'period':          _period_meta(date_from, date_to),
        'customer':        {'id': customer.pk, 'name': customer.name,
                            'email': customer.email, 'phone': customer.phone},
        'opening_balance': opening_balance,
        'closing_balance': running,
        'transactions':    txns,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 3 — Payable Reports
# ═════════════════════════════════════════════════════════════════════════════

def supplier_payable_summary(tenant, as_of_date):
    """
    Per-supplier summary: total billed, total paid, outstanding balance.
    """
    from accounting.models import Bill
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    bills = (
        Bill.objects
        .filter(tenant=tenant,
                status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
                created_at__date__lte=as_of_date)
        .select_related('supplier')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
    )

    summary: dict = {}
    for bill in bills:
        sname = bill.supplier.name if bill.supplier else bill.supplier_name or '(No Supplier)'
        sid   = bill.supplier_id or 0
        if sid not in summary:
            summary[sid] = {
                'supplier_id':   sid,
                'supplier_name': sname,
                'total_billed':  _zero(),
                'total_paid':    _zero(),
                'outstanding':   _zero(),
                'bill_count':    0,
            }
        outstanding = max(bill.total - bill.paid_sum, _zero())
        summary[sid]['total_billed']  += bill.total
        summary[sid]['total_paid']    += bill.paid_sum
        summary[sid]['outstanding']   += outstanding
        summary[sid]['bill_count']    += 1

    rows = sorted(summary.values(), key=lambda r: r['outstanding'], reverse=True)
    grand_outstanding = sum(r['outstanding'] for r in rows)

    return {
        'as_of_date':        str(as_of_date),
        'rows':              rows,
        'grand_billed':      sum(r['total_billed'] for r in rows),
        'grand_paid':        sum(r['total_paid'] for r in rows),
        'grand_outstanding': grand_outstanding,
    }


def bill_age_detail(tenant, as_of_date):
    """
    Bill Age — every outstanding bill with supplier, amount, due_date, days overdue.
    """
    from accounting.models import Bill
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    bills = (
        Bill.objects
        .filter(tenant=tenant, status=Bill.STATUS_APPROVED,
                created_at__date__lte=as_of_date)
        .select_related('supplier')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
        .order_by('due_date', 'created_at')
    )

    rows = []
    for bill in bills:
        outstanding = float(max(bill.total - bill.paid_sum, _zero()))
        if outstanding <= 0:
            continue
        due = bill.due_date
        days = (as_of_date - due).days if due else 0
        if days <= 0:
            bucket = 'current'
        elif days <= 30:
            bucket = '1_30'
        elif days <= 60:
            bucket = '31_60'
        elif days <= 90:
            bucket = '61_90'
        else:
            bucket = '90_plus'
        sname = bill.supplier.name if bill.supplier else bill.supplier_name
        rows.append({
            'bill_number': bill.bill_number,
            'supplier':    sname,
            'date':        str(bill.created_at.date()),
            'due_date':    str(due) if due else None,
            'days_overdue': max(days, 0),
            'total':       float(bill.total),
            'paid':        float(bill.paid_sum),
            'outstanding': outstanding,
            'bucket':      bucket,
        })

    return {
        'as_of_date': str(as_of_date),
        'rows':       rows,
        'grand_total': sum(r['outstanding'] for r in rows),
    }


def supplier_statement(tenant, supplier_id, date_from, date_to):
    """
    Supplier Statement — full AP ledger for one supplier in the period.
    """
    from accounting.models import Bill, Payment, DebitNote
    from inventory.models import Supplier
    from django.db.models import Sum as DSum

    try:
        supplier = Supplier.objects.get(tenant=tenant, pk=supplier_id)
    except Supplier.DoesNotExist:
        raise ValueError(f"Supplier {supplier_id} not found")

    # Opening balance (bills approved before date_from minus payments)
    bill_before = Bill.objects.filter(
        tenant=tenant, supplier=supplier,
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
        created_at__date__lt=date_from,
    ).aggregate(t=DSum('total'))['t'] or _zero()

    pay_before = Payment.objects.filter(
        tenant=tenant, bill__supplier=supplier,
        type=Payment.TYPE_OUTGOING,
        date__lt=date_from,
    ).aggregate(t=DSum('amount'))['t'] or _zero()

    dn_before = DebitNote.objects.filter(
        tenant=tenant, bill__supplier=supplier,
        status__in=[DebitNote.STATUS_ISSUED, DebitNote.STATUS_APPLIED],
        created_at__date__lt=date_from,
    ).aggregate(t=DSum('total'))['t'] or _zero()

    opening_balance = bill_before - pay_before - dn_before

    txns = []

    for bill in Bill.objects.filter(
        tenant=tenant, supplier=supplier,
        created_at__date__gte=date_from, created_at__date__lte=date_to,
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID, Bill.STATUS_VOID],
    ).order_by('created_at'):
        txns.append({
            'sort_key':    bill.created_at.isoformat(),
            'date':        str(bill.created_at.date()),
            'type':        'bill',
            'reference':   bill.bill_number,
            'description': f"Bill {bill.bill_number}",
            'debit':   bill.total if bill.status != Bill.STATUS_VOID else _zero(),
            'credit':  _zero(),
        })

    for pay in Payment.objects.filter(
        tenant=tenant, bill__supplier=supplier,
        type=Payment.TYPE_OUTGOING,
        date__gte=date_from, date__lte=date_to,
    ).select_related('bill').order_by('date', 'created_at'):
        bill_ref = f" — Bill {pay.bill.bill_number}" if pay.bill else ''
        txns.append({
            'sort_key':    str(pay.date),
            'date':        str(pay.date),
            'type':        'payment',
            'reference':   pay.payment_number,
            'description': f"Payment {pay.payment_number}{bill_ref}",
            'debit':   _zero(),
            'credit':  pay.amount,
        })

    for dn in DebitNote.objects.filter(
        tenant=tenant, bill__supplier=supplier,
        status__in=[DebitNote.STATUS_ISSUED, DebitNote.STATUS_APPLIED],
        created_at__date__gte=date_from, created_at__date__lte=date_to,
    ).select_related('bill').order_by('created_at'):
        bill_ref = f" — Bill {dn.bill.bill_number}" if dn.bill else ''
        txns.append({
            'sort_key':    dn.created_at.isoformat(),
            'date':        str(dn.created_at.date()),
            'type':        'debit_note',
            'reference':   dn.debit_note_number,
            'description': f"Debit Note {dn.debit_note_number}{bill_ref}",
            'debit':   _zero(),
            'credit':  dn.total,
        })

    txns.sort(key=lambda x: x['sort_key'])
    running = opening_balance
    for t in txns:
        running = running + t['debit'] - t['credit']
        t['balance'] = running
        del t['sort_key']

    return {
        'period':          _period_meta(date_from, date_to),
        'supplier':        {'id': supplier.pk, 'name': supplier.name},
        'opening_balance': opening_balance,
        'closing_balance': running,
        'transactions':    txns,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 4 — Sales Reports
# ═════════════════════════════════════════════════════════════════════════════

def _active_invoices(tenant, date_from, date_to):
    """Invoices with status=issued|paid in the period (helper)."""
    from accounting.models import Invoice
    return Invoice.objects.filter(
        tenant=tenant,
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID],
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    )


def sales_by_customer(tenant, date_from, date_to):
    """Invoice totals grouped by customer for the period."""
    from django.db.models import Sum as DSum, Count, Value, DecimalField
    from django.db.models.functions import Coalesce

    qs = (
        _active_invoices(tenant, date_from, date_to)
        .select_related('customer')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
    )

    summary: dict = {}
    for inv in qs:
        cname = inv.customer.name if inv.customer else '(No Customer)'
        cid   = inv.customer_id or 0
        if cid not in summary:
            summary[cid] = {
                'customer_id':   cid,
                'customer_name': cname,
                'subtotal':      _zero(),
                'discount':      _zero(),
                'vat_amount':    _zero(),
                'total':         _zero(),
                'paid':          _zero(),
                'outstanding':   _zero(),
                'invoice_count': 0,
            }
            outstanding = max(inv.total - inv.paid_sum, _zero())
        summary[cid]['subtotal']      += inv.subtotal
        summary[cid]['discount']      += inv.discount
        summary[cid]['vat_amount']    += inv.vat_amount
        summary[cid]['total']         += inv.total
        summary[cid]['paid']          += inv.paid_sum
        summary[cid]['outstanding']   += outstanding
        summary[cid]['invoice_count'] += 1

    rows = sorted(summary.values(), key=lambda r: r['total'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'rows':        rows,
        'grand_total': sum(r['total'] for r in rows),
        'grand_vat':   sum(r['vat_amount'] for r in rows),
    }


def sales_by_item(tenant, date_from, date_to):
    """Invoice line-item totals grouped by item description/product."""
    from collections import defaultdict

    items: dict = defaultdict(lambda: {
        'description': '', 'total_qty': Decimal('0'),
        'total_amount': _zero(), 'invoice_count': 0,
    })

    for inv in _active_invoices(tenant, date_from, date_to):
        for line in (inv.line_items or []):
            key  = line.get('product_name') or line.get('description') or 'Unspecified'
            qty  = Decimal(str(line.get('qty') or line.get('quantity') or 0))
            amt  = Decimal(str(line.get('amount') or 0))
            items[key]['description']  = key
            items[key]['total_qty']   += qty
            items[key]['total_amount'] += amt
            items[key]['invoice_count'] += 1

    rows = sorted(items.values(), key=lambda r: r['total_amount'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'rows':        rows,
        'grand_total': sum(r['total_amount'] for r in rows),
    }


def sales_by_customer_monthly(tenant, date_from, date_to):
    """Monthly sales totals per customer (pivot table)."""
    from collections import defaultdict

    qs = _active_invoices(tenant, date_from, date_to).select_related('customer')

    data: dict    = defaultdict(lambda: defaultdict(_zero))
    months_set: set = set()

    for inv in qs:
        cname = inv.customer.name if inv.customer else '(No Customer)'
        m = f"{inv.created_at.year}-{inv.created_at.month:02d}"
        data[cname][m] += inv.total
        months_set.add(m)

    months = sorted(months_set)
    rows   = []
    for cname, mdata in sorted(data.items()):
        row = {'customer': cname}
        total = _zero()
        for m in months:
            row[m] = mdata.get(m, _zero())
            total += row[m]
        row['total'] = total
        rows.append(row)

    rows.sort(key=lambda r: r['total'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'months':      months,
        'rows':        rows,
        'grand_total': sum(r['total'] for r in rows),
    }


def sales_by_item_monthly(tenant, date_from, date_to):
    """Monthly sales totals per item (pivot table)."""
    from collections import defaultdict

    data: dict    = defaultdict(lambda: defaultdict(_zero))
    months_set: set = set()

    for inv in _active_invoices(tenant, date_from, date_to):
        m = f"{inv.created_at.year}-{inv.created_at.month:02d}"
        for line in (inv.line_items or []):
            key = line.get('product_name') or line.get('description') or 'Unspecified'
            amt = Decimal(str(line.get('amount') or 0))
            data[key][m] += amt
            months_set.add(m)

    months = sorted(months_set)
    rows   = []
    for key, mdata in sorted(data.items()):
        row = {'item': key}
        total = _zero()
        for m in months:
            row[m] = mdata.get(m, _zero())
            total += row[m]
        row['total'] = total
        rows.append(row)

    rows.sort(key=lambda r: r['total'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'months':      months,
        'rows':        rows,
        'grand_total': sum(r['total'] for r in rows),
    }


def sales_master(tenant, date_from, date_to):
    """
    Sales Master Report — every invoice with full detail:
    number, date, customer, PAX/VAT no, subtotal, discount, VAT, total, status.
    """
    qs = (
        _active_invoices(tenant, date_from, date_to)
        .select_related('customer')
        .order_by('created_at')
    )

    rows = []
    for inv in qs:
        rows.append({
            'invoice_number': inv.invoice_number,
            'date':           str(inv.created_at.date()),
            'customer':       inv.customer.name if inv.customer else '',
            'pan_vat':        inv.customer.vat_number if inv.customer else '',
            'subtotal':       inv.subtotal,
            'discount':       inv.discount,
            'vat_amount':     inv.vat_amount,
            'total':          inv.total,
            'status':         inv.status,
            'reference':      inv.reference,
        })

    return {
        'period':      _period_meta(date_from, date_to),
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'rows':        rows,
        'grand_subtotal': sum(r['subtotal'] for r in rows),
        'grand_discount': sum(r['discount'] for r in rows),
        'grand_vat':      sum(r['vat_amount'] for r in rows),
        'grand_total':    sum(r['total'] for r in rows),
        'invoice_count':  len(rows),
    }


def sales_summary(tenant, date_from, date_to):
    """
    Sales Summary — aggregate KPIs: total invoiced, collected, outstanding,
    VAT, average invoice value, invoice count, top 5 customers.
    """
    from django.db.models import Sum as DSum, Count, Avg, Value, DecimalField
    from django.db.models.functions import Coalesce

    qs = (
        _active_invoices(tenant, date_from, date_to)
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
    )

    total_invoiced  = _zero()
    total_collected = _zero()
    total_vat       = _zero()

    for inv in qs:
        total_invoiced  += inv.total
        total_collected += inv.paid_sum
        total_vat       += inv.vat_amount

    count = qs.count()
    avg_invoice = (total_invoiced / count) if count else _zero()

    # Top 5 by revenue
    from collections import defaultdict
    by_cust: dict = defaultdict(_zero)
    for inv in (
        _active_invoices(tenant, date_from, date_to)
        .select_related('customer')
    ):
        cname = inv.customer.name if inv.customer else '(No Customer)'
        by_cust[cname] += inv.total

    top5 = sorted(
        [{'customer': k, 'total': v} for k, v in by_cust.items()],
        key=lambda r: r['total'], reverse=True
    )[:5]

    return {
        'period':         _period_meta(date_from, date_to),
        'date_from':      str(date_from),
        'date_to':        str(date_to),
        'total_invoiced': total_invoiced,
        'total_collected': total_collected,
        'total_outstanding': total_invoiced - total_collected,
        'total_vat':      total_vat,
        'invoice_count':  count,
        'avg_invoice_value': avg_invoice,
        'top_customers':  top5,
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 5 — Purchase Reports
# ═════════════════════════════════════════════════════════════════════════════

def _active_bills(tenant, date_from, date_to):
    """Bills with status=approved|paid in the period (helper)."""
    from accounting.models import Bill
    return Bill.objects.filter(
        tenant=tenant,
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    )


def purchase_by_supplier(tenant, date_from, date_to):
    """Bill totals grouped by supplier."""
    from django.db.models import Sum as DSum, Value, DecimalField
    from django.db.models.functions import Coalesce

    qs = (
        _active_bills(tenant, date_from, date_to)
        .select_related('supplier')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
    )

    summary: dict = {}
    for bill in qs:
        sname = bill.supplier.name if bill.supplier else bill.supplier_name or '(No Supplier)'
        sid   = bill.supplier_id or 0
        if sid not in summary:
            summary[sid] = {
                'supplier_id':   sid,
                'supplier_name': sname,
                'subtotal':      _zero(),
                'vat_amount':    _zero(),
                'total':         _zero(),
                'paid':          _zero(),
                'outstanding':   _zero(),
                'bill_count':    0,
            }
        outstanding = max(bill.total - bill.paid_sum, _zero())
        summary[sid]['subtotal']    += bill.subtotal
        summary[sid]['vat_amount']  += bill.vat_amount
        summary[sid]['total']       += bill.total
        summary[sid]['paid']        += bill.paid_sum
        summary[sid]['outstanding'] += outstanding
        summary[sid]['bill_count']  += 1

    rows = sorted(summary.values(), key=lambda r: r['total'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'rows':        rows,
        'grand_total': sum(r['total'] for r in rows),
        'grand_vat':   sum(r['vat_amount'] for r in rows),
    }


def purchase_by_item(tenant, date_from, date_to):
    """Bill line-item totals grouped by description."""
    from collections import defaultdict

    items: dict = defaultdict(lambda: {
        'description': '', 'total_qty': Decimal('0'),
        'total_amount': _zero(), 'bill_count': 0,
    })

    for bill in _active_bills(tenant, date_from, date_to):
        for line in (bill.line_items or []):
            key = line.get('product_name') or line.get('description') or 'Unspecified'
            qty = Decimal(str(line.get('qty') or line.get('quantity') or 0))
            amt = Decimal(str(line.get('amount') or 0))
            items[key]['description']  = key
            items[key]['total_qty']   += qty
            items[key]['total_amount'] += amt
            items[key]['bill_count']   += 1

    rows = sorted(items.values(), key=lambda r: r['total_amount'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'rows':        rows,
        'grand_total': sum(r['total_amount'] for r in rows),
    }


def purchase_by_supplier_monthly(tenant, date_from, date_to):
    """Monthly purchase totals per supplier (pivot table)."""
    from collections import defaultdict

    qs = _active_bills(tenant, date_from, date_to).select_related('supplier')
    data: dict    = defaultdict(lambda: defaultdict(_zero))
    months_set: set = set()

    for bill in qs:
        sname = bill.supplier.name if bill.supplier else bill.supplier_name or '(No Supplier)'
        m = f"{bill.created_at.year}-{bill.created_at.month:02d}"
        data[sname][m] += bill.total
        months_set.add(m)

    months = sorted(months_set)
    rows   = []
    for sname, mdata in sorted(data.items()):
        row = {'supplier': sname}
        total = _zero()
        for m in months:
            row[m] = mdata.get(m, _zero())
            total += row[m]
        row['total'] = total
        rows.append(row)

    rows.sort(key=lambda r: r['total'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'months':      months,
        'rows':        rows,
        'grand_total': sum(r['total'] for r in rows),
    }


def purchase_by_item_monthly(tenant, date_from, date_to):
    """Monthly purchase totals per item (pivot table)."""
    from collections import defaultdict

    data: dict    = defaultdict(lambda: defaultdict(_zero))
    months_set: set = set()

    for bill in _active_bills(tenant, date_from, date_to):
        m = f"{bill.created_at.year}-{bill.created_at.month:02d}"
        for line in (bill.line_items or []):
            key = line.get('product_name') or line.get('description') or 'Unspecified'
            amt = Decimal(str(line.get('amount') or 0))
            data[key][m] += amt
            months_set.add(m)

    months = sorted(months_set)
    rows   = []
    for key, mdata in sorted(data.items()):
        row = {'item': key}
        total = _zero()
        for m in months:
            row[m] = mdata.get(m, _zero())
            total += row[m]
        row['total'] = total
        rows.append(row)

    rows.sort(key=lambda r: r['total'], reverse=True)
    return {
        'period':      _period_meta(date_from, date_to),
        'months':      months,
        'rows':        rows,
        'grand_total': sum(r['total'] for r in rows),
    }


def purchase_master(tenant, date_from, date_to):
    """Purchase Master — every bill with full detail."""
    qs = (
        _active_bills(tenant, date_from, date_to)
        .select_related('supplier')
        .order_by('created_at')
    )

    rows = []
    for bill in qs:
        rows.append({
            'bill_number': bill.bill_number,
            'date':        str(bill.created_at.date()),
            'supplier':    bill.supplier.name if bill.supplier else bill.supplier_name,
            'subtotal':    bill.subtotal,
            'discount':    bill.discount,
            'vat_amount':  bill.vat_amount,
            'total':       bill.total,
            'status':      bill.status,
            'reference':   bill.reference,
        })

    return {
        'period':         _period_meta(date_from, date_to),
        'date_from':      str(date_from),
        'date_to':        str(date_to),
        'rows':           rows,
        'grand_subtotal': sum(r['subtotal'] for r in rows),
        'grand_vat':      sum(r['vat_amount'] for r in rows),
        'grand_total':    sum(r['total'] for r in rows),
        'bill_count':     len(rows),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 6 — Tax / IRD Reports  (Nepal)
# ═════════════════════════════════════════════════════════════════════════════

def sales_register(tenant, date_from, date_to):
    """
    Sales Register (VAT Register) — all issued/paid invoices in period
    with buyer VAT/PAN, taxable amount and VAT column.
    Format matches Nepal IRD sales register requirements.
    """
    from core.nepali_date import date_to_bs_display

    qs = (
        _active_invoices(tenant, date_from, date_to)
        .select_related('customer')
        .order_by('created_at')
    )

    rows = []
    for i, inv in enumerate(qs, start=1):
        bs_info = date_to_bs_display(inv.created_at.date())
        rows.append({
            'sno':            i,
            'date_ad':        str(inv.created_at.date()),
            'date_bs':        bs_info.get('bs') if bs_info else None,
            'invoice_number': inv.invoice_number,
            'buyer_name':     inv.customer.name if inv.customer else '',
            'buyer_pan':      inv.customer.vat_number or inv.customer.pan_number if inv.customer else '',
            'taxable_amount': inv.subtotal - inv.discount,
            'vat_amount':     inv.vat_amount,
            'total':          inv.total,
        })

    return {
        'period':             _period_meta(date_from, date_to),
        'date_from':          str(date_from),
        'date_to':            str(date_to),
        'rows':               rows,
        'total_taxable':      sum(r['taxable_amount'] for r in rows),
        'total_vat':          sum(r['vat_amount'] for r in rows),
        'total_amount':       sum(r['total'] for r in rows),
        'invoice_count':      len(rows),
    }


def sales_return_register(tenant, date_from, date_to):
    """
    Sales Return Register — all issued/applied credit notes in period.
    IRD requires a separate register for sales returns.
    """
    from accounting.models import CreditNote
    from core.nepali_date import date_to_bs_display

    qs = (
        CreditNote.objects
        .filter(tenant=tenant,
                status__in=[CreditNote.STATUS_ISSUED, CreditNote.STATUS_APPLIED],
                created_at__date__gte=date_from,
                created_at__date__lte=date_to)
        .select_related('invoice__customer')
        .order_by('created_at')
    )

    rows = []
    for i, cn in enumerate(qs, start=1):
        customer = cn.invoice.customer if cn.invoice else None
        bs_info  = date_to_bs_display(cn.created_at.date())
        rows.append({
            'sno':             i,
            'date_ad':         str(cn.created_at.date()),
            'date_bs':         bs_info.get('bs') if bs_info else None,
            'credit_note_no':  cn.credit_note_number,
            'original_invoice': cn.invoice.invoice_number if cn.invoice else '',
            'buyer_name':      customer.name if customer else '',
            'buyer_pan':       customer.vat_number or customer.pan_number if customer else '',
            'taxable_amount':  cn.subtotal,
            'vat_amount':      cn.vat_amount,
            'total':           cn.total,
        })

    return {
        'period':        _period_meta(date_from, date_to),
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'rows':          rows,
        'total_taxable': sum(r['taxable_amount'] for r in rows),
        'total_vat':     sum(r['vat_amount'] for r in rows),
        'total_amount':  sum(r['total'] for r in rows),
        'count':         len(rows),
    }


def purchase_register(tenant, date_from, date_to):
    """
    Purchase Register (Input VAT Register) — all approved/paid bills in period.
    Matches Nepal IRD purchase register requirements.
    """
    from core.nepali_date import date_to_bs_display

    qs = (
        _active_bills(tenant, date_from, date_to)
        .select_related('supplier')
        .order_by('created_at')
    )

    rows = []
    for i, bill in enumerate(qs, start=1):
        bs_info = date_to_bs_display(bill.created_at.date())
        rows.append({
            'sno':         i,
            'date_ad':     str(bill.created_at.date()),
            'date_bs':     bs_info.get('bs') if bs_info else None,
            'bill_number': bill.bill_number,
            'supplier':    bill.supplier.name if bill.supplier else bill.supplier_name,
            'supplier_pan': (bill.supplier.pan_number if bill.supplier and hasattr(bill.supplier, 'pan_number') else ''),
            'taxable_amount': bill.subtotal - bill.discount,
            'vat_amount':  bill.vat_amount,
            'total':       bill.total,
        })

    return {
        'period':        _period_meta(date_from, date_to),
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'rows':          rows,
        'total_taxable': sum(r['taxable_amount'] for r in rows),
        'total_vat':     sum(r['vat_amount'] for r in rows),
        'total_amount':  sum(r['total'] for r in rows),
        'bill_count':    len(rows),
    }


def purchase_return_register(tenant, date_from, date_to):
    """
    Purchase Return Register — all issued/applied debit notes in period.
    """
    from accounting.models import DebitNote
    from core.nepali_date import date_to_bs_display

    qs = (
        DebitNote.objects
        .filter(tenant=tenant,
                status__in=[DebitNote.STATUS_ISSUED, DebitNote.STATUS_APPLIED],
                created_at__date__gte=date_from,
                created_at__date__lte=date_to)
        .select_related('bill__supplier')
        .order_by('created_at')
    )

    rows = []
    for i, dn in enumerate(qs, start=1):
        supplier = dn.bill.supplier if dn.bill else None
        bs_info  = date_to_bs_display(dn.created_at.date())
        rows.append({
            'sno':           i,
            'date_ad':       str(dn.created_at.date()),
            'date_bs':       bs_info.get('bs') if bs_info else None,
            'debit_note_no': dn.debit_note_number,
            'original_bill': dn.bill.bill_number if dn.bill else '',
            'supplier':      supplier.name if supplier else '',
            'taxable_amount': dn.subtotal,
            'vat_amount':    dn.vat_amount,
            'total':         dn.total,
        })

    return {
        'period':        _period_meta(date_from, date_to),
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'rows':          rows,
        'total_taxable': sum(r['taxable_amount'] for r in rows),
        'total_vat':     sum(r['vat_amount'] for r in rows),
        'total_amount':  sum(r['total'] for r in rows),
        'count':         len(rows),
    }


def tds_report(tenant, date_from, date_to):
    """
    TDS Report — all TDS entries for the period grouped by supplier and status.
    Used for Nepal IRD TDS remittance and reconciliation.
    """
    from accounting.models import TDSEntry

    entries = (
        TDSEntry.objects
        .filter(tenant=tenant,
                created_at__date__gte=date_from,
                created_at__date__lte=date_to)
        .select_related('bill')
        .order_by('created_at')
    )

    rows = []
    for e in entries:
        rows.append({
            'id':              e.pk,
            'date':            str(e.created_at.date()),
            'bill_number':     e.bill.bill_number if e.bill else '',
            'supplier_name':   e.supplier_name,
            'supplier_pan':    e.supplier_pan,
            'taxable_amount':  e.taxable_amount,
            'tds_rate':        float(e.tds_rate),
            'tds_amount':      e.tds_amount,
            'net_payable':     e.net_payable,
            'status':          e.status,
            'period_month':    e.period_month,
            'period_year':     e.period_year,
            'deposited_at':    str(e.deposited_at) if e.deposited_at else None,
            'deposit_reference': e.deposit_reference,
        })

    total_taxable = sum(r['taxable_amount'] for r in rows)
    total_tds     = sum(r['tds_amount'] for r in rows)
    total_pending = sum(r['tds_amount'] for r in rows if r['status'] == TDSEntry.STATUS_PENDING)

    return {
        'period':         _period_meta(date_from, date_to),
        'date_from':      str(date_from),
        'date_to':        str(date_to),
        'rows':           rows,
        'total_taxable':  total_taxable,
        'total_tds':      total_tds,
        'total_pending':  total_pending,
        'total_deposited': total_tds - total_pending,
        'count':          len(rows),
    }


def annex_13(tenant, period_start, period_end):
    """
    Nepal IRD Annex-13 — Schedule of VAT invoices issued.
    Format per IRD: SNo, Invoice Date (BS), Invoice No, Buyer Name,
    Buyer PAN/VAT, Taxable Amount, VAT Amount.
    Only invoices with vat_amount > 0 are included.
    """
    from core.nepali_date import date_to_bs_display

    qs = (
        _active_invoices(tenant, period_start, period_end)
        .filter(vat_amount__gt=0)
        .select_related('customer')
        .order_by('created_at')
    )

    rows = []
    for i, inv in enumerate(qs, start=1):
        bs_info  = date_to_bs_display(inv.created_at.date())
        customer = inv.customer
        rows.append({
            'sno':            i,
            'invoice_date_ad': str(inv.created_at.date()),
            'invoice_date_bs': bs_info.get('bs') if bs_info else None,
            'invoice_number': inv.invoice_number,
            'buyer_name':     customer.name if customer else '',
            'buyer_pan':      customer.vat_number or customer.pan_number if customer else '',
            'taxable_amount': inv.subtotal - inv.discount,
            'vat_amount':     inv.vat_amount,
            'total':          inv.total,
        })

    return {
        'period':        _period_meta(period_start, period_end),
        'period_start':  str(period_start),
        'period_end':    str(period_end),
        'rows':          rows,
        'total_taxable': sum(r['taxable_amount'] for r in rows),
        'total_vat':     sum(r['vat_amount'] for r in rows),
        'total_amount':  sum(r['total'] for r in rows),
        'invoice_count': len(rows),
    }


def annex_5(tenant, period_start, period_end):
    """
    Nepal IRD Annex-5 — VAT Account Summary (Materialized View).
    Shows: total purchases (excl VAT), input VAT claimed, total sales (excl VAT),
    output VAT collected, net VAT payable/refundable to/from IRD.
    Also includes sales returns (credit notes) and purchase returns (debit notes).
    """
    from accounting.models import Invoice, Bill, CreditNote, DebitNote
    from django.db.models import Sum as DSum

    # Sales
    inv_agg = Invoice.objects.filter(
        tenant=tenant,
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID],
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).aggregate(
        taxable=DSum('subtotal'),
        discount=DSum('discount'),
        vat=DSum('vat_amount'),
        total=DSum('total'),
    )

    # Sales returns
    cn_agg = CreditNote.objects.filter(
        tenant=tenant,
        status__in=[CreditNote.STATUS_ISSUED, CreditNote.STATUS_APPLIED],
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).aggregate(taxable=DSum('subtotal'), vat=DSum('vat_amount'))

    # Purchases
    bill_agg = Bill.objects.filter(
        tenant=tenant,
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).aggregate(
        taxable=DSum('subtotal'),
        discount=DSum('discount'),
        vat=DSum('vat_amount'),
        total=DSum('total'),
    )

    # Purchase returns
    dn_agg = DebitNote.objects.filter(
        tenant=tenant,
        status__in=[DebitNote.STATUS_ISSUED, DebitNote.STATUS_APPLIED],
        created_at__date__gte=period_start,
        created_at__date__lte=period_end,
    ).aggregate(taxable=DSum('subtotal'), vat=DSum('vat_amount'))

    def _d(v): return v or _zero()

    sales_taxable    = _d(inv_agg['taxable']) - _d(inv_agg['discount'])
    output_vat       = _d(inv_agg['vat'])
    sales_return_tax = _d(cn_agg['taxable'])
    sales_return_vat = _d(cn_agg['vat'])
    net_output_vat   = output_vat - sales_return_vat

    purchase_taxable  = _d(bill_agg['taxable']) - _d(bill_agg['discount'])
    input_vat         = _d(bill_agg['vat'])
    purchase_return_taxable = _d(dn_agg['taxable'])
    purchase_return_vat     = _d(dn_agg['vat'])
    net_input_vat     = input_vat - purchase_return_vat

    net_vat_payable   = net_output_vat - net_input_vat

    return {
        'period':             _period_meta(period_start, period_end),
        'period_start':       str(period_start),
        'period_end':         str(period_end),
        # Sales side
        'sales_taxable':          sales_taxable,
        'output_vat':             output_vat,
        'sales_return_taxable':   sales_return_tax,
        'sales_return_vat':       sales_return_vat,
        'net_output_vat':         net_output_vat,
        # Purchase side
        'purchase_taxable':       purchase_taxable,
        'input_vat':              input_vat,
        'purchase_return_taxable': purchase_return_taxable,
        'purchase_return_vat':    purchase_return_vat,
        'net_input_vat':          net_input_vat,
        # Net
        'net_vat_payable':        net_vat_payable,
        'is_refund':              net_vat_payable < _zero(),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 7 — Inventory Reports
# ═════════════════════════════════════════════════════════════════════════════

def inventory_position(tenant, as_of_date):
    """
    Inventory Position — current stock level per product with value at cost.
    Computes on-hand from StockMovement aggregation (source of truth).
    """
    from inventory.models import Product, StockMovement
    from django.db.models import Sum as DSum, Q

    products = (
        Product.objects
        .filter(tenant=tenant, is_deleted=False, is_active=True, track_stock=True)
        .select_related('category', 'uom')
        .order_by('category__name', 'name')
    )

    rows = []
    for prod in products:
        # All movements up to as_of_date
        mvs = StockMovement.objects.filter(
            tenant=tenant, product=prod,
            created_at__date__lte=as_of_date,
        ).aggregate(
            qty_in=DSum('quantity', filter=Q(movement_type__in=['in', 'return'])),
            qty_out=DSum('quantity', filter=Q(movement_type__in=['out', 'return_supplier', 'adjustment'])),
        )
        qty_in  = mvs['qty_in']  or 0
        qty_out = mvs['qty_out'] or 0
        on_hand = qty_in - qty_out
        cost_value = on_hand * float(prod.cost_price or 0)
        sale_value = on_hand * float(prod.unit_price or 0)

        rows.append({
            'sku':          prod.sku,
            'name':         prod.name,
            'category':     prod.category.name if prod.category else '',
            'uom':          prod.uom.abbreviation if prod.uom else '',
            'on_hand':      on_hand,
            'cost_price':   float(prod.cost_price or 0),
            'unit_price':   float(prod.unit_price or 0),
            'cost_value':   cost_value,
            'sale_value':   sale_value,
        })

    rows = [r for r in rows if r['on_hand'] >= 0]
    return {
        'as_of_date':    str(as_of_date),
        'rows':          rows,
        'total_items':   len(rows),
        'total_cost_value': sum(r['cost_value'] for r in rows),
        'total_sale_value': sum(r['sale_value'] for r in rows),
    }


def inventory_movement(tenant, date_from, date_to):
    """
    Inventory Movement — all stock movements in the period with type and reference.
    """
    from inventory.models import StockMovement

    movements = (
        StockMovement.objects
        .filter(tenant=tenant,
                created_at__date__gte=date_from,
                created_at__date__lte=date_to)
        .select_related('product', 'product__category', 'product__uom')
        .order_by('-created_at')
    )

    rows = []
    for mv in movements:
        rows.append({
            'date':           str(mv.created_at.date()),
            'product_name':   mv.product.name,
            'sku':            mv.product.sku,
            'movement_type':  mv.movement_type,
            'quantity':       mv.quantity,
            'reference_type': mv.reference_type,
            'reference_id':   mv.reference_id,
            'notes':          mv.notes,
        })

    in_total  = sum(r['quantity'] for r in rows if r['movement_type'] in ('in', 'return'))
    out_total = sum(r['quantity'] for r in rows if r['movement_type'] in ('out', 'return_supplier'))

    return {
        'period':      _period_meta(date_from, date_to),
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'rows':        rows,
        'total_in':    in_total,
        'total_out':   out_total,
        'net_change':  in_total - out_total,
    }


def inventory_master(tenant):
    """
    Inventory Master — all active products with pricing, costs and current stock.
    """
    from inventory.models import Product, StockLevel

    products = (
        Product.objects
        .filter(tenant=tenant, is_deleted=False, is_active=True)
        .select_related('category', 'uom', 'stock_level')
        .order_by('category__name', 'name')
    )

    rows = []
    for prod in products:
        sl = getattr(prod, 'stock_level', None)
        rows.append({
            'sku':          prod.sku,
            'name':         prod.name,
            'category':     prod.category.name if prod.category else '',
            'uom':          prod.uom.abbreviation if prod.uom else '',
            'cost_price':   float(prod.cost_price or 0),
            'unit_price':   float(prod.unit_price or 0),
            'reorder_level': prod.reorder_level,
            'on_hand':      sl.quantity_on_hand if sl else 0,
            'is_service':   prod.is_service,
            'track_stock':  prod.track_stock,
        })

    return {'rows': rows, 'total_products': len(rows)}


def product_profitability(tenant, date_from, date_to):
    """
    Product Profitability — revenue vs cost per product using invoice line items
    and Product.cost_price for COGS calculation.
    """
    from inventory.models import Product
    from collections import defaultdict

    # Map product_id → Product for cost lookup
    products = {
        p.pk: p for p in Product.objects.filter(tenant=tenant, is_deleted=False)
    }

    data: dict = defaultdict(lambda: {
        'product_id': None, 'name': '', 'qty': Decimal('0'),
        'revenue': _zero(), 'cogs': _zero(),
    })

    for inv in _active_invoices(tenant, date_from, date_to):
        for line in (inv.line_items or []):
            pid  = line.get('product_id')
            key  = line.get('product_name') or line.get('description') or 'Unspecified'
            qty  = Decimal(str(line.get('qty') or 0))
            amt  = Decimal(str(line.get('amount') or 0))

            if pid and pid in products:
                prod = products[pid]
                key  = prod.name
                cogs = qty * (prod.cost_price or _zero())
            else:
                cogs = _zero()

            data[key]['product_id'] = pid
            data[key]['name']       = key
            data[key]['qty']       += qty
            data[key]['revenue']   += amt
            data[key]['cogs']      += cogs

    rows = []
    for item in data.values():
        gross_profit = item['revenue'] - item['cogs']
        margin = (gross_profit / item['revenue'] * 100) if item['revenue'] else _zero()
        rows.append({
            'product_id':   item['product_id'],
            'name':         item['name'],
            'qty_sold':     item['qty'],
            'revenue':      item['revenue'],
            'cogs':         item['cogs'],
            'gross_profit': gross_profit,
            'margin_pct':   float(margin),
        })

    rows.sort(key=lambda r: r['gross_profit'], reverse=True)
    return {
        'period':          _period_meta(date_from, date_to),
        'date_from':       str(date_from),
        'date_to':         str(date_to),
        'rows':            rows,
        'total_revenue':   sum(r['revenue'] for r in rows),
        'total_cogs':      sum(r['cogs'] for r in rows),
        'total_profit':    sum(r['gross_profit'] for r in rows),
    }


# ═════════════════════════════════════════════════════════════════════════════
#  PHASE 8 — System / Activity Reports
# ═════════════════════════════════════════════════════════════════════════════

def activity_log(tenant, date_from, date_to, limit=500):
    """
    Activity Log — recent audit events for this tenant, newest first.
    Capped at `limit` rows to prevent unbounded responses.
    """
    from core.audit import AuditLog

    qs = (
        AuditLog.objects
        .filter(tenant_id=tenant.pk,
                timestamp__date__gte=date_from,
                timestamp__date__lte=date_to)
        .order_by('-timestamp')[:limit]
    )

    rows = []
    for log in qs:
        rows.append({
            'timestamp':  str(log.timestamp),
            'event':      log.event,
            'actor_id':   log.actor_id,
            'ip':         log.ip,
            'extra':      log.extra,
        })

    return {
        'period':    _period_meta(date_from, date_to),
        'date_from': str(date_from),
        'date_to':   str(date_to),
        'rows':      rows,
        'count':     len(rows),
        'capped':    len(rows) >= limit,
    }


def user_log(tenant, date_from, date_to, user_id=None, limit=500):
    """
    User Log — login/logout/password events per user for this tenant.
    Optionally filter by user_id.
    """
    from core.audit import AuditLog

    qs = AuditLog.objects.filter(
        tenant_id=tenant.pk,
        event__in=['user.login', 'user.logout', 'user.password.changed',
                   'user.2fa.enabled', 'user.2fa.disabled'],
        timestamp__date__gte=date_from,
        timestamp__date__lte=date_to,
    )
    if user_id:
        qs = qs.filter(actor_id=user_id)

    rows = []
    for log in qs.order_by('-timestamp')[:limit]:
        rows.append({
            'timestamp': str(log.timestamp),
            'event':     log.event,
            'actor_id':  log.actor_id,
            'ip':        log.ip,
            'extra':     log.extra,
        })

    return {
        'period':    _period_meta(date_from, date_to),
        'date_from': str(date_from),
        'date_to':   str(date_to),
        'rows':      rows,
        'count':     len(rows),
        'capped':    len(rows) >= limit,
    }
