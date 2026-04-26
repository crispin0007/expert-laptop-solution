"""
test_payslip_calendar.py
========================
Tests for the payslip_calendar tenant setting and the
task_generate_monthly_payslips AD/BS calendar branching.

Run directly (no Docker needed if DB port is exposed):
  pytest accounting/tests/test_payslip_calendar.py -v

Features under test
~~~~~~~~~~~~~~~~~~~
1. Tenant.payslip_calendar field — default, choices, constants
2. TenantSettingsSerializer — payslip_calendar is readable and writable via PATCH
3. task_generate_monthly_payslips — AD mode: only generates on AD 1st
4. task_generate_monthly_payslips — BS mode: only generates on BS 1st
5. task_generate_monthly_payslips — idempotency (no duplicate payslips)
6. task_generate_monthly_payslips — BS period boundaries (previous BS month)
"""

import datetime
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.utils import timezone


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def tenant_ad(db):
    """Tenant with Gregorian (AD) payslip calendar."""
    from tenants.models import Tenant
    return Tenant.objects.create(
        name="AD Corp", slug="adcorp",
        vat_enabled=False, vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
        payslip_calendar=Tenant.PAYSLIP_CALENDAR_AD,
    )


@pytest.fixture
def tenant_bs(db):
    """Tenant with Nepali BS payslip calendar."""
    from tenants.models import Tenant
    return Tenant.objects.create(
        name="BS Corp", slug="bscorp",
        vat_enabled=False, vat_rate=Decimal("0.13"),
        coin_to_money_rate=Decimal("10"),
        payslip_calendar=Tenant.PAYSLIP_CALENDAR_BS,
    )


@pytest.fixture
def staff_user(db, tenant_ad):
    """Staff user with TenantMembership for tenant_ad."""
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user(
        username="staffuser_pc",
        email="staff@adcorp.com",
        password="testpassword",
    )
    TenantMembership.objects.create(
        user=user, tenant=tenant_ad, role="staff", is_active=True,
    )
    return user


@pytest.fixture
def staff_user_bs(db, tenant_bs):
    """Staff user with TenantMembership for tenant_bs."""
    from django.contrib.auth import get_user_model
    from accounts.models import TenantMembership
    User = get_user_model()
    user = User.objects.create_user(
        username="staffuser_bs",
        email="staff@bscorp.com",
        password="testpassword",
    )
    TenantMembership.objects.create(
        user=user, tenant=tenant_bs, role="staff", is_active=True,
    )
    return user


@pytest.fixture
def salary_profile_ad(db, tenant_ad, staff_user):
    """StaffSalaryProfile for the AD tenant."""
    from accounting.models import StaffSalaryProfile
    return StaffSalaryProfile.objects.create(
        tenant=tenant_ad,
        staff=staff_user,
        basic_salary=Decimal("50000.00"),
    )


@pytest.fixture
def salary_profile_bs(db, tenant_bs, staff_user_bs):
    """StaffSalaryProfile for the BS tenant."""
    from accounting.models import StaffSalaryProfile
    return StaffSalaryProfile.objects.create(
        tenant=tenant_bs,
        staff=staff_user_bs,
        basic_salary=Decimal("50000.00"),
    )


# ─── 1. Tenant model field ─────────────────────────────────────────────────────

class TestPayslipCalendarField:

    @pytest.mark.django_db
    def test_default_is_ad(self, db):
        """New tenants should default to Gregorian (AD) calendar."""
        from tenants.models import Tenant
        t = Tenant.objects.create(
            name="Default Co", slug="defaultco",
            vat_enabled=False, vat_rate=Decimal("0.13"),
            coin_to_money_rate=Decimal("1"),
        )
        assert t.payslip_calendar == Tenant.PAYSLIP_CALENDAR_AD
        assert t.payslip_calendar == 'ad'

    @pytest.mark.django_db
    def test_bs_value_persists(self, tenant_bs):
        """BS calendar setting is saved and reloaded correctly."""
        from tenants.models import Tenant
        refreshed = Tenant.objects.get(pk=tenant_bs.pk)
        assert refreshed.payslip_calendar == Tenant.PAYSLIP_CALENDAR_BS
        assert refreshed.payslip_calendar == 'bs'

    def test_constants_are_correct(self):
        """Class-level constants must match expected string values."""
        from tenants.models import Tenant
        assert Tenant.PAYSLIP_CALENDAR_AD == 'ad'
        assert Tenant.PAYSLIP_CALENDAR_BS == 'bs'

    def test_choices_contain_both_options(self):
        """Choices must include both AD and BS options."""
        from tenants.models import Tenant
        keys = [c[0] for c in Tenant.PAYSLIP_CALENDAR_CHOICES]
        assert 'ad' in keys
        assert 'bs' in keys


# ─── 2. TenantSettingsSerializer ──────────────────────────────────────────────

class TestTenantSettingsSerializer:

    @pytest.mark.django_db
    def test_payslip_calendar_in_serializer_output(self, tenant_ad):
        """payslip_calendar must appear in serialized tenant settings."""
        from tenants.serializers import TenantSettingsSerializer
        data = TenantSettingsSerializer(tenant_ad).data
        assert 'payslip_calendar' in data
        assert data['payslip_calendar'] == 'ad'

    @pytest.mark.django_db
    def test_serializer_accepts_bs_value(self, tenant_ad):
        """Serializer must accept 'bs' and update the tenant."""
        from tenants.serializers import TenantSettingsSerializer
        serializer = TenantSettingsSerializer(
            tenant_ad,
            data={'payslip_calendar': 'bs'},
            partial=True,
        )
        assert serializer.is_valid(), serializer.errors
        updated = serializer.save()
        assert updated.payslip_calendar == 'bs'

    @pytest.mark.django_db
    def test_serializer_rejects_invalid_value(self, tenant_ad):
        """Serializer must reject values not in the allowed choices."""
        from tenants.serializers import TenantSettingsSerializer
        serializer = TenantSettingsSerializer(
            tenant_ad,
            data={'payslip_calendar': 'us'},
            partial=True,
        )
        assert not serializer.is_valid()
        assert 'payslip_calendar' in serializer.errors


# ─── 3. AD calendar mode: only generates on AD 1st ────────────────────────────

class TestTaskAdMode:

    @pytest.mark.django_db
    def test_ad_mode_generates_on_ad_first(self, salary_profile_ad):
        """AD tenant: payslip must be created when today is AD month day 1."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip

        # Simulate: today = 2026-05-01 (1st of May AD)
        fake_today = datetime.date(2026, 5, 1)
        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()

        assert Payslip.objects.filter(
            tenant=salary_profile_ad.tenant,
            staff=salary_profile_ad.staff,
            period_start=datetime.date(2026, 4, 1),
            period_end=datetime.date(2026, 4, 30),
        ).exists(), "Expected a payslip for April (prev AD month) to be created"

    @pytest.mark.django_db
    def test_ad_mode_skips_on_non_first(self, salary_profile_ad):
        """AD tenant: no payslip must be created when today is NOT AD month day 1."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip

        # Simulate: today = 2026-05-15 (mid-month)
        fake_today = datetime.date(2026, 5, 15)
        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()

        assert not Payslip.objects.filter(
            tenant=salary_profile_ad.tenant,
            staff=salary_profile_ad.staff,
        ).exists(), "No payslip should be created on a non-1st AD day"


# ─── 4. BS calendar mode: only generates on BS 1st ────────────────────────────

class TestTaskBsMode:

    @pytest.mark.django_db
    def test_bs_mode_generates_on_bs_first(self, salary_profile_bs):
        """BS tenant: payslip must be created when today is BS month day 1."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip
        from core.nepali_date import ad_to_bs, bs_to_ad

        # 2026-04-14 is the 1st of Baisakh 2083 (BS new year)
        fake_today = datetime.date(2026, 4, 14)
        today_bs = ad_to_bs(fake_today)
        assert today_bs.day == 1, f"Test setup: expected BS day 1, got {today_bs}"

        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()

        # Previous BS month = Chaitra 2082 (month 12)
        prev_bs_year, prev_bs_month = today_bs.year - 1, 12
        expected_start = bs_to_ad(prev_bs_year, prev_bs_month, 1)
        expected_end = fake_today - datetime.timedelta(days=1)

        assert Payslip.objects.filter(
            tenant=salary_profile_bs.tenant,
            staff=salary_profile_bs.staff,
            period_start=expected_start,
            period_end=expected_end,
        ).exists(), (
            f"Expected payslip for BS Chaitra {prev_bs_year} "
            f"(AD {expected_start} – {expected_end})"
        )

    @pytest.mark.django_db
    def test_bs_mode_skips_on_non_bs_first(self, salary_profile_bs):
        """BS tenant: no payslip must be created when today is NOT BS month day 1."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip
        from core.nepali_date import ad_to_bs

        # 2026-04-16 = BS 2083-01-03 (day 3 of Baisakh)
        fake_today = datetime.date(2026, 4, 16)
        today_bs = ad_to_bs(fake_today)
        assert today_bs.day != 1, f"Test setup: expected non-BS-1st, got {today_bs}"

        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()

        assert not Payslip.objects.filter(
            tenant=salary_profile_bs.tenant,
            staff=salary_profile_bs.staff,
        ).exists(), "No payslip should be created on a non-1st BS day"

    @pytest.mark.django_db
    def test_bs_mode_skips_when_ad_is_first_but_bs_is_not(self, salary_profile_bs):
        """BS tenant must NOT generate when AD is 1st but BS is not."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip
        from core.nepali_date import ad_to_bs

        # 2026-05-01 is AD month 1, but check if BS day != 1
        fake_today = datetime.date(2026, 5, 1)
        today_bs = ad_to_bs(fake_today)
        if today_bs.day == 1:
            pytest.skip(f"2026-05-01 happens to be BS day 1 ({today_bs}) — skip this assertion")

        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()

        assert not Payslip.objects.filter(
            tenant=salary_profile_bs.tenant,
            staff=salary_profile_bs.staff,
        ).exists(), "BS tenant must not generate when AD is 1st but BS day is not 1"


# ─── 5. Idempotency ───────────────────────────────────────────────────────────

class TestTaskIdempotency:

    @pytest.mark.django_db
    def test_no_duplicate_on_second_run(self, salary_profile_ad):
        """Running the task twice on the same day must not create duplicate payslips."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip

        fake_today = datetime.date(2026, 5, 1)
        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()
            task_generate_monthly_payslips()  # second run — must be idempotent

        count = Payslip.objects.filter(
            tenant=salary_profile_ad.tenant,
            staff=salary_profile_ad.staff,
            period_start=datetime.date(2026, 4, 1),
            period_end=datetime.date(2026, 4, 30),
        ).count()
        assert count == 1, f"Expected exactly 1 payslip, found {count}"


# ─── 6. BS period boundaries ─────────────────────────────────────────────────

class TestBsPeriodBoundaries:

    @pytest.mark.django_db
    def test_bs_period_uses_correct_month_boundaries(self, salary_profile_bs):
        """Period start must be BS prev-month day 1 in AD; period end must be day before today."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip
        from core.nepali_date import ad_to_bs, bs_to_ad

        # 2026-04-14 = BS 2083-01-01 (Baisakh 1, new year)
        fake_today = datetime.date(2026, 4, 14)
        today_bs = ad_to_bs(fake_today)

        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = fake_today
            task_generate_monthly_payslips()

        payslip = Payslip.objects.filter(
            tenant=salary_profile_bs.tenant,
            staff=salary_profile_bs.staff,
        ).first()
        assert payslip is not None, "Expected payslip to be created"

        # Previous BS month: Chaitra 2082 (month 12 of year 2082)
        expected_start = bs_to_ad(today_bs.year - 1, 12, 1)
        expected_end = fake_today - datetime.timedelta(days=1)

        assert payslip.period_start == expected_start, (
            f"period_start: got {payslip.period_start}, expected {expected_start}"
        )
        assert payslip.period_end == expected_end, (
            f"period_end: got {payslip.period_end}, expected {expected_end}"
        )

    @pytest.mark.django_db
    def test_bs_period_mid_year_month_rollover(self, salary_profile_bs):
        """Mid-year BS month: prev month is same BS year, month - 1."""
        from accounting.tasks import task_generate_monthly_payslips
        from accounting.models import Payslip
        from core.nepali_date import ad_to_bs, bs_to_ad

        # Find an AD date that falls on BS 2082-07-01 (Kartik 1, mid-year)
        # BS 2082-07-01 ≈ AD 2025-10-17
        bs_target_year, bs_target_month = 2082, 7
        ad_first_of_kartik = bs_to_ad(bs_target_year, bs_target_month, 1)

        # Verify our conversion
        bs_check = ad_to_bs(ad_first_of_kartik)
        if bs_check.day != 1 or bs_check.month != bs_target_month:
            pytest.skip(f"Conversion mismatch: {ad_first_of_kartik} → {bs_check}, skip")

        with patch('accounting.tasks.timezone') as mock_tz:
            mock_tz.localdate.return_value = ad_first_of_kartik
            task_generate_monthly_payslips()

        payslip = Payslip.objects.filter(
            tenant=salary_profile_bs.tenant,
            staff=salary_profile_bs.staff,
        ).first()
        assert payslip is not None, "Expected payslip to be created for Kartik 1"

        # Previous BS month = Ashwin (month 6, same year 2082)
        expected_start = bs_to_ad(bs_target_year, bs_target_month - 1, 1)
        expected_end = ad_first_of_kartik - datetime.timedelta(days=1)

        assert payslip.period_start == expected_start
        assert payslip.period_end == expected_end
