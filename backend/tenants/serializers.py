from rest_framework import serializers
from .models import Tenant, Plan, Module, TenantModuleOverride


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

    class Meta:
        model = Tenant
        fields = (
            'id', 'name', 'slug', 'logo', 'currency',
            'vat_enabled', 'vat_rate',
            'coin_to_money_rate', 'custom_domain', 'plan',
        )
        read_only_fields = ('id', 'slug', 'plan')

    def validate_custom_domain(self, value):
        if not value or not value.strip():
            return None
        return value.strip().lower()
