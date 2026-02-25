from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied

from accounts.models import TenantMembership

# ── Role constants ─────────────────────────────────────────────────────────────
# Ordered most-privileged → least-privileged.

#: Every system role — any authenticated tenant member may access.
ALL_ROLES = ['owner', 'admin', 'manager', 'staff', 'viewer']

#: Staff-and-above (create/edit most resources).
STAFF_ROLES = ['owner', 'admin', 'manager', 'staff']

#: Manager-and-above (approve, transfer, delete common resources).
MANAGER_ROLES = ['owner', 'admin', 'manager']

#: Admin-and-above (settings, roles, sensitive CRUD).
ADMIN_ROLES = ['owner', 'admin']

#: Owner only.
OWNER_ROLES = ['owner']


class IsSuperAdmin(permissions.BasePermission):
    """
    Allows access only to users with is_superadmin=True accessing the MAIN domain.
    Blocks access even for superusers when request comes via a tenant subdomain.
    Used exclusively for platform-level operations (Tenant CRUD).
    """
    message = 'Super admin access required. Use the main domain, not a tenant subdomain.'

    def has_permission(self, request, view):
        # Must be authenticated super admin / superuser
        is_super = bool(
            request.user
            and request.user.is_authenticated
            and (getattr(request.user, 'is_superadmin', False) or request.user.is_superuser)
        )
        if not is_super:
            return False
        # Must be on main domain (request.tenant is None).
        # This prevents super admins from calling tenant-CRUD endpoints
        # via a tenant subdomain (e.g. acme.nexusbms.com/api/v1/tenants/).
        if getattr(request, 'tenant', None) is not None:
            return False
        return True


def _resolve_membership(user, tenant):
    """Return the active TenantMembership (with custom_role) or None."""
    try:
        return TenantMembership.objects.select_related('custom_role').get(
            user=user, tenant=tenant, is_active=True,
        )
    except TenantMembership.DoesNotExist:
        return None


def _user_has_role(user, tenant, allowed_roles: set) -> bool:
    """
    Return True if *user* holds one of *allowed_roles* in *tenant*.

    Works with both system roles (CharField on TenantMembership) and custom
    roles (FK to roles.Role whose name is checked against allowed_roles).

    Usage in views::

        from core.permissions import _user_has_role, MANAGER_ROLES
        if _user_has_role(request.user, request.tenant, set(MANAGER_ROLES)):
            ...
    """
    membership = _resolve_membership(user, tenant)
    if membership is None:
        return False
    if membership.role in allowed_roles:
        return True
    # Custom role: check the role name on the linked Role object
    if membership.role == 'custom' and membership.custom_role:
        return membership.custom_role.name in allowed_roles
    return False


class IsTenantMember(permissions.BasePermission):
    """
    Allow any *active* member of request.tenant regardless of role.
    Blocks: unauthenticated users, inactive members, users from other tenants.

    Use this as the minimum permission gate on read-only tenant endpoints
    where every member (owner → viewer) should have access.
    """
    message = 'You are not an active member of this workspace.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        # Superadmin bypasses membership check
        if user.is_superuser or getattr(user, 'is_superadmin', False):
            return True
        tenant = getattr(request, 'tenant', None)
        if not tenant:
            return False
        return _resolve_membership(user, tenant) is not None


class TenantRolePermission(permissions.BasePermission):
    """Permission that requires the request user to be a member of the current
    tenant with one of the allowed roles.

    Views may set ``required_roles = ['owner', 'admin', ...]``. If not set,
    the default allows ALL_ROLES so every tenant member passes read-level access.
    Superusers and is_superadmin users bypass this check.

    Permission resolution order:
      1. Superadmin / superuser → pass.
      2. Lookup active TenantMembership for (user, tenant).
      3. Check membership.role against required_roles (fast path).
      4. If role is 'custom', look up Role.permissions JSON and check that
         the required_permission key is present and True.
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

        required_roles = getattr(view, 'required_roles', ALL_ROLES)

        membership = _resolve_membership(user, tenant)
        if membership is None:
            return False

        # Fast path: system role check
        if membership.role in required_roles:
            return True

        # Custom role: check JSON permissions map
        required_permission = getattr(view, 'required_permission', None)
        if required_permission and membership.role == 'custom' and membership.custom_role:
            role_perms = membership.custom_role.permissions or {}
            return bool(role_perms.get(required_permission, False))

        return False


def make_role_permission(*roles):
    """
    Factory that returns a TenantRolePermission subclass locked to *roles*.

    Preferred way to express per-action role requirements inside
    ``get_permissions()``::

        def get_permissions(self):
            if self.action in ('list', 'retrieve'):
                return [IsAuthenticated(), make_role_permission(*ALL_ROLES)()]
            return [IsAuthenticated(), make_role_permission(*ADMIN_ROLES)()]
    """
    required = list(roles)

    class _ConfiguredRolePermission(permissions.BasePermission):
        def has_permission(self, request, view):
            user = getattr(request, 'user', None)
            if not user or not user.is_authenticated:
                return False
            if user.is_superuser or getattr(user, 'is_superadmin', False):
                return True
            tenant = getattr(request, 'tenant', None)
            if tenant is None:
                return False
            membership = _resolve_membership(user, tenant)
            if membership is None:
                return False
            if membership.role in required:
                return True
            # Custom role JSON check
            required_permission = getattr(view, 'required_permission', None)
            if required_permission and membership.role == 'custom' and membership.custom_role:
                role_perms = membership.custom_role.permissions or {}
                return bool(role_perms.get(required_permission, False))
            return False

    _ConfiguredRolePermission.__name__ = f"RolePermission({'|'.join(required)})"
    return _ConfiguredRolePermission


# ── Module-level access control ───────────────────────────────────────────────

def module_required(module_key: str):
    """
    Factory that returns a permission class ensuring *module_key* is active
    for the tenant making the request.

    Usage in a ViewSet::

        permission_classes = [
            permissions.IsAuthenticated,
            make_role_permission(*ALL_ROLES),
            module_required('tickets'),
        ]

    Rules:
      - Superadmin / root domain → always pass (no module gating for platform admin).
      - Tenant with module active → pass.
      - Tenant with module inactive → raise 403 with code ``module_disabled``
        so the frontend can redirect to the upgrade page.
    """

    class _ModuleRequired(permissions.BasePermission):
        message = f'The "{module_key}" module is not active on your current plan.'

        def has_permission(self, request, view):
            user = getattr(request, 'user', None)
            if not user or not user.is_authenticated:
                return False

            # Superadmin on root domain — always allow
            if user.is_superuser or getattr(user, 'is_superadmin', False):
                return True

            tenant = getattr(request, 'tenant', None)
            if tenant is None:
                return False

            if module_key in tenant.active_modules_set:
                return True

            raise PermissionDenied(
                detail={
                    'code': 'module_disabled',
                    'module': module_key,
                    'message': self.message,
                }
            )

    _ModuleRequired.__name__ = f'ModuleRequired({module_key})'
    return _ModuleRequired
