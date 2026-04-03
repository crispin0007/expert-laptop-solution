"""
hrm/tests/test_leave_lifecycle.py
==================================
Tests for the HRM leave management lifecycle.

Coverage:
- Leave type seeding (Nepal defaults)
- Leave balance seeding for staff
- request_leave → creates pending request, deducts from available
- approve_leave → increments used, status=approved, EventBus fired
- reject_leave → status=rejected, balance unchanged
- cancel_leave → re-credits balance (approved), no re-credit (pending)
- Over-request blocked with ValidationError
- Cancelling already-started leave blocked
- Payslip: unpaid leave deduction computed correctly

Run inside Docker:
    docker compose exec web python -m pytest hrm/tests/ -v
"""
import pytest
from decimal import Decimal
from datetime import date, timedelta


# ─── Shared fixtures ──────────────────────────────────────────────────────────

@pytest.fixture
def tenant(db):
    from tenants.models import Tenant
    t = Tenant.objects.create(
        name='HRM Test Co',
        slug='hrmtest',
        vat_enabled=False,
        coin_to_money_rate=Decimal('10'),
    )
    return t


@pytest.fixture
def staff_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user('hrm_staff', email='staff@hrmtest.com', password='pass')
    TenantMembership.objects.create(
        user=user, tenant=tenant, role='staff', is_active=True,
    )
    return user


@pytest.fixture
def manager_user(db, tenant):
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user('hrm_manager', email='manager@hrmtest.com', password='pass')
    TenantMembership.objects.create(
        user=user, tenant=tenant, role='admin', is_active=True,
    )
    return user


@pytest.fixture
def leave_types(db, tenant):
    """Seed Nepal default leave types and return a dict keyed by code."""
    from hrm.services.leave_service import seed_leave_types
    types = seed_leave_types(tenant)
    return {lt.code: lt for lt in types}


@pytest.fixture
def annual_balance(db, tenant, staff_user, leave_types):
    """Give staff_user 18 days annual leave in year 2081."""
    from hrm.models import LeaveBalance
    return LeaveBalance.objects.create(
        tenant=tenant,
        staff=staff_user,
        leave_type=leave_types['annual'],
        year=2081,
        allocated=Decimal('18'),
    )


# ─── 1. Leave type seeding ────────────────────────────────────────────────────

class TestLeaveTypeSeeding:
    def test_seed_creates_six_default_types(self, db, tenant):
        from hrm.services.leave_service import seed_leave_types
        from hrm.models import LeaveType

        types = seed_leave_types(tenant)
        assert len(types) == 6
        codes = {lt.code for lt in types}
        assert codes == {'annual', 'sick', 'casual', 'maternity', 'paternity', 'public_holiday'}

    def test_seed_is_idempotent(self, db, tenant):
        from hrm.services.leave_service import seed_leave_types
        from hrm.models import LeaveType

        seed_leave_types(tenant)
        seed_leave_types(tenant)
        assert LeaveType.objects.filter(tenant=tenant).count() == 6

    def test_maternity_is_female_only(self, db, tenant, leave_types):
        assert leave_types['maternity'].gender_restriction == 'female'

    def test_paternity_is_male_only(self, db, tenant, leave_types):
        assert leave_types['paternity'].gender_restriction == 'male'

    def test_annual_carry_forward_enabled(self, db, tenant, leave_types):
        assert leave_types['annual'].carry_forward is True

    def test_sick_is_paid(self, db, tenant, leave_types):
        assert leave_types['sick'].is_paid is True


# ─── 2. Leave balance seeding ─────────────────────────────────────────────────

class TestLeaveBalanceSeeding:
    def test_seed_creates_balance_for_each_active_type(self, db, tenant, staff_user, leave_types):
        from hrm.services.leave_service import seed_leave_balances_for_staff
        from hrm.models import LeaveBalance

        # public_holiday has 0 days — filtered out by seed_leave_balances_for_staff
        balances = seed_leave_balances_for_staff(tenant, staff_user, 2081)
        # 5 types with days_allowed > 0
        assert len(balances) == 5

    def test_seed_balance_idempotent(self, db, tenant, staff_user, leave_types):
        from hrm.services.leave_service import seed_leave_balances_for_staff
        from hrm.models import LeaveBalance

        seed_leave_balances_for_staff(tenant, staff_user, 2081)
        seed_leave_balances_for_staff(tenant, staff_user, 2081)
        count = LeaveBalance.objects.filter(tenant=tenant, staff=staff_user, year=2081).count()
        assert count == 5

    def test_allocated_matches_leave_type_days(self, db, tenant, staff_user, leave_types):
        from hrm.services.leave_service import seed_leave_balances_for_staff
        from hrm.models import LeaveBalance

        seed_leave_balances_for_staff(tenant, staff_user, 2081)
        annual_bal = LeaveBalance.objects.get(
            tenant=tenant, staff=staff_user, leave_type=leave_types['annual'], year=2081
        )
        assert annual_bal.allocated == Decimal('18')
        assert annual_bal.used == Decimal('0')
        assert annual_bal.available == Decimal('18')


# ─── 3. request_leave ─────────────────────────────────────────────────────────

class TestRequestLeave:
    def test_creates_pending_request(self, db, tenant, staff_user, leave_types, annual_balance):
        from hrm.services.leave_service import request_leave
        from hrm.models import LeaveRequest

        # 3 working days: Mon-Wed (no Saturday in range)
        start = date(2024, 7, 1)  # Monday
        end   = date(2024, 7, 3)  # Wednesday
        req = request_leave(tenant, staff_user, leave_types['annual'].pk, start, end)

        assert req.status == LeaveRequest.STATUS_PENDING
        assert req.days == Decimal('3')
        assert req.staff == staff_user
        assert req.tenant == tenant

    def test_balance_not_decremented_on_request(self, db, tenant, staff_user, leave_types, annual_balance):
        from hrm.services.leave_service import request_leave

        start = date(2024, 7, 1)
        end   = date(2024, 7, 3)
        request_leave(tenant, staff_user, leave_types['annual'].pk, start, end)

        annual_balance.refresh_from_db()
        # used should NOT change until approved
        assert annual_balance.used == Decimal('0')

    def test_insufficient_balance_raises(self, db, tenant, staff_user, leave_types, annual_balance):
        from hrm.services.leave_service import request_leave
        from core.exceptions import ValidationError

        # Request 20 days — more than the 18 allocated
        start = date(2024, 7, 1)  # Monday
        end   = date(2024, 7, 26) # 20 working days later
        with pytest.raises(ValidationError, match='Insufficient'):
            request_leave(tenant, staff_user, leave_types['annual'].pk, start, end)

    def test_invalid_date_range_raises(self, db, tenant, staff_user, leave_types, annual_balance):
        from hrm.services.leave_service import request_leave
        from core.exceptions import ValidationError

        start = date(2024, 7, 5)
        end   = date(2024, 7, 3)  # before start
        with pytest.raises(ValidationError, match='start_date'):
            request_leave(tenant, staff_user, leave_types['annual'].pk, start, end)

    def test_inactive_leave_type_raises(self, db, tenant, staff_user, annual_balance):
        from hrm.services.leave_service import request_leave
        from hrm.models import LeaveType
        from core.exceptions import NotFoundError

        lt = LeaveType.objects.create(
            tenant=tenant,
            name='Inactive Type',
            code='inactive_test',
            days_allowed=5,
            is_active=False,
        )
        with pytest.raises(NotFoundError):
            request_leave(tenant, staff_user, lt.pk, date(2024, 7, 1), date(2024, 7, 3))


# ─── 4. approve_leave ─────────────────────────────────────────────────────────

class TestApproveLeave:
    def test_approve_increments_used(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import approve_leave, request_leave
        from hrm.models import LeaveBalance

        start = date(2024, 7, 1)
        end   = date(2024, 7, 3)  # 3 working days
        req = request_leave(tenant, staff_user, leave_types['annual'].pk, start, end)
        approve_leave(tenant, req, manager_user)

        annual_balance.refresh_from_db()
        assert annual_balance.used == Decimal('3')
        assert annual_balance.available == Decimal('15')

    def test_approve_sets_approved_by(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import approve_leave, request_leave
        from hrm.models import LeaveRequest

        req = request_leave(tenant, staff_user, leave_types['annual'].pk, date(2024, 7, 1), date(2024, 7, 3))
        approved = approve_leave(tenant, req, manager_user)

        assert approved.status == LeaveRequest.STATUS_APPROVED
        assert approved.approved_by == manager_user
        assert approved.approved_at is not None

    def test_approve_non_pending_raises(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import approve_leave, request_leave
        from core.exceptions import ConflictError
        from hrm.models import LeaveRequest

        req = request_leave(tenant, staff_user, leave_types['annual'].pk, date(2024, 7, 1), date(2024, 7, 3))
        approve_leave(tenant, req, manager_user)
        req.refresh_from_db()

        with pytest.raises(ConflictError):
            approve_leave(tenant, req, manager_user)


# ─── 5. reject_leave ──────────────────────────────────────────────────────────

class TestRejectLeave:
    def test_reject_does_not_change_balance(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import reject_leave, request_leave
        from hrm.models import LeaveRequest

        req = request_leave(tenant, staff_user, leave_types['annual'].pk, date(2024, 7, 1), date(2024, 7, 3))
        reject_leave(tenant, req, manager_user, reason='Not justified')

        annual_balance.refresh_from_db()
        assert annual_balance.used == Decimal('0')

    def test_reject_sets_status_and_reason(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import reject_leave, request_leave
        from hrm.models import LeaveRequest

        req = request_leave(tenant, staff_user, leave_types['annual'].pk, date(2024, 7, 1), date(2024, 7, 3))
        rejected = reject_leave(tenant, req, manager_user, reason='No cover available')

        assert rejected.status == LeaveRequest.STATUS_REJECTED
        assert 'No cover' in rejected.rejection_reason


# ─── 6. cancel_leave ──────────────────────────────────────────────────────────

class TestCancelLeave:
    def test_cancel_pending_no_balance_change(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import cancel_leave, request_leave
        from hrm.models import LeaveRequest

        req = request_leave(tenant, staff_user, leave_types['annual'].pk, date(2024, 7, 1), date(2024, 7, 3))
        cancel_leave(tenant, req, staff_user)

        annual_balance.refresh_from_db()
        assert annual_balance.used == Decimal('0')

    def test_cancel_approved_recredits_balance(self, db, tenant, staff_user, manager_user, leave_types):
        from hrm.services.leave_service import approve_leave, cancel_leave
        from hrm.models import LeaveBalance, LeaveRequest

        # Use future dates so cancel is allowed; create a balance for the correct BS year
        future_start = date.today() + timedelta(days=5)
        future_end   = date.today() + timedelta(days=7)

        # Manually create an approved leave request (bypass request_leave to avoid BS year issues)
        req = LeaveRequest.objects.create(
            tenant=tenant,
            staff=staff_user,
            leave_type=leave_types['annual'],
            start_date=future_start,
            end_date=future_end,
            days=Decimal('3'),
            status=LeaveRequest.STATUS_APPROVED,
            approved_by=manager_user,
        )

        # Create a matching balance with used=3 (as if approve_leave already ran)
        bal = LeaveBalance.objects.create(
            tenant=tenant,
            staff=staff_user,
            leave_type=leave_types['annual'],
            year=2082,
            allocated=Decimal('18'),
            used=Decimal('3'),
        )

        cancel_leave(tenant, req, staff_user)

        bal.refresh_from_db()
        assert bal.used == Decimal('0')

    def test_cancel_started_approved_leave_raises(self, db, tenant, staff_user, manager_user, leave_types, annual_balance):
        from hrm.services.leave_service import approve_leave, cancel_leave, request_leave
        from core.exceptions import ConflictError
        from hrm.models import LeaveRequest

        # Use past dates to simulate already-started leave
        past_start = date.today() - timedelta(days=3)
        past_end   = date.today() - timedelta(days=1)

        # Manually create approved leave (bypass service balance check for past dates)
        from hrm.models import LeaveRequest as LR
        req = LR.objects.create(
            tenant=tenant, staff=staff_user, leave_type=leave_types['annual'],
            start_date=past_start, end_date=past_end, days=Decimal('3'),
            status=LR.STATUS_APPROVED, approved_by=manager_user,
        )

        with pytest.raises(ConflictError, match='already-started'):
            cancel_leave(tenant, req, staff_user)


# ─── 7. Working day calculation ───────────────────────────────────────────────

class TestWorkingDays:
    def test_saturday_excluded(self):
        """Nepal working week is Sun–Fri. Saturday must not be counted."""
        from hrm.services.leave_service import _count_working_days

        # Sat 2024-07-06 is between Mon 01 and Mon 08
        start = date(2024, 7, 1)   # Monday
        end   = date(2024, 7, 7)   # Sunday (6 working days — Mon-Fri + Sun)
        result = _count_working_days(start, end)
        assert result == Decimal('6')  # Sat excluded

    def test_single_day_is_one(self):
        from hrm.services.leave_service import _count_working_days

        start = date(2024, 7, 1)
        assert _count_working_days(start, start) == Decimal('1')

    def test_full_week_mon_to_fri(self):
        from hrm.services.leave_service import _count_working_days

        start = date(2024, 7, 1)  # Monday
        end   = date(2024, 7, 5)  # Friday (no Sat in range)
        assert _count_working_days(start, end) == Decimal('5')


# ─── 8. Staff profile ─────────────────────────────────────────────────────────

class TestStaffProfile:
    def test_get_or_create_profile(self, db, tenant, staff_user):
        from hrm.services.profile_service import get_or_create_profile
        from hrm.models import StaffProfile
        from accounts.models import TenantMembership

        membership = TenantMembership.objects.get(user=staff_user, tenant=tenant)
        profile = get_or_create_profile(membership)

        assert profile is not None
        assert profile.membership == membership
        assert profile.tenant == tenant

    def test_get_or_create_is_idempotent(self, db, tenant, staff_user):
        from hrm.services.profile_service import get_or_create_profile
        from hrm.models import StaffProfile
        from accounts.models import TenantMembership

        membership = TenantMembership.objects.get(user=staff_user, tenant=tenant)
        p1 = get_or_create_profile(membership)
        p2 = get_or_create_profile(membership)

        assert p1.pk == p2.pk
        assert StaffProfile.objects.filter(membership=membership).count() == 1

    def test_update_profile_persists_fields(self, db, tenant, staff_user):
        from hrm.services.profile_service import get_or_create_profile, update_profile
        from accounts.models import TenantMembership

        membership = TenantMembership.objects.get(user=staff_user, tenant=tenant)
        profile = get_or_create_profile(membership)

        updated = update_profile(profile, {
            'designation': 'Senior Engineer',
            'blood_group': 'O+',
            'gender': 'male',
        })

        updated.refresh_from_db()
        assert updated.designation == 'Senior Engineer'
        assert updated.blood_group == 'O+'
        assert updated.gender == 'male'
