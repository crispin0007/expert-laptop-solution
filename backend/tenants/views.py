from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import TenantMixin
from core.permissions import IsSuperAdmin
from .models import Tenant
from .serializers import TenantSerializer, TenantSettingsSerializer


class TenantViewSet(viewsets.ModelViewSet):
    """
    Platform-level Tenant CRUD — accessible only to is_superadmin users.
    """

    serializer_class = TenantSerializer
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        return Tenant.objects.annotate(
            member_count=Count('members', distinct=True)
        ).order_by('slug')

    def perform_create(self, serializer):
        tenant = serializer.save(created_by=self.request.user)

        # Optionally create an owner/admin user for this tenant
        admin_email = self.request.data.get('admin_email', '').strip()
        admin_full_name = self.request.data.get('admin_full_name', '').strip()
        admin_password = self.request.data.get('admin_password', '').strip()

        if admin_email:
            import secrets
            from accounts.models import User, TenantMembership
            # Create user if not exists
            user, created = User.objects.get_or_create(
                email=admin_email,
                defaults={
                    'username': admin_email,
                    'full_name': admin_full_name or admin_email.split('@')[0],
                    'is_active': True,
                }
            )
            if created:
                pwd = admin_password or secrets.token_urlsafe(12)
                user.set_password(pwd)
                user.save()
                # Attach generated password to response via a custom attribute
                tenant._admin_password = pwd
                tenant._admin_email = admin_email
            # Link as owner membership
            TenantMembership.objects.get_or_create(
                user=user,
                tenant=tenant,
                defaults={'role': 'owner', 'is_admin': True, 'is_active': True}
            )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        tenant = serializer.instance
        data = serializer.data
        # Include generated credentials in response if a new admin was created
        if hasattr(tenant, '_admin_password'):
            data = dict(data)
            data['admin_email'] = tenant._admin_email
            data['admin_password'] = tenant._admin_password
        return Response(data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """Soft-delete instead of hard delete."""
        tenant = self.get_object()
        if tenant.is_deleted:
            return Response(
                {'success': False, 'errors': ['Tenant is already deleted.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant.soft_delete()
        # Invalidate tenant cache
        cache.delete(f'tenant_slug_{tenant.slug}')
        return Response({'success': True, 'detail': 'Tenant soft-deleted.'})

    @action(detail=True, methods=['post'])
    def suspend(self, request, pk=None):
        """Deactivate a tenant — staff can no longer log in."""
        tenant = self.get_object()
        if not tenant.is_active:
            return Response(
                {'success': False, 'errors': ['Tenant is already suspended.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant.is_active = False
        tenant.save(update_fields=['is_active', 'updated_at'])
        cache.delete(f'tenant_slug_{tenant.slug}')
        return Response({'success': True, 'detail': 'Tenant suspended.'})

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Re-activate a previously suspended tenant."""
        tenant = self.get_object()
        if tenant.is_deleted:
            return Response(
                {'success': False, 'errors': ['Cannot activate a deleted tenant.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        tenant.is_active = True
        tenant.save(update_fields=['is_active', 'updated_at'])
        cache.delete(f'tenant_slug_{tenant.slug}')
        return Response({'success': True, 'detail': 'Tenant activated.'})


class TenantSettingsView(TenantMixin, APIView):
    """
    GET  /api/v1/settings/  — Return current tenant settings for the authenticated admin.
    PATCH /api/v1/settings/  — Update tenant settings (coin rate, VAT, currency).

    Only accessible by owner / admin / manager of the current tenant.
    Super admins can also access this endpoint.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        self.ensure_tenant()
        if not self.is_manager_role():
            return Response(
                {'detail': 'Only managers or admins can view tenant settings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(TenantSettingsSerializer(self.tenant).data)

    def patch(self, request):
        self.ensure_tenant()
        if not self.is_manager_role():
            return Response(
                {'detail': 'Only managers or admins can update tenant settings.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = TenantSettingsSerializer(self.tenant, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        cache.delete(f'tenant_slug_{self.tenant.slug}')
        return Response(serializer.data)
