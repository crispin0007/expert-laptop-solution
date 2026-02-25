from rest_framework import serializers
from .models import Role
from .permissions_map import PERMISSION_MAP


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = (
            'id', 'name', 'description', 'permissions',
            'is_system_role', 'created_at', 'updated_at',
        )
        read_only_fields = ('created_at', 'updated_at', 'is_system_role')

    def validate_name(self, value):
        """Prevent renaming a system role."""
        if self.instance and self.instance.is_system_role and value != self.instance.name:
            raise serializers.ValidationError(
                'System role names cannot be changed. You can edit permissions instead.'
            )
        return value

    def validate_permissions(self, value):
        """
        Reject any permission keys that are not in the canonical PERMISSION_MAP.
        This prevents typos and keeps the permissions dict clean.
        """
        unknown = set(value.keys()) - set(PERMISSION_MAP.keys())
        if unknown:
            raise serializers.ValidationError(
                f"Unknown permission key(s): {', '.join(sorted(unknown))}. "
                f"Use GET /api/v1/roles/permission-map/ to see valid keys."
            )
        # Coerce all values to bool
        return {k: bool(v) for k, v in value.items()}
