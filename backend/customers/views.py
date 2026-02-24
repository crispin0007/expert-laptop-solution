from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.mixins import TenantMixin
from .models import Customer, CustomerContact
from .serializers import CustomerSerializer, CustomerContactSerializer


class CustomerViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    GET/POST   /api/v1/customers/        — list active / create
    GET/PUT/PATCH /api/v1/customers/{id}/ — detail / update
    DELETE     /api/v1/customers/{id}/   — soft delete
    """
    serializer_class = CustomerSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Customer.objects.filter(is_deleted=False)

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
    serializer_class = CustomerContactSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return CustomerContact.objects.filter(customer_id=self.kwargs['customer_pk'])

    def perform_create(self, serializer):
        serializer.save(customer_id=self.kwargs['customer_pk'])
