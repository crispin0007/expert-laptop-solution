"""
accounting/tasks.py
-------------------
Celery tasks for the accounting module.

Current tasks
~~~~~~~~~~~~~
- task_generate_monthly_payslips : Runs on the 1st of every month at 00:05 UTC.
  For every StaffSalaryProfile, creates a draft Payslip for the previous calendar
  month (if one does not already exist) and auto-creates a TDSEntry when tds_rate > 0.
"""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from core.nepali_date import fiscal_year_of

log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def task_generate_monthly_payslips(self):
    """
    Auto-generate draft payslips for all staff that have a StaffSalaryProfile.

    Schedule: 1st of month, 00:05 UTC  (set in CELERY_BEAT_SCHEDULE).
    Idempotent: skips if a payslip already exists for the staff + previous month.
    """
    from accounting.models import StaffSalaryProfile, Payslip
    from django.db.models import Sum

    today = timezone.localdate()
    first_of_current = today.replace(day=1)
    last_of_prev     = first_of_current - timedelta(days=1)
    first_of_prev    = last_of_prev.replace(day=1)

    log.info(
        "task_generate_monthly_payslips: generating payslips for %s → %s",
        first_of_prev, last_of_prev,
    )

    created_count = 0
    skipped_count = 0
    error_count   = 0

    profiles = (
        StaffSalaryProfile.objects
        .select_related('staff', 'tenant')
        .iterator(chunk_size=200)
    )

    for profile in profiles:
        tenant = profile.tenant
        staff  = profile.staff

        # ── idempotency check ────────────────────────────────────────────────
        if Payslip.objects.filter(
            tenant=tenant,
            staff=staff,
            period_start=first_of_prev,
            period_end=last_of_prev,
        ).exists():
            skipped_count += 1
            continue

        try:
            from accounting.services.payslip_service import PayslipService
            svc = PayslipService(tenant=tenant, user=None)
            payslip, created = svc.generate(
                staff_id     = staff.pk,
                period_start = first_of_prev,
                period_end   = last_of_prev,
            )
            if not created:
                skipped_count += 1
                continue
            log.info(
                "Created payslip #%s for %s @ tenant=%s (net=%s)",
                payslip.pk, staff.email, getattr(tenant, 'schema_name', tenant.pk), payslip.net_pay,
            )
            created_count += 1

        except Exception as exc:
            log.error(
                "Auto-payslip failed for staff=%s tenant=%s: %s",
                staff, getattr(tenant, 'schema_name', tenant.pk), exc,
                exc_info=True,
            )
            error_count += 1

    summary = (
        f"task_generate_monthly_payslips complete: "
        f"created={created_count}, skipped={skipped_count}, errors={error_count}"
    )
    log.info(summary)
    return summary


# ─── Overdue post-dated cheques ───────────────────────────────────────────────

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_flag_overdue_pdcs(self):
    """
    Daily: find cheques in 'issued' or 'presented' state whose date is in the past.
    Logs a warning per cheque. Future: fire notifications per tenant.

    Schedule: daily at 08:00 UTC (set in CELERY_BEAT_SCHEDULE).
    """
    from accounting.models import Payment

    today = timezone.localdate()

    overdue_qs = (
        Payment.objects
        .filter(
            method=Payment.METHOD_CHEQUE,
            cheque_status__in=[Payment.CHEQUE_STATUS_ISSUED, Payment.CHEQUE_STATUS_PRESENTED],
            date__lt=today,
            is_deleted=False,
        )
        .select_related('tenant', 'invoice', 'bill')
        .iterator(chunk_size=200)
    )

    count = 0
    for p in overdue_qs:
        days_overdue = (today - p.date).days
        log.warning(
            'Overdue PDC: payment=%s tenant=%s party="%s" amount=%s days_overdue=%s status=%s',
            p.payment_number,
            getattr(p.tenant, 'slug', p.tenant_id),
            p.party_name,
            p.amount,
            days_overdue,
            p.cheque_status,
        )
        count += 1

    msg = f"task_flag_overdue_pdcs: {count} overdue cheques"
    log.info(msg)
    return msg


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def task_process_reversals(self):
    """
    Daily task: find all posted JournalEntries with ``reversal_date <= today``
    and ``reversed_by`` not yet set, then create and post a reversing entry.

    Schedule: daily at 00:10 UTC (set in CELERY_BEAT_SCHEDULE).
    Idempotent: checks ``reversed_by`` before acting.
    """
    from accounting.models import JournalEntry
    from accounting.services.journal_service import create_reversing_entry
    from django.db.models import Q

    today = timezone.localdate()

    pending = JournalEntry.objects.filter(
        is_posted=True,
        reversal_date__lte=today,
        reversed_by__isnull=True,
    ).select_related('tenant', 'created_by').iterator(chunk_size=200)

    processed = 0
    errors    = 0

    for entry in pending:
        try:
            create_reversing_entry(
                original_entry=entry,
                reversal_date=entry.reversal_date,
                created_by=entry.created_by,   # preserve original author
            )
            processed += 1
            log.info(
                "Auto-reversed entry #%s (tenant=%s, reversal_date=%s)",
                entry.entry_number, entry.tenant_id, entry.reversal_date,
            )
        except Exception as exc:
            errors += 1
            log.error(
                "Auto-reversal failed for entry #%s: %s",
                entry.entry_number, exc,
                exc_info=True,
            )

    summary = f"task_process_reversals: processed={processed}, errors={errors}"
    log.info(summary)
    return summary
