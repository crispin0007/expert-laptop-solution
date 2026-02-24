from django.db.models import Count
from rest_framework import viewsets, permissions
from core.mixins import TenantMixin
from .models import Department
from .serializers import DepartmentSerializer


class DepartmentViewSet(TenantMixin, viewsets.ModelViewSet):
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Department.objects.annotate(
            member_count=Count('members', distinct=True)
        )

    def perform_create(self, serializer):
        serializer.save()
