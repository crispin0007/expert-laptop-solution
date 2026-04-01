from rest_framework import serializers
from .models import Department


class DepartmentSerializer(serializers.ModelSerializer):
    head_name = serializers.CharField(source='head.full_name', read_only=True, default='')
    member_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Department
        fields = ('id', 'name', 'description', 'head', 'head_name', 'member_count', 'created_at', 'updated_at')
        read_only_fields = ('id', 'head_name', 'member_count', 'created_at', 'updated_at')

    def validate_head(self, value):
        if value is None:
            return value

        request = self.context.get('request')
        tenant = getattr(request, 'tenant', None) if request is not None else None
        if tenant is None:
            return value

        from accounts.models import TenantMembership

        is_member = TenantMembership.objects.filter(
            tenant=tenant,
            user=value,
            is_active=True,
        ).exists()
        if not is_member:
            raise serializers.ValidationError('Department head must be an active member of this workspace.')

        return value
