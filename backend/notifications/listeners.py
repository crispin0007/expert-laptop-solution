"""
Notifications — EventBus listeners.

This module is the *consumer* end of the event bus: it receives lifecycle
events from other modules and triggers the appropriate notification helpers.

Cross-module imports are intentionally avoided — all data is read from
the event payload only.  The service functions themselves import models
lazily (inside the function body) to avoid circular import chains.
"""
import logging

from core.events import listens_to

logger = logging.getLogger(__name__)


@listens_to('ticket.assigned', module_id='notifications')
def on_ticket_assigned(payload: dict, tenant) -> None:
    """Send ticket_assigned notification when a ticket is assigned/reassigned."""
    ticket_id = payload.get('id')
    if not ticket_id:
        return
    try:
        from tickets.models import Ticket
        ticket = Ticket.objects.select_related('assigned_to', 'tenant').get(
            id=ticket_id, tenant=tenant
        )
        from notifications.service import notify_ticket_assigned
        notify_ticket_assigned(ticket)
    except Exception:
        logger.exception('on_ticket_assigned failed for ticket_id=%s', ticket_id)


@listens_to('ticket.status.changed', module_id='notifications')
def on_ticket_status_changed(payload: dict, tenant) -> None:
    """Notify assignee when ticket status changes."""
    ticket_id = payload.get('id')
    if not ticket_id:
        return
    try:
        from tickets.models import Ticket
        from notifications.models import Notification
        from notifications.service import _create
        ticket = Ticket.objects.select_related('assigned_to', 'tenant').get(
            id=ticket_id, tenant=tenant
        )
        if not ticket.assigned_to_id:
            return
        _create(
            tenant=tenant,
            recipient=ticket.assigned_to,
            notification_type=Notification.TYPE_TICKET_STATUS,
            title=f'Ticket status changed: {ticket.ticket_number}',
            body=f'Status changed to "{ticket.status}".',
            source_type='ticket',
            source_id=ticket.pk,
            metadata={'ticket_number': ticket.ticket_number, 'status': ticket.status},
        )
    except Exception:
        logger.exception('on_ticket_status_changed failed for ticket_id=%s', ticket_id)


@listens_to('invoice.sent', module_id='notifications')
def on_invoice_sent(payload: dict, tenant) -> None:
    """Enqueue invoice-issued email when an invoice is sent."""
    invoice_id = payload.get('id')
    if not invoice_id:
        return
    try:
        from notifications.tasks import task_send_invoice_issued
        task_send_invoice_issued.delay(invoice_id=invoice_id)
    except Exception:
        logger.exception('on_invoice_sent failed for invoice_id=%s', invoice_id)


@listens_to('inventory.stock.low', module_id='notifications')
def on_stock_low(payload: dict, tenant) -> None:
    """Notify on low stock — delegates to existing service helper."""
    product_id = payload.get('id')
    quantity = payload.get('quantity_on_hand', 0)
    if not product_id:
        return
    try:
        from inventory.models import Product
        product = Product.objects.get(id=product_id, tenant=tenant)
        from notifications.service import notify_low_stock
        notify_low_stock(product, quantity)
    except Exception:
        logger.exception('on_stock_low failed for product_id=%s', product_id)


@listens_to('task.assigned', module_id='notifications')
def on_task_assigned(payload: dict, tenant) -> None:
    """Send task_assigned notification via existing service helper."""
    task_id = payload.get('id')
    if not task_id:
        return
    try:
        from projects.models import ProjectTask
        task = ProjectTask.objects.select_related('assigned_to', 'project', 'tenant').get(
            id=task_id, tenant=tenant
        )
        from notifications.service import notify_task_assigned
        notify_task_assigned(task)
    except Exception:
        logger.exception('on_task_assigned failed for task_id=%s', task_id)


@listens_to('task.completed', module_id='notifications')
def on_task_completed(payload: dict, tenant) -> None:
    """Send task_completed notification via existing service helper."""
    task_id = payload.get('id')
    if not task_id:
        return
    try:
        from projects.models import ProjectTask
        task = ProjectTask.objects.select_related('assigned_to', 'project', 'tenant').get(
            id=task_id, tenant=tenant
        )
        from notifications.service import notify_task_completed
        notify_task_completed(task)
    except Exception:
        logger.exception('on_task_completed failed for task_id=%s', task_id)
