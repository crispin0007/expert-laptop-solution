from __future__ import annotations

import logging

from core.events import listens_to

logger = logging.getLogger(__name__)


@listens_to('staff.created', module_id='parties')
def on_staff_created_link_party(payload: dict, tenant) -> None:
    """Create/link a staff Party identity when a staff membership is created."""
    try:
        from accounts.models import TenantMembership
        from parties.services import resolve_or_create_staff_party

        staff_id = payload.get('staff_id') or payload.get('user_id') or payload.get('id')
        if not staff_id or tenant is None:
            return

        membership = TenantMembership.objects.select_related('tenant', 'user', 'party').get(
            tenant=tenant,
            user_id=staff_id,
        )
        resolve_or_create_staff_party(membership)
    except TenantMembership.DoesNotExist:
        logger.warning('parties.staff.created.membership_not_found', extra={'staff_id': payload.get('id')})
    except Exception:
        logger.exception('parties.staff.created.link_failed', extra={'staff_id': payload.get('id')})
