from rest_framework import serializers
from .models import Role


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ('id', 'name', 'permissions', 'is_system_role', 'created_at', 'updated_at')
        read_only_fields = ('created_at', 'updated_at', 'is_system_role')
