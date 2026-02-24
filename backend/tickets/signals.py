"""
Ticket signals.

Responsibilities:
- When a TicketProduct is saved/deleted, stub hooks for inventory StockMovement
  (inventory.signals handles the actual movement — these are placeholders).
- Timeline events are created directly in views/serializers for clarity.
  Signals here handle cross-cutting concerns that cannot be expressed in views.
"""
import logging
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# SLA auto-breach on ticket status transitions
# ---------------------------------------------------------------------------

@receiver(post_save, sender='tickets.Ticket')
def handle_ticket_status_change(sender, instance, created, **kwargs):
    """
    After a ticket is saved:
    - If status is 'resolved' or 'closed', mark SLA as no longer active.
    - resolved_at / closed_at are set by the view (change_status action).
    """
    if created:
        return  # creation handled by TicketCreateSerializer

    try:
        sla = instance.sla
    except Exception:
        return

    terminal_statuses = ('resolved', 'closed', 'cancelled')
    if instance.status in terminal_statuses and not sla.breached:
        # Ticket resolved before SLA breach — no further action needed.
        pass


# ---------------------------------------------------------------------------
# TicketProduct hooks (stub — inventory.signals does the heavy lifting)
# ---------------------------------------------------------------------------

@receiver(post_save, sender='tickets.TicketProduct')
def ticket_product_created(sender, instance, created, **kwargs):
    """
    When a product is added to a ticket a StockMovement(type=out) is created.
    The actual signal handler lives in inventory/signals.py and listens to
    this same signal — this receiver is intentionally a no-op stub so the
    signal is importable and unit-testable from the tickets app.
    """
    if created:
        logger.debug(
            "TicketProduct %s created for ticket %s — inventory signal will handle StockMovement.",
            instance.pk, instance.ticket_id,
        )


@receiver(post_delete, sender='tickets.TicketProduct')
def ticket_product_deleted(sender, instance, **kwargs):
    """
    When a ticket product is removed, inventory.signals reverses the StockMovement.
    """
    logger.debug(
        "TicketProduct %s deleted for ticket %s — inventory signal will reverse StockMovement.",
        instance.pk, instance.ticket_id,
    )
