from django.db import models
from core.models import TenantModel


class Role(TenantModel):
    """
    Custom per-tenant role definition.
    System roles (owner, admin, staff, viewer) are handled by
    TenantMembership.role; this model allows tenants to create
    additional fine-grained roles with explicit permission sets.
    """

    name = models.CharField(max_length=64)
    permissions = models.JSONField(default=dict, blank=True)
    is_system_role = models.BooleanField(default=False)

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f"{self.tenant_id} — {self.name}"
