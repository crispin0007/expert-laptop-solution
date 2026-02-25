from django.db import models
from core.models import TenantModel


class Role(TenantModel):
    """
    Custom per-tenant role definition.

    System roles (owner, admin, manager, staff, viewer) are the built-in
    CharField choices on TenantMembership.  This model lets each tenant define
    additional fine-grained roles (Finance, Technician, HR, …) where
    permissions is a flat JSON dict:  { "tickets.view": true, ... }

    The canonical set of permission keys lives in roles/permissions_map.py.
    is_system_role=True marks roles that were seeded from PRELOAD_ROLES;
    their names are protected from deletion but permissions can be tweaked.
    """

    name = models.CharField(max_length=64)
    description = models.TextField(blank=True)
    permissions = models.JSONField(default=dict, blank=True)
    is_system_role = models.BooleanField(
        default=False,
        help_text='Seeded from PRELOAD_ROLES. Name cannot be changed; permissions can.',
    )

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return f"{self.tenant_id} — {self.name}"
