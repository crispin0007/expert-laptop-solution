"""
Department service layer — all department business logic lives here.

Views call service functions; views never touch the ORM directly
for business operations (create, update, delete).
"""
from core.events import EventBus


def create_department(*, tenant, created_by, data: dict):
    """Create and return a new Department for the given tenant.

    Args:
        tenant:     Resolved Tenant instance (from request.tenant).
        created_by: User instance performing the action.
        data:       Validated data dict from DepartmentSerializer.

    Returns:
        Department instance (already saved).
    """
    from .models import Department

    department = Department(
        tenant=tenant,
        created_by=created_by,
        **data,
    )
    department.save()

    EventBus.publish('department.created', {
        'id': department.pk,
        'tenant_id': tenant.pk,
        'name': department.name,
    }, tenant=tenant)

    return department


def update_department(*, instance, tenant, data: dict):
    """Apply partial or full update to a Department.

    Args:
        instance:   Department instance to update.
        tenant:     Current tenant (for event payload).
        data:       Validated data dict from DepartmentSerializer.

    Returns:
        Updated Department instance.
    """
    for attr, value in data.items():
        setattr(instance, attr, value)
    instance.save()

    EventBus.publish('department.updated', {
        'id': instance.pk,
        'tenant_id': tenant.pk,
    }, tenant=tenant)

    return instance


def delete_department(*, instance, tenant):
    """Delete a Department.

    Args:
        instance:   Department instance to delete.
        tenant:     Current tenant (for event payload and access check).

    Raises:
        ValueError: If the department does not belong to the given tenant.
    """
    if instance.tenant_id != tenant.pk:
        raise ValueError('Department does not belong to this workspace.')

    dept_id = instance.pk
    instance.delete()

    EventBus.publish('department.deleted', {
        'id': dept_id,
        'tenant_id': tenant.pk,
    }, tenant=tenant)
