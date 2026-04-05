"""
Customer service layer — all customer business logic lives here.

Views call service functions; views never touch the ORM directly
for business operations (create, update, soft-delete).
"""
import logging

from core.events import EventBus
from parties.services import resolve_or_create_customer_party


logger = logging.getLogger(__name__)


def _sync_customer_party(instance) -> None:
    """Best-effort Party sync for customer profile changes.

    Sync failures are logged and do not block customer operations.
    """
    try:
        resolve_or_create_customer_party(instance, dry_run=False)
    except Exception as exc:
        logger.exception('Customer->Party sync failed for customer %s: %s', instance.pk, exc)


def create_customer(*, tenant, created_by, data: dict):
    """Create and return a new Customer for the given tenant.

    Args:
        tenant:     Resolved Tenant instance (from request.tenant).
        created_by: User instance performing the action.
        data:       Validated data dict from CustomerSerializer.

    Returns:
        Customer instance (already saved).
    """
    from .models import Customer

    customer = Customer(
        tenant=tenant,
        created_by=created_by,
        is_active=True,
        **data,
    )
    customer.save()
    _sync_customer_party(customer)

    EventBus.publish('customer.created', {
        'id': customer.pk,
        'tenant_id': tenant.pk,
        'name': customer.name,
        'type': customer.type,
    }, tenant=tenant)

    return customer


def update_customer(*, instance, tenant, data: dict):
    """Apply partial or full update to a Customer.

    Args:
        instance:   Customer instance to update.
        tenant:     Current tenant (for event payload).
        data:       Validated data dict from CustomerSerializer.

    Returns:
        Updated Customer instance.
    """
    for attr, value in data.items():
        setattr(instance, attr, value)
    instance.save()
    _sync_customer_party(instance)

    EventBus.publish('customer.updated', {
        'id': instance.pk,
        'tenant_id': tenant.pk,
    }, tenant=tenant)

    return instance


def soft_delete_customer(*, instance, tenant):
    """Soft-delete a Customer.

    Args:
        instance:   Customer instance to delete.
        tenant:     Current tenant (for event payload and access check).

    Raises:
        ValueError: If the customer does not belong to the given tenant.
    """
    if instance.tenant_id != tenant.pk:
        raise ValueError('Customer does not belong to this workspace.')

    instance.soft_delete()

    EventBus.publish('customer.deleted', {
        'id': instance.pk,
        'tenant_id': tenant.pk,
    }, tenant=tenant)
