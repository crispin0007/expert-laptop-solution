"""
Event listeners for the departments module.

Listeners react to domain events from other modules.
All listeners are marked with @listens_to — in Phase 2 these will be
auto-registered with the Celery-backed EventBus dispatcher.
"""
from core.events import listens_to


@listens_to('staff.deleted', module_id='departments')
def on_staff_deleted(payload: dict, tenant) -> None:
    """Clear the department head FK if a deleted staff member is a department head."""
    from .models import Department
    Department.objects.filter(
        tenant_id=payload['tenant_id'],
        head_id=payload['id'],
    ).update(head=None)

