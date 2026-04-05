from django.db import models

from core.models import TenantModel


class Party(TenantModel):
    """Canonical accounting counterparty (customer/supplier/external staff).

    Party is a business-identity abstraction used by accounting. It is not used
    for authentication or RBAC.
    """

    TYPE_CUSTOMER = 'customer'
    TYPE_SUPPLIER = 'supplier'
    TYPE_STAFF = 'staff'
    TYPE_OTHER = 'other'

    TYPE_CHOICES = [
        (TYPE_CUSTOMER, 'Customer'),
        (TYPE_SUPPLIER, 'Supplier'),
        (TYPE_STAFF, 'Staff'),
        (TYPE_OTHER, 'Other'),
    ]

    name = models.CharField(max_length=255)
    party_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_OTHER)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    pan_number = models.CharField(max_length=64, blank=True)
    account = models.ForeignKey(
        'accounting.Account',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='parties',
        help_text='Optional per-party sub-ledger account in Chart of Accounts.',
    )
    is_active = models.BooleanField(default=True)
    notes = models.TextField(blank=True)

    class Meta(TenantModel.Meta):
        ordering = ['name']
        indexes = [
            models.Index(fields=['tenant', 'party_type'], name='party_tenant_type_idx'),
            models.Index(fields=['tenant', 'name'], name='party_tenant_name_idx'),
        ]

    def __str__(self):
        return f"{self.name} ({self.party_type})"
