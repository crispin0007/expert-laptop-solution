"""
hrm/serializers.py

Separate serializers for list (lightweight) and detail/write operations.
Serializers contain no business logic — data shape only.
"""
from rest_framework import serializers

from .models import LeaveBalance, LeaveRequest, LeaveType, StaffProfile


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
                        source='available',
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
    role            = serializers.CharField(source='membership.role', read_only=True)
    staff_number    = serializers.CharField(source='membership.staff_number', read_only=True)
    department_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = [
            'id', 'staff_name', 'staff_email',
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
