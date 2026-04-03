"""
hrm/tasks.py

Celery tasks for HRM — leave balance seeding and yearly rollover.

Rules:
- Always bind=True + max_retries + default_retry_delay
- Always pass tenant_id (not tenant object) to tasks
- Always idempotent (safe to retry)
- Use iterator(chunk_size=200) for bulk — never .all()
"""
import logging
from datetime import date

from celery import shared_task
from django.db import transaction

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=300, queue='default')
def task_seed_yearly_leave_balances_all_tenants(self):
    """Fan-out task: dispatch task_seed_yearly_leave_balances for every active tenant.

    Called by Celery Beat around Baisakh 1 each year.
    """
    try:
        from tenants.models import Tenant

        tenant_ids = list(
            Tenant.objects.filter(is_active=True).values_list('id', flat=True)
        )
        for tenant_id in tenant_ids:
            task_seed_yearly_leave_balances.delay(tenant_id)
        logger.info('task_seed_yearly_leave_balances_all_tenants dispatched %d tenants', len(tenant_ids))
    except Exception as exc:
        logger.exception('task_seed_yearly_leave_balances_all_tenants failed: %s', exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=300, queue='default')
def task_seed_yearly_leave_balances(self, tenant_id: int):
    """Seed LeaveBalance for all active staff for the new BS year.

    Scheduled by Celery Beat around Baisakh 1 (mid-April AD) — Nepal New Year.
    Also handles carry-forward for leave types that allow it.
    Idempotent: get_or_create means repeated runs are safe.
    """
    try:
        from tenants.models import Tenant
        from hrm.services.leave_service import seed_all_balances_for_year
        from core.nepali_date import ad_to_bs

        tenant = Tenant.objects.get(pk=tenant_id)

        # Determine the new BS year from today's date
        today = date.today()
        bs_today = ad_to_bs(today)
        new_year = bs_today.year

        # Seed new year balances
        total = seed_all_balances_for_year(tenant, new_year)
        logger.info(
            'task_seed_yearly_leave_balances tenant=%s year=%d total=%d',
            tenant.slug, new_year, total,
        )

        # Handle carry-forward from previous year
        _carry_forward_unused_balances(tenant, new_year - 1, new_year)

    except Exception as exc:
        logger.exception('task_seed_yearly_leave_balances failed tenant_id=%s: %s', tenant_id, exc)
        raise self.retry(exc=exc)


@transaction.atomic
def _carry_forward_unused_balances(tenant, from_year: int, to_year: int) -> None:
    """Carry forward unused days for eligible leave types from *from_year* to *to_year*."""
    from hrm.models import LeaveBalance, LeaveType

    carry_types = LeaveType.objects.filter(
        tenant=tenant, is_active=True, carry_forward=True
    )
    for lt in carry_types:
        old_balances = LeaveBalance.objects.filter(
            tenant=tenant, leave_type=lt, year=from_year
        ).iterator(chunk_size=200)

        for old_bal in old_balances:
            unused = old_bal.available
            if unused <= 0:
                continue

            max_cf = lt.max_carry_forward_days
            carry = unused if max_cf == 0 else min(unused, max_cf)

            # Update the new year's balance if it exists
            LeaveBalance.objects.filter(
                tenant=tenant, staff=old_bal.staff, leave_type=lt, year=to_year,
            ).update(carried_forward=carry)

    logger.info(
        '_carry_forward_unused_balances tenant=%s from=%d to=%d done',
        tenant.slug, from_year, to_year,
    )
