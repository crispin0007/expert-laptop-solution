from rest_framework import viewsets, permissions
from core.mixins import TenantMixin
from .models import Role
from .serializers import RoleSerializer


class RoleViewSet(TenantMixin, viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
