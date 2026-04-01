from rest_framework import serializers
from .models import Tenant, Plan, Module, TenantModuleOverride, TenantSmtpConfig


# ── Module ────────────────────────────────────────────────────────────────────

class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ('id', 'key', 'name', 'description', 'icon', 'is_core', 'order')
        read_only_fields = ('id',)


# ── Plan ──────────────────────────────────────────────────────────────────────

class PlanSerializer(serializers.ModelSerializer):
    modules = ModuleSerializer(many=True, read_only=True)
    module_ids = serializers.PrimaryKeyRelatedField(
        queryset=Module.objects.all(),
        many=True,
        write_only=True,
        source='modules',
        required=False,
    )
    tenant_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Plan
        fields = (
            'id', 'name', 'slug', 'description', 'is_active',
            'modules', 'module_ids', 'tenant_count', 'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at', 'tenant_count')


# ── Plan inline (used in TenantSerializer) ────────────────────────────────────

class PlanInlineSerializer(serializers.ModelSerializer):
    module_keys = serializers.SerializerMethodField()

    class Meta:
        model = Plan
        fields = ('id', 'name', 'slug', 'module_keys')

    def get_module_keys(self, obj):
        return list(obj.modules.values_list('key', flat=True))


# ── TenantModuleOverride ──────────────────────────────────────────────────────

class TenantModuleOverrideSerializer(serializers.ModelSerializer):
    module = ModuleSerializer(read_only=True)
    module_id = serializers.PrimaryKeyRelatedField(
        queryset=Module.objects.all(),
        source='module',
        write_only=True,
    )

    class Meta:
        model = TenantModuleOverride
        fields = ('id', 'module', 'module_id', 'is_enabled', 'note', 'created_at')
        read_only_fields = ('id', 'created_at')


# ── Tenant ────────────────────────────────────────────────────────────────────

class TenantSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True, default=0)
    plan = PlanInlineSerializer(read_only=True)
    plan_id = serializers.PrimaryKeyRelatedField(
        queryset=Plan.objects.all(),
        source='plan',
        write_only=True,
        required=False,
        allow_null=True,
    )
    active_modules = serializers.SerializerMethodField()

    class Meta:
        model = Tenant
        fields = (
            'id', 'slug', 'name', 'plan', 'plan_id', 'logo', 'currency',
            'vat_enabled', 'vat_rate', 'coin_to_money_rate',
            'custom_domain', 'active_modules',
            'is_active', 'is_deleted', 'created_at', 'member_count',
        )
        read_only_fields = ('id', 'is_deleted', 'created_at', 'member_count', 'active_modules')

    def get_active_modules(self, obj):
        return sorted(obj.active_modules_set)

    def validate_slug(self, value):
        """Prevent slug changes after tenant creation; reject reserved slugs.

        The slug is the subdomain — changing it after creation breaks all
        existing DNS entries, bookmarks, and any cached JWT tokens that were
        issued against the old subdomain resolution path.

        Also rejects slugs permanently reserved by SlugReservation (set when a
        tenant is soft-deleted) to prevent JWT scope confusion and DNS history
        reuse by a new tenant claiming an old slug.
        """
        # self.instance is set on updates (PATCH/PUT), None on create (POST)
        if self.instance is not None and self.instance.slug != value:
            raise serializers.ValidationError(
                'Tenant slug (subdomain) cannot be changed after creation. '
                'Doing so would break all existing user sessions and DNS entries.'
            )
        # On creation, reject slugs that are permanently reserved.
        if self.instance is None:
            from tenants.models import SlugReservation
            if SlugReservation.objects.filter(slug=value).exists():
                raise serializers.ValidationError(
                    'This slug is reserved and cannot be used for a new tenant.'
                )
        return value

    def validate_custom_domain(self, value):
        """Normalise empty string → None so unique constraint works correctly."""
        if not value or not value.strip():
            return None
        return value.strip().lower()


class TenantMemberSerializer(serializers.Serializer):
    """Read/write serializer for membership rows inside TenantDetailPage."""
    id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    full_name = serializers.CharField(read_only=True, allow_blank=True)
    staff_number = serializers.CharField(read_only=True, allow_blank=True)
    role = serializers.ChoiceField(
        choices=['owner', 'admin', 'manager', 'staff', 'viewer', 'custom'],
        required=False,
    )
    is_active = serializers.BooleanField(required=False)
    join_date = serializers.DateField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    # Write-only fields used only when POSTing a new member
    email_input = serializers.EmailField(write_only=True, required=False)
    full_name_input = serializers.CharField(write_only=True, required=False, allow_blank=True)
    password_input = serializers.CharField(write_only=True, required=False, allow_blank=True)


class TenantSettingsSerializer(serializers.ModelSerializer):
    """
    Settings subset exposed to tenant admins.
    Allows updating coin_to_money_rate, VAT config, currency, and logo.
    Slug, plan, and lifecycle fields are read-only here.
    """
    plan = PlanInlineSerializer(read_only=True)
    # Override logo/favicon as CharField so relative paths (/media/...) from
    # our upload endpoint are accepted without URLField validation errors.
    logo   = serializers.CharField(allow_blank=True, required=False, default='')
    favicon = serializers.CharField(allow_blank=True, required=False, default='')

    class Meta:
        model = Tenant
        fields = (
            'id', 'name', 'slug', 'logo', 'favicon', 'currency',
            'vat_enabled', 'vat_rate',
            'coin_to_money_rate', 'custom_domain', 'plan',
        )
        read_only_fields = ('id', 'slug', 'plan')

    def validate_custom_domain(self, value):
        if not value or not value.strip():
            return None
        return value.strip().lower()


class TenantSmtpConfigSerializer(serializers.ModelSerializer):
    """
    Read/write serializer for TenantSmtpConfig.

    The SMTP password is write-only — responses include ``has_password`` (bool)
    instead of the raw or encrypted value.
    """
    password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={'input_type': 'password'},
        help_text='Leave blank to keep existing password unchanged.',
    )
    has_password = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = TenantSmtpConfig
        fields = (
            'id', 'host', 'port', 'username', 'password', 'has_password',
            'use_tls', 'use_ssl', 'from_email', 'from_name', 'is_active',
            'created_at', 'updated_at',
        )
        read_only_fields = ('id', 'created_at', 'updated_at')

    def get_has_password(self, obj) -> bool:
        return obj.has_password

    def validate(self, data):
        use_tls = data.get('use_tls', getattr(self.instance, 'use_tls', True))
        use_ssl = data.get('use_ssl', getattr(self.instance, 'use_ssl', False))
        if use_tls and use_ssl:
            raise serializers.ValidationError('use_tls and use_ssl cannot both be True.')
        port = data.get('port', getattr(self.instance, 'port', 587))
        if not (1 <= port <= 65535):
            raise serializers.ValidationError({'port': 'Port must be between 1 and 65535.'})
        return data

    def create(self, validated_data):
        password = validated_data.pop('password', '')
        instance = super().create(validated_data)
        if password:
            instance.password = password
            instance.save(update_fields=['_encrypted_password'])
        return instance

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        instance = super().update(instance, validated_data)
        if password is not None and password != '':
            instance.password = password
            instance.save(update_fields=['_encrypted_password'])
        return instance
