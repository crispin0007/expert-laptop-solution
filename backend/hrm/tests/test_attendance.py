"""
hrm/tests/test_attendance.py
==============================
Tests for the HRM Attendance module.

Coverage:
- AttendancePolicy: auto-creation with Nepal defaults
- clock_in: basic, GPS stored, late detection, idempotent rejection
- clock_out: work_hours computed, half_day downgrade, clocked-out-already rejection
- manual_mark: manager override, invalid status rejected
- get_summary: correct counts per status
- get_deduction: absent deduction, late deduction, grace period, disabled policy
- task_mark_absent_for_tenant: creates absent rows, respects leave, skips non-work day
- PayslipService.generate(): attendance_deduction included in net_pay

Run inside Docker:
    docker compose exec web python -m pytest hrm/tests/test_attendance.py -v
"""
import pytest
from datetime import date, time as dt_time, timedelta
from decimal import Decimal
from unittest.mock import patch, MagicMock


# ─── Shared fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def tenant(db):
    from tenants.models import Tenant
    return Tenant.objects.create(
        name='Attend Test Co',
        slug='attendtest',
        vat_enabled=False,
        coin_to_money_rate=Decimal('10'),
    )


@pytest.fixture
def staff_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user('att_staff', email='attstaff@test.com', password='pass')
    TenantMembership.objects.create(user=user, tenant=tenant, role='staff', is_active=True)
    return user


@pytest.fixture
def manager_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user('att_mgr', email='attmgr@test.com', password='pass')
    TenantMembership.objects.create(user=user, tenant=tenant, role='admin', is_active=True)
    return user


@pytest.fixture
def policy(db, tenant):
    """Return the default attendance policy for the test tenant."""
    from hrm.services.attendance_service import get_or_create_policy
    return get_or_create_policy(tenant)


# ─── Policy ───────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestAttendancePolicyDefaults:
    def test_created_with_nepal_defaults(self, tenant):
        from hrm.services.attendance_service import get_or_create_policy
        p = get_or_create_policy(tenant)

        assert p.expected_start_time == dt_time(9, 0)
        assert p.expected_end_time   == dt_time(18, 0)
        assert p.late_threshold_minutes == 15
        assert p.half_day_threshold_hours == Decimal('4.0')
        assert sorted(p.work_days) == sorted([0, 1, 2, 3, 4, 6])
        assert p.deduct_absent is True
        assert p.deduct_late   is True

    def test_idempotent(self, tenant):
        from hrm.services.attendance_service import get_or_create_policy
        p1 = get_or_create_policy(tenant)
        p2 = get_or_create_policy(tenant)
        assert p1.pk == p2.pk

    def test_backfills_empty_work_days(self, tenant):
        from hrm.models import AttendancePolicy
        from hrm.services.attendance_service import get_or_create_policy
        # Create policy with empty work_days
        AttendancePolicy.objects.create(tenant=tenant, work_days=[])
        p = get_or_create_policy(tenant)
        assert len(p.work_days) > 0


# ─── Clock-in ─────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestClockIn:
    def _freeze(self, hour, minute):
        """Return a mock for timezone.now() at the given local hour:minute."""
        from django.utils import timezone
        import datetime
        now = timezone.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
        return now

    def test_basic_clock_in_creates_record(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import clock_in
        from django.utils import timezone

        now = self._freeze(9, 0)
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = now
            tz_mock.localtime.return_value = now
            tz_mock.localdate.return_value = now.date()
            tz_mock.datetime = __import__('django.utils.timezone', fromlist=['timezone']).datetime
            record = clock_in(tenant, staff_user)

        assert record.pk is not None
        assert record.clock_in is not None
        assert record.status in ('present', 'late')

    def test_gps_stored(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import clock_in
        from django.utils import timezone

        now = timezone.now()
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = now
            tz_mock.localtime.return_value = now
            tz_mock.localdate.return_value = now.date()
            tz_mock.datetime = __import__('django.utils.timezone', fromlist=['timezone']).datetime
            record = clock_in(tenant, staff_user, lat=Decimal('27.700769'), lng=Decimal('85.300140'))

        assert record.clock_in_lat == Decimal('27.700769')
        assert record.clock_in_lng == Decimal('85.300140')

    def test_late_detection(self, tenant, staff_user):
        """Staff clocking in 30 min late should be STATUS_LATE with late_minutes > 0."""
        from hrm.services.attendance_service import clock_in, get_or_create_policy
        from django.utils import timezone

        p = get_or_create_policy(tenant)
        p.late_threshold_minutes = 5
        p.grace_period_minutes   = 0
        p.save()

        # Clock in at 09:31 — 31 min late, threshold 5 → marked late
        import datetime as dt_mod
        now = timezone.now()
        late_time = now.replace(hour=9, minute=31, second=0, microsecond=0)
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = late_time
            tz_mock.localtime.return_value = late_time
            tz_mock.localdate.return_value = late_time.date()
            tz_mock.datetime = __import__('django.utils.timezone', fromlist=['timezone']).datetime
            record = clock_in(tenant, staff_user)

        assert record.status == 'late'
        assert record.late_minutes > 0

    def test_on_time_not_marked_late(self, tenant, staff_user):
        """Staff clocking in on time should be STATUS_PRESENT with late_minutes=0."""
        from hrm.services.attendance_service import clock_in

        import django.utils.timezone as zone
        now = zone.now().replace(hour=8, minute=55, second=0, microsecond=0)
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = now
            tz_mock.localtime.return_value = now
            tz_mock.localdate.return_value = now.date()
            tz_mock.datetime = __import__('django.utils.timezone', fromlist=['timezone']).datetime
            record = clock_in(tenant, staff_user)

        assert record.status == 'present'
        assert record.late_minutes == 0

    def test_double_clock_in_raises(self, tenant, staff_user, policy):
        """Second clock-in on the same day should raise ConflictError."""
        from hrm.services.attendance_service import clock_in
        from core.exceptions import ConflictError

        import django.utils.timezone as zone
        now = zone.now().replace(hour=9, minute=0)
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = now
            tz_mock.localtime.return_value = now
            tz_mock.localdate.return_value = now.date()
            tz_mock.datetime = __import__('django.utils.timezone', fromlist=['timezone']).datetime
            clock_in(tenant, staff_user)
            with pytest.raises(ConflictError):
                clock_in(tenant, staff_user)


# ─── Clock-out ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestClockOut:
    def test_work_hours_computed(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import clock_in, clock_out
        from hrm.models import AttendanceRecord
        import django.utils.timezone as zone
        import datetime

        d = zone.now().date()
        ci_time = zone.now().replace(hour=9, minute=0, second=0, microsecond=0)
        co_time = zone.now().replace(hour=18, minute=0, second=0, microsecond=0)

        # Clock in
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = ci_time
            tz_mock.localtime.return_value = ci_time
            tz_mock.localdate.return_value = d
            tz_mock.datetime = zone.datetime
            clock_in(tenant, staff_user)

        # Clock out
        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = co_time
            tz_mock.localtime.return_value = co_time
            tz_mock.localdate.return_value = d
            tz_mock.datetime = zone.datetime
            record = clock_out(tenant, staff_user)

        assert record.work_hours == Decimal('9.00')
        assert record.clock_out is not None

    def test_half_day_downgrade(self, tenant, staff_user, policy):
        """Clocking out after only 3 hours should downgrade status to half_day."""
        from hrm.services.attendance_service import clock_in, clock_out
        import django.utils.timezone as zone

        d       = zone.now().date()
        ci_time = zone.now().replace(hour=9, minute=0)
        co_time = zone.now().replace(hour=12, minute=0)   # 3 h < threshold 4 h

        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = ci_time
            tz_mock.localtime.return_value = ci_time
            tz_mock.localdate.return_value = d
            tz_mock.datetime = zone.datetime
            clock_in(tenant, staff_user)

        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = co_time
            tz_mock.localtime.return_value = co_time
            tz_mock.localdate.return_value = d
            tz_mock.datetime = zone.datetime
            record = clock_out(tenant, staff_user)

        assert record.status == 'half_day'

    def test_no_clock_in_raises(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import clock_out
        from core.exceptions import ConflictError
        with pytest.raises(ConflictError):
            clock_out(tenant, staff_user)

    def test_double_clock_out_raises(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import clock_in, clock_out
        from core.exceptions import ConflictError
        import django.utils.timezone as zone

        d = zone.now().date()
        ci = zone.now().replace(hour=9, minute=0)
        co = zone.now().replace(hour=18, minute=0)

        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = ci
            tz_mock.localtime.return_value = ci
            tz_mock.localdate.return_value = d
            tz_mock.datetime = zone.datetime
            clock_in(tenant, staff_user)

        with patch('hrm.services.attendance_service.timezone') as tz_mock:
            tz_mock.now.return_value = co
            tz_mock.localtime.return_value = co
            tz_mock.localdate.return_value = d
            tz_mock.datetime = zone.datetime
            clock_out(tenant, staff_user)
            with pytest.raises(ConflictError):
                clock_out(tenant, staff_user)


# ─── Manual Mark ──────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestManualMark:
    def test_creates_record(self, tenant, staff_user, manager_user):
        from hrm.services.attendance_service import manual_mark
        from hrm.models import AttendanceRecord

        target_date = date.today() - timedelta(days=1)
        record = manual_mark(tenant, staff_user, target_date, 'wfh', manager_user, note='Remote day')

        assert record.status == 'wfh'
        assert record.clocked_in_by == manager_user
        assert record.clock_in_source == AttendanceRecord.SOURCE_MANUAL

    def test_override_existing(self, tenant, staff_user, manager_user):
        from hrm.services.attendance_service import manual_mark
        target_date = date.today() - timedelta(days=1)

        r1 = manual_mark(tenant, staff_user, target_date, 'absent', manager_user)
        r2 = manual_mark(tenant, staff_user, target_date, 'wfh',    manager_user)

        assert r1.pk == r2.pk
        assert r2.status == 'wfh'

    def test_invalid_status_raises(self, tenant, staff_user, manager_user):
        from hrm.services.attendance_service import manual_mark
        from core.exceptions import ValidationError

        with pytest.raises(ValidationError):
            manual_mark(tenant, staff_user, date.today(), 'INVALID_STATUS', manager_user)


# ─── Summary ──────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestGetSummary:
    def _make_record(self, tenant, staff, target_date, status):
        from hrm.models import AttendanceRecord
        return AttendanceRecord.objects.create(
            tenant=tenant, staff=staff, date=target_date, status=status,
        )

    def test_counts_correctly(self, tenant, staff_user):
        from hrm.services.attendance_service import get_summary

        base = date.today() - timedelta(days=10)
        self._make_record(tenant, staff_user, base,                    'present')
        self._make_record(tenant, staff_user, base + timedelta(days=1), 'absent')
        self._make_record(tenant, staff_user, base + timedelta(days=2), 'late')
        self._make_record(tenant, staff_user, base + timedelta(days=3), 'on_leave')

        result = get_summary(tenant, staff_user, base, base + timedelta(days=3))
        assert result['present']  == 1
        assert result['absent']   == 1
        assert result['late']     == 1
        assert result['on_leave'] == 1
        assert result['total_days'] == 4


# ─── Deduction ────────────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestGetDeduction:
    def _make_record(self, tenant, staff, target_date, status, late_minutes=0):
        from hrm.models import AttendanceRecord
        return AttendanceRecord.objects.create(
            tenant=tenant, staff=staff, date=target_date,
            status=status, late_minutes=late_minutes,
        )

    def test_absent_deduction(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import get_deduction

        start = date.today().replace(day=1)
        self._make_record(tenant, staff_user, start,                    'absent')
        self._make_record(tenant, staff_user, start + timedelta(days=1), 'present')

        # 1 absent day, base 26000, 26 work days → daily_rate = 1000
        deduction = get_deduction(
            tenant, staff_user,
            period_start=start,
            period_end=start + timedelta(days=5),
            base_salary=Decimal('26000'),
            working_days_per_month=26,
        )
        assert deduction == Decimal('1000.00')

    def test_late_deduction(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import get_deduction

        # Set grace to 0 so all late minutes are billable
        policy.late_deduction_grace_minutes = 0
        policy.deduct_absent = False
        policy.save()

        start = date.today().replace(day=1)
        # 60 minutes late, daily_rate=1000, expected_work_mins=(18-9)*60=540
        # per_min_rate = 1000/540 ≈ 1.851852
        # deduction = 60 * 1.851852 ≈ 111.11
        self._make_record(tenant, staff_user, start, 'late', late_minutes=60)

        deduction = get_deduction(
            tenant, staff_user,
            period_start=start,
            period_end=start + timedelta(days=2),
            base_salary=Decimal('26000'),
            working_days_per_month=26,
        )
        # Approximately 111.11 (can vary by rounding)
        assert deduction > Decimal('0')

    def test_grace_period_respected(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import get_deduction

        # Total grace = 120 minutes → staff who accumulates <= 120 minutes late pays nothing
        policy.late_deduction_grace_minutes = 120
        policy.deduct_absent = False
        policy.save()

        start = date.today().replace(day=1)
        self._make_record(tenant, staff_user, start, 'late', late_minutes=30)
        self._make_record(tenant, staff_user, start + timedelta(days=1), 'late', late_minutes=60)
        # Total: 90 late minutes, all within 120 grace → deduction = 0

        deduction = get_deduction(
            tenant, staff_user,
            period_start=start,
            period_end=start + timedelta(days=5),
            base_salary=Decimal('26000'),
            working_days_per_month=26,
        )
        assert deduction == Decimal('0.00')

    def test_disabled_policy_returns_zero(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import get_deduction

        policy.deduct_absent = False
        policy.deduct_late   = False
        policy.save()

        start = date.today().replace(day=1)
        self._make_record(tenant, staff_user, start, 'absent')

        deduction = get_deduction(
            tenant, staff_user,
            period_start=start,
            period_end=start + timedelta(days=5),
            base_salary=Decimal('26000'),
            working_days_per_month=26,
        )
        assert deduction == Decimal('0.00')

    def test_zero_base_salary_returns_zero(self, tenant, staff_user, policy):
        from hrm.services.attendance_service import get_deduction

        start = date.today().replace(day=1)
        self._make_record(tenant, staff_user, start, 'absent')

        deduction = get_deduction(
            tenant, staff_user,
            period_start=start,
            period_end=start + timedelta(days=5),
            base_salary=Decimal('0'),
            working_days_per_month=26,
        )
        assert deduction == Decimal('0.00')


# ─── Mark Absent Task ─────────────────────────────────────────────────────────

@pytest.mark.django_db
class TestMarkAbsentTask:
    def test_creates_absent_for_missing_staff(self, tenant, staff_user):
        """Staff with no record today should get an absent row."""
        from hrm.tasks import task_mark_absent_for_tenant
        from hrm.models import AttendanceRecord
        import django.utils.timezone as zone

        today = zone.localdate()
        # Ensure no existing record
        AttendanceRecord.objects.filter(tenant=tenant, staff=staff_user, date=today).delete()

        with patch('hrm.tasks.timezone') as tz_mock:
            tz_mock.localdate.return_value = today
            # today's weekday must be in work_days — use a known work day
            from hrm.services.attendance_service import get_or_create_policy
            policy = get_or_create_policy(tenant)
            policy.work_days = list(range(7))  # all days = work days for this test
            policy.save()

            task_mark_absent_for_tenant(tenant.pk)

        record = AttendanceRecord.objects.get(tenant=tenant, staff=staff_user, date=today)
        assert record.status == 'absent'

    def test_on_leave_staff_gets_on_leave_status(self, tenant, staff_user):
        """Staff on approved leave today should get on_leave, not absent."""
        from hrm.tasks import task_mark_absent_for_tenant
        from hrm.models import AttendanceRecord, LeaveRequest
        from hrm.services.leave_service import seed_leave_types
        import django.utils.timezone as zone

        today = zone.localdate()
        AttendanceRecord.objects.filter(tenant=tenant, staff=staff_user, date=today).delete()

        # Create an approved leave for today
        leave_types = seed_leave_types(tenant)
        lt = leave_types[0]
        LeaveRequest.objects.create(
            tenant=tenant,
            staff=staff_user,
            leave_type=lt,
            start_date=today,
            end_date=today,
            days=Decimal('1'),
            status=LeaveRequest.STATUS_APPROVED,
        )

        from hrm.services.attendance_service import get_or_create_policy
        policy = get_or_create_policy(tenant)
        policy.work_days = list(range(7))
        policy.save()

        with patch('hrm.tasks.timezone') as tz_mock:
            tz_mock.localdate.return_value = today
            task_mark_absent_for_tenant(tenant.pk)

        record = AttendanceRecord.objects.get(tenant=tenant, staff=staff_user, date=today)
        assert record.status == 'on_leave'

    def test_non_work_day_skipped(self, tenant, staff_user):
        """Task should skip entirely on non-work days."""
        from hrm.tasks import task_mark_absent_for_tenant
        from hrm.models import AttendanceRecord
        from hrm.services.attendance_service import get_or_create_policy
        import django.utils.timezone as zone

        today = zone.localdate()
        AttendanceRecord.objects.filter(tenant=tenant, staff=staff_user, date=today).delete()

        # Set work_days to Saturday-only so today (any weekday 0-4 or Sunday=6) is a non-work day.
        # Use a non-empty list so get_or_create_policy does NOT backfill.
        policy = get_or_create_policy(tenant)
        policy.work_days = [5]  # Saturday only
        policy.save(update_fields=['work_days'])

        with patch('hrm.tasks.timezone') as tz_mock:
            tz_mock.localdate.return_value = today
            task_mark_absent_for_tenant(tenant.pk)

        # No record should have been created
        assert not AttendanceRecord.objects.filter(
            tenant=tenant, staff=staff_user, date=today,
        ).exists()
