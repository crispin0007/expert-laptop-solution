from django.db import models
from core.models import TenantModel
from django.conf import settings


class Department(TenantModel):
    name = models.CharField(max_length=128)
    description = models.TextField(blank=True)
    head = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='led_departments',
    )

    class Meta:
        ordering = ['name']
        unique_together = ('tenant', 'name')

    def __str__(self):
        return self.name
