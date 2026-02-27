import logging
from django.utils.deprecation import MiddlewareMixin
from django.http import HttpRequest, Http404
from django.core.cache import cache
from core.throttles import _sanitize_slug

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

    Uses a Redis mutex (cache.add) to prevent cache stampede: only one process
    does the DB query on a cache miss; concurrent processes wait 50 ms and read
    the result that the lock winner stores.
    """
    cache_key = f'tenant_domain_{host}'

    # Fast path — cache hit
    cached = cache.get(cache_key)
    if cached is not None:
        return cached if cached else None

    # Slow path — compete for a short-lived mutex
    lock_key = f'lock_tenant_domain_{host[:128]}'  # cap key length
    if cache.add(lock_key, '1', 5):  # 5 s lock TTL; atomic in Redis
        try:
            # Double-check: race between our get() and the lock acquire
            cached = cache.get(cache_key)
            if cached is not None:
                return cached if cached else None

            try:
                from tenants.models import Tenant
                tenant = Tenant.objects.get(
                    custom_domain=host, is_active=True, is_deleted=False
                )
            except Exception:
                tenant = False  # sentinel — avoids repeated DB hits
            cache.set(cache_key, tenant, _TENANT_CACHE_TTL)
        finally:
            cache.delete(lock_key)
    else:
        # Another process is computing — wait, then use its result
        import time
        time.sleep(0.05)
        cached = cache.get(cache_key)
        tenant = cached if cached is not None else False

    return tenant if tenant else None


def _resolve_tenant(slug: str):
    """
    Look up a Tenant by slug. Result is cached for _TENANT_CACHE_TTL seconds
    so we avoid a DB hit on every request.
    Returns a Tenant instance, or None if not found / inactive / deleted.

    The slug is sanitized before use in the Redis cache key to prevent cache
    poisoning via adversarially crafted subdomains containing special characters.

    Cache stampede protection: uses a Redis mutex (cache.add is atomic) so that
    under a cold-start burst only one process performs the DB lookup; all others
    wait 50 ms and read the cached result.
    """
    safe_slug = _sanitize_slug(slug)
    cache_key = f'tenant_slug_{safe_slug}'

    # Fast path — cache hit (Tenant object or False sentinel)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached if cached else None

    # Slow path — compete for a short-lived mutex to prevent thundering herd
    lock_key = f'lock_tenant_slug_{safe_slug}'
    if cache.add(lock_key, '1', 5):  # 5 s lock TTL; atomic in Redis
        try:
            # Double-check: another process may have populated the cache between
            # our cache.get() call above and the moment we acquired the lock.
            cached = cache.get(cache_key)
            if cached is not None:
                return cached if cached else None

            try:
                # Import here to avoid circular imports at module load time
                from tenants.models import Tenant
                tenant = Tenant.objects.get(
                    slug=slug, is_active=True, is_deleted=False
                )
            except Exception:
                tenant = False  # sentinel: "looked up, not found"
            cache.set(cache_key, tenant, _TENANT_CACHE_TTL)
        finally:
            cache.delete(lock_key)  # always release, even on exception
    else:
        # Lock contested — wait briefly for the lock holder to populate the cache
        import time
        time.sleep(0.05)
        cached = cache.get(cache_key)
        tenant = cached if cached is not None else False

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
        _probed_slug = None  # track whether a subdomain was present but unresolved

        host = request.get_host().split(':')[0]  # strip port

        # ── Anomaly detection: ban check ──────────────────────────────────────
        # Banned IPs are checked FIRST, before any tenant lookup, using a
        # short-lived Redis cache so there is no DB overhead per request.
        client_ip = _get_ip(request)
        try:
            from core.anomaly import is_banned
            if is_banned(client_ip):
                import json as _json
                from django.http import HttpResponse
                body = _json.dumps({'detail': 'Too many requests. Your IP has been temporarily blocked.'})
                return HttpResponse(body, status=429, content_type='application/json')
        except Exception:
            pass  # ban check failure must NEVER block legitimate requests

        # --- 1. Custom domain (e.g. crm.els.com) ---
        tenant = _resolve_by_domain(host)

        # --- 2. Subdomain (e.g. els.bms.techyatra.com.np) ---
        if tenant is None:
            parts = host.split('.')
            if len(parts) > 2:
                slug = parts[0]
                tenant = _resolve_tenant(slug)
                if tenant is None:
                    # A subdomain was present but didn't map to any active tenant.
                    # Record the slug for enumeration probe logging below.
                    _probed_slug = slug

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

        # ── Tenant enumeration defense ────────────────────────────────────────
        # If a subdomain was present but resolved to no tenant, someone is
        # probing unknown slugs (e.g. scanning for active workspaces).
        # Return a response that is indistinguishable from a real tenant with
        # unauthenticated access — same status, same body, same headers.
        # Log the probe for the security audit trail.
        if _probed_slug is not None and tenant is None:
            from django.conf import settings as _settings
            if not _settings.DEBUG:  # only enforce in production; dev uses header
                try:
                    from core.audit import log_event, AuditEvent
                    log_event(
                        AuditEvent.TENANT_ENUM_PROBE,
                        request=request,
                        extra={'probed_slug': _probed_slug},
                    )
                except Exception:
                    pass
                import json
                from django.http import HttpResponse
                body = json.dumps({'detail': 'Authentication credentials were not provided.'})
                return HttpResponse(body, status=401, content_type='application/json')

        request.tenant = tenant
        request.is_main_domain = (tenant is None)

        # ── Postgres RLS: set nexus.tenant_id session variable ────────────────
        # Defense-in-depth: the DB-layer policy (migration 0005) restricts rows
        # to the current tenant. This call only has effect when a DB connection
        # is already open (CONN_MAX_AGE reuse). Fresh connections start with
        # nexus.tenant_id='' (superadmin mode) which the policy treats as
        # unrestricted — TenantManager is authoritative for those requests.
        # process_response() resets the variable to '' so reused connections
        # never carry one request's tenant into the next request.
        try:
            from django.db import connection as _db_conn
            if _db_conn.connection is not None:
                _tid = str(tenant.id) if tenant is not None else ''
                with _db_conn.cursor() as _cur:
                    _cur.execute(
                        "SELECT set_config('nexus.tenant_id', %s, false)", [_tid]
                    )
        except Exception:
            pass  # RLS setup failure must NEVER block a legitimate request



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

        # RULE B: Tenant-only API endpoints return 404 on the main domain.
        # TenantMixin already raises PermissionDenied for authenticated requests,
        # but returning 404 here closes the unauthenticated probe window and
        # avoids leaking that tenant-scoped APIs exist on the main domain.
        if tenant is None and any(request.path.startswith(p) for p in _TENANT_ONLY_API_PREFIXES):
            from django.http import HttpResponseNotFound
            return HttpResponseNotFound(
                b'Not Found',
                content_type='text/plain',
            )

    def process_response(self, request, response):
        # ── Reset Postgres RLS session variable ───────────────────────────────
        # IMPORTANT: always reset nexus.tenant_id at the end of every request.
        # With CONN_MAX_AGE > 0, Django reuses DB connections across requests.
        # Without this reset, the next request using this connection would inherit
        # the current request's tenant filter — a silent cross-tenant data leak.
        try:
            from django.db import connection as _db_conn
            if _db_conn.connection is not None:
                with _db_conn.cursor() as _cur:
                    _cur.execute("SELECT set_config('nexus.tenant_id', '', false)")
        except Exception:
            pass  # never block the response

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
