"""
Inventory signals.

1. After StockMovement save: recompute StockLevel for that product.
2. After TicketProduct save: create a StockMovement(type=out).
3. After Ticket status → cancelled: reverse StockMovements for TicketProducts.
"""
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender='inventory.StockMovement')
def update_stock_level(sender, instance, **kwargs):
    """Recompute quantity_on_hand from all movements for this product."""
    from inventory.models import StockLevel, StockMovement

    IN_TYPES = (StockMovement.MOVEMENT_IN, StockMovement.MOVEMENT_RETURN)
    OUT_TYPES = (StockMovement.MOVEMENT_OUT,)

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

