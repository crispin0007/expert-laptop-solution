"""
Celery tasks for the departments module.

Phase 2: implement async notifications for department events.
"""
from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_notify_department_head_assigned(self, department_id: int, tenant_id: int) -> None:
    """Notify the newly assigned department head by email.
    Phase 2 — stub only.
    """
    pass
