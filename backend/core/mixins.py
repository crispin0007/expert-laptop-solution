from rest_framework import exceptions


# Roles that have elevated management privileges within a tenant
MANAGER_ROLES = {'owner', 'admin', 'manager'}


class TenantMixin:
    """
    MUST be the FIRST mixin on every tenant-scoped ViewSet.

    Guarantees
    ----------
    - request.tenant is always set (blocks main-domain access in initial())
    - All querysets are auto-filtered to request.tenant via get_queryset()
    - perform_create() injects tenant + created_by automatically
    - perform_update() re-pins tenant to prevent FK tampering via PATCH
    - Cannot be bypassed by a ViewSet that forgets get_queryset because
      TenantMixin.get_queryset() wraps super() and applies the filter.

    Helpers
    -------
    self.user_membership   — TenantMembership for the current user (cached)
    self.user_role         — role string, e.g. 'staff', 'manager' (cached)
    self.is_manager_role() — True if user is owner/admin/manager for this tenant
    """

    def _get_tenant_or_raise(self):
        """Return request.tenant or raise PermissionDenied — used as a guard."""
        tenant = getattr(self, 'tenant', None) or getattr(self.request, 'tenant', None)
        if not tenant:
            raise exceptions.PermissionDenied(
                'This endpoint is only accessible via a tenant workspace. '
                'Access via your subdomain: yourworkspace.nexusbms.com'
            )
        return tenant

    def initial(self, request, *args, **kwargs):
        # Resolve and cache self.tenant from the request early.
        # Permissions already block main-domain access, but this is
        # defence-in-depth: even a misconfigured permission class cannot
        # leak cross-tenant data because every query goes through get_queryset().
        self.tenant = getattr(request, 'tenant', None)
        if self.tenant is None:
            raise exceptions.PermissionDenied(
                'This endpoint requires a tenant workspace context. '
                'Access it via your workspace subdomain.'
            )
        super().initial(request, *args, **kwargs)

        # Module gate — check if this viewset's required module is active.
        required_module = getattr(self, 'required_module', None)
        if required_module:
            user = request.user
            # Superadmin / root domain always passes
            if not (getattr(user, 'is_superadmin', False) or getattr(user, 'is_superuser', False)):
                if required_module not in self.tenant.active_modules_set:
                    raise exceptions.PermissionDenied({
                        'code': 'module_disabled',
                        'module': required_module,
                        'message': f'The "{required_module}" module is not active on your current plan.',
                    })

    def ensure_tenant(self):
        """Raise PermissionDenied if tenant is not resolved (legacy guard helper)."""
        if not getattr(self, 'tenant', None):
            raise exceptions.PermissionDenied('Tenant not resolved for this request')

    # ── Queryset isolation ────────────────────────────────────────────────────

    def get_queryset(self):
        """
        Auto-filter queryset to the current tenant.

        If a ViewSet overrides get_queryset() and calls super(), this filter
        is applied on top.  If the ViewSet does NOT call super() it is
        responsible for filtering itself (and will be caught by lint/tests).
        """
        tenant = self._get_tenant_or_raise()
        qs = super().get_queryset()
        if hasattr(qs.model, 'tenant'):
            return qs.filter(tenant=tenant)
        return qs

    # ── Create / update hooks ─────────────────────────────────────────────────

    def perform_create(self, serializer):
        """Inject tenant (and created_by if the model has the field) on create."""
        tenant = self._get_tenant_or_raise()
        kwargs = {'tenant': tenant}
        model = serializer.Meta.model
        if hasattr(model, 'created_by'):
            kwargs['created_by'] = self.request.user
        serializer.save(**kwargs)

    def perform_update(self, serializer):
        """Re-pin tenant on update to prevent tenant FK tampering via PATCH."""
        tenant = self._get_tenant_or_raise()
        serializer.save(tenant=tenant)

    # ── Role helpers ──────────────────────────────────────────────────────────

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

    def _is_admin(self):
        """True if the current request user has owner or admin role in this tenant.
        Superadmins always return True.
        Used to gate admin-override logic (e.g. editing non-draft invoices).
        """
        return self.user_role in {'owner', 'admin'}


# ── Module gate mixin ─────────────────────────────────────────────────────────

class ModuleGateMixin:
    """
    Add this AFTER TenantMixin on ViewSets that belong to a specific module.

    Set the class attribute ``required_module`` to the module key::

        class TicketViewSet(TenantMixin, ModuleGateMixin, viewsets.ModelViewSet):
            required_module = 'tickets'

    Superadmins on the root domain always pass.
    Tenants without the module active get a 403 with code='module_disabled'.
    """

    required_module: str = ''

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not self.required_module:
            return
        user = request.user
        # Superadmin on root domain — skip module gating
        if getattr(user, 'is_superadmin', False) or getattr(user, 'is_superuser', False):
            return
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            return
        if self.required_module not in tenant.active_modules_set:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied(detail={
                'code': 'module_disabled',
                'module': self.required_module,
                'message': f'The "{self.required_module}" module is not active on your current plan.',
            })
