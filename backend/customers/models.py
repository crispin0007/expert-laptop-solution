from django.db import models
from django.db.models import Q
from django.conf import settings
from core.models import TenantModel


class Customer(TenantModel):
    TYPE_INDIVIDUAL = 'individual'
    TYPE_ORGANIZATION = 'organization'
    TYPE_CHOICES = [(TYPE_INDIVIDUAL, 'Individual'), (TYPE_ORGANIZATION, 'Organization')]

    # Nepal's seven provinces (official 2022 names)
    PROVINCE_KOSHI         = 'koshi'
    PROVINCE_MADHESH       = 'madhesh'
    PROVINCE_BAGMATI       = 'bagmati'
    PROVINCE_GANDAKI       = 'gandaki'
    PROVINCE_LUMBINI       = 'lumbini'
    PROVINCE_KARNALI       = 'karnali'
    PROVINCE_SUDURPASHCHIM = 'sudurpashchim'
    PROVINCE_CHOICES = [
        (PROVINCE_KOSHI,         'Koshi'),
        (PROVINCE_MADHESH,       'Madhesh'),
        (PROVINCE_BAGMATI,       'Bagmati'),
        (PROVINCE_GANDAKI,       'Gandaki'),
        (PROVINCE_LUMBINI,       'Lumbini'),
        (PROVINCE_KARNALI,       'Karnali'),
        (PROVINCE_SUDURPASHCHIM, 'Sudurpashchim'),
    ]

    type = models.CharField(max_length=20, choices=TYPE_CHOICES, default=TYPE_INDIVIDUAL)
    name = models.CharField(max_length=255)
    # Auto-generated human-readable reference, e.g. CUS-0001 (per tenant)
    customer_number = models.CharField(max_length=32, blank=True, db_index=True)
    email = models.EmailField(blank=True)      # optional
    phone = models.CharField(max_length=32, blank=True)

    # ── Nepal hierarchical address ────────────────────────────────────────────
    province     = models.CharField(
        max_length=32, blank=True, choices=PROVINCE_CHOICES,
        help_text='One of Nepal\'s 7 provinces',
    )
    district     = models.CharField(max_length=128, blank=True, help_text='e.g. Kathmandu')
    municipality = models.CharField(
        max_length=255, blank=True,
        help_text='Municipality / Sub-Metropolitan / Metropolitan / Rural Municipality',
    )
    ward_no      = models.CharField(max_length=8, blank=True, help_text='Ward number')
    street       = models.CharField(max_length=255, blank=True, help_text='Tole / Street / Landmark')
    # ─────────────────────────────────────────────────────────────────────────

    vat_number = models.CharField(max_length=64, blank=True)
    pan_number = models.CharField(max_length=64, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='created_customers',
    )

    class Meta:
        ordering = ['name']
        constraints = [
            # Unique email per tenant among non-deleted customers
            models.UniqueConstraint(
                fields=['tenant', 'email'],
                condition=Q(is_deleted=False) & ~Q(email=''),
                name='unique_customer_email_per_tenant',
            ),
            # Unique phone per tenant among non-deleted customers
            models.UniqueConstraint(
                fields=['tenant', 'phone'],
                condition=Q(is_deleted=False) & ~Q(phone=''),
                name='unique_customer_phone_per_tenant',
            ),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.customer_number and self.tenant_id:
            last = (
                Customer.objects.filter(tenant_id=self.tenant_id)
                .order_by('-created_at')
                .values_list('customer_number', flat=True)
                .first()
            )
            if last:
                try:
                    seq = int(last.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    seq = 1
            else:
                seq = 1
            self.customer_number = f"CUS-{seq:04d}"
        super().save(*args, **kwargs)

    def soft_delete(self):
        import django.utils.timezone as tz
        self.is_deleted = True
        self.deleted_at = tz.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])


class CustomerContact(models.Model):
    """Additional contacts for an organisation customer."""
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name='contacts')
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    designation = models.CharField(max_length=128, blank=True)
    is_primary = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.name} ({self.customer})"
