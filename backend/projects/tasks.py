"""
Projects — Celery tasks.

Periodic:
  detect_overdue_tasks  — fire task.overdue for each past-due incomplete task.
"""
import logging

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def detect_overdue_tasks(self, tenant_id: int) -> None:
    """
    Fire task.overdue for every incomplete task whose due_date is in the past.

    Called by Celery Beat — one dispatch per active tenant.
    Passes tenant_id (not tenant object) for safe serialization.
    Uses iterator(chunk_size=200) to avoid loading the full queryset into memory.
    """
    try:
        from tenants.models import Tenant
        from core.events import EventBus
        from .models import ProjectTask

        tenant = Tenant.objects.get(id=tenant_id)
        today = timezone.now().date()

        overdue_qs = (
            ProjectTask.objects
            .filter(tenant=tenant, due_date__lt=today, is_deleted=False)
            .exclude(status=ProjectTask.STATUS_DONE)
            .iterator(chunk_size=200)
        )

        for task in overdue_qs:
            try:
                EventBus.publish('task.overdue', {
                    'id': task.id,
                    'tenant_id': tenant_id,
                    'project_id': task.project_id,
                    'assigned_to_id': task.assigned_to_id,
                }, tenant=tenant)
            except Exception:
                logger.exception('EventBus failed for task.overdue task=%s', task.id)

    except Exception as exc:
        raise self.retry(exc=exc)
