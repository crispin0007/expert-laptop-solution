"""
Projects — EventBus listeners.

Cross-module reactions to events fired by OTHER modules.
Never import other modules' models here — read from event payload only.
"""
# from core.events import listens_to


# Phase 2 — CRM: when a deal is won, optionally auto-create a project
# @listens_to('deal.won', module_id='projects')
# def on_deal_won(payload: dict, tenant) -> None:
#     """Auto-create a project stub when a CRM deal is won (Phase 2)."""
#     pass


# Phase 1 — example: react to invoice paid to mark project as fully paid
# @listens_to('invoice.paid', module_id='projects')
# def on_invoice_paid(payload: dict, tenant) -> None:
#     """Update project billing status when associated invoice is paid (future)."""
#     pass
