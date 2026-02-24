from django.db import models
from django.conf import settings
from django.utils import timezone
import contextvars

# Module-level contextvar to hold current tenant for TenantManager
_current_tenant = contextvars.ContextVar('current_tenant', default=None)


def get_current_tenant():
    return _current_tenant.get()


def set_current_tenant(tenant):
    _current_tenant.set(tenant)


class TenantManager(models.Manager):
    """Manager that filters by current tenant when available.

    Note: This manager expects TenantMiddleware to set the current tenant
    through core.middleware.set_current_tenant.
    """

    def get_queryset(self):
        qs = super().get_queryset()
        tenant = get_current_tenant()
        if tenant is not None:
            # assume models using this manager have a `tenant` FK
            return qs.filter(tenant=tenant)
        return qs


class TenantModel(models.Model):
    """Abstract base model for tenant-scoped models.

    Fields: tenant (FK to tenants.Tenant), created_at, updated_at, created_by
    """

    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        related_name='%(class)s_items',
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
    )

    objects = TenantManager()

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # if tenant is not set and we have a current tenant, set it automatically
        if not self.tenant:
            tenant = get_current_tenant()
            if tenant is not None:
                self.tenant = tenant
        super().save(*args, **kwargs)
