from django.db import models
from django.conf import settings


class TenantManager(models.Manager):
    """
    Default manager for all TenantModel subclasses.
    Does NOT auto-filter — filtering is done explicitly in TenantMixin
    via request.tenant to avoid thread-local / contextvar state bugs.
    """
    pass


class TenantModel(models.Model):
    """Abstract base for every tenant-scoped model.

    Fields: tenant (FK to tenants.Tenant), created_at, updated_at, created_by.
    Tenant filtering is enforced at the view layer by TenantMixin,
    NOT by this manager, to avoid implicit global state.
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
