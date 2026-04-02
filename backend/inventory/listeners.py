"""Inventory event listeners.

React to cross-module events via EventBus.  No direct imports from other
business modules — only core + own models.

Active listeners:
  invoice.sent       → create StockMovement(OUT) for each product line item
  invoice.cancelled  → reverse those OUT movements (StockMovement IN)
  project.completed  → create StockMovement(OUT) for each ProjectProduct
  project.cancelled  → reverse project stock movements (StockMovement IN)

Stubbed (future phases):
  cms.order.placed   → Phase 3: reduce stock on website order
"""
import logging
from django.db import transaction

from core.events import listens_to
from .models import StockMovement

logger = logging.getLogger(__name__)


# ── invoice.sent → stock out ──────────────────────────────────────────────────

@listens_to('invoice.sent', module_id='inventory')
def on_invoice_issued_reduce_stock(payload: dict, tenant) -> None:
    """When an invoice is issued, create MOVEMENT_OUT for each product line item.

    Idempotent — safe to call multiple times for the same invoice.
    """
    invoice_id = payload.get('id')
    if not invoice_id:
        return
    try:
        from accounting.models import Invoice
        invoice = Invoice.objects.get(id=invoice_id, tenant=tenant)
        _apply_invoice_stock_movements(invoice, tenant)
    except Exception:
        logger.exception('on_invoice_issued_reduce_stock failed for invoice_id=%s', invoice_id)


# ── invoice.cancelled → reverse stock out ────────────────────────────────────

@listens_to('invoice.cancelled', module_id='inventory')
def on_invoice_cancelled_reverse_stock(payload: dict, tenant) -> None:
    """When an invoice is voided, reverse any MOVEMENT_OUT created for its lines.

    Idempotent — skips products already reversed.
    """
    invoice_id = payload.get('id')
    if not invoice_id:
        return
    try:
        out_movements = StockMovement.objects.filter(
            tenant=tenant,
            reference_type='invoice',
            reference_id=invoice_id,
            movement_type=StockMovement.MOVEMENT_OUT,
        )
        for movement in out_movements:
            already_reversed = StockMovement.objects.filter(
                tenant=tenant,
                reference_type='invoice',
                reference_id=invoice_id,
                product=movement.product,
                movement_type=StockMovement.MOVEMENT_IN,
            ).exists()
            if already_reversed:
                continue
            StockMovement.objects.create(
                tenant=tenant,
                created_by=movement.created_by,
                product=movement.product,
                movement_type=StockMovement.MOVEMENT_IN,
                quantity=movement.quantity,
                reference_type='invoice',
                reference_id=invoice_id,
                notes=f'Auto reversal: Invoice #{invoice_id} voided',
            )
    except Exception:
        logger.exception('on_invoice_cancelled_reverse_stock failed for invoice_id=%s', invoice_id)


# ── helpers ───────────────────────────────────────────────────────────────────

def _apply_invoice_stock_movements(invoice, tenant) -> None:
    """Create MOVEMENT_OUT for every product-type line item in an invoice.

    Runs inside a transaction so that either ALL movements are created or none —
    no partial state on error.  The idempotency guard (check before atomic block)
    prevents duplicate movements on retries.
    """
    product_lines = [
        item for item in (invoice.line_items or [])
        if item.get('line_type') == 'product'
        and item.get('product_id')
        and int(item.get('qty', 0)) > 0
    ]
    if not product_lines:
        return

    # Idempotent: if any OUT movement already exists for this invoice, skip
    if StockMovement.objects.filter(
        tenant=tenant,
        reference_type='invoice',
        reference_id=invoice.pk,
        movement_type=StockMovement.MOVEMENT_OUT,
    ).exists():
        return

    with transaction.atomic():
        for item in product_lines:
            StockMovement.objects.create(
                tenant=tenant,
                created_by=invoice.created_by,
                product_id=int(item['product_id']),
                movement_type=StockMovement.MOVEMENT_OUT,
                quantity=int(item.get('qty', 1)),
                reference_type='invoice',
                reference_id=invoice.pk,
                notes=f'Auto: Invoice {invoice.invoice_number}',
            )
    logger.info(
        'Stock movements created for invoice_id=%s (%s product line(s))',
        invoice.pk, len(product_lines),
    )



# ── project.completed → stock out ────────────────────────────────────────────

@listens_to('project.completed', module_id='inventory')
def on_project_completed_reduce_stock(payload: dict, tenant) -> None:
    """When a project is completed, create MOVEMENT_OUT for each ProjectProduct.

    Uses quantity_planned as the movement quantity.
    Idempotent — safe to call multiple times for the same project.
    """
    project_id = payload.get('id')
    if not project_id:
        return
    try:
        from projects.models import ProjectProduct
        _apply_project_stock_movements(project_id, tenant, ProjectProduct)
    except Exception:
        logger.exception('on_project_completed_reduce_stock failed for project_id=%s', project_id)


# ── project.cancelled → reverse project stock out ────────────────────────────

@listens_to('project.cancelled', module_id='inventory')
def on_project_cancelled_reverse_stock(payload: dict, tenant) -> None:
    """When a project is cancelled, reverse any MOVEMENT_OUT created for its products.

    Idempotent — skips products already reversed.
    """
    project_id = payload.get('id')
    if not project_id:
        return
    try:
        out_movements = StockMovement.objects.filter(
            tenant=tenant,
            reference_type='project',
            reference_id=project_id,
            movement_type=StockMovement.MOVEMENT_OUT,
        )
        for movement in out_movements:
            already_reversed = StockMovement.objects.filter(
                tenant=tenant,
                reference_type='project',
                reference_id=project_id,
                product=movement.product,
                movement_type=StockMovement.MOVEMENT_IN,
            ).exists()
            if already_reversed:
                continue
            StockMovement.objects.create(
                tenant=tenant,
                created_by=movement.created_by,
                product=movement.product,
                movement_type=StockMovement.MOVEMENT_IN,
                quantity=movement.quantity,
                reference_type='project',
                reference_id=project_id,
                notes=f'Auto reversal: Project #{project_id} cancelled',
            )
    except Exception:
        logger.exception('on_project_cancelled_reverse_stock failed for project_id=%s', project_id)


def _apply_project_stock_movements(project_id: int, tenant, ProjectProduct) -> None:
    """Create MOVEMENT_OUT for every ProjectProduct linked to a completed project.

    Runs inside a transaction. Idempotent — if any OUT movement already exists
    for this project, the entire batch is skipped.
    """
    project_products = list(
        ProjectProduct.objects.filter(
            tenant=tenant,
            project_id=project_id,
            quantity_planned__gt=0,
        ).select_related('product')
    )
    if not project_products:
        return

    # Idempotent: if any OUT movement already exists for this project, skip
    if StockMovement.objects.filter(
        tenant=tenant,
        reference_type='project',
        reference_id=project_id,
        movement_type=StockMovement.MOVEMENT_OUT,
    ).exists():
        return

    with transaction.atomic():
        for pp in project_products:
            StockMovement.objects.create(
                tenant=tenant,
                product=pp.product,
                movement_type=StockMovement.MOVEMENT_OUT,
                quantity=pp.quantity_planned,
                reference_type='project',
                reference_id=project_id,
                notes=f'Auto: Project #{project_id} completed',
            )
    logger.info(
        'Stock movements created for project_id=%s (%s product(s))',
        project_id, len(project_products),
    )


# ── Phase 3 stubs ─────────────────────────────────────────────────────────────

# @listens_to('cms.order.placed', module_id='inventory')
# def on_cms_order_placed(payload: dict, tenant) -> None:
#     """Reduce stock when a website order is placed. Phase 3."""
#     pass
