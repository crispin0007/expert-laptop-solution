"""Inventory service functions.

Business logic for complex state transitions that involve multiple model
writes.  Views remain thin; only these functions mutate state for the
operations listed below.

All functions raise core.exceptions subclasses on invalid input so that
views can let the global exception handler turn them into structured
API error responses.
"""
import logging

from django.db import transaction
from django.utils import timezone

from core.events import EventBus
from core.exceptions import ConflictError, ValidationError as AppValidationError

logger = logging.getLogger(__name__)


def publish_stock_movement_events(movement, on_hand: int) -> None:
    """Publish stock-level domain events based on a saved StockMovement.

    Called by the StockMovement post_save signal after on_hand is updated.
    Centralises all stock EventBus calls so signals stay calculation-only.

    Args:
        movement:  The saved StockMovement instance.
        on_hand:   The current quantity_on_hand after this movement.
    """
    from inventory.models import StockMovement  # lazy — avoids circular import at module level

    IN_TYPES  = (StockMovement.MOVEMENT_IN, StockMovement.MOVEMENT_RETURN)
    OUT_TYPES = (StockMovement.MOVEMENT_OUT, StockMovement.MOVEMENT_RETURN_SUPPLIER)

    if movement.movement_type in IN_TYPES:
        EventBus.publish('inventory.stock.added', {
            'id': movement.product_id,
            'tenant_id': movement.tenant_id,
            'quantity': movement.quantity,
            'reference_type': movement.reference_type,
            'reference_id': movement.reference_id,
        }, tenant=movement.tenant)
    elif movement.movement_type in OUT_TYPES:
        EventBus.publish('inventory.stock.out', {
            'id': movement.product_id,
            'tenant_id': movement.tenant_id,
            'quantity': movement.quantity,
            'reference_type': movement.reference_type,
            'reference_id': movement.reference_id,
        }, tenant=movement.tenant)

    product = movement.product
    if (
        product.track_stock
        and not product.is_service
        and not product.is_deleted
        and on_hand <= product.reorder_level
    ):
        EventBus.publish('inventory.stock.low', {
            'id': product.pk,
            'tenant_id': movement.tenant_id,
            'quantity_on_hand': on_hand,
            'reorder_level': product.reorder_level,
        }, tenant=movement.tenant)



def receive_purchase_order(po, lines: list, notes: str, user) -> object:
    """Process receipt of purchase-order items.

    For each ``line`` dict with keys ``item_id`` and ``quantity_received``:

    * Validates the item belongs to this PO.
    * Creates ``StockMovement(MOVEMENT_IN)``.
    * Increments ``PurchaseOrderItem.quantity_received``.

    Recomputes PO status (partial / received) inside an atomic block.
    Fires ``inventory.stock.added`` via EventBus for each received line.

    Returns the updated PO instance.
    """
    from inventory.models import PurchaseOrder, StockMovement

    if po.status == PurchaseOrder.STATUS_CANCELLED:
        raise ConflictError('Cannot receive a cancelled purchase order.')
    if po.status == PurchaseOrder.STATUS_RECEIVED:
        raise ConflictError('Purchase order is already fully received.')

    items_map = {item.id: item for item in po.items.select_related('product')}

    with transaction.atomic():
        for line in lines:
            item = items_map.get(line['item_id'])
            if not item:
                raise AppValidationError(f"Item {line['item_id']} not found on this PO.")
            qty = line['quantity_received']
            if qty <= 0:
                continue
            max_receivable = item.quantity_ordered - item.quantity_received
            if qty > max_receivable:
                raise AppValidationError(
                    f"Cannot receive {qty} of '{item.product.name}'"
                    f" — only {max_receivable} pending."
                )
            StockMovement.objects.create(
                tenant=po.tenant,
                product=item.product,
                movement_type=StockMovement.MOVEMENT_IN,
                quantity=qty,
                reference_type='purchase_order',
                reference_id=po.pk,
                notes=notes or f"Received via {po.po_number}",
                created_by=user,
            )
            item.quantity_received += qty
            item.save(update_fields=['quantity_received'])
            # inventory.stock.added event is published by the StockMovement
            # post_save signal → publish_stock_movement_events() service helper.

        # Recompute PO status
        po.refresh_from_db()
        total_ordered  = sum(i.quantity_ordered  for i in po.items.all())
        total_received = sum(i.quantity_received for i in po.items.all())
        if total_received >= total_ordered:
            new_status = PurchaseOrder.STATUS_RECEIVED
        elif total_received > 0:
            new_status = PurchaseOrder.STATUS_PARTIAL
        else:
            new_status = po.status

        po.status = new_status
        if new_status in (PurchaseOrder.STATUS_RECEIVED, PurchaseOrder.STATUS_PARTIAL):
            po.received_by = user
            po.received_at = timezone.now()
        po.save(update_fields=['status', 'received_by', 'received_at'])

        # Fire event so accounting can auto-create a draft Bill for this receipt batch.
        try:
            received_lines = [
                {
                    'product_name': items_map[line['item_id']].product.name,
                    'quantity': line['quantity_received'],
                    'unit_cost': str(items_map[line['item_id']].unit_cost),
                }
                for line in lines
                if line.get('quantity_received', 0) > 0
            ]
            EventBus.publish('inventory.po.received', {
                'id': po.pk,
                'tenant_id': po.tenant_id,
                'supplier_id': po.supplier_id,
                'supplier_name': po.supplier.name if po.supplier else '',
                'po_number': po.po_number,
                'lines': received_lines,
            }, tenant=po.tenant)
        except Exception as exc:
            logger.warning(
                'EventBus.publish inventory.po.received failed for PO %s: %s',
                po.pk, exc, exc_info=True,
            )

    return po


def complete_stock_count(sc, user) -> tuple:
    """Finish a stock count session.

    For every counted item with a non-zero discrepancy:

    * Creates ``StockMovement(ADJUSTMENT)``.
    * Updates ``StockLevel`` via F-expression delta (preserves prior deltas).

    Marks the session as completed atomically.
    Raises ``ConflictError`` if the session is not in *counting* status.

    Returns ``(updated_sc, adjustments_created)`` tuple.
    """
    from inventory.models import StockCount, StockMovement, StockLevel
    from django.db.models import F as DbF

    if sc.status != StockCount.STATUS_COUNTING:
        raise ConflictError('Only counting-status sessions can be completed.')

    adjustments_created = 0
    with transaction.atomic():
        for item in sc.items.select_related('product'):
            if item.counted_qty is None:
                continue
            diff = item.discrepancy
            if diff == 0:
                continue
            StockMovement.objects.create(
                tenant=sc.tenant,
                product=item.product,
                movement_type=StockMovement.MOVEMENT_ADJUSTMENT,
                quantity=abs(diff),
                reference_type='stock_count',
                reference_id=sc.pk,
                notes=(
                    f"Stock count {sc.count_number}: "
                    f"{'surplus' if diff > 0 else 'shrinkage'} of {abs(diff)}"
                ),
                created_by=user,
            )
            StockLevel.objects.filter(product=item.product).update(
                quantity_on_hand=DbF('quantity_on_hand') + diff,
            )
            adjustments_created += 1

        sc.status       = StockCount.STATUS_COMPLETED
        sc.completed_at = timezone.now()
        sc.completed_by = user
        sc.save(update_fields=['status', 'completed_at', 'completed_by'])

    return sc, adjustments_created


def auto_reorder(tenant, user) -> dict:
    """Scan low-stock products and group them into draft PurchaseOrders by preferred supplier.

    For each low-stock product that has a preferred ``SupplierProduct``:

    * Reorder qty = ``max(reorder_level - current_stock, min_order_qty)``.
    * All items for the same supplier land in one draft PO.

    Returns a summary dict with keys:
    ``pos_created``, ``purchase_orders``, ``skipped_no_supplier``.
    """
    from inventory.models import Product, SupplierProduct, PurchaseOrder, PurchaseOrderItem

    products = (
        Product.objects
        .filter(tenant=tenant, is_deleted=False, is_active=True,
                is_service=False, track_stock=True)
        .select_related('stock_level')
    )
    low_stock_products = [
        p for p in products
        if getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0) <= p.reorder_level
    ]

    if not low_stock_products:
        return {'detail': 'No low-stock products found.', 'pos_created': 0}

    product_ids = [p.id for p in low_stock_products]
    sp_qs = (
        SupplierProduct.objects
        .filter(tenant=tenant, product_id__in=product_ids, is_preferred=True)
        .select_related('supplier', 'product')
    )
    preferred_map = {sp.product_id: sp for sp in sp_qs}

    supplier_lines: dict = {}
    skipped: list = []
    for p in low_stock_products:
        sp = preferred_map.get(p.id)
        if not sp:
            skipped.append({'id': p.id, 'name': p.name, 'sku': p.sku})
            continue
        if sp.supplier_id not in supplier_lines:
            supplier_lines[sp.supplier_id] = {'supplier': sp.supplier, 'items': []}
        current_stock = getattr(getattr(p, 'stock_level', None), 'quantity_on_hand', 0)
        reorder_qty = max(p.reorder_level - current_stock, sp.min_order_qty)
        supplier_lines[sp.supplier_id]['items'].append({
            'product': p,
            'quantity_ordered': reorder_qty,
            'unit_cost': sp.unit_cost,
        })

    created_pos = []
    for _supplier_id, data in supplier_lines.items():
        po = PurchaseOrder.objects.create(
            tenant=tenant,
            supplier=data['supplier'],
            status=PurchaseOrder.STATUS_DRAFT,
            notes='Auto-generated from low-stock reorder',
            created_by=user,
        )
        for item in data['items']:
            PurchaseOrderItem.objects.create(
                tenant=tenant,
                po=po,
                product=item['product'],
                quantity_ordered=item['quantity_ordered'],
                unit_cost=item['unit_cost'],
                created_by=user,
            )
        created_pos.append({
            'po_number': po.po_number,
            'supplier': data['supplier'].name,
            'line_count': len(data['items']),
        })

    return {
        'pos_created': len(created_pos),
        'purchase_orders': created_pos,
        'skipped_no_supplier': skipped,
    }
