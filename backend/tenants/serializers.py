from rest_framework import serializers
from .models import Tenant


class TenantSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Tenant
        fields = (
            'id', 'slug', 'name', 'plan', 'logo', 'currency',
            'vat_enabled', 'vat_rate', 'coin_to_money_rate',
            'custom_domain',
            'is_active', 'is_deleted', 'created_at', 'member_count',
        )
        read_only_fields = ('id', 'is_deleted', 'created_at', 'member_count')


class TenantSettingsSerializer(serializers.ModelSerializer):
    """
    Settings subset exposed to tenant admins.
    Allows updating coin_to_money_rate, VAT config, currency, and logo.
    Slug, plan, and lifecycle fields are read-only here.
    """

    class Meta:
        model = Tenant
        fields = (
            'id', 'name', 'slug', 'logo', 'currency',
            'vat_enabled', 'vat_rate',
            'coin_to_money_rate', 'custom_domain',
        )
        read_only_fields = ('id', 'slug')
