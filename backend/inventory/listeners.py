"""Inventory event listeners.

React to cross-module events via EventBus.  No direct imports from other
business modules — only core + own models.
"""

# from core.events import listens_to
# from .models import Product, StockMovement
# import logging
#
# logger = logging.getLogger(__name__)


# @listens_to('ticket.closed', module_id='inventory')
# def on_ticket_closed(payload: dict, tenant) -> None:
#     """Reserved: post-close stock reconciliation if needed. Phase 2."""
#     pass


# @listens_to('cms.order.placed', module_id='inventory')
# def on_cms_order_placed(payload: dict, tenant) -> None:
#     """Reduce stock when a website order is placed. Phase 3."""
#     pass
