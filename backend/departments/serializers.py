from rest_framework import serializers
from .models import Department


class DepartmentSerializer(serializers.ModelSerializer):
    head_name = serializers.CharField(source='head.full_name', read_only=True, default='')
    member_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Department
        fields = ('id', 'name', 'description', 'head', 'head_name', 'member_count', 'created_at', 'updated_at')
        read_only_fields = ('id', 'head_name', 'member_count', 'created_at', 'updated_at')
