"""Comment service — create, timeline, event."""
import logging

from django.db import transaction

from core.events import EventBus

logger = logging.getLogger(__name__)


@transaction.atomic
def add_comment(ticket, *, author, body: str, is_internal: bool = False, tenant):
    """Create a TicketComment, write a timeline entry, and publish the event.

    Args:
        ticket:      Ticket instance (already validated, same tenant).
        author:      User instance adding the comment.
        body:        Comment text.
        is_internal: True → visible to staff only.
        tenant:      Tenant instance (from request.tenant).

    Returns:
        The saved TicketComment instance.
    """
    from tickets.models import TicketComment, TicketTimeline

    comment = TicketComment.objects.create(
        tenant=tenant,
        ticket=ticket,
        author=author,
        body=body,
        is_internal=is_internal,
        created_by=author,
    )

    TicketTimeline.objects.create(
        tenant=tenant,
        ticket=ticket,
        event_type=TicketTimeline.EVENT_COMMENTED,
        description=(
            f"{'[Internal] ' if is_internal else ''}"
            f"Comment by {author.get_full_name() or author.email}"
        ),
        actor=author,
        created_by=author,
        metadata={'comment_id': comment.pk, 'is_internal': is_internal},
    )

    try:
        EventBus.publish('ticket.comment.added', {
            'id': comment.pk,
            'ticket_id': ticket.pk,
            'tenant_id': tenant.pk,
            'author_id': author.pk,
            'is_internal': is_internal,
        }, tenant=tenant)
    except Exception:
        logger.error(
            'EventBus.publish ticket.comment.added failed for comment %s',
            comment.pk, exc_info=True,
        )

    return comment
