"""
hrm/models.py

All HRM models — Leave Types, Leave Balances, Leave Requests, Staff Profiles,
Attendance Policy, and Attendance Records.

Rules:
- All models inherit TenantModel (never models.Model directly).
- No cross-app model imports — settings.AUTH_USER_MODEL only.
- Soft delete on LeaveRequest / StaffProfile via TenantModel.is_deleted.
- Leave year = BS year integer (e.g., 2081).
"""
from datetime import time as datetime_time
from decimal import Decimal

from django.conf import settings
from django.db import models

from core.models import TenantModel


# ─────────────────────────────────────────────────────────────────────────────
# Leave Type
# ─────────────────────────────────────────────────────────────────────────────

class LeaveType(TenantModel):
    """Configurable leave type per tenant (Nepal defaults seeded on tenant creation)."""

    CODE_ANNUAL         = 'annual'
    CODE_SICK           = 'sick'
    CODE_CASUAL         = 'casual'
    CODE_MATERNITY      = 'maternity'
    CODE_PATERNITY      = 'paternity'
    CODE_PUBLIC_HOLIDAY = 'public_holiday'

    GENDER_NONE   = 'none'
    GENDER_MALE   = 'male'
    GENDER_FEMALE = 'female'

    GENDER_CHOICES = [
        (GENDER_NONE,   'No restriction'),
        (GENDER_MALE,   'Male only'),
        (GENDER_FEMALE, 'Female only'),
    ]

    name                 = models.CharField(max_length=60)
    code                 = models.SlugField(max_length=30)
    days_allowed         = models.PositiveSmallIntegerField(
                             help_text='Default days allowed per year for new balances.',
                           )
    is_paid              = models.BooleanField(
                             default=True,
                             help_text='Unpaid leave triggers a salary deduction in payslip.',
                           )
    carry_forward        = models.BooleanField(
                             default=False,
                             help_text='Unused balance carries forward to the next BS year.',
                           )
    max_carry_forward_days = models.PositiveSmallIntegerField(
                               default=0,
                               help_text='Maximum days that can carry forward. 0 = unlimited.',
                             )
    requires_approval    = models.BooleanField(
                             default=True,
                             help_text='Public holidays do not require approval.',
                           )
    gender_restriction   = models.CharField(
                             max_length=8,
                             choices=GENDER_CHOICES,
                             default=GENDER_NONE,
                             help_text='Maternity = female_only; Paternity = male_only.',
                           )
    is_active            = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        unique_together = ('tenant', 'code')
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.tenant_id})"


# ─────────────────────────────────────────────────────────────────────────────
# Leave Balance
# ─────────────────────────────────────────────────────────────────────────────

class LeaveBalance(TenantModel):
    """Annual leave entitlement for one staff member and leave type, in a BS year."""

    staff        = models.ForeignKey(
                     settings.AUTH_USER_MODEL,
                     on_delete=models.CASCADE,
                     related_name='leave_balances',
                   )
    leave_type   = models.ForeignKey(
                     LeaveType,
                     on_delete=models.CASCADE,
                     related_name='balances',
                   )
    year         = models.PositiveSmallIntegerField(
                     help_text='Bikram Sambat year (e.g. 2081).',
                   )
    allocated    = models.DecimalField(
                     max_digits=5, decimal_places=1,
                     help_text='Days allocated this year (may differ from LeaveType.days_allowed for HR overrides).',
                   )
    carried_forward = models.DecimalField(
                        max_digits=5, decimal_places=1, default=Decimal('0'),
                        help_text='Days carried forward from the previous year.',
                      )
    used         = models.DecimalField(
                     max_digits=5, decimal_places=1, default=Decimal('0'),
                     help_text='Days consumed by approved leave requests.',
                   )

    class Meta(TenantModel.Meta):
        unique_together = ('tenant', 'staff', 'leave_type', 'year')
        indexes = [
            models.Index(fields=['tenant', 'staff', 'year']),
        ]

    def __str__(self):
        return f"{self.staff_id} | {self.leave_type_id} | {self.year}"

    @property
    def available(self) -> Decimal:
        """Days remaining = allocated + carried_forward - used."""
        return (self.allocated or Decimal('0')) + (self.carried_forward or Decimal('0')) - (self.used or Decimal('0'))


# ─────────────────────────────────────────────────────────────────────────────
# Leave Request
# ─────────────────────────────────────────────────────────────────────────────

class LeaveRequest(TenantModel):
    """A staff member's leave application, from draft through to approved/rejected."""

    STATUS_PENDING   = 'pending'
    STATUS_APPROVED  = 'approved'
    STATUS_REJECTED  = 'rejected'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_PENDING,   'Pending'),
        (STATUS_APPROVED,  'Approved'),
        (STATUS_REJECTED,  'Rejected'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    staff            = models.ForeignKey(
                         settings.AUTH_USER_MODEL,
                         on_delete=models.CASCADE,
                         related_name='leave_requests',
                       )
    leave_type       = models.ForeignKey(
                         LeaveType,
                         on_delete=models.PROTECT,
                         related_name='requests',
                       )
    start_date       = models.DateField()
    end_date         = models.DateField()
    days             = models.DecimalField(
                         max_digits=5, decimal_places=1,
                         help_text='Computed working days (weekends excluded).',
                       )
    reason           = models.TextField(blank=True)
    status           = models.CharField(
                         max_length=16,
                         choices=STATUS_CHOICES,
                         default=STATUS_PENDING,
                         db_index=True,
                       )
    approved_by      = models.ForeignKey(
                         settings.AUTH_USER_MODEL,
                         null=True, blank=True,
                         on_delete=models.SET_NULL,
                         related_name='approved_leave_requests',
                       )
    approved_at      = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    attachments      = models.JSONField(
                         default=list,
                         help_text='[{"name": str, "url": str}]',
                       )

    class Meta(TenantModel.Meta):
        ordering = ['-start_date']
        indexes = [
            models.Index(fields=['tenant', 'staff', 'status']),
            models.Index(fields=['tenant', 'staff', 'start_date']),
        ]

    def __str__(self):
        return f"{self.staff_id} | {self.leave_type_id} | {self.start_date}–{self.end_date} [{self.status}]"


# ─────────────────────────────────────────────────────────────────────────────
# Staff Profile
# ─────────────────────────────────────────────────────────────────────────────

class StaffProfile(TenantModel):
    """
    Extended HR profile for a TenantMembership.

    Deliberately avoids importing TenantMembership at the top level —
    uses a string reference to prevent circular imports.
    """

    GENDER_MALE   = 'male'
    GENDER_FEMALE = 'female'
    GENDER_OTHER  = 'other'

    GENDER_CHOICES = [
        (GENDER_MALE,   'Male'),
        (GENDER_FEMALE, 'Female'),
        (GENDER_OTHER,  'Other'),
    ]

    membership             = models.OneToOneField(
                               'accounts.TenantMembership',
                               on_delete=models.CASCADE,
                               related_name='hrm_profile',
                             )
    designation            = models.CharField(max_length=120, blank=True)
    blood_group            = models.CharField(max_length=5, blank=True)
    date_of_birth          = models.DateField(null=True, blank=True)
    gender                 = models.CharField(
                               max_length=8,
                               choices=GENDER_CHOICES,
                               blank=True,
                             )
    address                = models.TextField(blank=True)
    emergency_contact_name = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=32, blank=True)
    bank_name              = models.CharField(max_length=120, blank=True)
    bank_account_number    = models.CharField(max_length=64, blank=True)
    notes                  = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        indexes = [
            models.Index(fields=['tenant', 'membership']),
        ]

    def __str__(self):
        return f"StaffProfile({self.membership_id})"


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Policy  (singleton per tenant)
# ─────────────────────────────────────────────────────────────────────────────

class AttendancePolicy(TenantModel):
    """
    Per-tenant attendance configuration.

    There is exactly one policy per tenant (enforced by UniqueConstraint).
    Use attendance_service.get_or_create_policy(tenant) to access it so
    a sensible default is always returned.

    work_days stores Python weekday() integers (Mon=0 … Sun=6).
    Nepal default: [0, 1, 2, 3, 4, 6]  (Mon–Fri + Sun; Saturday off).
    """
    expected_start_time = models.TimeField(
        default=datetime_time(9, 0),
        help_text='Expected clock-in time (local timezone).',
    )
    expected_end_time = models.TimeField(
        default=datetime_time(18, 0),
        help_text='Expected clock-out time (local timezone).',
    )
    late_threshold_minutes = models.PositiveSmallIntegerField(
        default=15,
        help_text='Minutes after expected_start_time before staff is marked Late.',
    )
    grace_period_minutes = models.PositiveSmallIntegerField(
        default=0,
        help_text='Per-arrival grace window subtracted from measured lateness.',
    )
    half_day_threshold_hours = models.DecimalField(
        max_digits=4, decimal_places=1, default=Decimal('4.0'),
        help_text='Work hours below this → status downgraded to Half Day.',
    )
    work_days = models.JSONField(
        default=list,
        help_text=(
            'List of Python weekday() integers that count as work days. '
            'Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6. '
            'Nepal default: [0,1,2,3,4,6].'
        ),
    )
    deduct_absent = models.BooleanField(
        default=True,
        help_text='Deduct one daily-rate from payslip for each Absent day.',
    )
    deduct_late = models.BooleanField(
        default=True,
        help_text='Deduct proportional amount from payslip for late minutes.',
    )
    late_deduction_grace_minutes = models.PositiveSmallIntegerField(
        default=60,
        help_text=(
            'Total late minutes per pay period allowed before deduction is applied. '
            'Prevents penalising minor cumulative lateness.'
        ),
    )

    class Meta(TenantModel.Meta):
        constraints = [
            models.UniqueConstraint(
                fields=['tenant'],
                name='hrm_attendance_policy_one_per_tenant',
            ),
        ]

    def __str__(self):
        return f"AttendancePolicy(tenant={self.tenant_id})"


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Record  (one per staff per calendar day)
# ─────────────────────────────────────────────────────────────────────────────

class AttendanceRecord(TenantModel):
    """
    One attendance entry per staff member per calendar day.

    Clock-in / clock-out are full UTC datetimes; the service layer converts
    them to local time before comparing against AttendancePolicy times.
    GPS coordinates (lat/lng) are captured when source = 'web' or 'mobile'
    and the device grants location permission.
    """

    STATUS_PRESENT  = 'present'
    STATUS_ABSENT   = 'absent'
    STATUS_LATE     = 'late'
    STATUS_HALF_DAY = 'half_day'
    STATUS_ON_LEAVE = 'on_leave'
    STATUS_HOLIDAY  = 'holiday'
    STATUS_WFH      = 'wfh'

    STATUS_CHOICES = [
        (STATUS_PRESENT,  'Present'),
        (STATUS_ABSENT,   'Absent'),
        (STATUS_LATE,     'Late'),
        (STATUS_HALF_DAY, 'Half Day'),
        (STATUS_ON_LEAVE, 'On Leave'),
        (STATUS_HOLIDAY,  'Holiday'),
        (STATUS_WFH,      'Work From Home'),
    ]

    SOURCE_MANUAL = 'manual'
    SOURCE_WEB    = 'web'
    SOURCE_MOBILE = 'mobile'

    SOURCE_CHOICES = [
        (SOURCE_MANUAL, 'Manual'),
        (SOURCE_WEB,    'Web'),
        (SOURCE_MOBILE, 'Mobile'),
    ]

    staff             = models.ForeignKey(
                          settings.AUTH_USER_MODEL,
                          on_delete=models.CASCADE,
                          related_name='attendance_records',
                        )
    date              = models.DateField(db_index=True)
    clock_in          = models.DateTimeField(null=True, blank=True)
    clock_out         = models.DateTimeField(null=True, blank=True)
    clock_in_lat      = models.DecimalField(
                          max_digits=9, decimal_places=6, null=True, blank=True,
                        )
    clock_in_lng      = models.DecimalField(
                          max_digits=9, decimal_places=6, null=True, blank=True,
                        )
    clock_out_lat     = models.DecimalField(
                          max_digits=9, decimal_places=6, null=True, blank=True,
                        )
    clock_out_lng     = models.DecimalField(
                          max_digits=9, decimal_places=6, null=True, blank=True,
                        )
    clock_in_source   = models.CharField(
                          max_length=16, choices=SOURCE_CHOICES, default=SOURCE_WEB,
                        )
    clock_out_source  = models.CharField(
                          max_length=16, choices=SOURCE_CHOICES, default=SOURCE_WEB,
                        )
    clocked_in_by     = models.ForeignKey(
                          settings.AUTH_USER_MODEL,
                          null=True, blank=True,
                          on_delete=models.SET_NULL,
                          related_name='manual_attendance_records',
                          help_text='Set when a manager manually marks attendance.',
                        )
    status            = models.CharField(
                          max_length=16,
                          choices=STATUS_CHOICES,
                          default=STATUS_ABSENT,
                          db_index=True,
                        )
    late_minutes      = models.PositiveSmallIntegerField(default=0)
    work_hours        = models.DecimalField(
                          max_digits=5, decimal_places=2, default=Decimal('0'),
                        )
    note              = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        unique_together = (('tenant', 'staff', 'date'),)
        indexes = [
            models.Index(fields=['tenant', 'staff', 'date']),
            models.Index(fields=['tenant', 'date']),
        ]

    # Enhanced tracking fields (added upgrade v2)
    early_exit_minutes = models.PositiveSmallIntegerField(
                           default=0,
                           help_text='Minutes the staff left before expected_end_time / shift end.',
                         )
    overtime_minutes   = models.PositiveSmallIntegerField(
                           default=0,
                           help_text='Minutes worked beyond expected_end_time / shift end.',
                         )
    break_minutes      = models.PositiveSmallIntegerField(
                           default=0,
                           help_text='Minutes of break time (deducted from net work hours).',
                         )
    admin_remarks      = models.TextField(
                           blank=True,
                           help_text='Admin notes on manual overrides or corrections.',
                         )
    shift              = models.ForeignKey(
                           'Shift',
                           null=True, blank=True,
                           on_delete=models.SET_NULL,
                           related_name='attendance_records',
                           help_text='Shift assigned at clock-in time (snapshot).',
                         )

    def __str__(self):
        return f"AttendanceRecord({self.staff_id}, {self.date}, {self.status})"


# ─────────────────────────────────────────────────────────────────────────────
# Shift  (named work schedule with overtime rules)
# ─────────────────────────────────────────────────────────────────────────────

class Shift(TenantModel):
    """A named work schedule.  Multiple shifts per tenant; one can be default."""

    name                  = models.CharField(max_length=60)
    start_time            = models.TimeField()
    end_time              = models.TimeField()
    grace_period_minutes  = models.PositiveSmallIntegerField(
                              default=15,
                              help_text='Minutes late before Staff is marked Late.',
                            )
    min_work_hours        = models.DecimalField(
                              max_digits=4, decimal_places=1, default=Decimal('4.0'),
                              help_text='Minimum hours to avoid Half Day status.',
                            )
    overtime_after_hours  = models.DecimalField(
                              max_digits=4, decimal_places=1, default=Decimal('8.0'),
                              help_text='Hours beyond which work is counted as overtime.',
                            )
    late_threshold_minutes = models.PositiveSmallIntegerField(
                               default=15,
                               help_text='Minutes after start_time + grace before marking Late.',
                             )
    work_days             = models.JSONField(
                              default=list,
                              help_text=(
                                  'Python weekday() integers that count as working days for this shift. '
                                  'Mon=0 … Sun=6. Empty list = inherit from AttendancePolicy.'
                              ),
                            )
    is_default            = models.BooleanField(
                              default=False,
                              help_text='Auto-assigned when no ShiftAssignment exists for a staff.',
                            )
    is_active             = models.BooleanField(default=True)

    class Meta(TenantModel.Meta):
        unique_together = ('tenant', 'name')
        ordering = ['name']

    def __str__(self):
        return f"Shift({self.name}, {self.start_time}–{self.end_time}, tenant={self.tenant_id})"


# ─────────────────────────────────────────────────────────────────────────────
# ShiftAssignment  (staff → shift mapping with effective dates)
# ─────────────────────────────────────────────────────────────────────────────

class ShiftAssignment(TenantModel):
    """Maps a staff member to a Shift for a date range."""

    staff         = models.ForeignKey(
                      settings.AUTH_USER_MODEL,
                      on_delete=models.CASCADE,
                      related_name='shift_assignments',
                    )
    shift         = models.ForeignKey(
                      Shift,
                      on_delete=models.CASCADE,
                      related_name='assignments',
                    )
    effective_from = models.DateField(help_text='First day this assignment is active.')
    effective_to   = models.DateField(
                       null=True, blank=True,
                       help_text='Last day active. Null = still current.',
                     )

    class Meta(TenantModel.Meta):
        ordering = ['-effective_from']
        indexes = [
            models.Index(fields=['tenant', 'staff', 'effective_from']),
        ]

    def __str__(self):
        return (
            f"ShiftAssignment({self.staff_id} → {self.shift_id}, "
            f"from={self.effective_from}, to={self.effective_to or 'ongoing'})"
        )
