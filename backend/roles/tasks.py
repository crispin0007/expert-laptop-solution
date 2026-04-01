"""
Async Celery tasks for the roles module.

Task guidelines:
  - Always bind=True + max_retries + default_retry_delay.
  - Always accept tenant_id (int), never a Tenant object.
  - Always idempotent — safe to retry on transient failures.
"""
from celery import shared_task


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_seed_preload_roles(self, tenant_id: int) -> None:
    """Seed PRELOAD_ROLES for a newly created tenant workspace."""
    try:
        from tenants.models import Tenant
        from roles.models import Role
        from roles.permissions_map import PRELOAD_ROLES
        tenant = Tenant.objects.get(pk=tenant_id)
        for template in PRELOAD_ROLES:
            Role.objects.get_or_create(
                tenant=tenant,
                name=template['name'],
                defaults={
                    'description': template.get('description', ''),
                    'permissions': template.get('permissions', {}),
                    'is_system_role': True,
                },
            )
    except Exception as exc:
        raise self.retry(exc=exc)
