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


def _voucher_date_filter(start, end):
    """Match document voucher date, with legacy fallback to created_at date."""
    return (
        Q(date__gte=start, date__lte=end) |
        Q(date__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
    )


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

    Uses a single batched GROUP BY query instead of one aggregate per account
    to avoid N+1 performance issues at scale.
    """
    from accounting.models import Account, JournalLine
    from django.db.models import Value
    from django.db.models.functions import Coalesce

    accounts = list(
        Account.objects.filter(tenant=tenant, type=acct_type, is_active=True)
        .order_by('code')
    )
    if not accounts:
        return []

    account_ids = [a.pk for a in accounts]

    # Single SQL query: GROUP BY account_id to get debit/credit totals for all accounts
    line_qs = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        account_id__in=account_ids,
    )
    if date_from:
        line_qs = line_qs.filter(entry__date__gte=date_from)
    if date_to:
        line_qs = line_qs.filter(entry__date__lte=date_to)

    balance_map = {
        r['account_id']: (r['total_debit'], r['total_credit'])
        for r in line_qs.values('account_id').annotate(
            total_debit=Coalesce(Sum('debit'),  Value(Decimal('0'))),
            total_credit=Coalesce(Sum('credit'), Value(Decimal('0'))),
        )
    }

    result = []
    for acc in accounts:
        dr, cr = balance_map.get(acc.pk, (_zero(), _zero()))
        ob = acc.opening_balance or _zero()
        if acct_type in ('asset', 'expense'):
            balance = ob + dr - cr
        else:
            balance = ob + cr - dr
        result.append({'id': acc.pk, 'code': acc.code, 'name': acc.name, 'balance': balance})

    return result


# ─── Profit & Loss ───────────────────────────────────────────────────────────

def _accounts_by_group_slug(tenant, group_slug, date_from=None, date_to=None):
    """
    Return [{code, name, balance, group_name}] for all active accounts
    belonging to the given AccountGroup slug.
    Balance sign follows the account type (debit-normal or credit-normal).

    Uses a single batched GROUP BY query instead of one aggregate per account
    to avoid N+1 performance issues at scale.
    """
    from accounting.models import Account, JournalLine
    from django.db.models import Value
    from django.db.models.functions import Coalesce

    accounts = list(
        Account.objects.filter(
            tenant=tenant,
            group__slug=group_slug,
            is_active=True,
        ).select_related('group').order_by('code')
    )
    if not accounts:
        return []

    account_ids = [a.pk for a in accounts]

    # Single SQL query: GROUP BY account_id
    line_qs = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        account_id__in=account_ids,
    )
    if date_from:
        line_qs = line_qs.filter(entry__date__gte=date_from)
    if date_to:
        line_qs = line_qs.filter(entry__date__lte=date_to)

    balance_map = {
        r['account_id']: (r['total_debit'], r['total_credit'])
        for r in line_qs.values('account_id').annotate(
            total_debit=Coalesce(Sum('debit'),  Value(Decimal('0'))),
            total_credit=Coalesce(Sum('credit'), Value(Decimal('0'))),
        )
    }

    result = []
    for acc in accounts:
        dr, cr = balance_map.get(acc.pk, (_zero(), _zero()))
        ob = acc.opening_balance or _zero()
        if acc.type in ('asset', 'expense'):
            balance = ob + dr - cr
        else:
            balance = ob + cr - dr
        result.append({
            'id':         acc.pk,
            'code':       acc.code,
            'name':       acc.name,
            'balance':    balance,
            'group_name': acc.group.name if acc.group else '',
        })
    return result


def _section_total(accounts_list):
    return sum(a['balance'] for a in accounts_list)


def profit_and_loss(tenant, date_from, date_to, compare_from=None, compare_to=None):
    """
    Tally-style Profit & Loss with Gross Profit split.

    Optional comparison period: pass compare_from / compare_to to get a
    side-by-side view.  Each account entry gains a ``compare_balance`` field
    and the response includes a ``compare_period`` block.

    Structure:
      INCOME (Gross):
        Sales / Revenue         (sales_accounts)
        Direct Income           (direct_income)
       = Gross Revenue
      LESS DIRECT COSTS (Gross):
        Purchases / COGS        (purchase_accounts)
        Direct Expenses         (direct_expense)
       = Total Direct Costs
      ─────────────────────────
      GROSS PROFIT
      ─────────────────────────
      LESS INDIRECT EXPENSES:   (indirect_expense)
      ADD INDIRECT INCOME:      (indirect_income)
      ─────────────────────────
      NET PROFIT
    """
    sales         = _accounts_by_group_slug(tenant, 'sales_accounts',    date_from, date_to)
    direct_inc    = _accounts_by_group_slug(tenant, 'direct_income',     date_from, date_to)
    purchases     = _accounts_by_group_slug(tenant, 'purchase_accounts', date_from, date_to)
    direct_exp    = _accounts_by_group_slug(tenant, 'direct_expense',    date_from, date_to)
    indirect_exp  = _accounts_by_group_slug(tenant, 'indirect_expense',  date_from, date_to)
    indirect_inc  = _accounts_by_group_slug(tenant, 'indirect_income',   date_from, date_to)

    # Fallback: also include any revenue/expense accounts without a group
    ungrouped_rev = [
        a for a in _accounts_by_type(tenant, 'revenue', date_from, date_to)
        if not any(a['code'] == s['code'] for s in sales + direct_inc + indirect_inc)
    ]
    ungrouped_exp = [
        a for a in _accounts_by_type(tenant, 'expense', date_from, date_to)
        if not any(a['code'] == s['code'] for s in purchases + direct_exp + indirect_exp)
    ]

    gross_revenue     = _section_total(sales) + _section_total(direct_inc)
    total_direct_cost = _section_total(purchases) + _section_total(direct_exp)
    gross_profit      = gross_revenue - total_direct_cost

    total_indirect_exp = _section_total(indirect_exp) + _section_total(ungrouped_exp)
    total_indirect_inc = _section_total(indirect_inc) + _section_total(ungrouped_rev)
    net_profit         = gross_profit - total_indirect_exp + total_indirect_inc

    # ── Optional comparison period ────────────────────────────────────────────
    def _merge_compare(base_list, group_slug, cf, ct):
        """Attach compare_balance to each account row."""
        if not (cf and ct):
            return base_list
        cmp_list = _accounts_by_group_slug(tenant, group_slug, cf, ct)
        cmp_map  = {a['code']: a['balance'] for a in cmp_list}
        return [{**a, 'compare_balance': cmp_map.get(a['code'], _zero())} for a in base_list]

    has_compare = compare_from and compare_to
    cmp = {}
    if has_compare:
        cmp_pl = profit_and_loss(tenant, compare_from, compare_to)
        cmp = {
            'gross_revenue':     cmp_pl['gross_revenue'],
            'total_direct_cost': cmp_pl['total_direct_cost'],
            'gross_profit':      cmp_pl['gross_profit'],
            'total_indirect_exp': cmp_pl['total_indirect_exp'],
            'total_indirect_inc': cmp_pl['total_indirect_inc'],
            'net_profit':        cmp_pl['net_profit'],
        }

    return {
        'period':               _period_meta(date_from, date_to),
        'date_from':            str(date_from),
        'date_to':              str(date_to),
        # Gross section
        'sales':                sales,
        'direct_income':        direct_inc,
        'gross_revenue':        gross_revenue,
        'purchases':            purchases,
        'direct_expenses':      direct_exp,
        'total_direct_cost':    total_direct_cost,
        'gross_profit':         gross_profit,
        # Net section
        'indirect_expenses':    indirect_exp + ungrouped_exp,
        'indirect_income':      indirect_inc + ungrouped_rev,
        'total_indirect_exp':   total_indirect_exp,
        'total_indirect_inc':   total_indirect_inc,
        'net_profit':           net_profit,
        # Comparison
        'has_compare':          has_compare,
        'compare_period':       _period_meta(compare_from, compare_to) if has_compare else None,
        'compare':              cmp,
    }


# ─── Balance Sheet ────────────────────────────────────────────────────────────

def _balance_sheet_sections(tenant, as_of_date):
    """
    Compute all Balance Sheet sections for a single date.
    Extracted so balance_sheet() can re-use it for the comparison period
    without recursion.
    """
    from core.nepali_date import date_to_bs_display

    # ── Assets ──────────────────────────────────────────────────────────────
    fixed_assets  = _accounts_by_group_slug(tenant, 'fixed_assets',         None, as_of_date)
    investments   = _accounts_by_group_slug(tenant, 'investments',          None, as_of_date)
    stock         = _accounts_by_group_slug(tenant, 'stock_in_hand',        None, as_of_date)
    debtors       = _accounts_by_group_slug(tenant, 'sundry_debtors',       None, as_of_date)
    bank_accs     = _accounts_by_group_slug(tenant, 'bank_accounts',        None, as_of_date)
    cash          = _accounts_by_group_slug(tenant, 'cash_in_hand',         None, as_of_date)
    loans_asset   = _accounts_by_group_slug(tenant, 'loans_advances_asset', None, as_of_date)
    other_ca      = _accounts_by_group_slug(tenant, 'other_current_assets', None, as_of_date)

    grouped_asset_codes = set(
        a['code'] for a in
        fixed_assets + investments + stock + debtors + bank_accs + cash + loans_asset + other_ca
    )
    ungrouped_assets = [
        a for a in _accounts_by_type(tenant, 'asset', None, as_of_date)
        if a['code'] not in grouped_asset_codes
    ]
    other_ca = other_ca + ungrouped_assets
    current_assets = stock + debtors + bank_accs + cash + loans_asset + other_ca

    total_fixed       = _section_total(fixed_assets)
    total_investments = _section_total(investments)
    total_current_a   = _section_total(current_assets)
    total_assets      = total_fixed + total_investments + total_current_a

    # ── Capital & Equity ─────────────────────────────────────────────────────
    capital_accs = _accounts_by_group_slug(tenant, 'capital_account', None, as_of_date)
    reserves     = _accounts_by_group_slug(tenant, 'reserves_surplus', None, as_of_date)

    revenue_total = sum(
        _section_total(_accounts_by_group_slug(tenant, slug, None, as_of_date))
        for slug in ('sales_accounts', 'direct_income', 'indirect_income')
    )
    expense_total = sum(
        _section_total(_accounts_by_group_slug(tenant, slug, None, as_of_date))
        for slug in ('purchase_accounts', 'direct_expense', 'indirect_expense')
    )
    current_earnings = revenue_total - expense_total

    capital_section = capital_accs + reserves
    if current_earnings != _zero():
        capital_section = capital_section + [{
            'code':       'EARNINGS',
            'name':       'Current Year Earnings',
            'balance':    current_earnings,
            'group_name': 'Computed',
        }]
    total_capital = _section_total(capital_accs) + _section_total(reserves) + current_earnings

    # ── Loans ────────────────────────────────────────────────────────────────
    bank_od    = _accounts_by_group_slug(tenant, 'bank_od',         None, as_of_date)
    loans_liab = _accounts_by_group_slug(tenant, 'loans_liability', None, as_of_date)
    total_loans = _section_total(bank_od) + _section_total(loans_liab)

    # ── Current Liabilities ──────────────────────────────────────────────────
    creditors = _accounts_by_group_slug(tenant, 'sundry_creditors',    None, as_of_date)
    vat_liab  = _accounts_by_group_slug(tenant, 'duties_taxes_vat',    None, as_of_date)
    tds_liab  = _accounts_by_group_slug(tenant, 'duties_taxes_tds',    None, as_of_date)
    other_cl  = _accounts_by_group_slug(tenant, 'current_liabilities', None, as_of_date)

    grouped_liab_codes = set(
        a['code'] for a in bank_od + loans_liab + creditors + vat_liab + tds_liab + other_cl
    )
    ungrouped_liabs = [
        a for a in _accounts_by_type(tenant, 'liability', None, as_of_date)
        if a['code'] not in grouped_liab_codes
    ]
    other_cl = other_cl + ungrouped_liabs

    current_liabilities_list = creditors + vat_liab + tds_liab + other_cl
    total_current_l           = _section_total(current_liabilities_list)
    total_liabilities         = total_loans + total_current_l
    total_equity_and_liab     = total_capital + total_liabilities

    return {
        'as_of_date':                    str(as_of_date),
        'as_of_date_bs':                 date_to_bs_display(as_of_date),
        'fixed_assets':                  fixed_assets,
        'total_fixed_assets':            total_fixed,
        'investments':                   investments,
        'total_investments':             total_investments,
        'current_assets':                current_assets,
        'total_current_assets':          total_current_a,
        'total_assets':                  total_assets,
        'capital':                       capital_section,
        'total_capital':                 total_capital,
        'bank_od':                       bank_od,
        'loans':                         loans_liab,
        'total_loans':                   total_loans,
        'current_liabilities':           current_liabilities_list,
        'total_current_liabilities':     total_current_l,
        'total_liabilities':             total_liabilities,
        'total_equity_and_liabilities':  total_equity_and_liab,
        'balanced':                      abs(total_assets - total_equity_and_liab) < Decimal('0.01'),
    }


def balance_sheet(tenant, as_of_date, compare_as_of=None):
    """
    Tally-style Balance Sheet with proper section splits.

    Optional compare_as_of: pass a second date to get prior-period figures.
    Each section total gains a ``compare`` counterpart in the response.

    Assets:
      Fixed Assets              (fixed_assets group)
      Investments               (investments group)
      Current Assets:
        Stock / Inventory       (stock_in_hand)
        Sundry Debtors          (sundry_debtors)
        Bank Accounts           (bank_accounts)
        Cash in Hand            (cash_in_hand)
        Loans & Advances        (loans_advances_asset)
        Other Current Assets    (other_current_assets)

    Capital & Liabilities:
      Capital Account:
        Capital Account         (capital_account)
        Reserves & Surplus      (reserves_surplus)
        Current Year Earnings   (computed: Revenue − Expense)
      Loans:
        Bank OD                 (bank_od)
        Loans (Liability)       (loans_liability)
      Current Liabilities:
        Sundry Creditors        (sundry_creditors)
        Duties & Taxes (VAT)    (duties_taxes_vat)
        Duties & Taxes (TDS)    (duties_taxes_tds)
        Other Current Liabilities (current_liabilities)
    """
    result = _balance_sheet_sections(tenant, as_of_date)
    result['has_compare']  = compare_as_of is not None
    result['compare_as_of'] = str(compare_as_of) if compare_as_of else None
    result['compare']      = _balance_sheet_sections(tenant, compare_as_of) if compare_as_of else None
    return result


# ─── Trial Balance ────────────────────────────────────────────────────────────

def _trial_balance_opening_and_period_maps(tenant, date_from, date_to):
    """Return grouped debit/credit maps for pre-period and in-period lines."""
    from accounting.models import JournalLine
    from django.db.models import Sum as _Sum

    pre_qs = (
        JournalLine.objects
        .filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            entry__date__lt=date_from,
        )
        .values('account_id')
        .annotate(debit=_Sum('debit'), credit=_Sum('credit'))
    )
    per_qs = (
        JournalLine.objects
        .filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            entry__date__gte=date_from,
            entry__date__lte=date_to,
        )
        .values('account_id')
        .annotate(debit=_Sum('debit'), credit=_Sum('credit'))
    )
    return {row['account_id']: row for row in pre_qs}, {row['account_id']: row for row in per_qs}


def _trial_balance_row(acc, pre_map, period_map):
    """Compute one trial balance row and debit/credit splits for totals."""
    ob_field = acc.opening_balance or _zero()

    pre = pre_map.get(acc.pk, {})
    pre_dr = pre.get('debit') or _zero()
    pre_cr = pre.get('credit') or _zero()

    per = period_map.get(acc.pk, {})
    period_dr = per.get('debit') or _zero()
    period_cr = per.get('credit') or _zero()

    is_debit_normal = acc.type in ('asset', 'expense')
    if is_debit_normal:
        opening = ob_field + pre_dr - pre_cr
        closing = opening + period_dr - period_cr
    else:
        opening = ob_field + pre_cr - pre_dr
        closing = opening + period_cr - period_dr

    if not (opening or period_dr or period_cr or closing):
        return None

    if is_debit_normal:
        o_dr = max(opening, _zero())
        o_cr = max(-opening, _zero())
        c_dr = max(closing, _zero())
        c_cr = max(-closing, _zero())
    else:
        o_cr = max(opening, _zero())
        o_dr = max(-opening, _zero())
        c_cr = max(closing, _zero())
        c_dr = max(-closing, _zero())

    return {
        'row': {
            'id': acc.pk,
            'code': acc.code,
            'name': acc.name,
            'type': acc.type,
            'group_name': acc.group.name if acc.group_id else '',
            'opening_dr': o_dr,
            'opening_cr': o_cr,
            'period_dr': period_dr,
            'period_cr': period_cr,
            'closing_dr': c_dr,
            'closing_cr': c_cr,
        },
        'o_dr': o_dr,
        'o_cr': o_cr,
        'p_dr': period_dr,
        'p_cr': period_cr,
        'c_dr': c_dr,
        'c_cr': c_cr,
    }


def _trial_balance_rows_and_totals(accounts, pre_map, period_map):
    """Build trial balance rows and running totals in a single pass."""
    rows = []
    totals = {
        'total_opening_dr': _zero(),
        'total_opening_cr': _zero(),
        'total_period_dr': _zero(),
        'total_period_cr': _zero(),
        'total_closing_dr': _zero(),
        'total_closing_cr': _zero(),
    }

    for acc in accounts:
        computed = _trial_balance_row(acc, pre_map, period_map)
        if not computed:
            continue
        rows.append(computed['row'])
        totals['total_opening_dr'] += computed['o_dr']
        totals['total_opening_cr'] += computed['o_cr']
        totals['total_period_dr'] += computed['p_dr']
        totals['total_period_cr'] += computed['p_cr']
        totals['total_closing_dr'] += computed['c_dr']
        totals['total_closing_cr'] += computed['c_cr']

    return rows, totals

def trial_balance(tenant, date_from, date_to):
    """
    Tally-style Trial Balance with three columns per account:

        Opening Balance  |  Period Dr / Cr  |  Closing Balance

    Opening = net balance of all posted transactions + account.opening_balance
              *before* date_from.
    Closing = opening ± period movements.

    Accounts are included if they have any non-zero figure (opening, period, or
    closing) so previously-active accounts with zero current-period activity are
    never silently omitted.

    B2 — Performance: uses TWO bulk GROUP BY queries for all accounts combined
    (pre-period and in-period), then builds rows in a single O(N) Python loop.
    The old implementation ran 2 queries per account (2×N total) which caused
    timeouts on tenants with 50+ accounts.
    """
    from accounting.models import Account

    accounts = list(
        Account.objects.filter(tenant=tenant, is_active=True)
        .select_related('group')
        .order_by('code')
    )
    if not accounts:
        return {
            'date_from': str(date_from), 'date_to': str(date_to),
            'accounts': [], 'balanced': True,
            'total_opening_dr': _zero(), 'total_opening_cr': _zero(),
            'total_period_dr': _zero(), 'total_period_cr': _zero(),
            'total_closing_dr': _zero(), 'total_closing_cr': _zero(),
        }

    pre_map, period_map = _trial_balance_opening_and_period_maps(tenant, date_from, date_to)
    rows, totals = _trial_balance_rows_and_totals(accounts, pre_map, period_map)

    return {
        'date_from':         str(date_from),
        'date_to':           str(date_to),
        'accounts':          rows,
        'total_opening_dr':  totals['total_opening_dr'],
        'total_opening_cr':  totals['total_opening_cr'],
        'total_period_dr':   totals['total_period_dr'],
        'total_period_cr':   totals['total_period_cr'],
        'total_closing_dr':  totals['total_closing_dr'],
        'total_closing_cr':  totals['total_closing_cr'],
        'balanced':          totals['total_closing_dr'] == totals['total_closing_cr'],
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
        remaining = max(inv.total - inv.paid_sum, _zero())
        if remaining <= _zero():
            continue
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
        remaining = max(bill.total - bill.paid_sum, _zero())
        if remaining <= _zero():
            continue
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
    from django.db.models import Sum as DSum, Q, DateField
    from django.db.models.functions import Coalesce, Cast

    # Use the invoice/bill's explicit `date` field (IRD-grade: the date on the document).
    # For legacy records that pre-date migration 0017 (date=NULL), fall back to
    # created_at::date so existing data is not silently excluded from VAT filings.
    def _date_in_range(start, end):
        return (
            Q(date__gte=start, date__lte=end) |
            Q(date__isnull=True, created_at__date__gte=start, created_at__date__lte=end)
        )

    invoices = Invoice.objects.filter(
        tenant=tenant,
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID],
    ).filter(_date_in_range(period_start, period_end))

    bills = Bill.objects.filter(
        tenant=tenant,
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
    ).filter(_date_in_range(period_start, period_end))

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

def _bulk_group_balances(tenant, as_of_date, group_slugs):
    """
    Compute net account-group balances for *group_slugs* as of *as_of_date*.

    Performance: exactly 2 SQL queries regardless of how many groups are
    requested (one SELECT on Account, one GROUP BY on JournalLine).

    Balance sign follows account.type convention:
      asset / expense           → ob + debit − credit  (debit-normal)
      liability / equity / rev  → ob + credit − debit  (credit-normal)

    Returns: {slug: Decimal}  — zero for slugs with no accounts.
    """
    from accounting.models import Account, JournalLine
    from django.db.models import Value
    from django.db.models.functions import Coalesce

    accounts = list(
        Account.objects.filter(
            tenant=tenant,
            group__slug__in=group_slugs,
            is_active=True,
        ).values('pk', 'type', 'opening_balance', 'group__slug')
    )

    result = {s: _zero() for s in group_slugs}
    if not accounts:
        return result

    account_ids = [a['pk'] for a in accounts]

    balance_map = {
        row['account_id']: (row['total_debit'] or _zero(), row['total_credit'] or _zero())
        for row in JournalLine.objects.filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            account_id__in=account_ids,
            entry__date__lte=as_of_date,
        ).values('account_id').annotate(
            total_debit=Coalesce(Sum('debit'),  Value(Decimal('0'))),
            total_credit=Coalesce(Sum('credit'), Value(Decimal('0'))),
        )
    }

    for acc in accounts:
        dr, cr = balance_map.get(acc['pk'], (_zero(), _zero()))
        ob = acc['opening_balance'] or _zero()
        slug = acc['group__slug']
        if acc['type'] in ('asset', 'expense'):
            result[slug] += ob + dr - cr
        else:
            result[slug] += ob + cr - dr

    return result


def _cashflow_depreciation_addback(tenant, date_from, date_to):
    """Return depreciation amount to add back in indirect cash flow."""
    from accounting.models import JournalLine, JournalEntry
    from django.db.models import Value
    from django.db.models.functions import Coalesce

    dep_qs = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        entry__date__gte=date_from,
        entry__date__lte=date_to,
        account__type='expense',
    ).filter(
        Q(entry__reference_type=JournalEntry.REF_DEPRECIATION) |
        Q(entry__purpose=JournalEntry.PURPOSE_DEPRECIATION) |
        Q(account__name__icontains='depreciation') |
        Q(account__name__icontains='amortis'),
    ).aggregate(
        d=Coalesce(Sum('debit'), Value(Decimal('0'))),
        c=Coalesce(Sum('credit'), Value(Decimal('0'))),
    )
    return (dep_qs['d'] or _zero()) - (dep_qs['c'] or _zero())


def _cashflow_working_capital_changes(opening_balances, closing_balances):
    """Return working-capital line items and total for cash-flow operating section."""
    wc_items = []
    for slug, pos_label, neg_label, is_asset in [
        ('sundry_debtors',       'Decrease in Trade Receivables',          'Increase in Trade Receivables',          True),
        ('stock_in_hand',        'Decrease in Inventories',                'Increase in Inventories',                True),
        ('loans_advances_asset', 'Decrease in Loans & Advances (Asset)',   'Increase in Loans & Advances (Asset)',   True),
        ('other_current_assets', 'Decrease in Other Current Assets',       'Increase in Other Current Assets',       True),
        ('sundry_creditors',     'Increase in Trade Payables',             'Decrease in Trade Payables',             False),
        ('duties_taxes_vat',     'Increase in VAT Payable',                'Decrease in VAT Payable',                False),
        ('duties_taxes_tds',     'Increase in TDS Payable',                'Decrease in TDS Payable',                False),
        ('current_liabilities',  'Increase in Other Current Liabilities',  'Decrease in Other Current Liabilities',  False),
    ]:
        change = (opening_balances[slug] - closing_balances[slug]) if is_asset else (closing_balances[slug] - opening_balances[slug])
        if change != _zero():
            wc_items.append({
                'label': pos_label if change >= _zero() else neg_label,
                'amount': str(change),
            })

    wc_total = sum(Decimal(item['amount']) for item in wc_items)
    return wc_items, wc_total


def _cashflow_investing_items(opening_balances, closing_balances, dep_amount):
    """Return investing section items and total."""
    investing_items = []

    fa_nbv_change = closing_balances['fixed_assets'] - opening_balances['fixed_assets']
    fa_cash = -(fa_nbv_change + dep_amount)
    if fa_cash != _zero():
        label = 'Proceeds from Disposal of Fixed Assets' if fa_cash > _zero() else 'Purchase of Fixed Assets'
        investing_items.append({'label': label, 'amount': str(fa_cash)})

    inv_cash = -(closing_balances['investments'] - opening_balances['investments'])
    if inv_cash != _zero():
        label = 'Proceeds from Sale of Investments' if inv_cash > _zero() else 'Purchase of Investments'
        investing_items.append({'label': label, 'amount': str(inv_cash)})

    investing_total = sum(Decimal(item['amount']) for item in investing_items)
    return investing_items, investing_total


def _cashflow_financing_items(tenant, date_from, date_to, opening_balances, closing_balances, net_profit):
    """Return financing section items and total, including FY-close guard."""
    from accounting.models import JournalEntry

    financing_items = []
    for slug, pos_label, neg_label in [
        ('bank_od', 'Increase in Bank Overdraft', 'Repayment of Bank Overdraft'),
        ('loans_liability', 'Proceeds from Term Loans', 'Repayment of Term Loans'),
    ]:
        change = closing_balances[slug] - opening_balances[slug]
        if change != _zero():
            financing_items.append({
                'label': pos_label if change >= _zero() else neg_label,
                'amount': str(change),
            })

    equity_change = (
        (closing_balances['capital_account'] - opening_balances['capital_account'])
        + (closing_balances['reserves_surplus'] - opening_balances['reserves_surplus'])
    )
    has_fy_close = JournalEntry.objects.filter(
        tenant=tenant,
        reference_type=JournalEntry.REF_FY_CLOSE,
        is_posted=True,
        date__gte=date_from,
        date__lte=date_to,
    ).exists()
    if has_fy_close:
        equity_change -= net_profit

    if equity_change != _zero():
        label = 'Capital Introduced (Owner Investment)' if equity_change >= _zero() else 'Capital Withdrawn (Drawings)'
        financing_items.append({'label': label, 'amount': str(equity_change)})

    financing_total = sum(Decimal(item['amount']) for item in financing_items)
    return financing_items, financing_total


def _cashflow_payment_method_breakdown(tenant, date_from, date_to):
    """Return backward-compatible direct-method payment totals by method."""
    from accounting.models import Payment

    by_method = {}
    for payment in Payment.objects.filter(
        tenant=tenant,
        date__gte=date_from,
        date__lte=date_to,
    ).exclude(method='credit_note').values('method', 'type', 'amount'):
        by_method.setdefault(payment['method'], {'incoming': _zero(), 'outgoing': _zero()})
        by_method[payment['method']][payment['type']] += payment['amount']
    return by_method


def cash_flow(tenant, date_from, date_to):
    """
    Indirect-method Cash Flow Statement (Tally-style three-section layout).

    Operating Activities
    ────────────────────
    Net Profit / (Loss) for the period  [from P&L]
    + Add back: Depreciation & Amortisation  [non-cash expense]
    ± Working Capital Changes:
        Decrease / (Increase) in Trade Receivables
        Decrease / (Increase) in Inventories
        Decrease / (Increase) in Loans & Advances (Asset)
        Decrease / (Increase) in Other Current Assets
        Increase / (Decrease) in Trade Payables
        Increase / (Decrease) in VAT Payable
        Increase / (Decrease) in TDS Payable
        Increase / (Decrease) in Other Current Liabilities
    = Net Cash from Operating Activities

    Investing Activities
    ────────────────────
    Purchase / Disposal of Fixed Assets
      (balance change adjusted for depreciation so it reflects actual cash)
    Purchase / Sale of Investments
    = Net Cash from Investing Activities

    Financing Activities
    ────────────────────
    Proceeds from / Repayment of Bank Overdraft
    Proceeds from / Repayment of Term Loans
    Capital Introduced / (Withdrawn)    [owner movements only]
    = Net Cash from Financing Activities

    Reconciliation
    ────────────────────
    Opening Cash & Bank
    + Net Change (Operating + Investing + Financing)
    = Expected Closing Cash & Bank
    Actual Closing Cash & Bank
    Difference  (should be zero; non-zero = transactions not captured above)

    Performance: 4 SQL queries total (2× _bulk_group_balances calls +
    1× profit_and_loss + 1× depreciation aggregate + 1× payments).
    """
    from datetime import timedelta
    opening_date = date_from - timedelta(days=1)

    # All account groups needed — fetched in 2 bulk queries (one per date).
    _ALL_SLUGS = [
        'cash_in_hand', 'bank_accounts',
        # Working capital — asset
        'sundry_debtors', 'stock_in_hand', 'loans_advances_asset', 'other_current_assets',
        # Working capital — liability
        'sundry_creditors', 'duties_taxes_vat', 'duties_taxes_tds', 'current_liabilities',
        # Investing
        'fixed_assets', 'investments',
        # Financing
        'bank_od', 'loans_liability', 'capital_account', 'reserves_surplus',
    ]
    op = _bulk_group_balances(tenant, opening_date, _ALL_SLUGS)
    cl = _bulk_group_balances(tenant, date_to, _ALL_SLUGS)

    # ── Net Profit ────────────────────────────────────────────────────────────
    pl = profit_and_loss(tenant, date_from, date_to)
    net_profit = Decimal(str(pl['net_profit']))

    dep_amount = _cashflow_depreciation_addback(tenant, date_from, date_to)
    wc_items, wc_total = _cashflow_working_capital_changes(op, cl)
    operating_adj   = dep_amount + wc_total
    operating_total = net_profit + operating_adj

    investing_items, investing_total = _cashflow_investing_items(op, cl, dep_amount)
    financing_items, financing_total = _cashflow_financing_items(tenant, date_from, date_to, op, cl, net_profit)

    # ── Reconciliation ────────────────────────────────────────────────────────
    net_change       = operating_total + investing_total + financing_total
    opening_cash     = op['cash_in_hand'] + op['bank_accounts']
    closing_cash     = cl['cash_in_hand'] + cl['bank_accounts']
    expected_closing = opening_cash + net_change
    difference       = closing_cash - expected_closing   # should be zero

    by_method = _cashflow_payment_method_breakdown(tenant, date_from, date_to)

    return {
        'date_from': str(date_from),
        'date_to':   str(date_to),
        'period':    _period_meta(date_from, date_to),

        # ── Indirect method ──────────────────────────────────────────────────
        'operating': {
            'net_profit':              str(net_profit),
            'net_profit_label':        'Net Profit / (Loss) for the Period',
            'depreciation':            str(dep_amount),
            'depreciation_label':      'Add: Depreciation & Amortisation',
            'working_capital_changes': wc_items,
            'working_capital_total':   str(wc_total),
            'total':                   str(operating_total),
        },
        'investing': {
            'items': investing_items,
            'total': str(investing_total),
        },
        'financing': {
            'items': financing_items,
            'total': str(financing_total),
        },
        'net_change':       str(net_change),
        'opening_cash':     str(opening_cash),
        'closing_cash':     str(closing_cash),
        'expected_closing': str(expected_closing),
        'difference':       str(difference),
        'balanced':         abs(difference) < Decimal('1.00'),

        # ── Legacy aliases (backward-compatible) ─────────────────────────────
        'total_incoming': str(sum(v['incoming'] for v in by_method.values())),
        'total_outgoing': str(sum(v['outgoing'] for v in by_method.values())),
        'net_cash_flow':  str(net_change),
        'by_method': [
            {'method': k, 'incoming': str(v['incoming']), 'outgoing': str(v['outgoing'])}
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
            'line_id':       line.id,
            'entry_id':      line.entry_id,
            'date':         str(line.entry.date),
            'entry_number': line.entry.entry_number,
            'description':  line.description or line.entry.description,
            'reference_type': line.entry.reference_type,
            'reference_id':  line.entry.reference_id,
            'purpose':       line.entry.purpose,
            'debit':        line.debit,
            'credit':       line.credit,
            'balance':      running,
        })

    return {
        'account_code':  account.code,
        'account_id':    account.id,
        'account_name':  account.name,
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'opening_balance': opening,
        'closing_balance': running,
        'transactions':  rows,
    }


def report_drill_node(tenant, node_type, node_id, date_from=None, date_to=None):
    """Resolve a generic drill node for accounting reports.

    Supported nodes:
    - account -> account ledger transactions (next: journal_entry)
    - journal_entry -> voucher lines + source reference (next: source document)
    - invoice | bill | payment | credit_note | debit_note -> source document detail
    - customer | supplier -> statement transactions within date range
    """
    from accounting.models import Account, JournalEntry, Invoice, Bill, Payment, CreditNote, DebitNote

    if node_type == 'account':
        try:
            account = Account.objects.get(tenant=tenant, pk=node_id, is_active=True)
        except Account.DoesNotExist:
            raise ValueError('Account not found for drill-down.')
        if not date_from or not date_to:
            raise ValueError('date_from and date_to are required for account drill-down.')
        data = ledger_report(tenant, account.code, date_from, date_to)
        txns = data.get('transactions', [])
        rows = [
            {
                'node_type': 'journal_entry',
                'node_id': tx.get('entry_id'),
                'line_id': tx.get('line_id'),
                'date': tx.get('date'),
                'entry_number': tx.get('entry_number'),
                'description': tx.get('description'),
                'debit': tx.get('debit'),
                'credit': tx.get('credit'),
                'balance': tx.get('balance'),
                'reference_type': tx.get('reference_type'),
                'reference_id': tx.get('reference_id'),
            }
            for tx in txns
        ]
        return {
            'node_type': 'account',
            'node_id': account.id,
            'node_label': f'{account.code} — {account.name}',
            'date_from': str(date_from),
            'date_to': str(date_to),
            'opening_balance': data.get('opening_balance', _zero()),
            'closing_balance': data.get('closing_balance', _zero()),
            'rows': rows,
        }

    if node_type == 'journal_entry':
        try:
            je = JournalEntry.objects.prefetch_related('lines__account').get(
                tenant=tenant,
                pk=node_id,
                is_posted=True,
            )
        except JournalEntry.DoesNotExist:
            raise ValueError('Journal entry not found for drill-down.')

        source_ref = None
        if je.reference_type and je.reference_id:
            source_ref = {
                'node_type': je.reference_type,
                'node_id': je.reference_id,
                'label': f"{je.reference_type.replace('_', ' ')} #{je.reference_id}",
            }

        return {
            'node_type': 'journal_entry',
            'node_id': je.id,
            'node_label': je.entry_number,
            'date': str(je.date),
            'description': je.description,
            'reference_type': je.reference_type,
            'reference_id': je.reference_id,
            'source_ref': source_ref,
            'lines': [
                {
                    'line_id': line.id,
                    'account_id': line.account_id,
                    'account_code': line.account.code,
                    'account_name': line.account.name,
                    'description': line.description,
                    'debit': line.debit,
                    'credit': line.credit,
                }
                for line in je.lines.all()
            ],
        }

    if node_type == 'invoice':
        try:
            inv = Invoice.objects.select_related('customer').get(tenant=tenant, pk=node_id)
        except Invoice.DoesNotExist:
            raise ValueError('Invoice not found for drill-down.')
        return {
            'node_type': 'invoice',
            'node_id': inv.id,
            'node_label': inv.invoice_number,
            'invoice_number': inv.invoice_number,
            'date': str(inv.date or inv.created_at.date()),
            'status': inv.status,
            'customer_id': inv.customer_id,
            'customer_name': inv.customer_name,
            'total': inv.total,
            'amount_due': inv.amount_due,
            'next_refs': [
                {
                    'node_type': 'customer',
                    'node_id': inv.customer_id,
                    'label': inv.customer_name,
                }
            ] if inv.customer_id else [],
        }

    if node_type == 'bill':
        try:
            bill = Bill.objects.select_related('supplier').get(tenant=tenant, pk=node_id)
        except Bill.DoesNotExist:
            raise ValueError('Bill not found for drill-down.')
        supplier_name = bill.supplier.name if bill.supplier else (bill.supplier_name or '')
        return {
            'node_type': 'bill',
            'node_id': bill.id,
            'node_label': bill.bill_number,
            'bill_number': bill.bill_number,
            'date': str(bill.date or bill.created_at.date()),
            'status': bill.status,
            'supplier_id': bill.supplier_id,
            'supplier_name': supplier_name,
            'total': bill.total,
            'amount_due': bill.amount_due,
            'next_refs': [
                {
                    'node_type': 'supplier',
                    'node_id': bill.supplier_id,
                    'label': supplier_name,
                }
            ] if bill.supplier_id else [],
        }

    if node_type == 'payment':
        try:
            pay = Payment.objects.select_related('invoice', 'bill').get(tenant=tenant, pk=node_id)
        except Payment.DoesNotExist:
            raise ValueError('Payment not found for drill-down.')
        refs = []
        if pay.invoice_id:
            refs.append({'node_type': 'invoice', 'node_id': pay.invoice_id, 'label': pay.invoice_number})
        if pay.bill_id:
            refs.append({'node_type': 'bill', 'node_id': pay.bill_id, 'label': pay.bill_number})
        return {
            'node_type': 'payment',
            'node_id': pay.id,
            'node_label': pay.payment_number,
            'payment_number': pay.payment_number,
            'date': str(pay.date),
            'status': pay.cheque_status or pay.type,
            'amount': pay.amount,
            'type': pay.type,
            'method': pay.method,
            'next_refs': refs,
        }

    if node_type == 'credit_note':
        try:
            cn = CreditNote.objects.select_related('invoice').get(tenant=tenant, pk=node_id)
        except CreditNote.DoesNotExist:
            raise ValueError('Credit note not found for drill-down.')
        return {
            'node_type': 'credit_note',
            'node_id': cn.id,
            'node_label': cn.credit_note_number,
            'credit_note_number': cn.credit_note_number,
            'date': str(cn.created_at.date()),
            'status': cn.status,
            'total': cn.total,
            'next_refs': [
                {
                    'node_type': 'invoice',
                    'node_id': cn.invoice_id,
                    'label': cn.invoice_number,
                }
            ] if cn.invoice_id else [],
        }

    if node_type == 'debit_note':
        try:
            dn = DebitNote.objects.select_related('bill').get(tenant=tenant, pk=node_id)
        except DebitNote.DoesNotExist:
            raise ValueError('Debit note not found for drill-down.')
        return {
            'node_type': 'debit_note',
            'node_id': dn.id,
            'node_label': dn.debit_note_number,
            'debit_note_number': dn.debit_note_number,
            'date': str(dn.created_at.date()),
            'status': dn.status,
            'total': dn.total,
            'next_refs': [
                {
                    'node_type': 'bill',
                    'node_id': dn.bill_id,
                    'label': dn.bill_number,
                }
            ] if dn.bill_id else [],
        }

    if node_type == 'customer':
        if not date_from or not date_to:
            raise ValueError('date_from and date_to are required for customer drill-down.')
        data = customer_statement(tenant, node_id, date_from, date_to)
        return {
            'node_type': 'customer',
            'node_id': node_id,
            'node_label': data.get('customer', {}).get('name', f'Customer #{node_id}'),
            'date_from': str(date_from),
            'date_to': str(date_to),
            'opening_balance': data.get('opening_balance', _zero()),
            'closing_balance': data.get('closing_balance', _zero()),
            'rows': data.get('transactions', []),
        }

    if node_type == 'supplier':
        if not date_from or not date_to:
            raise ValueError('date_from and date_to are required for supplier drill-down.')
        data = supplier_statement(tenant, node_id, date_from, date_to)
        return {
            'node_type': 'supplier',
            'node_id': node_id,
            'node_label': data.get('supplier', {}).get('name', f'Supplier #{node_id}'),
            'date_from': str(date_from),
            'date_to': str(date_to),
            'opening_balance': data.get('opening_balance', _zero()),
            'closing_balance': data.get('closing_balance', _zero()),
            'rows': data.get('transactions', []),
        }

    raise ValueError(f'Unsupported drill node_type: {node_type}')


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
            'account_id':       acc.pk,
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
        .filter(tenant=tenant, status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID])
        .filter(Q(date__lte=as_of_date) | Q(date__isnull=True, created_at__date__lte=as_of_date))
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
        .filter(tenant=tenant, status=Invoice.STATUS_ISSUED)
        .filter(Q(date__lte=as_of_date) | Q(date__isnull=True, created_at__date__lte=as_of_date))
        .select_related('customer')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
        .order_by('due_date', 'created_at')
    )

    rows = []
    for inv in invoices:
        outstanding = max(inv.total - inv.paid_sum, _zero())
        if outstanding <= _zero():
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
            'invoice_id':     inv.pk,
            'invoice_number': inv.invoice_number,
            'customer_id':    inv.customer_id,
            'customer':       inv.customer.name if inv.customer else '',
            'date':           str(inv.created_at.date()),
            'due_date':       str(due) if due else None,
            'days_overdue':   max(days, 0),
            'total':          inv.total,
            'paid':           inv.paid_sum,
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
    ).filter(
        Q(date__lt=date_from) | Q(date__isnull=True, created_at__date__lt=date_from)
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
        status__in=[Invoice.STATUS_ISSUED, Invoice.STATUS_PAID, Invoice.STATUS_VOID],
    ).filter(_voucher_date_filter(date_from, date_to)).order_by('date', 'created_at'):
        voucher_date = inv.date or inv.created_at.date()
        txns.append({
            'sort_key': f"{voucher_date.isoformat()}-{inv.pk:010d}",
            'date':      str(voucher_date),
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
        .filter(
            tenant=tenant,
            status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID],
        )
        .filter(Q(date__lte=as_of_date) | Q(date__isnull=True, created_at__date__lte=as_of_date))
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
        .filter(tenant=tenant, status=Bill.STATUS_APPROVED)
        .filter(Q(date__lte=as_of_date) | Q(date__isnull=True, created_at__date__lte=as_of_date))
        .select_related('supplier')
        .annotate(paid_sum=Coalesce(DSum('payments__amount'), Value(_zero()), output_field=DecimalField()))
        .order_by('due_date', 'created_at')
    )

    rows = []
    for bill in bills:
        outstanding = max(bill.total - bill.paid_sum, _zero())
        if outstanding <= _zero():
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
            'bill_id':      bill.pk,
            'bill_number': bill.bill_number,
            'supplier_id':  bill.supplier_id,
            'supplier':    sname,
            'date':        str(bill.created_at.date()),
            'due_date':    str(due) if due else None,
            'days_overdue': max(days, 0),
            'total':       bill.total,
            'paid':        bill.paid_sum,
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
    ).filter(
        Q(date__lt=date_from) | Q(date__isnull=True, created_at__date__lt=date_from)
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
        status__in=[Bill.STATUS_APPROVED, Bill.STATUS_PAID, Bill.STATUS_VOID],
    ).filter(_voucher_date_filter(date_from, date_to)).order_by('date', 'created_at'):
        voucher_date = bill.date or bill.created_at.date()
        txns.append({
            'sort_key':    f"{voucher_date.isoformat()}-{bill.pk:010d}",
            'date':        str(voucher_date),
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
    ).filter(_voucher_date_filter(date_from, date_to))


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
            amt_raw = line.get('amount')
            if amt_raw is not None:
                amt = Decimal(str(amt_raw))
            else:
                unit_price = Decimal(str(line.get('unit_price') or 0))
                discount_pct = Decimal(str(line.get('discount') or 0)) / Decimal('100')
                amt = qty * unit_price * (Decimal('1') - discount_pct)
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
        voucher_date = inv.date or inv.created_at.date()
        m = f"{voucher_date.year}-{voucher_date.month:02d}"
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
            'invoice_id':     inv.pk,
            'invoice_number': inv.invoice_number,
            'customer_id':    inv.customer_id,
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
            'bill_id':     bill.pk,
            'bill_number': bill.bill_number,
            'supplier_id': bill.supplier_id,
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


# ─── Cash Book / Bank Book ─────────────────────────────────────────────────────

def cash_book(tenant, date_from, date_to, bank_account_id=None):
    """
    Cash Book / Bank Book — Tally's most-used operational report.

    Shows every cash or bank transaction for the period with a running balance:
      - Opening balance as of date_from  (sum of all movements before that date
        plus Account.opening_balance for migrated tenants)
      - Each posted JournalLine that touches Cash (1100) or a BankAccount's
        linked GL account, grouped by date with debit/credit columns
      - Running balance after each transaction
      - Closing balance as of date_to

    If bank_account_id is supplied, filters to that specific bank account only.
    If None, shows all Cash and Bank activity combined.
    """
    from accounting.models import Account, BankAccount, JournalLine, Invoice, Bill, Payment

    # Determine which GL account(s) to include
    if bank_account_id:
        try:
            bank = BankAccount.objects.get(tenant=tenant, pk=bank_account_id)
        except BankAccount.DoesNotExist:
            raise ValueError(f'Bank account {bank_account_id} not found.')
        if not bank.linked_account:
            raise ValueError(
                f"Bank account '{bank.name}' has no linked GL account. "
                'Set linked_account in Bank Account settings first.'
            )
        accounts = [bank.linked_account]
        bank_meta = {'id': bank.pk, 'name': bank.name}
    else:
        # Collect all Cash + Bank GL accounts for this tenant
        cash_qs = Account.objects.filter(
            tenant=tenant,
            is_active=True,
            type='asset',
        ).filter(
            Q(group__slug='cash_in_hand') |
            Q(group__slug='bank_accounts')
        )
        accounts = list(cash_qs)
        bank_meta = None

    if not accounts:
        return {
            'bank_account':    bank_meta,
            'date_from':       str(date_from),
            'date_to':         str(date_to),
            'opening_balance': str(_zero()),
            'closing_balance': str(_zero()),
            'transactions':    [],
            'period':          _period_meta(date_from, date_to),
        }

    account_ids = [a.pk for a in accounts]

    # Opening balance = Account.opening_balance + all movements BEFORE date_from
    opening = sum(a.opening_balance or _zero() for a in accounts)

    pre = JournalLine.objects.filter(
        entry__tenant=tenant,
        entry__is_posted=True,
        entry__date__lt=date_from,
        account_id__in=account_ids,
    ).aggregate(dr=Sum('debit'), cr=Sum('credit'))
    opening += (pre['dr'] or _zero()) - (pre['cr'] or _zero())

    # Period transactions
    period_lines = (
        JournalLine.objects
        .filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            entry__date__gte=date_from,
            entry__date__lte=date_to,
            account_id__in=account_ids,
        )
        .select_related('entry', 'account')
        .order_by('entry__date', 'entry__entry_number', 'pk')
    )

    transactions = []
    running = opening
    for line in period_lines:
        running += line.debit - line.credit

        # Resolve a human-readable voucher number for drill-down
        ref  = line.entry.reference_type or ''
        rid  = line.entry.reference_id
        voucher_number = ''
        if ref == 'invoice' and rid:
            try:
                voucher_number = Invoice.objects.filter(tenant=tenant, pk=rid).values_list('invoice_number', flat=True).first() or ''
            except Exception:
                pass
        elif ref == 'bill' and rid:
            try:
                voucher_number = Bill.objects.filter(tenant=tenant, pk=rid).values_list('bill_number', flat=True).first() or ''
            except Exception:
                pass
        elif ref == 'payment' and rid:
            try:
                voucher_number = Payment.objects.filter(tenant=tenant, pk=rid).values_list('payment_number', flat=True).first() or ''
            except Exception:
                pass

        transactions.append({
            'date':           str(line.entry.date),
            'entry_number':   line.entry.entry_number,
            'description':    line.entry.description,
            'narration':      line.description,
            'reference_type': ref,
            'reference_id':   rid,
            'voucher_number': voucher_number,
            'debit':          str(line.debit),
            'credit':         str(line.credit),
            'balance':        str(running),
        })

    return {
        'bank_account':    bank_meta,
        'date_from':       str(date_from),
        'date_to':         str(date_to),
        'opening_balance': str(opening),
        'closing_balance': str(running),
        'transactions':    transactions,
        'period':          _period_meta(date_from, date_to),
    }


# ─── Ratio Analysis ───────────────────────────────────────────────────────────

def ratio_analysis(tenant, as_of_date, date_from=None, date_to=None):
    """
    Tally-parity financial ratio analysis.

    Balance-sheet ratios are computed as of ``as_of_date``.
    Profitability and activity ratios require ``date_from`` / ``date_to``.

    Returns
    -------
    {
      as_of_date, period,
      # Liquidity
      current_ratio, quick_ratio, cash_ratio, working_capital,
      # Leverage
      debt_to_equity, debt_to_assets, interest_coverage,
      # Profitability (None when date range not supplied)
      gross_margin_pct, net_margin_pct, roe_pct, roa_pct,
      # Activity
      days_sales_outstanding, days_payable_outstanding,
    }
    """
    def _grp(slug):
        return _section_total(_accounts_by_group_slug(tenant, slug, None, as_of_date))

    def _grp_period(slug):
        if date_from and date_to:
            return _section_total(_accounts_by_group_slug(tenant, slug, date_from, date_to))
        return _zero()

    def _safe_div(num, den):
        if den and den != _zero():
            return round(float(num / den), 4)
        return None

    # ── Balance-sheet components (as_of_date) ────────────────────────────────
    inventory        = _grp('stock_in_hand')
    debtors          = _grp('sundry_debtors')
    cash_in_hand     = _grp('cash_in_hand')
    bank_accounts    = _grp('bank_accounts')
    loans_asset      = _grp('loans_advances_asset')
    other_ca         = _grp('other_current_assets')

    cash_total       = cash_in_hand + bank_accounts
    current_assets   = inventory + debtors + cash_total + loans_asset + other_ca

    creditors        = _grp('sundry_creditors')
    vat_liab         = _grp('duties_taxes_vat')
    tds_liab         = _grp('duties_taxes_tds')
    other_cl         = _grp('current_liabilities')
    current_liab     = creditors + vat_liab + tds_liab + other_cl

    bank_od          = _grp('bank_od')
    loans_liab       = _grp('loans_liability')
    total_liab       = bank_od + loans_liab + current_liab

    capital_accs     = _grp('capital_account')
    reserves         = _grp('reserves_surplus')
    # Include current-year earnings to keep equity accurate
    rev_total = sum(
        _section_total(_accounts_by_group_slug(tenant, s, None, as_of_date))
        for s in ('sales_accounts', 'direct_income', 'indirect_income')
    )
    exp_total = sum(
        _section_total(_accounts_by_group_slug(tenant, s, None, as_of_date))
        for s in ('purchase_accounts', 'direct_expense', 'indirect_expense')
    )
    total_capital    = capital_accs + reserves + (rev_total - exp_total)
    total_assets     = _section_total(_accounts_by_type(tenant, 'asset', None, as_of_date))

    working_capital  = current_assets - current_liab

    # ── Liquidity ratios ─────────────────────────────────────────────────────
    current_ratio    = _safe_div(current_assets,           current_liab)
    quick_ratio      = _safe_div(current_assets - inventory, current_liab)
    cash_ratio       = _safe_div(cash_total,               current_liab)

    # ── Leverage ratios ──────────────────────────────────────────────────────
    debt_to_equity   = _safe_div(total_liab, total_capital)
    debt_to_assets   = _safe_div(total_liab, total_assets)

    # Interest coverage = EBIT / interest_expense
    # (proxy: indirect_expense often contains interest; set to None if no data)
    interest_expense = _grp('indirect_expense') if date_from else _zero()
    ebit = (rev_total - exp_total) if date_from else _zero()
    interest_coverage = None  # complex to compute without dedicated interest account tagging

    # ── Profitability ratios (period only) ────────────────────────────────────
    gross_margin_pct = net_margin_pct = roe_pct = roa_pct = None
    if date_from and date_to:
        sales_period     = _grp_period('sales_accounts') + _grp_period('direct_income')
        purchases_period = _grp_period('purchase_accounts') + _grp_period('direct_expense')
        gross_profit     = sales_period - purchases_period
        indirect_exp_p   = _grp_period('indirect_expense')
        indirect_inc_p   = _grp_period('indirect_income')
        net_profit       = gross_profit - indirect_exp_p + indirect_inc_p

        gross_margin_pct = _safe_div(gross_profit * 100, sales_period)
        net_margin_pct   = _safe_div(net_profit   * 100, sales_period)
        roe_pct          = _safe_div(net_profit   * 100, total_capital)
        roa_pct          = _safe_div(net_profit   * 100, total_assets)

        # Activity ratios
        days = (date_to - date_from).days + 1
        days_sales_outstanding   = _safe_div(debtors  * days, sales_period)   if sales_period  else None
        days_payable_outstanding = _safe_div(creditors * days, purchases_period) if purchases_period else None
    else:
        days_sales_outstanding   = None
        days_payable_outstanding = None

    return {
        'as_of_date':               str(as_of_date),
        'period':                   _period_meta(date_from, date_to),
        # Liquidity
        'current_ratio':            current_ratio,
        'quick_ratio':              quick_ratio,
        'cash_ratio':               cash_ratio,
        'working_capital':          str(working_capital),
        # Leverage
        'debt_to_equity':           debt_to_equity,
        'debt_to_assets':           debt_to_assets,
        'interest_coverage':        interest_coverage,
        # Profitability
        'gross_margin_pct':         gross_margin_pct,
        'net_margin_pct':           net_margin_pct,
        'roe_pct':                  roe_pct,
        'roa_pct':                  roa_pct,
        # Activity
        'days_sales_outstanding':   days_sales_outstanding,
        'days_payable_outstanding': days_payable_outstanding,
    }


# ─── Cost Centre P&L ─────────────────────────────────────────────────────────

def cost_centre_pl(tenant, cost_centre_id, date_from, date_to):
    """
    Profit & Loss filtered to a single Cost Centre.

    Queries only JournalLines where ``cost_centre_id`` matches, giving a
    departmental / project-level P&L breakdown.

    Returns the same shape as ``profit_and_loss`` but every account balance
    reflects only lines tagged to this cost centre.

    Raises ``ValueError`` if the cost centre is not found on the tenant.
    """
    from accounting.models import Account, CostCentre, JournalLine

    try:
        cc = CostCentre.objects.get(pk=cost_centre_id, tenant=tenant)
    except CostCentre.DoesNotExist:
        raise ValueError(f'Cost centre {cost_centre_id} not found.')

    def _cc_group(group_slug):
        """Balances for accounts in group_slug, filtered to this cost centre."""
        accounts = Account.objects.filter(
            tenant=tenant,
            group__slug=group_slug,
            is_active=True,
        ).select_related('group').order_by('code')

        result = []
        for acc in accounts:
            qs = JournalLine.objects.filter(
                entry__tenant=tenant,
                entry__is_posted=True,
                entry__date__gte=date_from,
                entry__date__lte=date_to,
                account=acc,
                cost_centre=cc,
            )
            d  = qs.aggregate(debit=Sum('debit'), credit=Sum('credit'))
            dr = d['debit']  or _zero()
            cr = d['credit'] or _zero()

            if acc.type in ('asset', 'expense'):
                balance = dr - cr
            else:
                balance = cr - dr

            # Only include accounts with activity for this CC
            if balance:
                result.append({
                    'code':       acc.code,
                    'name':       acc.name,
                    'balance':    balance,
                    'group_name': acc.group.name if acc.group else '',
                })
        return result

    sales         = _cc_group('sales_accounts')
    direct_inc    = _cc_group('direct_income')
    purchases     = _cc_group('purchase_accounts')
    direct_exp    = _cc_group('direct_expense')
    indirect_exp  = _cc_group('indirect_expense')
    indirect_inc  = _cc_group('indirect_income')

    gross_revenue      = _section_total(sales) + _section_total(direct_inc)
    total_direct_cost  = _section_total(purchases) + _section_total(direct_exp)
    gross_profit       = gross_revenue - total_direct_cost
    total_indirect_exp = _section_total(indirect_exp)
    total_indirect_inc = _section_total(indirect_inc)
    net_profit         = gross_profit - total_indirect_exp + total_indirect_inc

    return {
        'cost_centre': {'id': cc.pk, 'code': cc.code, 'name': cc.name},
        'date_from':   str(date_from),
        'date_to':     str(date_to),
        'period':      _period_meta(date_from, date_to),
        # Income
        'sales':               sales,
        'direct_income':       direct_inc,
        'gross_revenue':       gross_revenue,
        # Direct costs
        'purchases':           purchases,
        'direct_expenses':     direct_exp,
        'total_direct_cost':   total_direct_cost,
        'gross_profit':        gross_profit,
        # Overhead
        'indirect_expenses':   indirect_exp,
        'indirect_income':     indirect_inc,
        'total_indirect_exp':  total_indirect_exp,
        'total_indirect_inc':  total_indirect_inc,
        # Bottom line
        'net_profit':          net_profit,
    }


# ── Service Ledger ────────────────────────────────────────────────────────────

def service_ledger(tenant, service_id, date_from, date_to):
    """Per-service transaction ledger — invoices + expenses for one service."""
    from inventory.models import Product
    from accounting.models import Invoice, Expense

    try:
        service = Product.objects.filter(
            tenant=tenant, pk=service_id, is_service=True, is_deleted=False
        ).get()
    except Product.DoesNotExist:
        return None

    rows = []
    revenue_total = _zero()
    cost_total = _zero()

    # Revenue from invoice lines that reference this service
    for inv in Invoice.objects.filter(
        tenant=tenant,
        status__in=['issued', 'paid'],
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ).select_related('customer'):
        for line in (inv.line_items or []):
            if (line.get('line_type') == 'service'
                    and str(line.get('service_id', '')) == str(service_id)):
                amt = Decimal(str(line.get('amount') or 0))
                rows.append({
                    'date':        inv.created_at.date().isoformat(),
                    'doc_type':    'Invoice',
                    'doc_number':  inv.invoice_number,
                    'party':       inv.customer.name if inv.customer else '—',
                    'description': line.get('description') or service.name,
                    'revenue':     amt,
                    'cost':        _zero(),
                })
                revenue_total += amt

    # Cost from expenses directly linked to this service
    for exp in Expense.objects.filter(
        tenant=tenant,
        service_id=service_id,
        date__range=(date_from, date_to),
    ).select_related('submitted_by'):
        amt = Decimal(str(exp.amount or 0))
        rows.append({
            'date':        exp.date.isoformat() if exp.date else '',
            'doc_type':    'Expense',
            'doc_number':  f'EXP-{exp.id}',
            'party':       (exp.submitted_by.get_full_name() or exp.submitted_by.email) if exp.submitted_by else '—',
            'description': exp.description,
            'revenue':     _zero(),
            'cost':        amt,
        })
        cost_total += amt

    rows.sort(key=lambda r: r['date'])

    return {
        'service':       {'id': service.pk, 'name': service.name},
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'period':        _period_meta(date_from, date_to),
        'rows':          rows,
        'revenue_total': revenue_total,
        'cost_total':    cost_total,
        'net':           revenue_total - cost_total,
    }


# ── Service Report ────────────────────────────────────────────────────────────

def service_report(tenant, date_from, date_to):
    """Summary of all services — revenue vs cost for the period."""
    from collections import defaultdict
    from inventory.models import Product
    from accounting.models import Invoice, Expense

    services = list(
        Product.objects.filter(
            tenant=tenant, is_service=True, is_deleted=False
        ).order_by('name')
    )
    service_map = {
        s.pk: {
            'id':            s.pk,
            'name':          s.name,
            'invoice_count': 0,
            'revenue':       _zero(),
            'expense_count': 0,
            'cost':          _zero(),
        }
        for s in services
    }

    # Revenue from invoice lines
    for inv in Invoice.objects.filter(
        tenant=tenant,
        status__in=['issued', 'paid'],
        created_at__date__gte=date_from,
        created_at__date__lte=date_to,
    ):
        for line in (inv.line_items or []):
            if line.get('line_type') == 'service':
                sid = line.get('service_id')
                if sid and int(sid) in service_map:
                    amt = Decimal(str(line.get('amount') or 0))
                    service_map[int(sid)]['revenue']       += amt
                    service_map[int(sid)]['invoice_count'] += 1

    # Cost from expenses
    for exp in Expense.objects.filter(
        tenant=tenant,
        service__isnull=False,
        date__range=(date_from, date_to),
    ):
        sid = exp.service_id
        if sid and sid in service_map:
            amt = Decimal(str(exp.amount or 0))
            service_map[sid]['cost']          += amt
            service_map[sid]['expense_count'] += 1

    rows = [
        {**row, 'net': row['revenue'] - row['cost']}
        for row in service_map.values()
    ]
    rows.sort(key=lambda r: r['revenue'], reverse=True)

    return {
        'date_from':     str(date_from),
        'date_to':       str(date_to),
        'period':        _period_meta(date_from, date_to),
        'rows':          rows,
        'total_revenue': sum(r['revenue'] for r in rows),
        'total_cost':    sum(r['cost']    for r in rows),
        'total_net':     sum(r['net']     for r in rows),
    }
