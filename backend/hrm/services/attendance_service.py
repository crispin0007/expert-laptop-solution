"""
hrm/services/attendance_service.py

All business logic for the Attendance module.

Exported API:
  get_or_create_policy(tenant)              → AttendancePolicy
  clock_in(tenant, staff, *, source, lat, lng, note)  → AttendanceRecord
  clock_out(tenant, staff, *, source, lat, lng, note) → AttendanceRecord
  manual_mark(tenant, staff, date, status, marked_by, note) → AttendanceRecord
  get_summary(tenant, staff, start_date, end_date)    → dict
  get_deduction(tenant, staff, period_start, period_end,
                *, base_salary, working_days_per_month) → Decimal

Rules:
- No cross-app model imports at top level. Use apps.get_model() inside functions
  only when absolutely required (avoided here — payslip service calls us instead).
- Fire EventBus events for clocked_in / clocked_out only.
- All monetary amounts returned as Decimal, quantised to 0.01.
"""
import logging
from datetime import date as date_type
from decimal import Decimal

from django.db import models, transaction
from django.utils import timezone

from core.events import EventBus
from core.exceptions import ConflictError, ValidationError

logger = logging.getLogger(__name__)

# Nepal default work days: Mon–Fri (0–4) + Sun (6); Saturday (5) off.
_NEPAL_WORK_DAYS = [0, 1, 2, 3, 4, 6]


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _compute_late_minutes(clock_in_dt, policy) -> int:
    """Return late_minutes (int ≥ 0) for a clock-in datetime vs AttendancePolicy."""
    local_ci = timezone.localtime(clock_in_dt)
    ci_mins  = local_ci.hour * 60 + local_ci.minute
    exp_mins = policy.expected_start_time.hour * 60 + policy.expected_start_time.minute
    grace    = policy.grace_period_minutes or 0
    diff     = ci_mins - exp_mins - grace
    return max(0, diff)


def _compute_work_hours(clock_in_dt, clock_out_dt) -> Decimal:
    """Return decimal work hours (to 2 d.p.) between two UTC datetimes."""
    delta = clock_out_dt - clock_in_dt
    hours = delta.total_seconds() / 3600
    return Decimal(str(round(hours, 2))).quantize(Decimal('0.01'))


def _count_working_days(start: date_type, end: date_type, work_days: list) -> int:
    """Count calendar days in [start, end] whose weekday() is in *work_days*.

    Args:
        start:      First day of the period (inclusive).
        end:        Last day of the period (inclusive).
        work_days:  List of Python weekday() integers, e.g. [0,1,2,3,4,6].

    Returns:
        Integer count. Returns (end - start).days + 1 if work_days is empty
        (fall back to calendar days rather than returning 0).
    """
    if not work_days:
        return (end - start).days + 1

    wd_set = set(work_days)
    from datetime import timedelta
    total = 0
    cursor = start
    while cursor <= end:
        if cursor.weekday() in wd_set:
            total += 1
        cursor += timedelta(days=1)
    return total


# ─────────────────────────────────────────────────────────────────────────────
# Policy
# ─────────────────────────────────────────────────────────────────────────────

def get_or_create_policy(tenant):
    """Return the AttendancePolicy for tenant, creating a sensible Nepal default if absent."""
    from hrm.models import AttendancePolicy

    policy, created = AttendancePolicy.objects.get_or_create(
        tenant=tenant,
        defaults={
            'expected_start_time':       timezone.datetime.strptime('09:00', '%H:%M').time(),
            'expected_end_time':         timezone.datetime.strptime('18:00', '%H:%M').time(),
            'late_threshold_minutes':    15,
            'grace_period_minutes':      0,
            'half_day_threshold_hours':  Decimal('4.0'),
            'work_days':                 list(_NEPAL_WORK_DAYS),
            'deduct_absent':             True,
            'deduct_late':               True,
            'late_deduction_grace_minutes': 60,
        },
    )
    # Backfill empty work_days on old records
    if not created and not policy.work_days:
        policy.work_days = list(_NEPAL_WORK_DAYS)
        policy.save(update_fields=['work_days', 'updated_at'])
    return policy


# ─────────────────────────────────────────────────────────────────────────────
# Clock-in
# ─────────────────────────────────────────────────────────────────────────────

@transaction.atomic
def clock_in(tenant, staff, *, source='web', lat=None, lng=None, note=''):
    """Record clock-in for *staff* at the current moment.

    Idempotent: if a record for today already has a clock_in, raises ConflictError.
    Late detection is applied immediately using the tenant's AttendancePolicy.
    """
    from hrm.models import AttendanceRecord

    policy = get_or_create_policy(tenant)
    now    = timezone.now()
    today  = timezone.localdate()

    record, created = AttendanceRecord.objects.get_or_create(
        tenant=tenant,
        staff=staff,
        date=today,
        defaults={
            'clock_in':        now,
            'clock_in_lat':    lat,
            'clock_in_lng':    lng,
            'clock_in_source': source,
            'note':            note,
            'status':          AttendanceRecord.STATUS_PRESENT,
        },
    )

    if not created:
        if record.clock_in is not None:
            raise ConflictError('Already clocked in for today.')
        record.clock_in        = now
        record.clock_in_lat    = lat
        record.clock_in_lng    = lng
        record.clock_in_source = source
        if note:
            record.note = note

    # Snapshot the active shift for this staff member
    active_shift = get_active_shift_for_staff(tenant, staff, on_date=today)
    if active_shift:
        record.shift = active_shift

    # Apply late detection — prefer shift timing over policy
    policy = get_or_create_policy(tenant)
    if active_shift:
        local_ci = timezone.localtime(now)
        ci_mins  = local_ci.hour * 60 + local_ci.minute
        exp_mins = active_shift.start_time.hour * 60 + active_shift.start_time.minute
        grace    = active_shift.grace_period_minutes
        diff     = ci_mins - exp_mins - grace
        late_mins = max(0, diff)
        late_thresh = active_shift.late_threshold_minutes
    else:
        late_mins = _compute_late_minutes(now, policy)
        late_thresh = policy.late_threshold_minutes

    if late_mins > late_thresh:
        record.status       = AttendanceRecord.STATUS_LATE
        record.late_minutes = late_mins
    else:
        record.status       = AttendanceRecord.STATUS_PRESENT
        record.late_minutes = 0

    save_fields = [
        'clock_in', 'clock_in_lat', 'clock_in_lng', 'clock_in_source',
        'status', 'late_minutes', 'note', 'shift', 'updated_at',
    ]
    if not created:
        record.save(update_fields=save_fields)
    else:
        record.save()

    try:
        EventBus.publish('attendance.clocked_in', {
            'id':         record.pk,
            'tenant_id':  tenant.id,
            'staff_id':   staff.pk,
            'date':       today.isoformat(),
            'status':     record.status,
            'late_minutes': record.late_minutes,
        }, tenant=tenant)
    except Exception as exc:
        logger.warning('EventBus attendance.clocked_in failed id=%s: %s', record.pk, exc)

    return record


# ─────────────────────────────────────────────────────────────────────────────
# Clock-out
# ─────────────────────────────────────────────────────────────────────────────

@transaction.atomic
def clock_out(tenant, staff, *, source='web', lat=None, lng=None, note=''):
    """Record clock-out for *staff* at the current moment.

    Requires an existing clock-in record for today; raises ConflictError otherwise.
    Computes work_hours and may downgrade status to HALF_DAY.
    """
    from hrm.models import AttendanceRecord

    policy = get_or_create_policy(tenant)
    now    = timezone.now()
    today  = timezone.localdate()

    try:
        record = AttendanceRecord.objects.select_for_update().get(
            tenant=tenant, staff=staff, date=today,
        )
    except AttendanceRecord.DoesNotExist:
        raise ConflictError('No clock-in found for today. Clock in first.')

    if record.clock_in is None:
        raise ConflictError('No clock-in found for today. Clock in first.')

    if record.clock_out is not None:
        raise ConflictError('Already clocked out for today.')

    if now <= record.clock_in:
        raise ValidationError('Clock-out time must be after clock-in time.')

    record.clock_out        = now
    record.clock_out_lat    = lat
    record.clock_out_lng    = lng
    record.clock_out_source = source
    if note:
        record.note = note

    # Compute work hours and potentially downgrade to half_day
    record.work_hours = _compute_work_hours(record.clock_in, now)

    # Compute early exit / overtime
    record.early_exit_minutes, record.overtime_minutes = _compute_exit_metrics(
        now, tenant, record
    )

    # Determine half-day threshold from shift or policy
    policy_threshold = float(policy.half_day_threshold_hours)
    if record.shift:
        half_thresh = float(record.shift.min_work_hours)
    else:
        half_thresh = policy_threshold

    if (float(record.work_hours) < half_thresh
            and record.status in (AttendanceRecord.STATUS_PRESENT, AttendanceRecord.STATUS_LATE)):
        record.status = AttendanceRecord.STATUS_HALF_DAY

    record.save(update_fields=[
        'clock_out', 'clock_out_lat', 'clock_out_lng', 'clock_out_source',
        'work_hours', 'early_exit_minutes', 'overtime_minutes',
        'status', 'note', 'updated_at',
    ])

    try:
        EventBus.publish('attendance.clocked_out', {
            'id':         record.pk,
            'tenant_id':  tenant.id,
            'staff_id':   staff.pk,
            'date':       today.isoformat(),
            'status':     record.status,
            'work_hours': str(record.work_hours),
        }, tenant=tenant)
    except Exception as exc:
        logger.warning('EventBus attendance.clocked_out failed id=%s: %s', record.pk, exc)

    return record


# ─────────────────────────────────────────────────────────────────────────────
# Manual Mark  (manager override)
# ─────────────────────────────────────────────────────────────────────────────

@transaction.atomic
def manual_mark(tenant, staff, target_date, status, marked_by, note=''):
    """Create or override an attendance record for any past date.

    Only managers/admins should call this. The caller is responsible for
    checking permissions before invoking.
    """
    from hrm.models import AttendanceRecord

    valid_statuses = {s for s, _ in AttendanceRecord.STATUS_CHOICES}
    if status not in valid_statuses:
        raise ValidationError(f'Invalid status "{status}". Choose from: {sorted(valid_statuses)}.')

    record, _ = AttendanceRecord.objects.update_or_create(
        tenant=tenant,
        staff=staff,
        date=target_date,
        defaults={
            'status':        status,
            'clocked_in_by': marked_by,
            'clock_in_source': AttendanceRecord.SOURCE_MANUAL,
            'note':          note,
        },
    )

    # Gap 3: snapshot the active shift so manual records show shift_name in reports
    active_shift = get_active_shift_for_staff(tenant, staff, on_date=target_date)
    if active_shift and record.shift_id != active_shift.pk:
        record.shift = active_shift
        record.save(update_fields=['shift', 'updated_at'])

    return record


# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

def get_summary(tenant, staff, start_date, end_date) -> dict:
    """Return a summary dict of attendance statuses for *staff* in [start, end]."""
    from hrm.models import AttendanceRecord
    from django.db.models import Count

    agg = (
        AttendanceRecord.objects
        .filter(tenant=tenant, staff=staff, date__gte=start_date, date__lte=end_date)
        .values('status')
        .annotate(count=Count('id'))
    )
    counts = {row['status']: row['count'] for row in agg}

    total_days = (end_date - start_date).days + 1
    return {
        'total_days':  total_days,
        'present':     counts.get('present', 0),
        'absent':      counts.get('absent', 0),
        'late':        counts.get('late', 0),
        'half_day':    counts.get('half_day', 0),
        'on_leave':    counts.get('on_leave', 0),
        'holiday':     counts.get('holiday', 0),
        'wfh':         counts.get('wfh', 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Shift helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_active_shift_for_staff(tenant, staff, on_date=None):
    """Return the Shift active for *staff* on *on_date* (defaults to today).

    Resolution order:
      1. ShiftAssignment with effective_from <= date and (effective_to is null or >= date)
      2. Tenant's default Shift (is_default=True)
      3. None
    """
    from hrm.models import Shift, ShiftAssignment

    if on_date is None:
        on_date = timezone.localdate()

    assignment = (
        ShiftAssignment.objects
        .filter(
            tenant=tenant, staff=staff,
            effective_from__lte=on_date,
        )
        .filter(models.Q(effective_to__isnull=True) | models.Q(effective_to__gte=on_date))
        .select_related('shift')
        .order_by('-effective_from')
        .first()
    )
    if assignment:
        return assignment.shift

    return Shift.objects.filter(tenant=tenant, is_default=True, is_active=True).first()


def _resolve_timing(shift, policy):
    """Return (start_mins, end_mins, late_threshold, grace, overtime_after_hours, half_day_hours).

    Uses shift values when a Shift is provided, falls back to AttendancePolicy.
    """
    if shift:
        start_mins  = shift.start_time.hour * 60 + shift.start_time.minute
        end_mins    = shift.end_time.hour * 60 + shift.end_time.minute
        late_thresh = shift.late_threshold_minutes
        grace       = shift.grace_period_minutes
        ot_hours    = float(shift.overtime_after_hours)
        half_hours  = float(shift.min_work_hours)
    else:
        start_mins  = policy.expected_start_time.hour * 60 + policy.expected_start_time.minute
        end_mins    = policy.expected_end_time.hour * 60 + policy.expected_end_time.minute
        late_thresh = policy.late_threshold_minutes
        grace       = policy.grace_period_minutes or 0
        # Derive overtime_after_hours from policy end - start
        raw_shift_mins = end_mins - start_mins
        ot_hours    = raw_shift_mins / 60 if raw_shift_mins > 0 else 8.0
        half_hours  = float(policy.half_day_threshold_hours)
    return start_mins, end_mins, late_thresh, grace, ot_hours, half_hours


def _compute_exit_metrics(clock_out_dt, tenant, record):
    """Return (early_exit_minutes, overtime_minutes) for a completed record.

    Takes into account the record's assigned shift or the tenant policy.
    """
    shift  = record.shift
    policy = get_or_create_policy(tenant)
    _, end_mins, _, _, ot_hours, _ = _resolve_timing(shift, policy)

    local_co = timezone.localtime(clock_out_dt)
    co_mins  = local_co.hour * 60 + local_co.minute

    # Expected end for overtime calculation: start + overtime_after_hours
    # When shift is set use shift end directly; policy end is used otherwise
    overtime_after_mins = end_mins + (
        (ot_hours * 60 - (end_mins - (
            shift.start_time.hour * 60 + shift.start_time.minute if shift else policy.expected_start_time.hour * 60 + policy.expected_start_time.minute
        )))
        if False  # always use end_mins as overtime threshold
        else 0
    )
    # Simplified: overtime = minutes past end_mins; early exit = minutes before end_mins
    if co_mins > end_mins:
        overtime    = co_mins - end_mins
        early_exit  = 0
    elif co_mins < end_mins:
        early_exit  = end_mins - co_mins
        overtime    = 0
    else:
        overtime = early_exit = 0

    return early_exit, overtime


# ─────────────────────────────────────────────────────────────────────────────
# Admin override
# ─────────────────────────────────────────────────────────────────────────────

@transaction.atomic
def admin_override_record(
    tenant,
    record_id: int,
    *,
    admin_user,
    clock_in=None,
    clock_out=None,
    status=None,
    note=None,
    admin_remarks=None,
    break_minutes=None,
    shift_id=None,
):
    """Admin full override of an existing AttendanceRecord.

    Accepts any combination of fields. Derived fields (work_hours,
    late_minutes, early_exit_minutes, overtime_minutes) are recomputed
    when both clock_in and clock_out are set after the update.
    """
    from hrm.models import AttendanceRecord, Shift

    record = AttendanceRecord.objects.select_for_update().get(tenant=tenant, pk=record_id)

    if clock_in is not None:
        record.clock_in = clock_in
        record.clock_in_source = AttendanceRecord.SOURCE_MANUAL
    if clock_out is not None:
        record.clock_out = clock_out
        record.clock_out_source = AttendanceRecord.SOURCE_MANUAL
    if status is not None:
        record.status = status
    if note is not None:
        record.note = note
    if admin_remarks is not None:
        record.admin_remarks = admin_remarks
    if break_minutes is not None:
        record.break_minutes = break_minutes
    if shift_id is not None:
        if shift_id == 0:
            record.shift = None
        else:
            try:
                record.shift = Shift.objects.get(tenant=tenant, pk=shift_id)
            except Shift.DoesNotExist:
                pass

    record.clocked_in_by = admin_user

    # Recompute derived fields when clocks are set
    if record.clock_in and record.clock_out and record.clock_out > record.clock_in:
        policy = get_or_create_policy(tenant)
        record.work_hours = _compute_work_hours(record.clock_in, record.clock_out)
        record.late_minutes = _compute_late_minutes(record.clock_in, policy)
        record.early_exit_minutes, record.overtime_minutes = _compute_exit_metrics(
            record.clock_out, tenant, record
        )
        if record.status in (
            AttendanceRecord.STATUS_PRESENT,
            AttendanceRecord.STATUS_LATE,
        ):
            _, _, _, _, _, half_hours = _resolve_timing(record.shift, policy)
            if float(record.work_hours) < half_hours:
                record.status = AttendanceRecord.STATUS_HALF_DAY

    record.save()
    return record


# ─────────────────────────────────────────────────────────────────────────────
# Reports
# ─────────────────────────────────────────────────────────────────────────────

def get_daily_report(tenant, report_date, dept_id=None) -> dict:
    """Return a daily attendance summary for all staff on *report_date*.

    Optionally filtered by *dept_id* (TenantMembership.department_id).
    """
    from hrm.models import AttendanceRecord
    from django.db.models import Count, Sum, Q

    qs = AttendanceRecord.objects.filter(tenant=tenant, date=report_date)
    if dept_id:
        # Filter by staff whose membership belongs to the given department
        qs = qs.filter(
            staff__memberships__tenant=tenant,
            staff__memberships__department_id=dept_id,
        )

    agg = qs.values('status').annotate(n=Count('id'))
    counts = {row['status']: row['n'] for row in agg}

    totals = qs.aggregate(
        total_work_hours=Sum('work_hours'),
        total_overtime=Sum('overtime_minutes'),
        total_late_mins=Sum('late_minutes'),
    )

    records_qs = qs.select_related('staff', 'shift', 'clocked_in_by').order_by('staff__email')

    from hrm.serializers import AttendanceRecordListSerializer
    records_data = AttendanceRecordListSerializer(records_qs, many=True).data

    return {
        'date':           report_date.isoformat(),
        'present':        counts.get('present', 0) + counts.get('late', 0),
        'absent':         counts.get('absent', 0),
        'late':           counts.get('late', 0),
        'half_day':       counts.get('half_day', 0),
        'on_leave':       counts.get('on_leave', 0),
        'wfh':            counts.get('wfh', 0),
        'holiday':        counts.get('holiday', 0),
        'total_work_hours': str(totals['total_work_hours'] or 0),
        'total_overtime_minutes': totals['total_overtime'] or 0,
        'total_late_minutes':     totals['total_late_mins'] or 0,
        'records': records_data,
    }


def get_monthly_report(tenant, year: int, month: int, staff=None, dept_id=None) -> dict:
    """Return a monthly attendance report.

    When *staff* is given → per-staff detailed breakdown.
    When *dept_id* is given → aggregate for that department.
    When neither is given → aggregate across all staff.
    """
    from datetime import date as date_cls
    import calendar
    from hrm.models import AttendanceRecord
    from django.db.models import Count, Sum

    first_day = date_cls(year, month, 1)
    last_day  = date_cls(year, month, calendar.monthrange(year, month)[1])

    qs = AttendanceRecord.objects.filter(
        tenant=tenant,
        date__gte=first_day,
        date__lte=last_day,
    )
    if staff:
        qs = qs.filter(staff=staff)
    elif dept_id:
        qs = qs.filter(
            staff__memberships__tenant=tenant,
            staff__memberships__department_id=dept_id,
        )

    agg = qs.values('status').annotate(n=Count('id'))
    counts = {row['status']: row['n'] for row in agg}

    totals = qs.aggregate(
        total_work=Sum('work_hours'),
        total_ot=Sum('overtime_minutes'),
        total_late=Sum('late_minutes'),
        total_early=Sum('early_exit_minutes'),
        total_break=Sum('break_minutes'),
    )

    # Gap 1: compute shift-aware working day count when a staff member is specified.
    # Fall back to policy.work_days (or Nepal default) for aggregate views.
    if staff:
        shift       = get_active_shift_for_staff(tenant, staff, on_date=first_day)
        policy      = get_or_create_policy(tenant)
        wd_list     = (shift.work_days if shift and shift.work_days else None) \
                      or policy.work_days \
                      or list(_NEPAL_WORK_DAYS)
        working_days = _count_working_days(first_day, last_day, wd_list)
    else:
        working_days = (last_day - first_day).days + 1   # calendar days for aggregate views

    result = {
        'year':   year,
        'month':  month,
        'total_days':       (last_day - first_day).days + 1,
        'working_days':     working_days,
        'present':          counts.get('present', 0),
        'absent':           counts.get('absent', 0),
        'late':             counts.get('late', 0),
        'half_day':         counts.get('half_day', 0),
        'on_leave':         counts.get('on_leave', 0),
        'wfh':              counts.get('wfh', 0),
        'holiday':          counts.get('holiday', 0),
        'total_work_hours':         str(totals['total_work'] or 0),
        'total_overtime_minutes':   totals['total_ot'] or 0,
        'total_late_minutes':       totals['total_late'] or 0,
        'total_early_exit_minutes': totals['total_early'] or 0,
        'total_break_minutes':      totals['total_break'] or 0,
    }

    if staff:
        result['staff_name']  = getattr(staff, 'full_name', '') or staff.email
        result['staff_email'] = staff.email

        from hrm.serializers import AttendanceRecordListSerializer
        records_qs = qs.select_related('shift', 'clocked_in_by').order_by('date')
        result['records'] = AttendanceRecordListSerializer(records_qs, many=True).data

    return result




def get_deduction(
    tenant,
    staff,
    period_start,
    period_end,
    *,
    base_salary: Decimal,
    working_days_per_month: int = 26,
) -> Decimal:
    """Compute the attendance-based payslip deduction for a pay period.

    Args:
        tenant: Tenant instance.
        staff: User instance (the employee).
        period_start: First day of the pay period (inclusive).
        period_end:   Last day of the pay period (inclusive).
        base_salary:  Employee's base salary for the period (Decimal).
        working_days_per_month: Working days used to compute the daily rate.

    Returns:
        Total deduction amount as Decimal, quantised to 0.01.
        Returns Decimal('0') if the policy has both deductions disabled.
    """
    from hrm.models import AttendanceRecord
    from django.db.models import Sum

    policy = get_or_create_policy(tenant)

    if not policy.deduct_absent and not policy.deduct_late:
        return Decimal('0')

    # Gap 2a: count actual working days in this pay period from shift (or policy) schedule.
    shift   = get_active_shift_for_staff(tenant, staff, on_date=period_start)
    wd_list = (shift.work_days if shift and shift.work_days else None) \
              or policy.work_days \
              or list(_NEPAL_WORK_DAYS)
    actual_wdpm = _count_working_days(period_start, period_end, wd_list)

    # Fall back to caller's hint if the period is shorter than a full month
    # (e.g. mid-month joiner) and shift schedule gives 0 days.
    if actual_wdpm == 0:
        actual_wdpm = int(working_days_per_month) if working_days_per_month else 26

    wdpm = Decimal(str(actual_wdpm))
    if wdpm <= 0 or base_salary <= 0:
        return Decimal('0')

    daily_rate = (base_salary / wdpm).quantize(Decimal('0.000001'))
    deduction  = Decimal('0')

    records = AttendanceRecord.objects.filter(
        tenant=tenant,
        staff=staff,
        date__gte=period_start,
        date__lte=period_end,
    )

    if policy.deduct_absent:
        absent_count = records.filter(status=AttendanceRecord.STATUS_ABSENT).count()
        deduction += (daily_rate * Decimal(absent_count)).quantize(Decimal('0.01'))

    if policy.deduct_late:
        total_late_minutes = records.aggregate(t=Sum('late_minutes'))['t'] or 0
        grace_total        = policy.late_deduction_grace_minutes or 0
        billable_late      = max(0, total_late_minutes - grace_total)
        if billable_late > 0:
            # Gap 2b: use shift timing for per-minute rate when available.
            if shift:
                work_start = shift.start_time.hour * 60 + shift.start_time.minute
                work_end   = shift.end_time.hour * 60 + shift.end_time.minute
            else:
                work_start = (
                    policy.expected_start_time.hour * 60 + policy.expected_start_time.minute
                )
                work_end = (
                    policy.expected_end_time.hour * 60 + policy.expected_end_time.minute
                )
            work_mins_per_day = Decimal(str(max(1, work_end - work_start)))
            per_minute_rate   = (daily_rate / work_mins_per_day).quantize(Decimal('0.000001'))
            deduction += (per_minute_rate * Decimal(billable_late)).quantize(Decimal('0.01'))

    return deduction.quantize(Decimal('0.01'))
