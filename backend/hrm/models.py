"""
hrm/models.py

All HRM models — Leave Types, Leave Balances, Leave Requests, and Staff Profiles.

Rules:
- All models inherit TenantModel (never models.Model directly).
- No cross-app model imports — settings.AUTH_USER_MODEL only.
- Soft delete on LeaveRequest / StaffProfile via TenantModel.is_deleted.
- Leave year = BS year integer (e.g., 2081).
"""
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
