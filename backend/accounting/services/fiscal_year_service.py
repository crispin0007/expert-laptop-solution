"""
fiscal_year_service.py
======================
Year-end closing: transfer net P&L to Retained Earnings and lock the FY.

Process
-------
1. Compute the date range for the Nepali BS fiscal year (fy_year).
2. Run profit_and_loss() for that range.
3. Find (or create) the Retained Earnings account.
4. Build a closing JournalEntry:
     DR all P&L accounts with balances != 0
     CR Retained Earnings (net profit)
   or if net loss:
     DR Retained Earnings
     CR all P&L accounts with balances != 0
5. Post the entry.
6. Create FiscalYearClose record linked to that entry.
"""
from decimal import Decimal
from django.db import transaction


def close_fiscal_year(tenant, fy_year: int, closed_by, notes: str = ''):
    """
    Close fiscal year *fy_year* (Nepali BS year, e.g. 2081) for *tenant*.

    Returns the created FiscalYearClose instance.
    Raises ValueError if already closed.
    Raises ConflictError if net P&L is zero (nothing to close).
    """
    from accounting.models import (
        Account, JournalEntry, JournalLine, FiscalYearClose,
    )
    from accounting.services.journal_service import _get_account_by_group
    from accounting.services.report_service import profit_and_loss
    from core.nepali_date import fiscal_year_date_range, FiscalYear
    from core.exceptions import ConflictError

    # ── Guard: already closed? ────────────────────────────────────────────────
    if FiscalYearClose.objects.filter(tenant=tenant, fy_year=fy_year).exists():
        raise ValueError(f'Fiscal year {fy_year} is already closed.')

    # ── Date range for the FY ─────────────────────────────────────────────────
    fy  = FiscalYear(bs_year=fy_year)
    start_ad, end_ad = fiscal_year_date_range(fy)

    # ── P&L for the year ─────────────────────────────────────────────────────
    pl = profit_and_loss(tenant, start_ad, end_ad)
    net_profit = Decimal(str(pl['net_profit']))

    if net_profit == Decimal('0'):
        raise ConflictError('Net P&L for this fiscal year is zero — nothing to close.')

    # ── Retained Earnings account ─────────────────────────────────────────────
    try:
        retained_earnings = _get_account_by_group(
            tenant,
            'reserves_surplus',
            fallback_code='3200',
        )
    except ValueError:
        # Fall back: try to find by name
        retained_earnings = (
            Account.objects.filter(
                tenant=tenant,
                name__icontains='retained earning',
            ).first()
        )
        if retained_earnings is None:
            retained_earnings = (
                Account.objects.filter(
                    tenant=tenant,
                    name__icontains='surplus',
                ).first()
            )
        if retained_earnings is None:
            raise ValueError(
                "No 'Retained Earnings' / 'Reserves & Surplus' account found. "
                "Create one under the Reserves & Surplus group before closing."
            )

    # ── Gather P&L account balances ───────────────────────────────────────────
    from accounting.models import JournalLine as JLine
    from django.db.models import Sum

    # All revenue and expense accounts with non-zero net movement in the period
    pl_balances = (
        JLine.objects.filter(
            entry__tenant=tenant,
            entry__is_posted=True,
            entry__date__gte=start_ad,
            entry__date__lte=end_ad,
            account__type__in=('revenue', 'expense'),
        )
        .values('account', 'account__type', 'account__name', 'account__code')
        .annotate(total_dr=Sum('debit'), total_cr=Sum('credit'))
    )

    closing_lines = []   # (account, debit, credit, description)
    for row in pl_balances:
        dr = row['total_dr'] or Decimal('0')
        cr = row['total_cr'] or Decimal('0')

        acct = Account.objects.get(pk=row['account'])
        # N3 fix: include opening_balance in the account's full balance so the
        # closing entry zeros the entire account, not just period movements.
        # Without this, accounts with a non-zero opening_balance (e.g. migrated
        # tenants or mid-year FY opens) produce an unbalanced closing journal.
        ob = acct.opening_balance or Decimal('0')
        label = f"Year-end close: {row['account__name']}"

        if row['account__type'] == 'revenue':
            # Revenue is credit-normal: full balance = OB + cr − dr
            # DR the full balance to bring it to zero.
            full_balance = ob + cr - dr
            if full_balance != Decimal('0'):
                closing_lines.append((acct, full_balance, Decimal('0'), label))
        else:
            # Expense is debit-normal: full balance = OB + dr − cr
            # CR the full balance to bring it to zero.
            full_balance = ob + dr - cr
            if full_balance != Decimal('0'):
                closing_lines.append((acct, Decimal('0'), full_balance, label))

    if not closing_lines:
        raise ConflictError('No P&L transactions found for this fiscal year.')

    # Retained Earnings gets the NET (DR if net loss, CR if net profit)
    re_label = f'Year-end close FY {fy_year}: net {"profit" if net_profit > 0 else "loss"}'
    if net_profit > 0:
        closing_lines.append((retained_earnings, Decimal('0'), net_profit, re_label))
    else:
        closing_lines.append((retained_earnings, abs(net_profit), Decimal('0'), re_label))

    # ── Create + post the closing entry ──────────────────────────────────────
    with transaction.atomic():
        entry = JournalEntry.objects.create(
            tenant=tenant,
            created_by=closed_by,
            date=end_ad,
            description=f'Year-end closing entry for FY {fy_year}/{str(fy_year + 1)[2:]}',
            reference_type='fiscal_year_close',
            reference_id=fy_year,
        )
        for acct, dr, cr, desc in closing_lines:
            JLine.objects.create(
                entry=entry,
                account=acct,
                debit=dr,
                credit=cr,
                description=desc,
            )
        entry.post()

        fy_close = FiscalYearClose.objects.create(
            tenant=tenant,
            fy_year=fy_year,
            journal_entry=entry,
            closed_by=closed_by,
            retained_earnings_amount=net_profit,
            notes=notes,
        )

    return fy_close
