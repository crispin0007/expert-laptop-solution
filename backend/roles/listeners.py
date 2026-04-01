"""
Event listeners for the roles module.

Listeners react to domain events from other modules.
All listeners are marked with @listens_to — in Phase 2 these will be
auto-registered with the Celery-backed EventBus dispatcher.
"""
from core.events import listens_to


# @listens_to('tenant.created', module_id='roles')
# def on_tenant_created(payload: dict, tenant) -> None:
#     """Auto-seed PRELOAD_ROLES when a new tenant workspace is created."""
#     from roles.tasks import task_seed_preload_roles
#     task_seed_preload_roles.delay(tenant_id=payload['id'])
