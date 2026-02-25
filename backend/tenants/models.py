from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal


# ── Module catalogue ──────────────────────────────────────────────────────────

class Module(models.Model):
    """
    A business module that can be enabled or disabled for a tenant.
    Seeded via migration — superadmin does not create modules, only assigns them.
    """
    key = models.SlugField(max_length=64, unique=True,
                           help_text='Machine key, e.g. "tickets", "inventory"')
    name = models.CharField(max_length=128,
                            help_text='Human name, e.g. "Ticket System"')
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=64, blank=True,
                            help_text='Lucide icon name used in the frontend')
    is_core = models.BooleanField(
        default=False,
        help_text='If True this module is always active regardless of plan (e.g. Staff, Settings)',
    )
    order = models.PositiveSmallIntegerField(default=0,
                                             help_text='Display order in UI')

    class Meta:
        ordering = ['order', 'key']

    def __str__(self):
        return f'{self.name} ({self.key})'


# ── Subscription plan ─────────────────────────────────────────────────────────

class Plan(models.Model):
    """
    A subscription plan template created and managed by the Super Admin.
    Defines a default set of modules. Individual tenants can have overrides.
    """
    name = models.CharField(max_length=128, unique=True)
    slug = models.SlugField(max_length=64, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(
        default=True,
        help_text='Inactive plans are hidden from the tenant assignment dropdown',
    )
    modules = models.ManyToManyField(
        Module,
        blank=True,
        related_name='plans',
        help_text='Which modules are included by default in this plan',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


# ── Per-tenant module overrides ───────────────────────────────────────────────

class TenantModuleOverride(models.Model):
    """
    Allows granting or revoking a specific module for a single tenant,
    independent of the plan defaults.

    is_enabled=True  → module is granted even if the plan doesn't include it
    is_enabled=False → module is blocked even if the plan includes it
    """
    tenant = models.ForeignKey(
        'Tenant',
        on_delete=models.CASCADE,
        related_name='module_overrides',
    )
    module = models.ForeignKey(
        Module,
        on_delete=models.CASCADE,
        related_name='tenant_overrides',
    )
    is_enabled = models.BooleanField()
    note = models.CharField(
        max_length=255, blank=True,
        help_text='Optional reason for this override, e.g. "Grandfathered access"',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('tenant', 'module')
        ordering = ['module__order']

    def __str__(self):
        verb = 'GRANT' if self.is_enabled else 'REVOKE'
        return f'{verb} {self.module.key} → {self.tenant.slug}'


# ── Tenant ────────────────────────────────────────────────────────────────────

class Tenant(models.Model):
    """Concrete Tenant model for multi-tenancy."""

    slug = models.SlugField(max_length=64, unique=True, help_text='Used as subdomain, e.g. acme → acme.bms.techyatra.com.np')
    name = models.CharField(max_length=255)
    # Optional fully custom domain, e.g. bms.els.com
    # null=True + unique=True: many tenants can have null (no custom domain)
    # but only one tenant can own any given domain string.
    custom_domain = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        default=None,
        unique=True,
        help_text='Custom domain, e.g. bms.els.com. Leave blank to use subdomain only.',
    )
    plan = models.ForeignKey(
        Plan,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='tenants',
        help_text='Subscription plan. Null only during initial seed migration.',
    )
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

    @property
    def active_modules_set(self) -> set:
        """
        Compute the effective set of module keys for this tenant:
          base   = plan's modules  (or empty set if no plan)
          + overrides where is_enabled=True   (grants extra modules)
          - overrides where is_enabled=False  (revokes plan modules)
          + core modules (always active regardless of plan)
        Result is a frozenset-compatible set of string keys.
        """
        # Base from plan
        if self.plan_id:
            base = set(
                self.plan.modules.values_list('key', flat=True)
            )
        else:
            base = set()

        # Always include core modules
        core_keys = set(
            Module.objects.filter(is_core=True).values_list('key', flat=True)
        )
        base |= core_keys

        # Apply per-tenant overrides
        for override in self.module_overrides.select_related('module').all():
            if override.is_enabled:
                base.add(override.module.key)
            else:
                base.discard(override.module.key)

        return base

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save()
        # Invalidate custom domain cache too
        if self.custom_domain:
            from django.core.cache import cache
            cache.delete(f'tenant_domain_{self.custom_domain}')
