"""
Inventory signals.

1. After StockMovement save: recompute StockLevel for that product.
2. After StockLevel recompute: fire low-stock notification if at/below reorder level.
3. After TicketProduct save: create a StockMovement(type=out).
4. After Ticket status → cancelled: reverse StockMovements for TicketProducts.
5. After PurchaseOrder save: notify creator on status changes.
6. After ReturnOrder save: notify creator on status changes.
"""
from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender='inventory.StockMovement')
def update_stock_level(sender, instance, created, **kwargs):
    """Apply a stock-level delta when a new movement is created.

    DESIGN: Delta-based (not full-recompute) so that stock-count adjustments
    applied by StockCount.complete() as F('quantity_on_hand') + diff are never
    overwritten.  Full recompute would re-anchor to the raw IN/OUT aggregate,
    silently discarding all prior adjustment deltas.

    For the rare case of a movement update (admin shell), a full recompute is
    used as a safe fallback — but movements are create-only via the API.
    """
    from inventory.models import StockLevel, StockMovement

    # Adjustments are applied directly by StockCount.complete(); skip here.
    if instance.movement_type == StockMovement.MOVEMENT_ADJUSTMENT:
        return

    IN_TYPES  = (StockMovement.MOVEMENT_IN, StockMovement.MOVEMENT_RETURN)
    OUT_TYPES = (StockMovement.MOVEMENT_OUT, StockMovement.MOVEMENT_RETURN_SUPPLIER)

    if created:
        # Delta path — preserves prior adjustment deltas
        if instance.movement_type in IN_TYPES:
            delta = instance.quantity
        elif instance.movement_type in OUT_TYPES:
            delta = -instance.quantity
        else:
            delta = 0

        sl, _ = StockLevel.objects.get_or_create(
            tenant=instance.tenant,
            product=instance.product,
            defaults={'quantity_on_hand': 0},
        )
        StockLevel.objects.filter(pk=sl.pk).update(
            quantity_on_hand=models.F('quantity_on_hand') + delta
        )
        sl.refresh_from_db()
        on_hand = sl.quantity_on_hand
    else:
        # Fallback full recompute for admin-level movement edits
        agg = StockMovement.objects.filter(
            tenant=instance.tenant,
            product=instance.product,
        ).aggregate(
            total_in=models.Sum(
                'quantity',
                filter=models.Q(movement_type__in=IN_TYPES),
                default=0,
            ),
            total_out=models.Sum(
                'quantity',
                filter=models.Q(movement_type__in=OUT_TYPES),
                default=0,
            ),
        )
        on_hand = (agg['total_in'] or 0) - (agg['total_out'] or 0)
        StockLevel.objects.update_or_create(
            tenant=instance.tenant,
            product=instance.product,
            defaults={'quantity_on_hand': on_hand},
        )

    # ── Low stock alert ──────────────────────────────────────────────────────
    product = instance.product
    if (
        product.track_stock
        and not product.is_service
        and not product.is_deleted
        and on_hand <= product.reorder_level
    ):
        try:
            from notifications.service import notify_low_stock
            notify_low_stock(product, on_hand)
        except Exception:
            logger.exception("Low stock notification failed for product %s", product.pk)


@receiver(post_save, sender='tickets.TicketProduct')
def create_stock_movement_for_ticket_product(sender, instance, created, **kwargs):
    """When a product is added to a ticket, record a stock-out movement."""
    if not created:
        return  # Only on initial creation; quantity edits are handled manually

    from inventory.models import StockMovement

    StockMovement.objects.create(
        tenant=instance.tenant,
        created_by=instance.created_by,
        product=instance.product,
        movement_type=StockMovement.MOVEMENT_OUT,
        quantity=instance.quantity,
        reference_type='ticket',
        reference_id=instance.ticket_id,
        notes=f"Auto: TicketProduct #{instance.pk} on Ticket #{instance.ticket_id}",
    )


# ── Purchase Order status change notifications ────────────────────────────────

@receiver(pre_save, sender='inventory.PurchaseOrder')
def _cache_po_status(sender, instance, **kwargs):
    """Cache the pre-save status so the post_save handler can detect changes."""
    if instance.pk:
        try:
            instance._pre_status = sender.objects.values_list('status', flat=True).get(pk=instance.pk)
        except sender.DoesNotExist:
            instance._pre_status = None
    else:
        instance._pre_status = None


@receiver(post_save, sender='inventory.PurchaseOrder')
def notify_po_updated(sender, instance, created, **kwargs):
    """Notify PO creator when status changes (not on initial draft creation)."""
    if created:
        return
    old_status = getattr(instance, '_pre_status', None)
    if old_status == instance.status:
        return
    # Only notify on meaningful transitions
    if instance.status not in ('sent', 'partial', 'received', 'cancelled'):
        return
    try:
        from notifications.service import notify_po_status_changed
        notify_po_status_changed(instance)
    except Exception:
        logger.exception("PO status notification failed for PO %s", instance.pk)


# ── Return Order status change notifications ──────────────────────────────────

@receiver(pre_save, sender='inventory.ReturnOrder')
def _cache_return_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._pre_status = sender.objects.values_list('status', flat=True).get(pk=instance.pk)
        except sender.DoesNotExist:
            instance._pre_status = None
    else:
        instance._pre_status = None


@receiver(post_save, sender='inventory.ReturnOrder')
def notify_return_updated(sender, instance, created, **kwargs):
    """Notify return order creator when status changes to sent/accepted/cancelled."""
    if created:
        return
    old_status = getattr(instance, '_pre_status', None)
    if old_status == instance.status:
        return
    if instance.status not in ('sent', 'accepted', 'cancelled'):
        return
    try:
        from notifications.service import notify_return_status_changed
        notify_return_status_changed(instance)
    except Exception:
        logger.exception("Return status notification failed for return %s", instance.pk)


@receiver(post_save, sender='tickets.Ticket')
def reverse_stock_movements_on_cancel(sender, instance, created, **kwargs):
    """When a ticket is cancelled, return products to stock via a RETURN movement."""
    if created:
        return

    from tickets.models import Ticket
    if instance.status != Ticket.STATUS_CANCELLED:
        return

    from tickets.models import TicketProduct
    from inventory.models import StockMovement

    for tp in TicketProduct.objects.filter(ticket=instance):
        # Avoid double-reversals by checking existing returns for this ticket product
        already_reversed = StockMovement.objects.filter(
            tenant=instance.tenant,
            movement_type=StockMovement.MOVEMENT_RETURN,
            reference_type='ticket_product',
            reference_id=tp.pk,
        ).exists()
        if not already_reversed:
            StockMovement.objects.create(
                tenant=instance.tenant,
                created_by=instance.created_by,
                product=tp.product,
                movement_type=StockMovement.MOVEMENT_RETURN,
                quantity=tp.quantity,
                reference_type='ticket_product',
                reference_id=tp.pk,
                notes=f"Auto-reversal: Ticket #{instance.pk} cancelled",
            )

