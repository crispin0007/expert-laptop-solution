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
            created_by=recipient,  # system-created; use recipient as proxy
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
