"""
Project signals — thin domain hooks only.

Responsibilities:
1. Task → STATUS_DONE: create pending CoinTransaction for assignee.
2. Project created / manager changed: send project_assigned notification.

Pre-save state (manager_id, status, assigned_to_id) is captured via
Project.from_db() and ProjectTask.from_db() — no extra DB query needed here.

EventBus.publish() is NOT called here — services handle event publication.
Notifications for task.assigned and task.completed are handled by
notifications/listeners.py reacting to EventBus events published by services.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

logger = logging.getLogger(__name__)


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
            coin_reward = getattr(instance.tenant, 'task_coin_reward', 1)
            CoinTransaction.objects.create(
                tenant=instance.tenant,
                created_by=instance.assigned_to,
                staff=instance.assigned_to,
                amount=coin_reward,
                source_type='task',
                source_id=instance.pk,
                status=CoinTransaction.STATUS_PENDING,
                note=f'Task completed: {instance.title}',
            )
            logger.info("CoinTransaction created for task %s → staff %s", instance.pk, instance.assigned_to_id)
        except Exception:
            logger.exception("Failed to create CoinTransaction for task %s", instance.pk)
    # EventBus.publish('task.completed') is called by update_task_status() service.


@receiver(post_save, sender='projects.ProjectTask')
def handle_task_assigned(sender, instance, created, **kwargs):
    """Fire task_assigned notification when a task is created with an assignee
    or when the assignee changes on an existing task."""
    if not instance.assigned_to_id:
        return

    pre_assigned = getattr(instance, '_pre_assigned_to_id', None)
    if not created and pre_assigned == instance.assigned_to_id:
        return  # assignee didn't change

    # EventBus.publish('task.assigned') is called by create_task() / update_task_assignee() services.
    # Notification is handled by notifications.listeners.on_task_assigned via EventBus.


# ── Project signals ───────────────────────────────────────────────────────────

@receiver(post_save, sender='projects.Project')
def handle_project_lifecycle(sender, instance, created, **kwargs):
    """Placeholder — project lifecycle events are published by project services."""
    # EventBus.publish('project.created') → create_project() service
    # EventBus.publish('project.completed') → update_project() service


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


@receiver(post_save, sender='projects.ProjectTask')
def handle_task_created(sender, instance, created, **kwargs):
    """Fire task.created when a new task is added."""
    if not created:
        return
    # EventBus.publish('task.created') is called by create_task() service.
