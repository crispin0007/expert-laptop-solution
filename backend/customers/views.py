from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.mixins import TenantMixin
from core.permissions import make_role_permission, STAFF_ROLES, MANAGER_ROLES, ALL_ROLES
from .models import Customer, CustomerContact
from .serializers import CustomerSerializer, CustomerContactSerializer


class CustomerViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    GET/POST   /api/v1/customers/        — list active / create
    GET/PUT/PATCH /api/v1/customers/{id}/ — detail / update
    DELETE     /api/v1/customers/{id}/   — soft delete (manager+)

    Permissions:
    - read: all tenant members
    - create/update: staff+
    - delete: manager+
    """
    required_module = 'customers'
    serializer_class = CustomerSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return Customer.objects.filter(tenant=self.tenant, is_deleted=False)

    def perform_create(self, serializer):
        serializer.save(
            tenant=self.tenant,
            created_by=self.request.user,
            is_active=True,
        )

    def destroy(self, request, *args, **kwargs):
        customer = self.get_object()
        customer.soft_delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class CustomerContactViewSet(TenantMixin, viewsets.ModelViewSet):
    """Contacts inherit the parent customer's permission level."""

    required_module = 'customers'
    serializer_class = CustomerContactSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            return [permissions.IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
        if self.action == 'destroy':
            return [permissions.IsAuthenticated(), make_role_permission(*MANAGER_ROLES)()]
        return [permissions.IsAuthenticated(), make_role_permission(*STAFF_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        # Scope contacts to the parent customer AND the current tenant to prevent
        # a user from probing contacts across tenants by guessing customer_pk.
        return CustomerContact.objects.filter(
            customer_id=self.kwargs['customer_pk'],
            customer__tenant=self.tenant,
        )

    def perform_create(self, serializer):
        serializer.save(customer_id=self.kwargs['customer_pk'])
