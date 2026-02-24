"""
Project signals.

When a ProjectTask transitions to STATUS_DONE, a CoinTransaction is
automatically created (status=pending) for the assigned staff member.
The manager then approves or rejects it from the coin queue.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender='projects.ProjectTask')
def handle_task_completed(sender, instance, created, **kwargs):
    """
    When a task is marked done, create a pending CoinTransaction for the assignee.
    Guard: only fire when transitioning to 'done' and task has an assignee.
    """
    from projects.models import ProjectTask
    if created:
        return
    if instance.status != ProjectTask.STATUS_DONE:
        return
    if not instance.assigned_to_id:
        return

    from accounting.models import CoinTransaction
    # Avoid creating duplicate coin transactions for the same task
    already_exists = CoinTransaction.objects.filter(
        source_type='task',
        source_id=instance.pk,
        staff=instance.assigned_to,
    ).exists()
    if already_exists:
        return

    try:
        CoinTransaction.objects.create(
            tenant=instance.tenant,
            created_by=instance.assigned_to,
            staff=instance.assigned_to,
            amount=1,  # default 1 coin per task; managers can award more via /coins/award/
            source_type='task',
            source_id=instance.pk,
            status=CoinTransaction.STATUS_PENDING,
            note=f'Task completed: {instance.title}',
        )
        logger.info("CoinTransaction created for task %s → staff %s", instance.pk, instance.assigned_to_id)
    except Exception:
        logger.exception("Failed to create CoinTransaction for task %s", instance.pk)
