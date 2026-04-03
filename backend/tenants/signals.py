from django.db.models.signals import post_save, m2m_changed
from django.dispatch import receiver
from .models import Tenant, Plan


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

    # Seed Nepal default leave types for the new tenant
    try:
        from hrm.services.leave_service import seed_leave_types
        seed_leave_types(instance)
    except Exception:
        pass  # hrm may not be installed in all deployments


@receiver(m2m_changed, sender=Plan.modules.through)
def bust_tenant_module_cache_on_plan_change(sender, instance, action, **kwargs):
    """
    Whenever a Plan's module set changes (post_add / post_remove / post_clear),
    clear the active_modules_set Redis cache for every tenant on that plan.

    This fires automatically whether the change comes from:
      - A data migration  (plan.modules.add / set)
      - The admin panel
      - The superadmin Plan management API
    No more stale caches after deploying a new module migration.
    """
    if action not in ('post_add', 'post_remove', 'post_clear'):
        return

    # instance is a Plan when the M2M is accessed as plan.modules.*
    # instance is a Module when accessed as module.plans.*
    # Both cases: collect the affected plans.
    if isinstance(instance, Plan):
        plans = [instance]
    else:
        # instance is a Module — all plans that include it
        plans = list(instance.plans.all())

    for plan in plans:
        for tenant in Tenant.objects.filter(plan=plan, is_deleted=False).only('slug'):
            tenant.clear_module_cache()
