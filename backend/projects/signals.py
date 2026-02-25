"""
Project signals.

1. Task → STATUS_DONE: create pending CoinTransaction for assignee.
2. Task created/assignee changed: send task_assigned notification.
3. Task → STATUS_DONE: notify project manager.
4. Project created / manager changed: notify project manager.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
import logging

logger = logging.getLogger(__name__)


# ── Cache pre-save state for change detection ─────────────────────────────────

@receiver(pre_save, sender='projects.ProjectTask')
def _cache_task_state(sender, instance, **kwargs):
    """Store previous assigned_to_id and status before save."""
    if instance.pk:
        try:
            prev = sender.objects.values('assigned_to_id', 'status').get(pk=instance.pk)
            instance._pre_assigned_to_id = prev['assigned_to_id']
            instance._pre_status = prev['status']
        except sender.DoesNotExist:
            instance._pre_assigned_to_id = None
            instance._pre_status = None
    else:
        instance._pre_assigned_to_id = None
        instance._pre_status = None


@receiver(pre_save, sender='projects.Project')
def _cache_project_manager(sender, instance, **kwargs):
    """Store previous manager_id before save."""
    if instance.pk:
        try:
            instance._pre_manager_id = sender.objects.values_list('manager_id', flat=True).get(pk=instance.pk)
        except sender.DoesNotExist:
            instance._pre_manager_id = None
    else:
        instance._pre_manager_id = None


# ── Task signals ──────────────────────────────────────────────────────────────

@receiver(post_save, sender='projects.ProjectTask')
def handle_task_completed(sender, instance, created, **kwargs):
    """
    When a task is marked done:
      1. Create a pending CoinTransaction for the assignee.
      2. Notify the project manager.
    """
    from projects.models import ProjectTask
    if created:
        return
    if instance.status != ProjectTask.STATUS_DONE:
        return
    old_status = getattr(instance, '_pre_status', None)
    if old_status == ProjectTask.STATUS_DONE:
        return  # already done — no double-fire
    if not instance.assigned_to_id:
        return

    # ── Coins ────────────────────────────────────────────────────────────────
    from accounting.models import CoinTransaction
    already_exists = CoinTransaction.objects.filter(
        source_type='task',
        source_id=instance.pk,
        staff=instance.assigned_to,
    ).exists()
    if not already_exists:
        try:
            CoinTransaction.objects.create(
                tenant=instance.tenant,
                created_by=instance.assigned_to,
                staff=instance.assigned_to,
                amount=1,
                source_type='task',
                source_id=instance.pk,
                status=CoinTransaction.STATUS_PENDING,
                note=f'Task completed: {instance.title}',
            )
            logger.info("CoinTransaction created for task %s → staff %s", instance.pk, instance.assigned_to_id)
        except Exception:
            logger.exception("Failed to create CoinTransaction for task %s", instance.pk)

    # ── Notify project manager ────────────────────────────────────────────────
    try:
        from notifications.service import notify_task_completed
        notify_task_completed(instance)
    except Exception:
        logger.exception("Failed to send task_completed notification for task %s", instance.pk)


@receiver(post_save, sender='projects.ProjectTask')
def handle_task_assigned(sender, instance, created, **kwargs):
    """Fire task_assigned notification when a task is created with an assignee
    or when the assignee changes on an existing task."""
    if not instance.assigned_to_id:
        return

    pre_assigned = getattr(instance, '_pre_assigned_to_id', None)
    if not created and pre_assigned == instance.assigned_to_id:
        return  # assignee didn't change

    # Don't double-fire on STATUS_DONE transition (handle_task_completed handles its own logic)
    try:
        from notifications.service import notify_task_assigned
        notify_task_assigned(instance)
    except Exception:
        logger.exception("Failed to send task_assigned notification for task %s", instance.pk)


# ── Project signals ───────────────────────────────────────────────────────────

@receiver(post_save, sender='projects.Project')
def handle_project_manager_assigned(sender, instance, created, **kwargs):
    """Notify the manager when a project is created or its manager changes."""
    if not instance.manager_id:
        return
    pre_manager = getattr(instance, '_pre_manager_id', None)
    if not created and pre_manager == instance.manager_id:
        return  # manager didn't change
    try:
        from notifications.service import notify_project_assigned
        notify_project_assigned(instance)
    except Exception:
        logger.exception("Failed to send project_assigned notification for project %s", instance.pk)
