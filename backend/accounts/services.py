"""
Accounts — Staff Service Layer

All staff business logic lives here. Views call these functions and stay thin.
EventBus.publish() is called from services only — never from views or signals.
"""
import logging

from django.core.cache import cache

from core.events import EventBus

logger = logging.getLogger(__name__)

_AVAILABILITY_CACHE_KEY = 'staff_availability_{tenant_id}'


def _bust_availability_cache(tenant) -> None:
    cache.delete(_AVAILABILITY_CACHE_KEY.format(tenant_id=tenant.pk))


def invite_staff(*, tenant, data: dict):
    """Create a new staff user + TenantMembership from validated serializer data.

    Args:
        tenant: The requesting Tenant instance.
        data:   Validated data dict from InviteStaffSerializer.

    Returns:
        The newly created User instance.
    """
    from .serializers import InviteStaffSerializer

    serializer = InviteStaffSerializer(data=data, context={'tenant': tenant})
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    _bust_availability_cache(tenant)
    EventBus.publish('staff.created', {
        'id': user.pk,
        'tenant_id': tenant.pk,
        'email': user.email,
    }, tenant=tenant)
    return user


def update_staff(*, tenant, user, data: dict):
    """Apply a partial profile update to a staff member.

    Args:
        tenant: The requesting Tenant instance (used for serializer scoping).
        user:   The User instance to update.
        data:   Validated data dict from UpdateStaffSerializer (partial).

    Returns:
        The updated User instance.
    """
    from .serializers import UpdateStaffSerializer

    serializer = UpdateStaffSerializer(
        user, data=data, partial=True, context={'tenant': tenant}
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    _bust_availability_cache(tenant)
    EventBus.publish('staff.updated', {
        'id': user.pk,
        'tenant_id': tenant.pk,
        'change': 'profile_updated',
    }, tenant=tenant)
    return user


def deactivate_staff(*, tenant, membership):
    """Deactivate a staff member's access to this tenant.

    Args:
        tenant:     The requesting Tenant instance.
        membership: The TenantMembership instance to deactivate.

    Raises:
        ValueError: If the member is already inactive.
    """
    if not membership.is_active:
        raise ValueError('Staff member is already inactive.')
    membership.is_active = False
    membership.save(update_fields=['is_active'])
    _bust_availability_cache(tenant)
    EventBus.publish('staff.updated', {
        'id': membership.user_id,
        'tenant_id': tenant.pk,
        'change': 'deactivated',
    }, tenant=tenant)


def reactivate_staff(*, tenant, membership):
    """Re-enable a staff member's access and send a reactivation email.

    Args:
        tenant:     The requesting Tenant instance.
        membership: The TenantMembership instance to reactivate.

    Raises:
        ValueError: If the member is already active.
    """
    if membership.is_active:
        raise ValueError('Staff member is already active.')
    membership.is_active = True
    membership.save(update_fields=['is_active'])
    _bust_availability_cache(tenant)
    EventBus.publish('staff.updated', {
        'id': membership.user_id,
        'tenant_id': tenant.pk,
        'change': 'reactivated',
    }, tenant=tenant)
    # Send reactivation email — try Celery first, fall back to sync send.
    # SECURITY: new_password is not involved here; no sensitive data in task args.
    try:
        from notifications.tasks import task_send_staff_reactivated
        task_send_staff_reactivated.delay(
            user_id=membership.user.pk, tenant_id=tenant.pk
        )
    except Exception:
        try:
            from notifications.email import send_staff_reactivated
            send_staff_reactivated(membership.user, tenant)
        except Exception:
            logger.warning('staff.reactivate_email_failed', extra={'user_id': membership.user_id})


def assign_role(*, tenant, membership, role: str, custom_role_id=None):
    """Assign a system or custom role to a staff member.

    Args:
        tenant:         The requesting Tenant instance.
        membership:     The TenantMembership instance to update.
        role:           System role string ('owner', 'admin', 'manager', 'staff', 'viewer', 'custom').
        custom_role_id: Required when role == 'custom'.

    Returns:
        The updated TenantMembership instance.

    Raises:
        ValueError: On invalid role string or missing custom_role_id.
        LookupError: If custom_role_id does not belong to this tenant.
    """
    valid_system_roles = ['owner', 'admin', 'manager', 'staff', 'viewer', 'custom']
    if role not in valid_system_roles:
        raise ValueError(f'Invalid role. Choose from: {", ".join(valid_system_roles)}')

    # Prevent demoting the last owner — would lock the workspace
    if membership.role == 'owner' and role != 'owner':
        from .models import TenantMembership as _TM
        remaining_owners = (
            _TM.objects.filter(tenant=tenant, role='owner', is_active=True)
            .exclude(pk=membership.pk)
            .count()
        )
        if remaining_owners == 0:
            raise ValueError('Cannot demote the last owner of this workspace.')

    if role == 'custom':
        if not custom_role_id:
            raise ValueError('custom_role_id is required when role is "custom".')
        from roles.models import Role as CustomRole
        try:
            custom_role = CustomRole.objects.get(pk=custom_role_id, tenant=tenant)
        except CustomRole.DoesNotExist:
            raise LookupError('Custom role not found in this workspace.')
        membership.role = 'custom'
        membership.custom_role = custom_role
    else:
        membership.role = role
        membership.custom_role = None

    membership.save(update_fields=['role', 'custom_role'])
    _bust_availability_cache(tenant)
    EventBus.publish('staff.updated', {
        'id': membership.user_id,
        'tenant_id': tenant.pk,
        'change': 'role_assigned',
        'role': membership.role,
    }, tenant=tenant)
    return membership
