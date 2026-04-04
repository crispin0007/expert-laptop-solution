"""
Event listeners for the accounts module.

Listeners react to domain events from other modules.
All listeners are marked with @listens_to — in Phase 2 these will be
auto-registered with the Celery-backed EventBus dispatcher.

Cross-module imports are only allowed for own models + core.
Never import from sibling apps inside listener logic.
"""
import logging

from core.events import listens_to

logger = logging.getLogger(__name__)


@listens_to('staff.deleted', module_id='accounts')
def on_staff_deleted_unassign(payload: dict, tenant) -> None:
    """When a staff member is deactivated, unassign their open tickets and tasks."""
    try:
        from django.apps import apps
        from core.events import EventBus

        staff_id = payload.get('id') or payload.get('staff_id') or payload.get('user_id')
        if not staff_id:
            logger.warning('on_staff_deleted_unassign: no staff_id in payload=%s', payload)
            return

        Ticket = apps.get_model('tickets', 'Ticket')
        Task   = apps.get_model('projects', 'Task')

        # Unassign open tickets
        open_tickets = Ticket.objects.for_tenant(tenant).filter(
            assigned_to_id=staff_id,
            status__in=['open', 'in_progress', 'pending'],
        )
        ticket_count = 0
        for ticket in open_tickets.iterator(chunk_size=200):
            ticket.assigned_to = None
            ticket.save(update_fields=['assigned_to', 'updated_at'])
            ticket_count += 1
            try:
                EventBus.publish('ticket.assigned', {
                    'id':             ticket.pk,
                    'tenant_id':      tenant.id,
                    'assigned_to_id': None,
                    'reason':         'staff_deactivated',
                }, tenant=tenant)
            except Exception:
                pass

        # Unassign open tasks
        open_tasks = Task.objects.for_tenant(tenant).filter(
            assigned_to_id=staff_id,
            status__in=['todo', 'in_progress'],
        )
        task_count = 0
        for task in open_tasks.iterator(chunk_size=200):
            task.assigned_to = None
            task.save(update_fields=['assigned_to', 'updated_at'])
            task_count += 1
            try:
                EventBus.publish('task.assigned', {
                    'id':             task.pk,
                    'tenant_id':      tenant.id,
                    'assigned_to_id': None,
                    'reason':         'staff_deactivated',
                }, tenant=tenant)
            except Exception:
                pass

        logger.info(
            'on_staff_deleted_unassign: unassigned %d tickets + %d tasks for staff=%s tenant=%s',
            ticket_count, task_count, staff_id, tenant.slug,
        )
    except Exception as exc:
        logger.exception('on_staff_deleted_unassign listener failed: %s', exc)


# @listens_to('tenant.created', module_id='accounts')
# def on_tenant_created(payload: dict, tenant) -> None:
#     """Seed default roles when a new tenant workspace is created."""
#     # Phase 2: auto-seed PRELOAD_ROLES for new tenant.
#     pass


# @listens_to('user.login', module_id='accounts')
# def on_user_login(payload: dict, tenant) -> None:
#     """Update last-seen timestamp, invalidate anomaly detection cache."""
#     pass
