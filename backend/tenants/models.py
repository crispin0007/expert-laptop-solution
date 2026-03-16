import secrets

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
    logo = models.URLField(blank=True, help_text='URL of the tenant logo displayed in the sidebar and app header.')
    favicon = models.URLField(blank=True, help_text='URL of the tenant favicon (16×16 or 32×32 .ico/.png).')
    # Brand colour for mobile app dynamic theming — expects CSS hex value
    primary_color = models.CharField(
        max_length=7,
        default='#4f46e5',
        help_text='Primary brand colour in hex (e.g. #4f46e5). Used by the mobile app for dynamic theming.',
    )
    currency = models.CharField(max_length=8, default='NPR')
    timezone = models.CharField(max_length=64, default='Asia/Kathmandu')

    # SLA alerting — how many minutes before deadline to fire the warning notification
    sla_warn_before_minutes = models.PositiveIntegerField(
        default=30,
        help_text='Send SLA breach warning this many minutes before the deadline.',
    )

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

    # Per-tenant JWT signing secret (Item #3 — per-tenant JWT keys).
    # Embedded as a `tenant_sig` HMAC claim in every token issued for this tenant.
    # Rotating this secret instantly invalidates all existing tokens for the tenant
    # without needing to touch the global DJANGO_SECRET_KEY.  Used by
    # TenantJWTAuthentication to verify the binding between a token and its tenant.
    jwt_signing_secret = models.CharField(
        max_length=64,
        blank=True,
        help_text=(
            'Per-tenant HMAC secret for JWT binding. '
            'Auto-generated on first save. Rotate to invalidate all tenant tokens.'
        ),
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

    def save(self, *args, **kwargs):
        # Auto-generate a per-tenant JWT signing secret on first creation.
        # We do this in save() rather than a signal so it works in tests,
        # factories, and fixtures without extra setup.
        if not self.jwt_signing_secret:
            self.jwt_signing_secret = secrets.token_hex(32)
        super().save(*args, **kwargs)

    @property
    def _modules_cache_key(self) -> str:
        return f'tenant_modules_{self.slug}'

    def clear_module_cache(self):
        """Invalidate the cached active_modules_set for this tenant."""
        from django.core.cache import cache
        cache.delete(self._modules_cache_key)

    @property
    def active_modules_set(self) -> set:
        """
        Compute the effective set of module keys for this tenant:
          base   = plan's modules  (or empty set if no plan)
          + overrides where is_enabled=True   (grants extra modules)
          - overrides where is_enabled=False  (revokes plan modules)
          + core modules (always active regardless of plan)
        Result is a frozenset-compatible set of string keys.

        The result is cached in Redis for 5 minutes (same TTL as the tenant
        object itself) to avoid 3 extra DB queries on every module-gated request.
        Call clear_module_cache() after any plan or override change.
        """
        from django.core.cache import cache
        from core.middleware import _TENANT_CACHE_TTL

        # Fast path — cache hit
        cached = cache.get(self._modules_cache_key)
        if cached is not None:
            return cached

        # Slow path — mutex prevents multiple processes from doing the same three
        # DB queries simultaneously on a cache miss (stampede protection).
        lock_key = f'lock_tenant_modules_{self.slug}'
        if cache.add(lock_key, '1', 5):  # 5 s mutex; atomic in Redis
            try:
                # Double-check: another process may have populated the cache
                # between our cache.get() call and acquiring the lock.
                cached = cache.get(self._modules_cache_key)
                if cached is not None:
                    return cached

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

                cache.set(self._modules_cache_key, base, _TENANT_CACHE_TTL)
            finally:
                cache.delete(lock_key)  # always release
        else:
            # Another process is computing — wait briefly, then use its result
            import time
            time.sleep(0.05)
            cached = cache.get(self._modules_cache_key)
            base = cached if cached is not None else set()

        return base

    def soft_delete(self):
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save()
        # Invalidate all cache keys for this tenant
        from django.core.cache import cache
        cache.delete(f'tenant_slug_{self.slug}')
        cache.delete(self._modules_cache_key)
        if self.custom_domain:
            cache.delete(f'tenant_domain_{self.custom_domain}')
        # Reserve the slug so it cannot be reused by a new tenant.
        # This prevents slug squatting and JWT scope confusion after deletion.
        SlugReservation.objects.get_or_create(
            slug=self.slug,
            defaults={'reason': f'deleted tenant id={self.pk}'},
        )


class SlugReservation(models.Model):
    """
    Permanently reserves a tenant slug that was previously in use.

    Created automatically when a Tenant is soft-deleted.  The serializer
    checks this table on tenant creation to prevent slug reuse — even after
    the original tenant record has been deleted — which would otherwise allow
    a new tenant to inherit another tenant's JWT audience, DNS history, and
    cached data.
    """

    slug = models.SlugField(max_length=64, unique=True)
    reserved_at = models.DateTimeField(auto_now_add=True)
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-reserved_at']

    def __str__(self):
        return f'Reserved: {self.slug} ({self.reason})'
