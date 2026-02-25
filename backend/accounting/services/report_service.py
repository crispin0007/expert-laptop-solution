"""
report_service.py
=================
Accounting reports derived from posted JournalLines.

All reports return plain Python dicts so views can serialize them directly.
"""
from decimal import Decimal
from django.db.models import Sum, Q


def _zero():
    return Decimal('0')


def _account_balance(tenant, account_code, date_from=None, date_to=None):
    """Sum debit - credit for a single account code within a date range."""
    from accounting.models import JournalLine
    qs = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        account__code=account_code,
    )
    if date_from:
        qs = qs.filter(entry__date__gte=date_from)
    if date_to:
        qs = qs.filter(entry__date__lte=date_to)
    d = qs.aggregate(debit=Sum('debit'), credit=Sum('credit'))
    return (d['debit'] or _zero()) - (d['credit'] or _zero())


def _accounts_by_type(tenant, acct_type, date_from=None, date_to=None):
    """
    Return list of {code, name, balance} for all accounts of a given type.
    Balance sign: asset/expense = debit-credit; liability/equity/revenue = credit-debit.
    """
    from accounting.models import Account, JournalLine

    accounts = Account.objects.filter(
        tenant=tenant, type=acct_type, is_active=True
    ).exclude(children__isnull=False).order_by('code')  # leaf accounts only

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

        if acct_type in ('asset', 'expense'):
            balance = dr - cr
        else:
            balance = cr - dr

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
    """
    assets      = _accounts_by_type(tenant, 'asset',     None, as_of_date)
    liabilities = _accounts_by_type(tenant, 'liability', None, as_of_date)
    equity      = _accounts_by_type(tenant, 'equity',    None, as_of_date)

    total_assets      = sum(a['balance'] for a in assets)
    total_liabilities = sum(l['balance'] for l in liabilities)
    total_equity      = sum(e['balance'] for e in equity)

    return {
        'as_of_date':        str(as_of_date),
        'assets':            assets,
        'total_assets':      total_assets,
        'liabilities':       liabilities,
        'total_liabilities': total_liabilities,
        'equity':            equity,
        'total_equity':      total_equity,
        'balanced':          total_assets == (total_liabilities + total_equity),
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
    from django.utils.timezone import datetime

    invoices = Invoice.objects.filter(
        tenant=tenant,
        status=Invoice.STATUS_ISSUED,
    ).select_related('customer')

    buckets = {'current': [], '1_30': [], '31_60': [], '61_90': [], '90_plus': []}

    for inv in invoices:
        due = inv.due_date
        if not due:
            buckets['current'].append(inv)
            continue
        days_overdue = (as_of_date - due).days
        remaining = float(inv.amount_due)
        entry = {
            'id':             inv.pk,
            'invoice_number': inv.invoice_number,
            'customer':       inv.customer.name if inv.customer else '',
            'due_date':       str(due),
            'amount_due':     remaining,
        }
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

    bills = Bill.objects.filter(
        tenant=tenant,
        status=Bill.STATUS_APPROVED,
    ).select_related('supplier')

    buckets = {'current': [], '1_30': [], '31_60': [], '61_90': [], '90_plus': []}

    for bill in bills:
        due = bill.due_date
        remaining = float(bill.amount_due)
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

    payments = Payment.objects.filter(
        tenant=tenant,
        date__gte=date_from,
        date__lte=date_to,
    )

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
