"""Accounting event listeners.

React to cross-module events via EventBus.  No direct imports from other
business modules — only core + own models.
"""
import logging

from core.events import listens_to

logger = logging.getLogger(__name__)


@listens_to('inventory.po.received', module_id='accounting')
def on_po_received(payload: dict, tenant) -> None:
    """Auto-create a draft Bill when purchase-order goods are received.

    The Bill is created in draft status so accounting staff can review VAT
    applicability, TDS rate, and line items before approving.
    """
    from accounting.services.bill_service import BillService
    BillService.create_from_po_payload(tenant=tenant, payload=payload)


# @listens_to('ticket.resolved', module_id='accounting')
# def on_ticket_resolved(payload: dict, tenant) -> None:
#     """Auto-generate a draft ticket invoice when a ticket is resolved. Phase 2."""
#     pass


# @listens_to('project.completed', module_id='accounting')
# def on_project_completed(payload: dict, tenant) -> None:
#     """Auto-generate a draft project invoice when a project is completed. Phase 2."""
#     pass
