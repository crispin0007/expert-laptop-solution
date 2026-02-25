from django.core.cache import cache
from django.db.models import Count
from django.utils import timezone
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import TenantMixin
from core.permissions import IsSuperAdmin
from .models import Tenant, Plan, Module, TenantModuleOverride
from .serializers import (
    TenantSerializer, TenantMemberSerializer, TenantSettingsSerializer,
    PlanSerializer, ModuleSerializer, TenantModuleOverrideSerializer,
)


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
            import re
            from accounts.models import User, TenantMembership
            # Create user if not exists
            # Generate a safe unique username from the email (not just email itself
            # to avoid hitting Django's 150-char username limit with long emails)
            def _make_username(email: str) -> str:
                base = re.sub(r'[^a-z0-9._]', '', email.lower())[:140]
                if not User.objects.filter(username=base).exists():
                    return base
                return f"{base[:130]}_{secrets.token_hex(4)}"

            user, created = User.objects.get_or_create(
                email=admin_email,
                defaults={
                    'username': _make_username(admin_email),
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

    def perform_update(self, serializer):
        # Before saving, capture the old custom_domain to invalidate its cache.
        old_domain = serializer.instance.custom_domain
        instance = serializer.save()
        if old_domain:
            cache.delete(f'tenant_domain_{old_domain}')
        if instance.custom_domain and instance.custom_domain != old_domain:
            cache.delete(f'tenant_domain_{instance.custom_domain}')
        cache.delete(f'tenant_slug_{instance.slug}')

    def destroy(self, request, *args, **kwargs):
        """Soft-delete instead of hard delete."""
        tenant = self.get_object()
        if tenant.is_deleted:
            return Response(
                {'success': False, 'errors': ['Tenant is already deleted.']},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Clear both slug + custom domain caches before soft delete
        cache.delete(f'tenant_slug_{tenant.slug}')
        if tenant.custom_domain:
            cache.delete(f'tenant_domain_{tenant.custom_domain}')
        tenant.soft_delete()
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

    # ── Members management (superadmin only, no TenantMixin needed) ────────────

    @action(detail=True, methods=['get', 'post'], url_path='members')
    def members(self, request, pk=None):
        """
        GET  /api/v1/tenants/{id}/members/  — list all members of this tenant
        POST /api/v1/tenants/{id}/members/  — add a new member (find or create user)
        """
        from accounts.models import User, TenantMembership
        import secrets, re

        tenant = self.get_object()

        if request.method == 'GET':
            memberships = TenantMembership.objects.filter(
                tenant=tenant
            ).select_related('user').order_by('staff_number')
            data = [
                {
                    'id': m.id,
                    'user_id': m.user_id,
                    'email': m.user.email,
                    'full_name': m.user.full_name or m.user.username,
                    'staff_number': m.staff_number,
                    'role': m.role,
                    'is_active': m.is_active,
                    'join_date': m.join_date,
                    'created_at': m.created_at,
                }
                for m in memberships
            ]
            return Response(data)

        # POST — add member
        email = (request.data.get('email_input') or request.data.get('email') or '').strip()
        if not email:
            return Response(
                {'detail': 'email is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        role = request.data.get('role', 'staff')
        full_name = (request.data.get('full_name_input') or request.data.get('full_name') or '').strip()
        password = (request.data.get('password_input') or request.data.get('password') or '').strip()

        def _make_username(email: str) -> str:
            base = re.sub(r'[^a-z0-9._]', '', email.lower())[:140]
            if not User.objects.filter(username=base).exists():
                return base
            return f"{base[:130]}_{secrets.token_hex(4)}"

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': _make_username(email),
                'full_name': full_name or email.split('@')[0],
                'is_active': True,
            }
        )
        if created:
            pwd = password or secrets.token_urlsafe(12)
            user.set_password(pwd)
            user.save()
        elif full_name and not user.full_name:
            user.full_name = full_name
            user.save(update_fields=['full_name'])

        membership, mem_created = TenantMembership.objects.get_or_create(
            user=user,
            tenant=tenant,
            defaults={'role': role, 'is_active': True},
        )
        if not mem_created:
            # Update role if membership already exists
            membership.role = role
            membership.is_active = True
            membership.save(update_fields=['role', 'is_active'])

        response_data = {
            'id': membership.id,
            'user_id': user.id,
            'email': user.email,
            'full_name': user.full_name,
            'staff_number': membership.staff_number,
            'role': membership.role,
            'is_active': membership.is_active,
            'join_date': membership.join_date,
            'created_at': membership.created_at,
        }
        if created:
            response_data['generated_password'] = pwd

        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=['patch', 'delete'],
        url_path=r'members/(?P<mid>[^/.]+)',
    )
    def member_detail(self, request, pk=None, mid=None):
        """
        PATCH  /api/v1/tenants/{id}/members/{mid}/  — update role / is_active
        DELETE /api/v1/tenants/{id}/members/{mid}/  — remove member from tenant
        """
        from accounts.models import TenantMembership

        tenant = self.get_object()
        try:
            membership = TenantMembership.objects.select_related('user').get(
                id=mid, tenant=tenant
            )
        except TenantMembership.DoesNotExist:
            return Response(
                {'detail': 'Membership not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.method == 'DELETE':
            membership.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)

        # PATCH
        fields = []
        if 'role' in request.data:
            membership.role = request.data['role']
            fields.append('role')
        if 'is_active' in request.data:
            membership.is_active = bool(request.data['is_active'])
            fields.append('is_active')
        if fields:
            membership.save(update_fields=fields)

        return Response({
            'id': membership.id,
            'user_id': membership.user_id,
            'email': membership.user.email,
            'full_name': membership.user.full_name,
            'staff_number': membership.staff_number,
            'role': membership.role,
            'is_active': membership.is_active,
            'join_date': membership.join_date,
            'created_at': membership.created_at,
        })

    # ── Module overrides ──────────────────────────────────────────────────────

    @action(detail=True, methods=['get', 'post'], url_path='module_overrides')
    def module_overrides(self, request, pk=None):
        """
        GET  /tenants/{id}/module_overrides/  — All modules with override/plan status.
        POST /tenants/{id}/module_overrides/  — Create or update an override.
                                               Body: { module_id, is_enabled, note? }
        """
        tenant = self.get_object()

        if request.method == 'GET':
            modules = Module.objects.all()
            plan_keys = set(tenant.plan.modules.values_list('key', flat=True)) if tenant.plan else set()
            override_map = {o.module_id: o for o in TenantModuleOverride.objects.filter(tenant=tenant).select_related('module')}
            active_keys = tenant.active_modules_set

            result = []
            for mod in modules:
                override = override_map.get(mod.id)
                if override is not None:
                    source = 'override_grant' if override.is_enabled else 'override_revoke'
                elif mod.is_core:
                    source = 'core'
                elif mod.key in plan_keys:
                    source = 'plan'
                else:
                    source = 'not_included'

                result.append({
                    'module': ModuleSerializer(mod).data,
                    'is_active': mod.key in active_keys,
                    'source': source,
                    'override': TenantModuleOverrideSerializer(override).data if override else None,
                })
            return Response(result)

        # POST — create or update an override
        module_id = request.data.get('module_id')
        is_enabled = request.data.get('is_enabled')
        note = request.data.get('note', '')

        if module_id is None or is_enabled is None:
            return Response({'detail': 'module_id and is_enabled are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            module = Module.objects.get(pk=module_id)
        except Module.DoesNotExist:
            return Response({'detail': 'Module not found.'}, status=status.HTTP_404_NOT_FOUND)

        override, created = TenantModuleOverride.objects.update_or_create(
            tenant=tenant, module=module,
            defaults={'is_enabled': is_enabled, 'note': note},
        )
        return Response(
            TenantModuleOverrideSerializer(override).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['delete'], url_path='module_overrides/(?P<mod_id>[0-9]+)')
    def delete_module_override(self, request, pk=None, mod_id=None):
        """DELETE /tenants/{id}/module_overrides/{mod_id}/ — Revert to plan default."""
        tenant = self.get_object()
        override = TenantModuleOverride.objects.filter(tenant=tenant, pk=mod_id).first()
        if not override:
            return Response({'detail': 'Override not found.'}, status=status.HTTP_404_NOT_FOUND)
        override.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── Plan management (super admin only) ────────────────────────────────────────

class PlanViewSet(viewsets.ModelViewSet):
    """CRUD for subscription plans. POST /plans/:id/toggle_module/ to add/remove a module."""
    permission_classes = [IsSuperAdmin]

    def get_queryset(self):
        return Plan.objects.annotate(
            tenant_count=Count('tenants', distinct=True)
        ).prefetch_related('modules').order_by('name')

    def get_serializer_class(self):
        return PlanSerializer

    @action(detail=True, methods=['post'], url_path='toggle_module')
    def toggle_module(self, request, pk=None):
        """POST /plans/{id}/toggle_module/  Body: { module_key, enabled }"""
        plan = self.get_object()
        module_key = request.data.get('module_key', '').strip()
        enabled = request.data.get('enabled')

        if not module_key or enabled is None:
            return Response({'detail': 'module_key and enabled are required.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            module = Module.objects.get(key=module_key)
        except Module.DoesNotExist:
            return Response({'detail': f'Module "{module_key}" not found.'},
                            status=status.HTTP_404_NOT_FOUND)

        if enabled:
            plan.modules.add(module)
        else:
            plan.modules.remove(module)

        return Response(PlanSerializer(plan, context={'request': request}).data)


# ── Module list (read-only, super admin) ──────────────────────────────────────

class ModuleViewSet(viewsets.ReadOnlyModelViewSet):
    """GET /api/v1/modules/ — catalogue of all available modules."""
    permission_classes = [IsSuperAdmin]
    serializer_class = ModuleSerializer
    queryset = Module.objects.all()


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
