"""
Event listeners for the customers module.

Listeners react to domain events from other modules.
All listeners are marked with @listens_to — in Phase 2 these will be
auto-registered with the Celery-backed EventBus dispatcher.

Cross-module imports are only allowed for own models + core.
Never import from sibling apps inside listener logic.
"""
from core.events import listens_to


# @listens_to('customer.birthday', module_id='customers')
# def on_customer_birthday(payload: dict, tenant) -> None:
#     """Dispatch birthday greeting notification to the customer."""
#     from customers.tasks import task_send_customer_birthday_greetings
#     task_send_customer_birthday_greetings.delay(tenant_id=payload['tenant_id'])


# @listens_to('customer.inactive', module_id='customers')
# def on_customer_inactive(payload: dict, tenant) -> None:
#     """Handle 30-day inactivity flag — notify account manager."""
#     pass
