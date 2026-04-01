"""
Event listeners for the accounts module.

Listeners react to domain events from other modules.
All listeners are marked with @listens_to — in Phase 2 these will be
auto-registered with the Celery-backed EventBus dispatcher.

Cross-module imports are only allowed for own models + core.
Never import from sibling apps inside listener logic.
"""
from core.events import listens_to


# @listens_to('tenant.created', module_id='accounts')
# def on_tenant_created(payload: dict, tenant) -> None:
#     """Seed default roles when a new tenant workspace is created."""
#     # Phase 2: auto-seed PRELOAD_ROLES for new tenant.
#     pass


# @listens_to('user.login', module_id='accounts')
# def on_user_login(payload: dict, tenant) -> None:
#     """Update last-seen timestamp, invalidate anomaly detection cache."""
#     pass
