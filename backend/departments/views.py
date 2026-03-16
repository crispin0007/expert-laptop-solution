from django.db.models import Count
from rest_framework import viewsets, permissions
from core.mixins import TenantMixin
from core.permissions import make_role_permission, MANAGER_ROLES, ADMIN_ROLES, ALL_ROLES
from .models import Department
from .serializers import DepartmentSerializer


class DepartmentViewSet(TenantMixin, viewsets.ModelViewSet):
    """Departments:
    - read (list/retrieve): all tenant members
    - write (create/update): manager+
    - delete: admin+
    """

    required_module = 'departments'
    serializer_class = DepartmentSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES, permission_key='staff.view')()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES, permission_key='staff.manage')()]
        return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES, permission_key='staff.manage')()]

    def get_queryset(self):
        self.ensure_tenant()
        return Department.objects.filter(tenant=self.tenant).annotate(
            member_count=Count('members', distinct=True)
        )

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)
