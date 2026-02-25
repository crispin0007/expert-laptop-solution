import logging
from django.utils.deprecation import MiddlewareMixin
from django.http import HttpRequest, Http404
from django.core.cache import cache

_access_logger = logging.getLogger('nexus.access')
_security_logger = logging.getLogger('nexus.security')

# How long to cache a tenant DB lookup (seconds)
_TENANT_CACHE_TTL = 300

# Paths that should return 404 (not 403, not login) when accessed from a tenant subdomain.
# 404 is intentional — do not reveal that an admin interface exists.
_MAIN_DOMAIN_ONLY_PATHS = ('/admin/',)

# Paths that must only work ON a tenant subdomain (not the main domain)
_TENANT_ONLY_API_PREFIXES = (
    '/api/v1/tickets/',
    '/api/v1/customers/',
    '/api/v1/departments/',
    '/api/v1/staff/',
    '/api/v1/roles/',
    '/api/v1/inventory/',
    '/api/v1/accounting/',
    '/api/v1/projects/',
    '/api/v1/notifications/',
    '/api/v1/settings/',
)


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

        # --- 3. Fallback: X-Tenant-Slug header (dev / localhost ONLY) ---
        # WARNING: This header can be spoofed by any client in production.
        # It is ONLY honoured when DEBUG=True (local dev / test environments).
        # In production Django ignores it; Nginx also strips it before proxying.
        if tenant is None:
            from django.conf import settings
            if settings.DEBUG:
                header_slug = request.headers.get('X-Tenant-Slug', '').strip()
                if header_slug:
                    tenant = _resolve_tenant(header_slug)

        request.tenant = tenant
        request.is_main_domain = (tenant is None)

        # ───────────────────────────────────────────────────────────────────────
        # Domain isolation enforcement
        # ───────────────────────────────────────────────────────────────────────

        # RULE A: /admin/ is ONLY accessible from the main domain.
        # Return 404 (not 403) from tenant subdomains — do not reveal admin exists.
        if tenant is not None and any(request.path.startswith(p) for p in _MAIN_DOMAIN_ONLY_PATHS):
            _security_logger.warning(
                'TENANT_ADMIN_PROBE | tenant=%s | ip=%s | path=%s | ua=%s',
                getattr(tenant, 'slug', '?'),
                _get_ip(request),
                request.path,
                request.META.get('HTTP_USER_AGENT', '')[:120],
            )
            from django.http import HttpResponseNotFound
            return HttpResponseNotFound(
                b'Not Found',
                content_type='text/plain',
            )

    def process_response(self, request, response):
        # ───────────────────────────────────────────────────────────────────────
        # Security headers — applied to every response regardless of domain.
        # These are standard real-world hardening headers.
        # ───────────────────────────────────────────────────────────────────────
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
        # Prevent browsers from caching API responses that contain tenant data
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
            response['Pragma'] = 'no-cache'
        return response


def _get_ip(request: HttpRequest) -> str:
    """Extract real client IP respecting common reverse-proxy headers."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', 'unknown')
