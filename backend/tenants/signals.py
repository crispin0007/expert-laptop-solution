from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant


@receiver(post_save, sender=Tenant)
def create_owner_membership(sender, instance, created, **kwargs):
    """
    When a new Tenant is created, auto-create an owner-level TenantMembership
    for the user who created it (instance.created_by).

    This ensures the creating superadmin can immediately make API calls
    with X-Tenant-Slug and have `ensure_tenant()` succeed.
    """
    if not created:
        return
    if not instance.created_by:
        return

    # Late import to avoid circular dependency
    from accounts.models import TenantMembership

    TenantMembership.objects.get_or_create(
        user=instance.created_by,
        tenant=instance,
        defaults={
            'role': 'admin',
            'is_admin': True,
            'is_active': True,
        },
    )
