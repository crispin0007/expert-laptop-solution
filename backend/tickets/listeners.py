"""
Event listeners for the tickets module.

Listeners react to domain events from other modules.
All listeners are marked with @listens_to — in Phase 2 these will be
auto-registered with the Celery-backed EventBus dispatcher.
"""
from core.events import listens_to


# @listens_to('customer.deleted', module_id='tickets')
# def on_customer_deleted(payload: dict, tenant) -> None:
#     """Detach the deleted customer from all their open tickets."""
#     from .models import Ticket
#     Ticket.objects.filter(
#         tenant_id=payload['tenant_id'],
#         customer_id=payload['id'],
#     ).update(customer=None)


# @listens_to('staff.deleted', module_id='tickets')
# def on_staff_deleted(payload: dict, tenant) -> None:
#     """Un-assign the removed staff member from any open tickets."""
#     from .models import Ticket
#     Ticket.objects.filter(
#         tenant_id=payload['tenant_id'],
#         assigned_to_id=payload['id'],
#     ).update(assigned_to=None)
