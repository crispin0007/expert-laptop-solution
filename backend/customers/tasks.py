"""
Async Celery tasks for the customers module.

Task guidelines:
  - Always bind=True + max_retries + default_retry_delay.
  - Always accept tenant_id (int), never a Tenant object.
  - Always idempotent — safe to retry on transient failures.
"""
from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_customer_birthday_greetings(self, tenant_id: int) -> None:
    """Send birthday greeting notifications to customers whose birthday is today.

    Triggered by Celery Beat daily schedule (Phase 2).
    """
    # Phase 2: implement birthday detection and notification dispatch.
    pass


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_flag_inactive_customers(self, tenant_id: int) -> None:
    """Flag customers with no activity in 30+ days and publish customer.inactive events.

    Triggered by Celery Beat daily schedule (Phase 2).
    """
    # Phase 2: implement inactivity detection and event publication.
    pass
