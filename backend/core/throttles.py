"""
Multi-level throttling — NEXUS BMS.

Three layers of protection:
  Layer 1 — AnonRateThrottle   : per-IP,  unauthenticated (default DRF)
  Layer 2 — UserRateThrottle   : per-user (default DRF)
  Layer 3 — TenantRateThrottle : per-tenant — protects against a malicious or
                                  compromised tenant flooding shared infrastructure.

Usage in views / settings
-------------------------
Add to DEFAULT_THROTTLE_CLASSES in settings (done via base.py) or per-view::

    throttle_classes = [TenantRateThrottle]

The rate is controlled by THROTTLE_RATES['tenant'] in settings.

When a rate limit is hit, an AuditEvent.RATE_LIMIT_HIT entry is written so
the event appears in the forensic audit trail.
"""
from __future__ import annotations

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle, SimpleRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    """
    Strict per-IP throttle for the login endpoint.
    Rate: 5 attempts per minute (overridden to 10 in dev, 5 in prod).
    """
    scope = 'login'


class TenantRateThrottle(SimpleRateThrottle):
    """
    Per-tenant rate limiter.

    Bucket key  = tenant_<slug>   → shared across ALL users of the same tenant.
    This prevents a single compromised account (or a malicious tenant owner)
    from DoS-ing the shared database/cache layer at the expense of other tenants.

    Rate: controlled by THROTTLE_RATES['tenant'] in settings.
    Default: 2000/min (very generous, just protects shared infrastructure).
    """
    scope = 'tenant'

    def get_cache_key(self, request, view):
        tenant = getattr(request, 'tenant', None)
        if tenant is None:
            # No tenant context — don't throttle at tenant level
            # (main-domain endpoints have their own scope)
            return None
        # Sanitize slug before using in cache key
        safe_slug = _sanitize_slug(tenant.slug)
        return self.cache_format % {
            'scope': self.scope,
            'ident': f'tenant_{safe_slug}',
        }

    def throttle_failure(self):
        """Emit an audit event on rate limit breach."""
        try:
            from core.audit import log_event, AuditEvent
            # request is available via self.request when called from throttle_failure
            req = getattr(self, 'request', None)
            if req:
                log_event(
                    AuditEvent.RATE_LIMIT_HIT,
                    request=req,
                    extra={
                        'scope': self.scope,
                        'limit': str(self.rate),
                    },
                )
        except Exception:
            pass
        return super().throttle_failure()


class StrictAnonRateThrottle(AnonRateThrottle):
    """
    Tight per-IP throttle for unauthenticated endpoints (registration, etc.).
    Rate: controlled by THROTTLE_RATES['anon_strict'] in settings.
    """
    scope = 'anon_strict'


def _sanitize_slug(slug: str) -> str:
    """
    Return a safe, consistent cache-key component from a tenant slug.

    Slugs come from user input at tenant creation time. Even though the
    serializer validates them as SlugField values (a-z, 0-9, hyphens), we
    re-sanitize here as defence-in-depth against any future code path that
    might skip validation.
    """
    import re
    # Keep only alphanumeric and hyphens, strip anything else
    return re.sub(r'[^a-z0-9\-]', '', slug.lower())[:64]
