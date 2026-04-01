from django.db.models import Count
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from core.mixins import TenantMixin
from core.permissions import make_role_permission, MANAGER_ROLES, ADMIN_ROLES, ALL_ROLES
from .models import Department
from .serializers import DepartmentSerializer
from . import services as dept_service


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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = dept_service.create_department(
            tenant=self.tenant,
            created_by=request.user,
            data=serializer.validated_data,
        )
        return Response(self.get_serializer(instance).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        dept_service.update_department(
            instance=serializer.instance,
            tenant=self.tenant,
            data=serializer.validated_data,
        )

    def destroy(self, request, *args, **kwargs):
        dept = self.get_object()
        dept_service.delete_department(instance=dept, tenant=self.tenant)
        return Response(status=status.HTTP_204_NO_CONTENT)
