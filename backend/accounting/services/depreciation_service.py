"""
depreciation_service.py
=======================
Fixed Asset depreciation engine.

Runs monthly/yearly depreciation for all active FixedAsset records belonging
to a tenant.  Supports:
  - Straight-Line Method (SLM)
  - Written-Down Value / Diminishing Balance (WDV)

Each period's depreciation is posted as a JournalEntry via
journal_service.create_depreciation_journal().

Celery task usage (in tasks.py):
    from accounting.services.depreciation_service import run_depreciation_for_tenant
    run_depreciation_for_tenant(tenant_id=tenant.pk, period_date=date.today())
"""
import logging
from datetime import date
from decimal import Decimal

log = logging.getLogger(__name__)


def run_depreciation_for_tenant(tenant_id: int, period_date: date, created_by=None) -> dict:
    """
    Post one period's depreciation for every active FixedAsset under *tenant*.

    *period_date* should be the last day of the period (e.g. month-end or
    fiscal year-end in BS calendar).

    Returns a summary dict:
        {
            'posted': [asset_id, ...],
            'skipped': [asset_id, ...],
            'errors': [{'asset_id': ..., 'error': '...'}, ...],
        }

    Idempotent: if a depreciation journal already exists for this asset
    on *period_date*, the asset is added to 'skipped' and no duplicate is created.
    """
    from tenants.models import Tenant
    from accounting.models import FixedAsset, JournalEntry
    from accounting.services.journal_service import create_depreciation_journal

    try:
        tenant = Tenant.objects.get(pk=tenant_id)
    except Tenant.DoesNotExist:
        raise ValueError(f'Tenant {tenant_id} does not exist.')

    assets = (
        FixedAsset.objects
        .filter(tenant=tenant, status=FixedAsset.STATUS_ACTIVE, is_deleted=False)
        .iterator(chunk_size=200)   # never load all at once
    )

    posted  = []
    skipped = []
    errors  = []

    for asset in assets:
        # Idempotency check: already posted for this date?
        already = JournalEntry.objects.filter(
            tenant=tenant,
            reference_type='depreciation',
            reference_id=asset.pk,
            date=period_date,
            is_posted=True,
        ).exists()
        if already:
            skipped.append(asset.pk)
            log.debug('Depreciation already posted for asset %s on %s — skipped.', asset.pk, period_date)
            continue

        try:
            entry = create_depreciation_journal(asset, period_date, created_by=created_by)
            if entry:
                posted.append(asset.pk)
                log.info('Depreciation posted: asset=%s entry=%s date=%s', asset.pk, entry.pk, period_date)
            else:
                skipped.append(asset.pk)
                log.debug('Depreciation skipped (zero charge): asset=%s date=%s', asset.pk, period_date)
        except ValueError as exc:
            errors.append({'asset_id': asset.pk, 'error': str(exc)})
            log.warning('Depreciation skipped for asset %s: %s', asset.pk, exc)
        except Exception as exc:
            errors.append({'asset_id': asset.pk, 'error': str(exc)})
            log.error('Depreciation failed for asset %s: %s', asset.pk, exc, exc_info=True)

    log.info(
        'Depreciation run complete: tenant=%s date=%s posted=%d skipped=%d errors=%d',
        tenant.slug, period_date, len(posted), len(skipped), len(errors),
    )
    return {'posted': posted, 'skipped': skipped, 'errors': errors}


def depreciation_schedule(asset) -> list:
    """
    Return the full depreciation schedule for *asset* from purchase_date to
    full depreciation (or useful_life_months, whichever comes first).

    Each row: {'period': date, 'charge': Decimal, 'accumulated': Decimal, 'nbv': Decimal}

    Useful for the Fixed Asset Register view / PDF report.
    Does NOT write any DB records.
    """
    from dateutil.relativedelta import relativedelta
    from accounting.models import FixedAsset

    schedule = []
    if asset.status == FixedAsset.STATUS_DISPOSED:
        return schedule

    accumulated = asset.total_depreciated
    current_nbv = asset.purchase_cost - accumulated
    period = asset.purchase_date.replace(day=1) + relativedelta(months=1)

    # Limit to useful_life_months periods
    for _ in range(asset.useful_life_months):
        if current_nbv <= asset.residual_value:
            break

        if asset.method == FixedAsset.METHOD_SLM:
            charge = asset.monthly_slm_charge()
        else:
            # WDV: annual rate ÷ 12
            annual = (current_nbv * (asset.depreciation_rate or Decimal('0'))).quantize(Decimal('0.01'))
            charge = (annual / Decimal('12')).quantize(Decimal('0.01'))

        # Cap to avoid going below residual
        max_charge = (current_nbv - asset.residual_value).quantize(Decimal('0.01'))
        charge = min(charge, max_charge)

        if charge <= Decimal('0'):
            break

        accumulated += charge
        current_nbv = asset.purchase_cost - accumulated
        schedule.append({
            'period':      period - relativedelta(days=1),   # last day of previous month
            'charge':      charge,
            'accumulated': accumulated,
            'nbv':         current_nbv,
        })
        period += relativedelta(months=1)

    return schedule
