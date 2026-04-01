"""
Projects — Service Layer

All project and task business logic lives here. Views call these functions.
EventBus.publish() is called from services only — never from signals or views.
"""
import logging

from django.utils import timezone

from core.events import EventBus

logger = logging.getLogger(__name__)


# ── Project services ──────────────────────────────────────────────────────────

def create_project(*, tenant, created_by, validated_data: dict):
    """Create a new Project and publish project.created.

    Args:
        tenant:         The requesting Tenant instance.
        created_by:     The User creating the project.
        validated_data: Dict from ProjectSerializer (already validated).

    Returns:
        The newly created Project instance.
    """
    from .models import Project

    project = Project(**validated_data)
    project.tenant = tenant
    project.created_by = created_by
    project.save()
    EventBus.publish('project.created', {
        'id': project.id,
        'tenant_id': tenant.id,
        'customer_id': project.customer_id,
        'manager_id': project.manager_id,
    }, tenant=tenant)
    return project


def update_project(*, instance, tenant, validated_data: dict):
    """Apply updates to a Project. Sets completed_at and publishes project.completed
    when the status transitions to 'completed'.

    Args:
        instance:       The existing Project instance.
        tenant:         The requesting Tenant instance.
        validated_data: Dict from ProjectSerializer (already validated, partial ok).

    Returns:
        The updated Project instance.
    """
    old_status = instance.status
    team_members = validated_data.pop('team_members', None)
    for attr, value in validated_data.items():
        setattr(instance, attr, value)

    new_status = instance.status
    transitioning_to_complete = (
        old_status != 'completed' and new_status == 'completed'
    )
    if transitioning_to_complete and not instance.completed_at:
        instance.completed_at = timezone.now()
    elif new_status != 'completed':
        instance.completed_at = None

    instance.save()

    if team_members is not None:
        instance.team_members.set(team_members)

    if transitioning_to_complete:
        EventBus.publish('project.completed', {
            'id': instance.id,
            'tenant_id': tenant.id,
            'customer_id': instance.customer_id,
            'manager_id': instance.manager_id,
            'completed_at': instance.completed_at.isoformat() if instance.completed_at else None,
        }, tenant=tenant)
    return instance


# ── Task services ─────────────────────────────────────────────────────────────

def create_task(*, project, tenant, created_by, validated_data: dict):
    """Create a new ProjectTask, publish task.created, and task.assigned if assigned.

    Args:
        project:        The parent Project instance.
        tenant:         The requesting Tenant instance.
        created_by:     The User creating the task.
        validated_data: Dict from ProjectTaskSerializer (already validated).

    Returns:
        The newly created ProjectTask instance.
    """
    from .models import ProjectTask

    task = ProjectTask(**validated_data)
    task.project = project
    task.tenant = tenant
    task.created_by = created_by
    task.save()

    EventBus.publish('task.created', {
        'id': task.id,
        'tenant_id': tenant.id,
        'project_id': project.id,
        'assigned_to_id': task.assigned_to_id,
    }, tenant=tenant)

    if task.assigned_to_id:
        EventBus.publish('task.assigned', {
            'id': task.id,
            'tenant_id': tenant.id,
            'project_id': project.id,
            'assigned_to_id': task.assigned_to_id,
        }, tenant=tenant)
    return task


def update_task_status(*, task, new_status: str, actual_hours=None):
    """Change a task's status, set completed_at, and publish the relevant event.

    Args:
        task:         The ProjectTask instance to update.
        new_status:   Target status string (must be a valid STATUS_CHOICES value).
        actual_hours: Optional float to record actual time spent.

    Returns:
        The updated ProjectTask instance.

    Raises:
        ValueError: If new_status is not a valid choice.
    """
    from .models import ProjectTask

    valid = [s for s, _ in ProjectTask.STATUS_CHOICES]
    if new_status not in valid:
        raise ValueError(f'Invalid status. Choose from {valid}')

    old_status = task.status
    task.status = new_status
    if actual_hours is not None:
        task.actual_hours = actual_hours
    if new_status == ProjectTask.STATUS_DONE and old_status != ProjectTask.STATUS_DONE:
        task.completed_at = timezone.now()
    elif new_status != ProjectTask.STATUS_DONE:
        task.completed_at = None

    update_fields = ['status', 'completed_at']
    if actual_hours is not None:
        update_fields.append('actual_hours')
    task.save(update_fields=update_fields)

    if new_status == ProjectTask.STATUS_DONE and old_status != ProjectTask.STATUS_DONE:
        EventBus.publish('task.completed', {
            'id': task.id,
            'tenant_id': task.tenant_id,
            'project_id': task.project_id,
            'assigned_to_id': task.assigned_to_id,
        }, tenant=task.tenant)

    return task


def update_task_assignee(*, task, new_assignee_id):
    """Reassign a task and publish task.assigned.

    Args:
        task:             The ProjectTask instance to update.
        new_assignee_id:  New assignee user PK (or None to unassign).

    Returns:
        The updated ProjectTask instance.
    """
    task.assigned_to_id = new_assignee_id
    task.save(update_fields=['assigned_to_id'])
    if new_assignee_id:
        EventBus.publish('task.assigned', {
            'id': task.id,
            'tenant_id': task.tenant_id,
            'project_id': task.project_id,
            'assigned_to_id': new_assignee_id,
        }, tenant=task.tenant)
    return task
