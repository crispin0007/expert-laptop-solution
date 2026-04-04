"""
hrm/serializers.py

Separate serializers for list (lightweight) and detail/write operations.
Serializers contain no business logic — data shape only.
"""
from rest_framework import serializers

from .models import (
    AttendancePolicy, AttendanceRecord,
    LeaveBalance, LeaveRequest, LeaveType, StaffProfile,
    Shift, ShiftAssignment,
)


# ─────────────────────────────────────────────────────────────────────────────
# Leave Type
# ─────────────────────────────────────────────────────────────────────────────

class LeaveTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = LeaveType
        fields = [
            'id', 'name', 'code', 'days_allowed', 'is_paid',
            'carry_forward', 'max_carry_forward_days',
            'requires_approval', 'gender_restriction', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class LeaveTypeMinimalSerializer(serializers.ModelSerializer):
    """Lightweight serializer for dropdowns."""
    class Meta:
        model = LeaveType
        fields = ['id', 'name', 'code', 'days_allowed', 'is_paid']


# ─────────────────────────────────────────────────────────────────────────────
# Leave Balance
# ─────────────────────────────────────────────────────────────────────────────

class LeaveBalanceSerializer(serializers.ModelSerializer):
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    leave_type_code = serializers.CharField(source='leave_type.code', read_only=True)
    available       = serializers.DecimalField(
                        max_digits=5, decimal_places=1,
                        read_only=True,
                      )
    staff_email     = serializers.EmailField(source='staff.email', read_only=True)
    staff_name      = serializers.SerializerMethodField()

    class Meta:
        model = LeaveBalance
        fields = [
            'id', 'staff', 'staff_email', 'staff_name',
            'leave_type', 'leave_type_name', 'leave_type_code',
            'year', 'allocated', 'carried_forward', 'used', 'available',
        ]
        read_only_fields = ['id', 'available', 'staff_email', 'staff_name',
                            'leave_type_name', 'leave_type_code']

    def get_staff_name(self, obj) -> str:
        return getattr(obj.staff, 'full_name', '') or obj.staff.email


# ─────────────────────────────────────────────────────────────────────────────
# Leave Request
# ─────────────────────────────────────────────────────────────────────────────

class LeaveRequestListSerializer(serializers.ModelSerializer):
    """Lightweight for list views (mobile-friendly, 6 fields)."""
    leave_type_name = serializers.CharField(source='leave_type.name', read_only=True)
    staff_name      = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'staff', 'staff_name',
            'leave_type', 'leave_type_name',
            'start_date', 'end_date', 'days', 'status',
        ]

    def get_staff_name(self, obj) -> str:
        return getattr(obj.staff, 'full_name', '') or obj.staff.email


class LeaveRequestSerializer(serializers.ModelSerializer):
    leave_type_name  = serializers.CharField(source='leave_type.name', read_only=True)
    leave_type_is_paid = serializers.BooleanField(source='leave_type.is_paid', read_only=True)
    staff_name       = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LeaveRequest
        fields = [
            'id', 'staff', 'staff_name',
            'leave_type', 'leave_type_name', 'leave_type_is_paid',
            'start_date', 'end_date', 'days',
            'reason', 'status',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'attachments',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'days', 'status', 'approved_by', 'approved_at',
            'rejection_reason', 'created_at', 'updated_at',
        ]

    def get_staff_name(self, obj) -> str:
        return getattr(obj.staff, 'full_name', '') or obj.staff.email

    def get_approved_by_name(self, obj) -> str | None:
        if obj.approved_by:
            return getattr(obj.approved_by, 'full_name', '') or obj.approved_by.email
        return None


class LeaveRequestWriteSerializer(serializers.Serializer):
    """Input validation for creating a leave request."""
    leave_type_id = serializers.IntegerField()
    start_date    = serializers.DateField()
    end_date      = serializers.DateField()
    reason        = serializers.CharField(required=False, allow_blank=True, default='')
    attachments   = serializers.ListField(
                      child=serializers.DictField(),
                      required=False,
                      default=list,
                    )

    def validate(self, data):
        if data['start_date'] > data['end_date']:
            raise serializers.ValidationError('start_date must be on or before end_date.')
        return data


class LeaveRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, default='')


# ─────────────────────────────────────────────────────────────────────────────
# Staff Profile
# ─────────────────────────────────────────────────────────────────────────────

class StaffProfileSerializer(serializers.ModelSerializer):
    """Full profile for detail view and update."""
    membership_id   = serializers.IntegerField(source='membership.id', read_only=True)
    staff_id        = serializers.IntegerField(source='membership.user.id', read_only=True)
    staff_email     = serializers.EmailField(source='membership.user.email', read_only=True)
    staff_name      = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    role            = serializers.CharField(source='membership.role', read_only=True)
    staff_number    = serializers.CharField(source='membership.staff_number', read_only=True)
    join_date       = serializers.DateField(source='membership.join_date', read_only=True)

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'membership_id', 'staff_id', 'staff_email', 'staff_name',
            'department_name', 'role', 'staff_number', 'join_date',
            'designation', 'blood_group', 'date_of_birth', 'gender',
            'address', 'emergency_contact_name', 'emergency_contact_phone',
            'bank_name', 'bank_account_number', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'membership_id', 'staff_id', 'staff_email', 'staff_name',
            'department_name', 'role', 'staff_number', 'join_date',
            'created_at', 'updated_at',
        ]

    def get_staff_name(self, obj) -> str:
        user = obj.membership.user
        return getattr(user, 'full_name', '') or user.email

    def get_department_name(self, obj) -> str | None:
        dept = getattr(obj.membership, 'department', None)
        return dept.name if dept else None


class StaffProfileListSerializer(serializers.ModelSerializer):
    """Lightweight for directory list (mobile-friendly)."""
    staff_name      = serializers.SerializerMethodField()
    staff_email     = serializers.EmailField(source='membership.user.email', read_only=True)
    # staff = membership.user.id — used as the FK value when creating ShiftAssignments / filtering
    staff           = serializers.IntegerField(source='membership.user.id', read_only=True)
    role            = serializers.CharField(source='membership.role', read_only=True)
    staff_number    = serializers.CharField(source='membership.staff_number', read_only=True)
    department_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'staff', 'staff_name', 'staff_email',
            'role', 'staff_number', 'designation',
            'department_name', 'gender',
        ]

    def get_staff_name(self, obj) -> str:
        user = obj.membership.user
        return getattr(user, 'full_name', '') or user.email

    def get_department_name(self, obj) -> str | None:
        dept = getattr(obj.membership, 'department', None)
        return dept.name if dept else None


class StaffProfileWriteSerializer(serializers.Serializer):
    """Input validation for updating a staff profile."""
    designation             = serializers.CharField(max_length=120, required=False, allow_blank=True)
    blood_group             = serializers.CharField(max_length=5, required=False, allow_blank=True)
    date_of_birth           = serializers.DateField(required=False, allow_null=True)
    gender                  = serializers.ChoiceField(
                                choices=['male', 'female', 'other', ''],
                                required=False,
                                allow_blank=True,
                              )
    address                 = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_name  = serializers.CharField(max_length=120, required=False, allow_blank=True)
    emergency_contact_phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    bank_name               = serializers.CharField(max_length=120, required=False, allow_blank=True)
    bank_account_number     = serializers.CharField(max_length=64, required=False, allow_blank=True)
    notes                   = serializers.CharField(required=False, allow_blank=True)


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Policy
# ─────────────────────────────────────────────────────────────────────────────

class AttendancePolicySerializer(serializers.ModelSerializer):
    """Full policy — for GET and PUT /api/v1/hrm/attendance-policy/."""

    class Meta:
        model  = AttendancePolicy
        fields = [
            'id',
            'expected_start_time', 'expected_end_time',
            'late_threshold_minutes', 'grace_period_minutes',
            'half_day_threshold_hours',
            'work_days',
            'deduct_absent', 'deduct_late',
            'late_deduction_grace_minutes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Record
# ─────────────────────────────────────────────────────────────────────────────

class AttendanceRecordListSerializer(serializers.ModelSerializer):
    """Lightweight for list / mobile — includes key tracking fields."""
    staff_name  = serializers.SerializerMethodField()
    shift_name  = serializers.SerializerMethodField()

    class Meta:
        model  = AttendanceRecord
        fields = [
            'id', 'staff', 'staff_name',
            'date', 'status', 'late_minutes', 'work_hours',
            'early_exit_minutes', 'overtime_minutes', 'shift_name',
        ]

    def get_staff_name(self, obj) -> str:
        return getattr(obj.staff, 'full_name', '') or obj.staff.email

    def get_shift_name(self, obj) -> str | None:
        return obj.shift.name if obj.shift_id else None


class AttendanceRecordSerializer(serializers.ModelSerializer):
    """Full record detail including enhanced tracking and location fields."""
    staff_name          = serializers.SerializerMethodField()
    clocked_in_by_name  = serializers.SerializerMethodField()
    shift_name          = serializers.SerializerMethodField()
    net_work_hours      = serializers.SerializerMethodField()

    class Meta:
        model  = AttendanceRecord
        fields = [
            'id', 'staff', 'staff_name', 'date', 'status',
            'clock_in', 'clock_out',
            'clock_in_lat', 'clock_in_lng', 'clock_in_source',
            'clock_out_lat', 'clock_out_lng', 'clock_out_source',
            'clocked_in_by', 'clocked_in_by_name',
            'late_minutes', 'early_exit_minutes', 'overtime_minutes',
            'work_hours', 'break_minutes', 'net_work_hours',
            'shift', 'shift_name',
            'note', 'admin_remarks',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'staff_name', 'clocked_in_by_name', 'shift_name',
            'late_minutes', 'work_hours', 'net_work_hours',
            'created_at', 'updated_at',
        ]

    def get_staff_name(self, obj) -> str:
        return getattr(obj.staff, 'full_name', '') or obj.staff.email

    def get_clocked_in_by_name(self, obj) -> str | None:
        if obj.clocked_in_by:
            return getattr(obj.clocked_in_by, 'full_name', '') or obj.clocked_in_by.email
        return None

    def get_shift_name(self, obj) -> str | None:
        return obj.shift.name if obj.shift_id else None

    def get_net_work_hours(self, obj) -> str:
        """work_hours minus break_minutes."""
        from decimal import Decimal
        hours = (obj.work_hours or Decimal('0')) - Decimal(str(obj.break_minutes or 0)) / 60
        return str(max(Decimal('0'), hours).quantize(Decimal('0.01')))


class AttendanceAdminUpdateSerializer(serializers.Serializer):
    """Input for admin override of an existing attendance record."""
    clock_in        = serializers.DateTimeField(required=False, allow_null=True)
    clock_out       = serializers.DateTimeField(required=False, allow_null=True)
    status          = serializers.ChoiceField(choices=AttendanceRecord.STATUS_CHOICES, required=False)
    note            = serializers.CharField(required=False, allow_blank=True)
    admin_remarks   = serializers.CharField(required=False, allow_blank=True)
    break_minutes   = serializers.IntegerField(required=False, min_value=0)
    shift_id        = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, data):
        ci = data.get('clock_in')
        co = data.get('clock_out')
        if ci and co and co <= ci:
            raise serializers.ValidationError('clock_out must be after clock_in.')
        return data


class ClockInSerializer(serializers.Serializer):
    """Input for POST .../attendance/clock-in/."""
    source = serializers.ChoiceField(
        choices=AttendanceRecord.SOURCE_CHOICES,
        default=AttendanceRecord.SOURCE_WEB,
    )
    lat    = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    lng    = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    note   = serializers.CharField(required=False, allow_blank=True, default='')


class ClockOutSerializer(serializers.Serializer):
    """Input for POST .../attendance/clock-out/."""
    source = serializers.ChoiceField(
        choices=AttendanceRecord.SOURCE_CHOICES,
        default=AttendanceRecord.SOURCE_WEB,
    )
    lat    = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    lng    = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    note   = serializers.CharField(required=False, allow_blank=True, default='')


class ManualMarkSerializer(serializers.Serializer):
    """Input for POST .../attendance/manual-mark/ (manager override)."""
    staff_id    = serializers.IntegerField()
    date        = serializers.DateField()
    status      = serializers.ChoiceField(choices=AttendanceRecord.STATUS_CHOICES)
    note        = serializers.CharField(required=False, allow_blank=True, default='')


class AttendanceSummaryQuerySerializer(serializers.Serializer):
    """Query params for .../attendance/summary/."""
    staff_id   = serializers.IntegerField(required=False)
    start_date = serializers.DateField()
    end_date   = serializers.DateField()

    def validate(self, data):
        if data['start_date'] > data['end_date']:
            raise serializers.ValidationError('start_date must be on or before end_date.')
        return data


# ─────────────────────────────────────────────────────────────────────────────
# Shift
# ─────────────────────────────────────────────────────────────────────────────

class ShiftSerializer(serializers.ModelSerializer):
    """Full shift detail for create / update / retrieve."""

    class Meta:
        model  = Shift
        fields = [
            'id', 'name', 'start_time', 'end_time',
            'grace_period_minutes', 'min_work_hours',
            'overtime_after_hours', 'late_threshold_minutes',
            'is_default', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ShiftListSerializer(serializers.ModelSerializer):
    """Lightweight for dropdowns."""

    class Meta:
        model  = Shift
        fields = ['id', 'name', 'start_time', 'end_time', 'is_default', 'is_active']


# ─────────────────────────────────────────────────────────────────────────────
# Shift Assignment
# ─────────────────────────────────────────────────────────────────────────────

class ShiftAssignmentSerializer(serializers.ModelSerializer):
    """Full shift assignment detail."""
    shift_name  = serializers.CharField(source='shift.name', read_only=True)
    staff_name  = serializers.SerializerMethodField()
    staff_email = serializers.EmailField(source='staff.email', read_only=True)

    class Meta:
        model  = ShiftAssignment
        fields = [
            'id', 'staff', 'staff_name', 'staff_email',
            'shift', 'shift_name',
            'effective_from', 'effective_to',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'shift_name', 'staff_name', 'staff_email',
                            'created_at', 'updated_at']

    def get_staff_name(self, obj) -> str:
        return getattr(obj.staff, 'full_name', '') or obj.staff.email


class ShiftAssignmentWriteSerializer(serializers.Serializer):
    """Input for creating / updating a shift assignment."""
    staff_id       = serializers.IntegerField()
    shift_id       = serializers.IntegerField()
    effective_from = serializers.DateField()
    effective_to   = serializers.DateField(required=False, allow_null=True)

    def validate(self, data):
        eff_to = data.get('effective_to')
        if eff_to and eff_to < data['effective_from']:
            raise serializers.ValidationError('effective_to must be on or after effective_from.')
        return data


# ─────────────────────────────────────────────────────────────────────────────
# Attendance Reports
# ─────────────────────────────────────────────────────────────────────────────

class AttendanceDailyReportQuerySerializer(serializers.Serializer):
    """Query params for .../attendance/daily_report/?date=YYYY-MM-DD[&dept_id=X]."""
    date    = serializers.DateField()
    dept_id = serializers.IntegerField(required=False)


class AttendanceMonthlyReportQuerySerializer(serializers.Serializer):
    """Query params for .../attendance/monthly_report/?staff_id=X&year=Y&month=M."""
    staff_id = serializers.IntegerField(required=False)
    year     = serializers.IntegerField()
    month    = serializers.IntegerField(min_value=1, max_value=12)
    dept_id  = serializers.IntegerField(required=False)

