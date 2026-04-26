"""
Notification service — creates in-app Notification records and fires
async Celery tasks for email / push delivery.

Always call these functions from signals or views, never directly from
email.py or push.py (those are low-level wrappers).
"""
from __future__ import annotations
import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from tickets.models import Ticket
    from projects.models import ProjectTask

logger = logging.getLogger(__name__)


def _create(*, tenant, recipient, notification_type, title, body='',
            source_type='', source_id=None, metadata=None):
    """Internal helper — creates a Notification record."""
    from .models import Notification
    try:
        return Notification.objects.create(
            tenant=tenant,
            created_by=None,  # system-generated; no human actor
            recipient=recipient,
            notification_type=notification_type,
            title=title,
            body=body,
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {},
        )
    except Exception:
        logger.exception("Failed to create notification: type=%s recipient=%s", notification_type, recipient)
        return None


# ── Ticket notifications ──────────────────────────────────────────────────────

def notify_ticket_assigned(ticket: 'Ticket') -> None:
    """Create in-app notification + async email when ticket is assigned."""
    if not ticket.assigned_to:
        return
    _create(
        tenant=ticket.tenant,
        recipient=ticket.assigned_to,
        notification_type='ticket_assigned',
        title=f'Ticket assigned: {ticket.ticket_number}',
        body=f'You have been assigned to ticket "{ticket.title}".',
        source_type='ticket',
        source_id=ticket.pk,
        metadata={'ticket_number': ticket.ticket_number, 'title': ticket.title},
    )
    # Fire async email (don't block)
    try:
        from notifications.tasks import task_send_ticket_assigned
        task_send_ticket_assigned.delay(ticket_id=ticket.pk, assignee_id=ticket.assigned_to_id)
    except Exception:
        logger.exception("Failed to enqueue ticket_assigned email for ticket %s", ticket.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=ticket.assigned_to_id,
            tenant_id=ticket.tenant_id,
            title=f'Ticket assigned: {ticket.ticket_number}',
            body=f'You have been assigned to ticket "{ticket.title}".',
            data={'type': 'ticket_assigned', 'source_id': ticket.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for ticket_assigned ticket %s", ticket.pk)


def notify_sla_warning(ticket: 'Ticket', recipient) -> None:
    _create(
        tenant=ticket.tenant,
        recipient=recipient,
        notification_type='sla_warning',
        title=f'SLA warning: {ticket.ticket_number}',
        body=f'Ticket "{ticket.title}" is approaching its SLA deadline.',
        source_type='ticket',
        source_id=ticket.pk,
        metadata={'ticket_number': ticket.ticket_number},
    )
    try:
        from notifications.tasks import task_send_sla_warning
        task_send_sla_warning.delay(ticket_id=ticket.pk, recipient_id=recipient.pk)
    except Exception:
        logger.exception("Failed to enqueue sla_warning email for ticket %s", ticket.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=recipient.pk,
            tenant_id=ticket.tenant_id,
            title=f'SLA warning: {ticket.ticket_number}',
            body=f'Ticket "{ticket.title}" is approaching its SLA deadline.',
            data={'type': 'sla_warning', 'source_id': ticket.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for sla_warning ticket %s", ticket.pk)


def notify_ticket_scheduled(ticket: 'Ticket') -> None:
    """Create in-app notification + push when a ticket reaches its scheduled start time."""
    if not ticket.assigned_to:
        return
    _create(
        tenant=ticket.tenant,
        recipient=ticket.assigned_to,
        notification_type='ticket_scheduled',
        title=f'Ticket scheduled: {ticket.ticket_number}',
        body=f'Ticket "{ticket.title}" is scheduled to start now.',
        source_type='ticket',
        source_id=ticket.pk,
        metadata={'ticket_number': ticket.ticket_number, 'scheduled_at': ticket.scheduled_at.isoformat() if ticket.scheduled_at else ''},
    )
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=ticket.assigned_to_id,
            tenant_id=ticket.tenant_id,
            title=f'Ticket scheduled: {ticket.ticket_number}',
            body=f'Ticket "{ticket.title}" is scheduled to start now.',
            data={'type': 'ticket_scheduled', 'source_id': ticket.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for ticket_scheduled %s", ticket.pk)


def notify_coin_approved(coin_txn) -> None:
    _create(
        tenant=coin_txn.tenant,
        recipient=coin_txn.staff,
        notification_type='coin_approved',
        title='Coins approved!',
        body=f'Your {coin_txn.amount} coin(s) for {coin_txn.source_type} #{coin_txn.source_id} have been approved.',
        source_type='coin',
        source_id=coin_txn.pk,
        metadata={'amount': str(coin_txn.amount)},
    )
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=coin_txn.staff_id,
            tenant_id=coin_txn.tenant_id,
            title='Coins approved!',
            body=f'Your {coin_txn.amount} coin(s) have been approved.',
            data={'type': 'coin_approved', 'source_id': coin_txn.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for coin_approved txn %s", coin_txn.pk)


def notify_coin_rejected(coin_txn) -> None:
    _create(
        tenant=coin_txn.tenant,
        recipient=coin_txn.staff,
        notification_type='coin_rejected',
        title='Coins rejected',
        body=f'Your {coin_txn.amount} coin(s) for {coin_txn.source_type} #{coin_txn.source_id} were rejected.',
        source_type='coin',
        source_id=coin_txn.pk,
        metadata={'amount': str(coin_txn.amount), 'note': coin_txn.note or ''},
    )
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=coin_txn.staff_id,
            tenant_id=coin_txn.tenant_id,
            title='Coins rejected',
            body=f'Your {coin_txn.amount} coin(s) were rejected.',
            data={'type': 'coin_rejected', 'source_id': coin_txn.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for coin_rejected txn %s", coin_txn.pk)


# ── Project / Task notifications ──────────────────────────────────────────────

def notify_task_assigned(task: 'ProjectTask') -> None:
    """Create in-app notification when a task is assigned."""
    if not task.assigned_to:
        return
    _create(
        tenant=task.tenant,
        recipient=task.assigned_to,
        notification_type='task_assigned',
        title=f'Task assigned: {task.title}',
        body=f'You have been assigned task "{task.title}" in project {task.project.project_number}.',
        source_type='task',
        source_id=task.pk,
        metadata={
            'project_number': task.project.project_number,
            'project_name': task.project.name,
            'task_title': task.title,
        },
    )
    try:
        from notifications.tasks import task_send_task_assigned
        task_send_task_assigned.delay(task_id=task.pk, assignee_id=task.assigned_to_id)
    except Exception:
        logger.exception("Failed to enqueue task_assigned email for task %s", task.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=task.assigned_to_id,
            tenant_id=task.tenant_id,
            title=f'Task assigned: {task.title}',
            body=f'You have been assigned task "{task.title}" in project {task.project.project_number}.',
            data={'type': 'task_assigned', 'source_id': task.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for task_assigned task %s", task.pk)


def notify_ticket_comment(ticket, comment, recipient) -> None:
    """Create in-app notification + async email when a comment is added to a ticket."""
    _create(
        tenant=ticket.tenant,
        recipient=recipient,
        notification_type='ticket_comment',
        title=f'New comment on {ticket.ticket_number}',
        body=comment.body[:200] if hasattr(comment, 'body') else '',
        source_type='ticket',
        source_id=ticket.pk,
        metadata={'ticket_number': ticket.ticket_number, 'title': ticket.title},
    )
    try:
        from notifications.tasks import task_send_ticket_comment
        task_send_ticket_comment.delay(
            ticket_id=ticket.pk, comment_id=comment.pk, recipient_id=recipient.pk
        )
    except Exception:
        logger.exception(
            "Failed to enqueue ticket_comment email for ticket %s", ticket.pk
        )
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=recipient.pk,
            tenant_id=ticket.tenant_id,
            title=f'New comment on {ticket.ticket_number}',
            body=comment.body[:200] if hasattr(comment, 'body') else '',
            data={'type': 'ticket_comment', 'source_id': ticket.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for ticket_comment ticket %s", ticket.pk)


def notify_ticket_transfer(ticket, new_assignee) -> None:
    """Create in-app notification when a ticket is transferred to a new assignee."""
    if not new_assignee:
        return
    _create(
        tenant=ticket.tenant,
        recipient=new_assignee,
        notification_type='ticket_transfer',
        title=f'Ticket transferred to you: {ticket.ticket_number}',
        body=f'Ticket "{ticket.title}" has been transferred to you.',
        source_type='ticket',
        source_id=ticket.pk,
        metadata={'ticket_number': ticket.ticket_number, 'title': ticket.title},
    )
    # Fire dedicated transfer email (not the same as "assigned")
    try:
        from notifications.tasks import task_send_ticket_transferred
        task_send_ticket_transferred.delay(ticket_id=ticket.pk, new_assignee_id=new_assignee.pk)
    except Exception:
        logger.exception(
            "Failed to enqueue ticket_transfer email for ticket %s", ticket.pk
        )
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=new_assignee.pk,
            tenant_id=ticket.tenant_id,
            title=f'Ticket transferred to you: {ticket.ticket_number}',
            body=f'Ticket "{ticket.title}" has been transferred to you.',
            data={'type': 'ticket_transfer', 'source_id': ticket.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for ticket_transfer ticket %s", ticket.pk)


# ── Inventory notifications ───────────────────────────────────────────────────

def notify_low_stock(product, quantity_on_hand: int) -> None:
    """
    Notify all active owner/admin/manager members of the tenant that a product
    has hit or dropped to/below its reorder level.
    One notification per admin — deduplication: only fire once per product
    per day (checked via Notification records).
    """
    from django.utils import timezone
    from accounts.models import TenantMembership
    from notifications.tasks import task_send_low_stock_alert

    # Find admins/managers in this tenant
    member_users = (
        TenantMembership.objects
        .filter(
            tenant=product.tenant,
            is_active=True,
            role__in=('owner', 'admin', 'manager'),
        )
        .select_related('user')
        .values_list('user', flat=True)
    )
    if not member_users:
        return

    # Deduplicate: skip if a low_stock notification for this product was already
    # created in the last 24 hours to avoid flood on every movement.
    from notifications.models import Notification
    recent_exists = Notification.objects.filter(
        tenant=product.tenant,
        notification_type='low_stock',
        source_type='product',
        source_id=product.pk,
        created_at__gte=timezone.now() - timezone.timedelta(hours=24),
    ).exists()
    if recent_exists:
        return

    for user_id in member_users:
        # Lazy import to avoid circular
        from accounts.models import User
        try:
            recipient = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            continue
        _create(
            tenant=product.tenant,
            recipient=recipient,
            notification_type='low_stock',
            title=f'Low stock: {product.name}',
            body=f'{product.name} (SKU: {product.sku}) is at {quantity_on_hand} units — at or below reorder level of {product.reorder_level}.',
            source_type='product',
            source_id=product.pk,
            metadata={'sku': product.sku, 'quantity_on_hand': quantity_on_hand, 'reorder_level': product.reorder_level},
        )
        try:
            task_send_low_stock_alert.delay(product_id=product.pk, recipient_id=user_id)
        except Exception:
            logger.exception("Failed to enqueue low_stock email for product %s", product.pk)
        try:
            from notifications.tasks import task_send_push
            task_send_push.delay(
                user_id=recipient.pk,
                tenant_id=product.tenant_id,
                title=f'Low stock: {product.name}',
                body=f'{product.name} is at {quantity_on_hand} units — at or below reorder level.',
                data={'type': 'low_stock', 'source_id': product.pk},
            )
        except Exception:
            logger.exception("Failed to enqueue push for low_stock product %s", product.pk)


def notify_po_status_changed(po) -> None:
    """Create in-app notification + async email for the PO creator when status changes."""
    if not po.created_by_id:
        return
    status_label = po.get_status_display()
    _create(
        tenant=po.tenant,
        recipient=po.created_by,
        notification_type='po_status',
        title=f'Purchase Order {po.po_number}: {status_label}',
        body=f'PO {po.po_number} for supplier {po.supplier.name} is now {status_label}.',
        source_type='purchase_order',
        source_id=po.pk,
        metadata={'po_number': po.po_number, 'status': po.status, 'supplier': po.supplier.name},
    )
    try:
        from notifications.tasks import task_send_po_status_changed
        task_send_po_status_changed.delay(po_id=po.pk, recipient_id=po.created_by_id)
    except Exception:
        logger.exception("Failed to enqueue po_status email for PO %s", po.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=po.created_by_id,
            tenant_id=po.tenant_id,
            title=f'Purchase Order {po.po_number}: {po.get_status_display()}',
            body=f'PO {po.po_number} from {po.supplier.name} is now {po.get_status_display()}.',
            data={'type': 'po_status', 'source_id': po.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for po_status PO %s", po.pk)


def notify_return_status_changed(return_order) -> None:
    """Create in-app notification + async email for the return order creator on status change."""
    if not return_order.created_by_id:
        return
    status_label = return_order.get_status_display()
    _create(
        tenant=return_order.tenant,
        recipient=return_order.created_by,
        notification_type='return_status',
        title=f'Return Order {return_order.return_number}: {status_label}',
        body=f'Return {return_order.return_number} for supplier {return_order.supplier.name} is now {status_label}.',
        source_type='return_order',
        source_id=return_order.pk,
        metadata={'return_number': return_order.return_number, 'status': return_order.status},
    )
    try:
        from notifications.tasks import task_send_return_status_changed
        task_send_return_status_changed.delay(return_id=return_order.pk, recipient_id=return_order.created_by_id)
    except Exception:
        logger.exception("Failed to enqueue return_status email for return %s", return_order.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=return_order.created_by_id,
            tenant_id=return_order.tenant_id,
            title=f'Return Order {return_order.return_number}: {return_order.get_status_display()}',
            body=f'Return {return_order.return_number} is now {return_order.get_status_display()}.',
            data={'type': 'return_status', 'source_id': return_order.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for return_status return %s", return_order.pk)


# ── Project / Manager notifications ──────────────────────────────────────────

def notify_project_assigned(project) -> None:
    """Notify the project manager when assigned (on creation or manager change)."""
    if not project.manager_id:
        return
    _create(
        tenant=project.tenant,
        recipient=project.manager,
        notification_type='project_assigned',
        title=f'You are managing project {project.project_number}',
        body=f'You have been set as manager for project "{project.name}".',
        source_type='project',
        source_id=project.pk,
        metadata={'project_number': project.project_number, 'project_name': project.name},
    )
    try:
        from notifications.tasks import task_send_project_assigned
        task_send_project_assigned.delay(project_id=project.pk, manager_id=project.manager_id)
    except Exception:
        logger.exception("Failed to enqueue project_assigned email for project %s", project.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=project.manager_id,
            tenant_id=project.tenant_id,
            title=f'You are managing project {project.project_number}',
            body=f'You have been set as manager for project "{project.name}".',
            data={'type': 'project_assigned', 'source_id': project.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for project_assigned project %s", project.pk)


def notify_task_completed(task) -> None:
    """Notify the project manager when a task is marked done."""
    manager = task.project.manager if task.project_id else None
    if not manager:
        return
    # Don't notify the manager if they are the assignee (they already know)
    if task.assigned_to_id and task.assigned_to_id == manager.pk:
        return
    _create(
        tenant=task.tenant,
        recipient=manager,
        notification_type='task_done',
        title=f'Task done in {task.project.project_number}: {task.title}',
        body=f'Task "{task.title}" has been marked as done.',
        source_type='task',
        source_id=task.pk,
        metadata={
            'project_number': task.project.project_number,
            'project_name': task.project.name,
            'task_title': task.title,
        },
    )
    try:
        from notifications.tasks import task_send_task_completed
        task_send_task_completed.delay(task_id=task.pk, manager_id=manager.pk)
    except Exception:
        logger.exception("Failed to enqueue task_completed email for task %s", task.pk)
    try:
        from notifications.tasks import task_send_push
        task_send_push.delay(
            user_id=manager.pk,
            tenant_id=task.tenant_id,
            title=f'Task done in {task.project.project_number}: {task.title}',
            body=f'Task "{task.title}" has been marked as done.',
            data={'type': 'task_done', 'source_id': task.pk},
        )
    except Exception:
        logger.exception("Failed to enqueue push for task_done task %s", task.pk)
