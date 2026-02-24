import logging
from django.utils.deprecation import MiddlewareMixin
from django.http import HttpRequest
from django.core.cache import cache
from .models import set_current_tenant

_access_logger = logging.getLogger('nexus.access')

# How long to cache a tenant DB lookup (seconds)
_TENANT_CACHE_TTL = 300


def _resolve_by_domain(host: str):
    """
    Look up a Tenant by custom_domain field.
    Cached separately from slug lookups.
    """
    cache_key = f'tenant_domain_{host}'
    tenant = cache.get(cache_key)
    if tenant is None:
        try:
            from tenants.models import Tenant
            tenant = Tenant.objects.get(custom_domain=host, is_active=True, is_deleted=False)
        except Exception:
            tenant = False
        cache.set(cache_key, tenant, _TENANT_CACHE_TTL)
    return tenant if tenant else None


def _resolve_tenant(slug: str):
    """
    Look up a Tenant by slug. Result is cached for _TENANT_CACHE_TTL seconds
    so we avoid a DB hit on every request.
    Returns a Tenant instance, or None if not found / inactive / deleted.
    """
    cache_key = f'tenant_slug_{slug}'
    tenant = cache.get(cache_key)
    if tenant is None:
        try:
            # Import here to avoid circular imports at module load time
            from tenants.models import Tenant
            tenant = Tenant.objects.get(slug=slug, is_active=True, is_deleted=False)
        except Exception:
            tenant = False  # Sentinel: "looked up, not found" — avoids repeated DB hits
        cache.set(cache_key, tenant, _TENANT_CACHE_TTL)
    # Return None for both "not found" (False sentinel) and genuine None
    return tenant if tenant else None


class TenantMiddleware(MiddlewareMixin):
    """
    Resolve tenant from subdomain and attach to request.tenant.

    Resolution order:
      1. Subdomain: acme.techyatra.com  → slug = 'acme'
      2. X-Tenant-Slug header (useful for local dev / API testing without subdomain)
      3. Falls back to None (super-admin endpoints work without a tenant)

    The resolved tenant is also stored in a process-level contextvar so that
    TenantManager can filter querysets without explicit FK filters in views.
    """

    def process_request(self, request: HttpRequest):
        tenant = None

        host = request.get_host().split(':')[0]  # strip port

        # --- 1. Custom domain (e.g. crm.els.com) ---
        tenant = _resolve_by_domain(host)

        # --- 2. Subdomain (e.g. els.bms.techyatra.com.np) ---
        if tenant is None:
            parts = host.split('.')
            if len(parts) > 2:
                slug = parts[0]
                tenant = _resolve_tenant(slug)

        # --- 3. Fallback: X-Tenant-Slug header (dev / localhost) ---
        if tenant is None:
            header_slug = request.headers.get('X-Tenant-Slug', '').strip()
            if header_slug:
                tenant = _resolve_tenant(header_slug)

        request.tenant = tenant
        set_current_tenant(tenant)

    def process_response(self, request, response):
        set_current_tenant(None)
        return response
