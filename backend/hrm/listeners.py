"""
hrm/listeners.py

Event listeners for the HRM module.

Rules:
- Only import own models + core here — no cross-app model imports at top level
- Use late imports inside handler functions for cross-app models
- @listens_to auto-discovered by CoreConfig.ready() via accounts.listeners import
"""
import logging

from core.events import listens_to

logger = logging.getLogger(__name__)


@listens_to('staff.created', module_id='hrm')
def on_staff_created(payload: dict, tenant) -> None:
    """When a new staff member is added, seed their leave balances for the current BS year."""
    try:
        from django.contrib.auth import get_user_model
        from core.nepali_date import ad_to_bs
        from datetime import date
        from hrm.services.leave_service import seed_leave_balances_for_staff

        User = get_user_model()
        staff_id = payload.get('staff_id') or payload.get('user_id')
        if not staff_id:
            return

        staff = User.objects.get(pk=staff_id)
        today = date.today()
        bs_today = ad_to_bs(today)
        year = bs_today.year

        balances = seed_leave_balances_for_staff(tenant, staff, year)
        logger.info(
            'on_staff_created: seeded %d balance(s) for staff=%s year=%d tenant=%s',
            len(balances), staff_id, year, tenant.slug,
        )
    except Exception as exc:
        logger.exception('on_staff_created listener failed: %s', exc)


@listens_to('staff.leave.approved', module_id='hrm')
def on_leave_approved_invalidate_availability(payload: dict, tenant) -> None:
    """Invalidate StaffAvailabilityView cache after a leave is approved."""
    try:
        from django.core.cache import cache
        cache_key = f'staff_availability_{tenant.pk}'
        cache.delete(cache_key)
        logger.debug('Invalidated availability cache for tenant=%s', tenant.slug)
    except Exception as exc:
        logger.warning('on_leave_approved_invalidate_availability failed: %s', exc)


@listens_to('staff.leave.cancelled', module_id='hrm')
def on_leave_cancelled_invalidate_availability(payload: dict, tenant) -> None:
    """Invalidate StaffAvailabilityView cache after a leave is cancelled."""
    try:
        from django.core.cache import cache
        cache_key = f'staff_availability_{tenant.pk}'
        cache.delete(cache_key)
        logger.debug('Invalidated availability cache for tenant=%s', tenant.slug)
    except Exception as exc:
        logger.warning('on_leave_cancelled_invalidate_availability failed: %s', exc)
