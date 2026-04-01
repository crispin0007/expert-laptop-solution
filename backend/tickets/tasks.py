"""
Celery tasks for the tickets module.

Phase 2: implement async notifications and SLA enforcement.
"""
from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_check_sla_warnings(self, tenant_id: int) -> None:
    """Scan all open tickets approaching SLA breach and send warnings.
    Scheduled via Celery Beat (every 30 minutes).
    Phase 2 — stub only.
    """
    pass


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_mark_overdue_tickets(self, tenant_id: int) -> None:
    """Mark SLA as breached for all tickets past their breach_at.
    Scheduled via Celery Beat (every 15 minutes).
    Phase 2 — stub only.
    """
    pass
