from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Tenant


@receiver(post_save, sender=Tenant)
def create_owner_membership(sender, instance, created, **kwargs):
    """
    When a new Tenant is created:
    1. Auto-create an owner-level TenantMembership for the creating user.
    2. Seed all PRELOAD_ROLES into the tenant's custom role library.

    This ensures the creating superadmin can immediately make API calls
    and that every tenant ships with sane default roles (Finance, Technician,
    HR, Support Agent, Project Manager, Read Only).
    """
    if not created:
        return

    # Late imports to avoid circular dependencies at module load time
    from accounts.models import TenantMembership
    from roles.models import Role
    from roles.permissions_map import PRELOAD_ROLES

    # 1. Owner membership for the creating user
    if instance.created_by:
        TenantMembership.objects.get_or_create(
            user=instance.created_by,
            tenant=instance,
            defaults={
                'role': 'admin',
                'is_admin': True,
                'is_active': True,
            },
        )

    # 2. Seed preload roles — skip any that already exist (idempotent)
    for template in PRELOAD_ROLES:
        Role.objects.get_or_create(
            tenant=instance,
            name=template['name'],
            defaults={
                'description': template.get('description', ''),
                'permissions': template.get('permissions', {}),
                'is_system_role': True,
                'created_by': instance.created_by,
            },
        )
