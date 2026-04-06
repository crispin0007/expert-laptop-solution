"""Accounting event listeners.

React to cross-module events via EventBus.  No direct imports from other
business modules — only core + own models.
"""
import logging
from decimal import Decimal
from django.utils import timezone

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


@listens_to('staff.created', module_id='accounting')
def on_staff_created_init_salary_profile(payload: dict, tenant) -> None:
    """Create a default salary profile for newly onboarded staff.

    This keeps monthly payroll automation predictable by ensuring every staff
    member has a StaffSalaryProfile row as soon as they are invited.
    """
    user_id = payload.get('id')
    if not user_id:
        return

    try:
        from django.contrib.auth import get_user_model
        from accounting.models import StaffSalaryProfile

        user_model = get_user_model()
        staff = user_model.objects.get(pk=user_id)

        StaffSalaryProfile.objects.get_or_create(
            tenant=tenant,
            staff=staff,
            defaults={
                'base_salary': Decimal('0.00'),
                'tds_rate': Decimal('0.1000'),
                'bonus_default': Decimal('0.00'),
                'effective_from': timezone.localdate(),
            },
        )
    except Exception:
        logger.exception('on_staff_created_init_salary_profile failed for user_id=%s', user_id)


# @listens_to('ticket.resolved', module_id='accounting')
# def on_ticket_resolved(payload: dict, tenant) -> None:
#     """Auto-generate a draft ticket invoice when a ticket is resolved. Phase 2."""
#     pass


# @listens_to('project.completed', module_id='accounting')
# def on_project_completed(payload: dict, tenant) -> None:
#     """Auto-generate a draft project invoice when a project is completed. Phase 2."""
#     pass
