from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from core.mixins import TenantMixin
from core.permissions import make_role_permission, ADMIN_ROLES, ALL_ROLES
from .models import Role
from .serializers import RoleSerializer
from .permissions_map import PERMISSION_MAP, PERMISSION_GROUPS, PRELOAD_ROLES


class RoleViewSet(TenantMixin, viewsets.ModelViewSet):
    """
    Custom role management for a tenant.

    Standard CRUD
    -------------
    GET    /api/v1/roles/                  — list all roles (admin+)
    POST   /api/v1/roles/                  — create a new role (admin+)
    GET    /api/v1/roles/{id}/             — role detail (admin+)
    PATCH  /api/v1/roles/{id}/             — update name/description/permissions (admin+)
    DELETE /api/v1/roles/{id}/             — delete (blocked for system roles)

    Extra actions
    -------------
    GET  /api/v1/roles/permission-map/     — full key registry for the role editor UI
    POST /api/v1/roles/seed-preloads/      — (re-)seed all PRELOAD_ROLES for this tenant
    """

    queryset = Role.objects.all()
    serializer_class = RoleSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]

    def get_queryset(self):
        self.ensure_tenant()
        return Role.objects.filter(tenant=self.tenant)

    def perform_create(self, serializer):
        serializer.save(tenant=self.tenant, created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """Block deletion of system roles — they can be edited but not removed."""
        role = self.get_object()
        if role.is_system_role:
            return Response(
                {
                    'detail': (
                        f'"{role.name}" is a system role and cannot be deleted. '
                        'You can edit its permissions instead.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ── Extra actions ─────────────────────────────────────────────────────────

    @action(detail=False, methods=['get'], url_path='permission-map')
    def permission_map(self, request):
        """
        GET /api/v1/roles/permission-map/

        Returns the canonical list of permission keys grouped by module.
        The frontend role editor uses this to render checkboxes.

        Response shape:
        {
          "keys": { "tickets.view": "View all tickets...", ... },
          "groups": [
            { "group": "Tickets", "keys": ["tickets.view", ...] },
            ...
          ]
        }
        """
        return Response({
            'keys': PERMISSION_MAP,
            'groups': PERMISSION_GROUPS,
        })

    @action(detail=False, methods=['post'], url_path='seed-preloads')
    def seed_preloads(self, request):
        """
        POST /api/v1/roles/seed-preloads/

        (Re-)creates all PRELOAD_ROLES for this tenant.
        Existing roles with the same name are left untouched (permissions
        are NOT overwritten so tenant customisations are preserved).
        New roles are created with is_system_role=True.

        Returns the full role list after seeding.
        """
        self.ensure_tenant()
        created_names = []
        for template in PRELOAD_ROLES:
            _, created = Role.objects.get_or_create(
                tenant=self.tenant,
                name=template['name'],
                defaults={
                    'description': template.get('description', ''),
                    'permissions': template.get('permissions', {}),
                    'is_system_role': True,
                    'created_by': request.user,
                },
            )
            if created:
                created_names.append(template['name'])

        all_roles = Role.objects.filter(tenant=self.tenant)
        return Response({
            'seeded': created_names,
            'skipped_already_exist': [
                t['name'] for t in PRELOAD_ROLES if t['name'] not in created_names
            ],
            'roles': RoleSerializer(all_roles, many=True).data,
        }, status=status.HTTP_200_OK)
