"""Accounting event listeners.

React to cross-module events via EventBus.  No direct imports from other
business modules — only core + own models.
"""

# from core.events import listens_to
# from accounting.models import Invoice
# import logging
#
# logger = logging.getLogger(__name__)


# @listens_to('ticket.resolved', module_id='accounting')
# def on_ticket_resolved(payload: dict, tenant) -> None:
#     """Auto-generate a draft ticket invoice when a ticket is resolved. Phase 2."""
#     pass


# @listens_to('project.completed', module_id='accounting')
# def on_project_completed(payload: dict, tenant) -> None:
#     """Auto-generate a draft project invoice when a project is completed. Phase 2."""
#     pass
