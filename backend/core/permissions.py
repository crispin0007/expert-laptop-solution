from rest_framework import permissions

from accounts.models import TenantMembership


class IsSuperAdmin(permissions.BasePermission):
    """
    Allows access only to users with is_superadmin=True.
    Used exclusively for platform-level super-admin operations (e.g. Tenant CRUD).
    """

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'is_superadmin', False)
        )


class TenantRolePermission(permissions.BasePermission):
    """Permission that requires the request user to be a member of the current
    tenant with one of the allowed roles.

    Views may set `required_roles = ['owner', 'admin', ...]`. If not set,
    default roles allowed are `['owner', 'admin', 'staff']`.
    Superusers and is_superadmin users bypass this check.

    Permission resolution order:
      1. Check membership.role against required_roles (fast path).
      2. If role is 'custom', look up Role.permissions JSON and check that the
         required permission key is present and set to True.
    """

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        # Super admin bypasses all tenant-scoped checks
        if user.is_superuser or getattr(user, 'is_superadmin', False):
            return True

        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return False

        required_roles = getattr(view, 'required_roles', ['owner', 'admin', 'staff'])

        try:
            membership = TenantMembership.objects.select_related('custom_role').get(
                user=user, tenant=tenant, is_active=True,
            )
        except TenantMembership.DoesNotExist:
            return False

        # --- Fast path: system role check ---
        if membership.role in required_roles:
            return True

        # --- Custom role: check JSON permissions map ---
        # A view can declare `required_permission = 'tickets.view'` for fine-grained control.
        required_permission = getattr(view, 'required_permission', None)
        if required_permission and membership.role == 'custom' and membership.custom_role:
            role_perms = membership.custom_role.permissions or {}
            return bool(role_perms.get(required_permission, False))

        return False
