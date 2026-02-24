from rest_framework import serializers
from django.db import transaction
from .models import User, TenantMembership


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = (
            'id', 'username', 'email', 'full_name',
            'phone', 'avatar', 'is_superadmin', 'is_staff', 'is_active',
        )
        read_only_fields = ('id', 'is_superadmin', 'is_staff')


class TenantMembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = TenantMembership
        fields = (
            'id', 'user', 'tenant', 'role', 'department',
            'employee_id', 'join_date', 'is_admin', 'is_active', 'created_at',
        )


class MeSerializer(serializers.ModelSerializer):
    """Full current-user payload including membership + permissions."""
    membership = serializers.SerializerMethodField()
    tenants = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'username', 'full_name',
            'phone', 'avatar', 'is_superadmin', 'membership', 'tenants',
        )

    def get_membership(self, user):
        request = self.context.get('request')
        if not request:
            return None
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return None
        membership = TenantMembership.objects.filter(user=user, tenant=tenant, is_active=True).first()
        if not membership:
            return None
        return {
            'role': membership.role,
            'is_admin': membership.is_admin,
            'department': membership.department_id,
            'employee_id': membership.employee_id,
        }

    def get_tenants(self, user):
        """Return all active tenant memberships so the frontend can pick one."""
        memberships = TenantMembership.objects.filter(
            user=user, is_active=True,
            tenant__is_active=True, tenant__is_deleted=False,
        ).select_related('tenant')
        return [
            {
                'id': m.tenant.id,
                'name': m.tenant.name,
                'subdomain': m.tenant.slug,
                'vat_enabled': getattr(m.tenant, 'vat_enabled', False),
                'vat_rate': float(getattr(m.tenant, 'vat_rate', 0.13)),
                'role': m.role,
                'is_admin': m.is_admin,
            }
            for m in memberships
        ]


class StaffAvailabilitySerializer(serializers.ModelSerializer):
    """Staff member with live assignment counts."""
    open_tickets = serializers.IntegerField(read_only=True)
    active_tasks = serializers.IntegerField(read_only=True)
    is_available = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'avatar', 'open_tickets', 'active_tasks', 'is_available')

    def get_is_available(self, obj):
        return (getattr(obj, 'open_tickets', 0) + getattr(obj, 'active_tasks', 0)) == 0


# ─── Sprint 2: Staff management ──────────────────────────────────────────────

class StaffMembershipSerializer(serializers.ModelSerializer):
    """Membership details nested inside a staff profile response."""
    department_name = serializers.CharField(source='department.name', read_only=True)
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = TenantMembership
        fields = (
            'id', 'role', 'role_display', 'department', 'department_name',
            'employee_id', 'staff_number', 'join_date', 'is_admin', 'is_active',
        )


class StaffSerializer(serializers.ModelSerializer):
    """Read serializer — user profile + their membership in the current tenant."""
    membership = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'phone', 'avatar', 'is_active', 'date_joined', 'membership')

    def get_membership(self, user):
        tenant = self.context.get('tenant')
        if not tenant:
            return None
        m = TenantMembership.objects.filter(user=user, tenant=tenant).first()
        if not m:
            return None
        return StaffMembershipSerializer(m).data


class InviteStaffSerializer(serializers.Serializer):
    """
    POST /api/v1/staff/
    Creates a User (or finds existing) and attaches them to the tenant.
    """
    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8, required=False)
    role = serializers.ChoiceField(choices=TenantMembership.ROLE_CHOICES, default='staff')
    department = serializers.PrimaryKeyRelatedField(
        queryset=__import__('departments.models', fromlist=['Department']).Department.objects.all(),
        required=False,
        allow_null=True,
    )
    employee_id = serializers.CharField(max_length=64, required=False, allow_blank=True)
    join_date = serializers.DateField(required=False, allow_null=True)
    is_admin = serializers.BooleanField(default=False)

    def validate_email(self, value):
        tenant = self.context.get('tenant')
        # Only block if there is an *active* membership — inactive means previously removed
        if TenantMembership.objects.filter(user__email=value, tenant=tenant, is_active=True).exists():
            raise serializers.ValidationError('This user is already an active member of this tenant.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        import secrets, string
        tenant = self.context['tenant']
        email = validated_data['email']
        alphabet = string.ascii_letters + string.digits + '!@#$%^&*'
        password = validated_data.get('password') or ''.join(secrets.choice(alphabet) for _ in range(16))
        is_new_user = False

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'full_name': validated_data.get('full_name', ''),
                'phone': validated_data.get('phone', ''),
            },
        )
        if created:
            is_new_user = True
            user.set_password(password)
            user.save()

        # Re-invite: reactivate an existing inactive membership instead of creating a duplicate
        membership = TenantMembership.objects.filter(user=user, tenant=tenant).first()
        if membership:
            membership.is_active = True
            membership.role = validated_data.get('role', membership.role)
            membership.department = validated_data.get('department', membership.department)
            membership.employee_id = validated_data.get('employee_id', membership.employee_id)
            membership.join_date = validated_data.get('join_date', membership.join_date)
            membership.is_admin = validated_data.get('is_admin', membership.is_admin)
            membership.save()
        else:
            TenantMembership.objects.create(
                user=user,
                tenant=tenant,
                role=validated_data.get('role', 'staff'),
                department=validated_data.get('department'),
                employee_id=validated_data.get('employee_id', ''),
                join_date=validated_data.get('join_date'),
                is_admin=validated_data.get('is_admin', False),
            )

        # Send invitation email — try Celery first, fall back to synchronous send
        try:
            from notifications.tasks import task_send_staff_invite
            task_send_staff_invite.delay(
                user_id=user.pk,
                tenant_id=tenant.pk,
                temp_password=password if is_new_user else '(your existing password)',
            )
        except Exception:
            # Celery unavailable — send directly so the email is never silently dropped
            try:
                from notifications.email import send_staff_invite
                send_staff_invite(user, tenant, password if is_new_user else '(your existing password)')
            except Exception:
                pass  # Email failure must never block the invite flow

        return user


class UpdateStaffSerializer(serializers.ModelSerializer):
    """PATCH /api/v1/staff/{id}/ — update user profile + membership fields."""
    role = serializers.ChoiceField(choices=TenantMembership.ROLE_CHOICES, required=False)
    department = serializers.PrimaryKeyRelatedField(
        queryset=__import__('departments.models', fromlist=['Department']).Department.objects.all(),
        required=False,
        allow_null=True,
    )
    employee_id = serializers.CharField(max_length=64, required=False, allow_blank=True)
    join_date = serializers.DateField(required=False, allow_null=True)
    is_admin = serializers.BooleanField(required=False)
    membership_active = serializers.BooleanField(required=False)

    class Meta:
        model = User
        fields = (
            'full_name', 'phone', 'avatar',
            # membership fields
            'role', 'department', 'employee_id', 'join_date', 'is_admin', 'membership_active',
        )

    def update(self, instance, validated_data):
        # Split user fields from membership fields
        membership_fields = {}
        for f in ('role', 'department', 'employee_id', 'join_date', 'is_admin', 'membership_active'):
            if f in validated_data:
                membership_fields[f] = validated_data.pop(f)

        # Update user
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        # Update membership
        if membership_fields:
            tenant = self.context['tenant']
            m = TenantMembership.objects.filter(user=instance, tenant=tenant).first()
            if m:
                if 'membership_active' in membership_fields:
                    m.is_active = membership_fields.pop('membership_active')
                for attr, val in membership_fields.items():
                    setattr(m, attr, val)
                m.save()

        return instance
