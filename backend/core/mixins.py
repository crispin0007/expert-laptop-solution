from functools import cached_property
from rest_framework import exceptions


# Roles that have elevated management privileges within a tenant
MANAGER_ROLES = {'owner', 'admin', 'manager'}


class TenantMixin:
    """Simple mixin that exposes the current request.tenant to views.

    It ensures `self.tenant` is set from `request.tenant`. Views can inherit this
    mixin and rely on `self.tenant` being present (or None).

    Helpers
    -------
    self.user_membership   — TenantMembership for the current user (cached)
    self.user_role         — role string, e.g. 'staff', 'manager' (cached)
    self.is_manager_role() — True if user is owner/admin/manager for this tenant
    """

    def initial(self, request, *args, **kwargs):
        # set tenant attribute for use in views/handlers
        self.tenant = getattr(request, 'tenant', None)
        return super().initial(request, *args, **kwargs)

    def ensure_tenant(self):
        if self.tenant is None:
            raise exceptions.PermissionDenied('Tenant not resolved for this request')

    @property
    def user_membership(self):
        """Return the TenantMembership for request.user in the current tenant (cached per request)."""
        cache_attr = '_user_membership_cache'
        if not hasattr(self, cache_attr):
            from accounts.models import TenantMembership
            try:
                membership = TenantMembership.objects.get(
                    user=self.request.user,
                    tenant=self.tenant,
                    is_active=True,
                )
            except TenantMembership.DoesNotExist:
                membership = None
            setattr(self, cache_attr, membership)
        return getattr(self, cache_attr)

    @property
    def user_role(self):
        """Return the role string for the current user in this tenant, or None."""
        if self.request.user.is_superadmin:
            return 'owner'
        m = self.user_membership
        return m.role if m else None

    def is_manager_role(self):
        """True if the current user is owner, admin, or manager for this tenant."""
        return self.user_role in MANAGER_ROLES
