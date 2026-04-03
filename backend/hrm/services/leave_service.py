"""
hrm/services/leave_service.py

All business logic for leave type management, leave balances, and leave requests.

Rules:
- Never import from other apps' models at module level (cross-app event bus only).
- All state transitions use select_for_update() to prevent race conditions.
- EventBus.publish() on every state change.
- Decimal fields in event payloads always converted to str().
"""
import logging
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from core.events import EventBus
from core.exceptions import ConflictError, NotFoundError, ValidationError

logger = logging.getLogger(__name__)

# Nepal default leave entitlements (BS calendar)
NEPAL_LEAVE_DEFAULTS = [
    {
        'name': 'Annual Leave',
        'code': 'annual',
        'days_allowed': 18,
        'is_paid': True,
        'carry_forward': True,
        'max_carry_forward_days': 18,
        'requires_approval': True,
        'gender_restriction': 'none',
    },
    {
        'name': 'Sick Leave',
        'code': 'sick',
        'days_allowed': 12,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward_days': 0,
        'requires_approval': True,
        'gender_restriction': 'none',
    },
    {
        'name': 'Casual Leave',
        'code': 'casual',
        'days_allowed': 6,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward_days': 0,
        'requires_approval': True,
        'gender_restriction': 'none',
    },
    {
        'name': 'Maternity Leave',
        'code': 'maternity',
        'days_allowed': 98,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward_days': 0,
        'requires_approval': True,
        'gender_restriction': 'female',
    },
    {
        'name': 'Paternity Leave',
        'code': 'paternity',
        'days_allowed': 15,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward_days': 0,
        'requires_approval': True,
        'gender_restriction': 'male',
    },
    {
        'name': 'Public Holiday',
        'code': 'public_holiday',
        'days_allowed': 0,
        'is_paid': True,
        'carry_forward': False,
        'max_carry_forward_days': 0,
        'requires_approval': False,
        'gender_restriction': 'none',
    },
]


def _count_working_days(start: date, end: date) -> Decimal:
    """Count calendar days between start and end (inclusive) excluding weekends.

    Nepal working week: Sunday–Friday. Saturday is the weekly holiday.
    Weekend = Saturday (weekday index 5).
    """
    count = 0
    current = start
    while current <= end:
        if current.weekday() != 5:  # 5 = Saturday in Python
            count += 1
        current += timedelta(days=1)
    return Decimal(str(count))


def seed_leave_types(tenant) -> list:
    """Create the 6 Nepal default leave types for *tenant* if they don't already exist.

    Idempotent — safe to call multiple times.
    Returns the list of LeaveType instances (created or existing).
    """
    from hrm.models import LeaveType

    result = []
    for defaults in NEPAL_LEAVE_DEFAULTS:
        lt, _ = LeaveType.objects.get_or_create(
            tenant=tenant,
            code=defaults['code'],
            defaults={**defaults},
        )
        result.append(lt)
    logger.info("seed_leave_types tenant=%s count=%d", tenant.slug, len(result))
    return result


def seed_leave_balances_for_staff(tenant, staff, year: int) -> list:
    """Create one LeaveBalance per active LeaveType for *staff* in the given BS *year*.

    Idempotent — existing balances are not overwritten.
    Returns list of LeaveBalance instances (created or existing).
    """
    from hrm.models import LeaveBalance, LeaveType

    active_types = LeaveType.objects.filter(tenant=tenant, is_active=True, days_allowed__gt=0)
    result = []
    for lt in active_types:
        bal, _ = LeaveBalance.objects.get_or_create(
            tenant=tenant,
            staff=staff,
            leave_type=lt,
            year=year,
            defaults={'allocated': Decimal(str(lt.days_allowed))},
        )
        result.append(bal)
    return result


def seed_all_balances_for_year(tenant, year: int) -> int:
    """Seed LeaveBalance for every active staff member for the given BS *year*.

    Uses iterator to stay memory-efficient for large tenants.
    Returns total balances created.
    """
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership

    User = get_user_model()
    active_members = (
        TenantMembership.objects
        .filter(tenant=tenant, is_active=True)
        .select_related('user')
        .iterator(chunk_size=200)
    )
    total = 0
    for membership in active_members:
        balances = seed_leave_balances_for_staff(tenant, membership.user, year)
        total += len(balances)
    logger.info("seed_all_balances_for_year tenant=%s year=%d total=%d", tenant.slug, year, total)
    return total


@transaction.atomic
def request_leave(tenant, staff, leave_type_id: int, start_date: date,
                  end_date: date, reason: str = '', attachments: list = None) -> object:
    """Create a new leave request for *staff*.

    Validates:
    - leave_type exists and belongs to tenant
    - start_date <= end_date
    - sufficient balance available for the current BS year

    Returns LeaveRequest.
    """
    from hrm.models import LeaveBalance, LeaveRequest, LeaveType
    from core.nepali_date import ad_to_bs

    if attachments is None:
        attachments = []

    if start_date > end_date:
        raise ValidationError('start_date must be on or before end_date.')

    try:
        leave_type = LeaveType.objects.get(pk=leave_type_id, tenant=tenant, is_active=True)
    except LeaveType.DoesNotExist:
        raise NotFoundError('Leave type not found or inactive.')

    days = _count_working_days(start_date, end_date)
    if days <= 0:
        raise ValidationError('The selected date range contains no working days.')

    # Check balance for the BS year of the start date
    bs_start = ad_to_bs(start_date)
    year = bs_start.year

    balance = LeaveBalance.objects.filter(
        tenant=tenant,
        staff=staff,
        leave_type=leave_type,
        year=year,
    ).first()

    if balance is None:
        raise ValidationError(
            f'No leave balance found for {leave_type.name} in BS year {year}. '
            'Please contact your administrator.'
        )

    if balance.available < days:
        raise ValidationError(
            f'Insufficient {leave_type.name} balance. '
            f'Available: {balance.available} days, Requested: {days} days.'
        )

    leave_request = LeaveRequest.objects.create(
        tenant=tenant,
        staff=staff,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
        days=days,
        reason=reason,
        status=LeaveRequest.STATUS_PENDING,
        attachments=attachments,
    )

    try:
        EventBus.publish('staff.leave.requested', {
            'id': leave_request.pk,
            'tenant_id': tenant.pk,
            'staff_id': staff.pk,
            'leave_type_id': leave_type.pk,
            'leave_type_name': leave_type.name,
            'start_date': str(start_date),
            'end_date': str(end_date),
            'days': str(days),
        }, tenant=tenant)
    except Exception as exc:
        logger.warning('EventBus staff.leave.requested failed id=%s: %s', leave_request.pk, exc)

    return leave_request


@transaction.atomic
def approve_leave(tenant, leave_request, approved_by) -> object:
    """Approve a pending leave request and deduct from the staff's balance.

    Uses select_for_update to guard against concurrent approvals.
    """
    from hrm.models import LeaveBalance, LeaveRequest
    from core.nepali_date import ad_to_bs

    leave_request = LeaveRequest.objects.select_for_update().get(pk=leave_request.pk)

    if leave_request.status != LeaveRequest.STATUS_PENDING:
        raise ConflictError(
            f'Cannot approve a leave request with status "{leave_request.status}". '
            'Only pending requests can be approved.'
        )

    # Lock the balance row too
    bs_start = ad_to_bs(leave_request.start_date)
    year = bs_start.year

    balance = LeaveBalance.objects.select_for_update().filter(
        tenant=tenant,
        staff=leave_request.staff,
        leave_type=leave_request.leave_type,
        year=year,
    ).first()

    if balance is None:
        raise ValidationError('Leave balance record not found — cannot approve.')

    if balance.available < leave_request.days:
        raise ValidationError(
            f'Insufficient balance at time of approval. '
            f'Available: {balance.available}, Requested: {leave_request.days}.'
        )

    balance.used = (balance.used or Decimal('0')) + leave_request.days
    balance.save(update_fields=['used'])

    leave_request.status = LeaveRequest.STATUS_APPROVED
    leave_request.approved_by = approved_by
    leave_request.approved_at = timezone.now()
    leave_request.save(update_fields=['status', 'approved_by', 'approved_at'])

    try:
        EventBus.publish('staff.leave.approved', {
            'id': leave_request.pk,
            'tenant_id': tenant.pk,
            'staff_id': leave_request.staff_id,
            'leave_type_id': leave_request.leave_type_id,
            'start_date': str(leave_request.start_date),
            'end_date': str(leave_request.end_date),
            'days': str(leave_request.days),
            'approved_by_id': approved_by.pk,
        }, tenant=tenant)
    except Exception as exc:
        logger.warning('EventBus staff.leave.approved failed id=%s: %s', leave_request.pk, exc)

    return leave_request


@transaction.atomic
def reject_leave(tenant, leave_request, rejected_by, reason: str = '') -> object:
    """Reject a pending leave request."""
    from hrm.models import LeaveRequest

    leave_request = LeaveRequest.objects.select_for_update().get(pk=leave_request.pk)

    if leave_request.status != LeaveRequest.STATUS_PENDING:
        raise ConflictError(
            f'Cannot reject a leave request with status "{leave_request.status}". '
            'Only pending requests can be rejected.'
        )

    leave_request.status = LeaveRequest.STATUS_REJECTED
    leave_request.approved_by = rejected_by
    leave_request.approved_at = timezone.now()
    leave_request.rejection_reason = reason
    leave_request.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason'])

    try:
        EventBus.publish('staff.leave.rejected', {
            'id': leave_request.pk,
            'tenant_id': tenant.pk,
            'staff_id': leave_request.staff_id,
            'leave_type_id': leave_request.leave_type_id,
            'rejected_by_id': rejected_by.pk,
            'reason': reason,
        }, tenant=tenant)
    except Exception as exc:
        logger.warning('EventBus staff.leave.rejected failed id=%s: %s', leave_request.pk, exc)

    return leave_request


@transaction.atomic
def cancel_leave(tenant, leave_request, cancelled_by) -> object:
    """Cancel a pending or approved leave request.

    - Pending → Cancelled (no balance change)
    - Approved → Cancelled (re-credits LeaveBalance.used) if start_date > today
    """
    from hrm.models import LeaveBalance, LeaveRequest
    from core.nepali_date import ad_to_bs

    leave_request = LeaveRequest.objects.select_for_update().get(pk=leave_request.pk)

    if leave_request.status not in (LeaveRequest.STATUS_PENDING, LeaveRequest.STATUS_APPROVED):
        raise ConflictError(
            f'Cannot cancel a leave request with status "{leave_request.status}".'
        )

    today = timezone.localdate()
    if leave_request.start_date <= today and leave_request.status == LeaveRequest.STATUS_APPROVED:
        raise ConflictError(
            'Cannot cancel an already-started approved leave. Contact your administrator.'
        )

    if leave_request.status == LeaveRequest.STATUS_APPROVED:
        # Re-credit balance
        bs_start = ad_to_bs(leave_request.start_date)
        year = bs_start.year

        balance = LeaveBalance.objects.select_for_update().filter(
            tenant=tenant,
            staff=leave_request.staff,
            leave_type=leave_request.leave_type,
            year=year,
        ).first()

        if balance:
            balance.used = max(
                Decimal('0'),
                (balance.used or Decimal('0')) - leave_request.days,
            )
            balance.save(update_fields=['used'])

    leave_request.status = LeaveRequest.STATUS_CANCELLED
    leave_request.save(update_fields=['status'])

    return leave_request
