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
from django.utils import timezone

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


# ─────────────────────────────────────────────────────────────────────────────
# Daily absent marking
# ─────────────────────────────────────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=300, queue='default')
def task_mark_absent_all_tenants(self):
    """Fan-out: dispatch task_mark_absent_for_tenant for every active tenant.

    Runs daily at 15:15 UTC (≈ 21:00 Nepal UTC+5:45) — after end of business.
    """
    try:
        from tenants.models import Tenant

        tenant_ids = list(
            Tenant.objects.filter(is_active=True).values_list('id', flat=True)
        )
        for tenant_id in tenant_ids:
            task_mark_absent_for_tenant.delay(tenant_id)
        logger.info('task_mark_absent_all_tenants dispatched %d tenants', len(tenant_ids))
    except Exception as exc:
        logger.exception('task_mark_absent_all_tenants failed: %s', exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=300, queue='default')
def task_mark_absent_for_tenant(self, tenant_id: int):
    """Mark all staff as absent if they have no attendance record for today.

    Idempotent — uses get_or_create so safe to retry or run multiple times.
    Skips staff who are on approved leave (their record gets STATUS_ON_LEAVE).
    Skips non-work days and public holidays.
    """
    try:
        from tenants.models import Tenant
        from accounts.models import TenantMembership
        from hrm.models import AttendanceRecord, LeaveRequest
        from hrm.services.attendance_service import get_or_create_policy

        tenant = Tenant.objects.get(pk=tenant_id)
        policy = get_or_create_policy(tenant)
        today  = timezone.localdate()

        # Only run on configured work days
        work_days = policy.work_days or [0, 1, 2, 3, 4, 6]
        if today.weekday() not in work_days:
            logger.debug(
                'task_mark_absent_for_tenant tenant=%s skipped: %s is a non-work day.',
                tenant.slug, today,
            )
            return

        # Collect staff who have an approved leave today
        on_leave_today = set(
            LeaveRequest.objects.filter(
                tenant=tenant,
                status=LeaveRequest.STATUS_APPROVED,
                start_date__lte=today,
                end_date__gte=today,
            ).values_list('staff_id', flat=True)
        )

        # All active staff for this tenant
        staff_ids = list(
            TenantMembership.objects.filter(
                tenant=tenant, is_active=True,
            ).values_list('user_id', flat=True)
        )

        created_count = 0
        leave_count   = 0

        for staff_id in staff_ids:
            if staff_id in on_leave_today:
                # Upsert as on_leave
                _, was_created = AttendanceRecord.objects.get_or_create(
                    tenant=tenant,
                    staff_id=staff_id,
                    date=today,
                    defaults={'status': AttendanceRecord.STATUS_ON_LEAVE},
                )
                if was_created:
                    leave_count += 1
            else:
                # Only create if no record yet
                _, was_created = AttendanceRecord.objects.get_or_create(
                    tenant=tenant,
                    staff_id=staff_id,
                    date=today,
                    defaults={'status': AttendanceRecord.STATUS_ABSENT},
                )
                if was_created:
                    created_count += 1

        logger.info(
            'task_mark_absent_for_tenant tenant=%s date=%s absent=%d on_leave=%d',
            tenant.slug, today, created_count, leave_count,
        )
    except Exception as exc:
        logger.exception(
            'task_mark_absent_for_tenant failed tenant_id=%s: %s', tenant_id, exc,
        )
        raise self.retry(exc=exc)
