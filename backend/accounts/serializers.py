from rest_framework import serializers
from django.db import transaction
from .models import User, TenantMembership


class TwoFAConfirmSerializer(serializers.Serializer):
    """Validates the 6-digit TOTP code submitted to confirm 2FA setup."""
    code = serializers.CharField(
        min_length=6,
        max_length=6,
        trim_whitespace=True,
        help_text='6-digit TOTP code from your authenticator app.',
    )

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('Code must be 6 digits.')
        return value


class TwoFAVerifySerializer(serializers.Serializer):
    """
    Validates the two_factor_token + TOTP code submitted at step-2 of the
    2FA login flow (POST /api/v1/accounts/2fa/verify/).
    """
    two_factor_token = serializers.CharField(
        trim_whitespace=True,
        help_text='Partial token returned by the login endpoint when 2FA is required.',
    )
    code = serializers.CharField(
        min_length=6,
        max_length=8,  # 6-digit TOTP or 8-char backup code
        trim_whitespace=True,
        help_text='6-digit TOTP code or 8-character backup code.',
    )


class TwoFADisableSerializer(serializers.Serializer):
    """
    Validates the TOTP code + current password needed to disable 2FA
    (POST /api/v1/accounts/2fa/disable/).
    """
    code = serializers.CharField(
        min_length=6,
        max_length=6,
        trim_whitespace=True,
        help_text='6-digit TOTP code from your authenticator app.',
    )
    password = serializers.CharField(
        write_only=True,
        style={'input_type': 'password'},
        help_text='Current account password for confirmation.',
    )

    def validate_code(self, value):
        if not value.isdigit():
            raise serializers.ValidationError('Code must be 6 digits.')
        return value


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
    is_superadmin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            'id', 'email', 'username', 'full_name',
            'phone', 'avatar', 'is_superadmin', 'is_2fa_enabled', 'membership', 'tenants',
        )

    def get_is_superadmin(self, user):
        # Django superusers (createsuperuser) are also platform super admins
        return bool(user.is_superadmin or user.is_superuser)

    def get_membership(self, user):
        request = self.context.get('request')
        if not request:
            return None
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return None
        membership = TenantMembership.objects.select_related(
            'department', 'custom_role'
        ).filter(user=user, tenant=tenant, is_active=True).first()
        if not membership:
            return None

        role = membership.role
        # Compute effective permissions for this role
        # These mirror the backend ViewSet permission matrix so the UI can gate
        # buttons/routes without additional API calls.
        is_admin = role in ('owner', 'admin')
        is_manager = role in ('owner', 'admin', 'manager')
        is_staff = role in ('owner', 'admin', 'manager', 'staff')
        is_viewer = role == 'viewer'

        # Custom role: merge any explicit overrides
        custom_perms = {}
        if role == 'custom' and membership.custom_role:
            custom_perms = membership.custom_role.permissions or {}

        def _perm(default: bool, key: str) -> bool:
            return custom_perms.get(key, default) if role == 'custom' else default

        permissions = {
            # Tickets
            'can_view_tickets': _perm(True, 'tickets.view'),
            'can_create_tickets': _perm(is_staff, 'tickets.create'),
            'can_update_tickets': _perm(is_staff, 'tickets.update'),
            'can_delete_tickets': _perm(is_manager, 'tickets.delete'),
            'can_assign_tickets': _perm(is_manager, 'tickets.assign'),
            'can_transfer_tickets': _perm(is_manager, 'tickets.transfer'),
            'can_close_tickets': _perm(is_manager, 'tickets.close'),
            'can_manage_ticket_types': _perm(is_admin, 'tickets.manage_types'),
            # Customers
            'can_view_customers': _perm(True, 'customers.view'),
            'can_create_customers': _perm(is_staff, 'customers.create'),
            'can_update_customers': _perm(is_staff, 'customers.update'),
            'can_delete_customers': _perm(is_manager, 'customers.delete'),
            # Projects
            'can_view_projects': _perm(True, 'projects.view'),
            'can_create_projects': _perm(is_staff, 'projects.create'),
            'can_update_projects': _perm(is_staff, 'projects.update'),
            'can_delete_projects': _perm(is_manager, 'projects.delete'),
            # Departments
            'can_view_departments': _perm(True, 'departments.view'),
            'can_manage_departments': _perm(is_manager, 'departments.manage'),
            # Staff
            'can_view_staff': _perm(is_manager, 'staff.view'),
            'can_manage_staff': _perm(is_admin, 'staff.manage'),
            # Inventory
            'can_view_inventory': _perm(True, 'inventory.view'),
            'can_manage_inventory': _perm(is_admin, 'inventory.manage'),
            # Accounting
            'can_view_accounting': _perm(is_manager, 'accounting.view'),
            'can_manage_accounting': _perm(is_admin, 'accounting.manage'),
            # Coins
            'can_view_coins': _perm(True, 'coins.view'),
            'can_approve_coins': _perm(is_manager, 'coins.approve'),
            # Settings & roles
            'can_manage_settings': _perm(is_admin, 'settings.manage'),
            'can_manage_roles': _perm(is_admin, 'roles.manage'),
        }

        return {
            'role': role,
            'role_display': membership.get_role_display(),
            'is_admin': membership.is_admin,
            'department': membership.department_id,
            'department_name': membership.department.name if membership.department else None,
            'employee_id': membership.employee_id,
            'staff_number': membership.staff_number,
            'permissions': permissions,
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
                'logo': m.tenant.logo or '',
                'favicon': getattr(m.tenant, 'favicon', '') or '',
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
    custom_role_id = serializers.IntegerField(source='custom_role.id', read_only=True)
    custom_role_name = serializers.CharField(source='custom_role.name', read_only=True)

    class Meta:
        model = TenantMembership
        fields = (
            'id', 'role', 'role_display',
            'custom_role_id', 'custom_role_name',
            'department', 'department_name',
            'employee_id', 'staff_number', 'join_date', 'is_admin', 'is_active',
        )


def _user_display_name(user) -> str:
    """Best available display name for a user (mirrors tickets/serializers.py helper)."""
    if not user:
        return ''
    if user.full_name:
        return user.full_name
    composed = f"{user.first_name} {user.last_name}".strip()
    if composed:
        return composed
    if user.username and user.username != user.email:
        return user.username
    local = user.email.split('@')[0] if user.email and '@' in user.email else user.email
    return local or user.email


class StaffSerializer(serializers.ModelSerializer):
    """Read serializer — user profile + their membership in the current tenant."""
    membership = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'email', 'full_name', 'display_name', 'phone', 'avatar', 'is_active', 'date_joined', 'membership')

    def get_display_name(self, user):
        return _user_display_name(user)

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

    def validate_department(self, value):
        """
        Reject departments that belong to a different tenant.

        ``department`` is accepted as a raw PK via PrimaryKeyRelatedField whose
        queryset is ``Department.objects.all()`` (unscoped) so that DRF can
        resolve the PK.  Without this explicit cross-tenant check an admin of
        tenant A could assign a department from tenant B on a staff member,
        leaking cross-tenant structure.
        """
        if value is None:
            return value
        tenant = self.context.get('tenant')
        if tenant is not None and getattr(value, 'tenant_id', None) != tenant.pk:
            raise serializers.ValidationError(
                'Department does not belong to this workspace.'
            )
        return value

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

        # SECURITY: never pass plaintext passwords to Celery.  Celery task args
        # are serialised and stored in the Redis broker in plaintext.  Send the
        # invite email synchronously so the password is never persisted beyond
        # this call stack (same reasoning as StaffViewSet.reset_password).
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

    def validate_department(self, value):
        """
        Reject departments that belong to a different tenant (same guard as
        InviteStaffSerializer.validate_department).
        """
        if value is None:
            return value
        tenant = self.context.get('tenant')
        if tenant is not None and getattr(value, 'tenant_id', None) != tenant.pk:
            raise serializers.ValidationError(
                'Department does not belong to this workspace.'
            )
        return value

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
