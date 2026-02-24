from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal


class Tenant(models.Model):
    """Concrete Tenant model for multi-tenancy."""

    PLAN_FREE = 'free'
    PLAN_BASIC = 'basic'
    PLAN_PRO = 'pro'

    PLAN_CHOICES = [
        (PLAN_FREE, 'Free'),
        (PLAN_BASIC, 'Basic'),
        (PLAN_PRO, 'Pro'),
    ]

    slug = models.SlugField(max_length=64, unique=True, help_text='Used as subdomain, e.g. acme → acme.nexusbms.com')
    name = models.CharField(max_length=255)
    plan = models.CharField(max_length=16, choices=PLAN_CHOICES, default=PLAN_FREE)
    logo = models.URLField(blank=True)
    currency = models.CharField(max_length=8, default='NPR')

    # VAT — Nepal default 13%
    vat_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('0.13'),
        validators=[MinValueValidator(Decimal('0.0')), MaxValueValidator(Decimal('1.0'))],
    )
    vat_enabled = models.BooleanField(default=True)

    # Coin reward system — admin sets how many NPR one coin is worth
    coin_to_money_rate = models.DecimalField(
        max_digits=10, decimal_places=4, default=Decimal('1.0'),
        help_text='How many currency units one coin equals (e.g. 10 = 1 coin = Rs. 10)',
    )

    is_active = models.BooleanField(default=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_tenants',
    )

    class Meta:
        ordering = ['slug']

    def __str__(self):
        return f"{self.name} ({self.slug})"

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save()
