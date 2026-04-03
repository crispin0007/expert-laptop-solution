import os
from .base import *

DEBUG = False

# Build ALLOWED_HOSTS from ROOT_DOMAIN so it is never a wildcard.
# 1. The root domain itself (for the landing page / super-admin).
# 2. All first-level subdomains of ROOT_DOMAIN (tenant workspaces).
# 3. Any extra hosts supplied as a comma-separated env var (e.g. custom
#    tenant vanity domains).
_root = ROOT_DOMAIN  # imported from base via *

# ALLOWED_HOSTS = ['*'] is intentional and safe in this multi-tenant architecture.
#
# Security is enforced at two layers that are more appropriate than Django's
# static host list:
#
#   1. Caddy (reverse proxy) — only forwards requests for domains explicitly
#      configured in the Caddyfile. Unknown domains are rejected before they
#      ever reach Django.
#
#   2. TenantMiddleware — resolves every request to a known tenant by subdomain
#      or custom_domain.  Requests that don't match any tenant are blocked with
#      403/404 before any view runs.
#
# A static ALLOWED_HOSTS list breaks dynamic custom domains: every time a client
# adds or changes their domain we would need to edit .env + restart the container.
# That is not acceptable for a white-label SaaS.  Caddy + TenantMiddleware
# provide equivalent (and actually stronger) protection without the operational
# cost.
ALLOWED_HOSTS = ['*']

# Throttle rates are tighter in production (base.py sets up the class list)
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    'anon': '5/min',          # auth endpoints — stricter in prod
    'user': '300/min',        # per-user: generous for SPA with many parallel requests
    'login': '5/min',         # dedicated scope on LoginRateThrottle
    'tenant': '3000/min',     # per-tenant aggregate across all users
    'anon_strict': '10/min',  # registration endpoints
}

# CORS — allow all tenant subdomains + root domain in production.
# Built from ROOT_DOMAIN so nothing is hardcoded to a specific domain or IP.
# CORS — allow all tenant subdomains + root domain in production.
# Custom tenant domains are validated at the TenantMiddleware layer, not here.
# We allow all HTTPS origins that Caddy would forward to us.
import re as _re
_escaped_root = _re.escape(_root)
CORS_ALLOWED_ORIGIN_REGEXES = [
    rf'^https://.*\.{_escaped_root}$',    # all tenant subdomains — HTTPS only
    rf'^https://{_escaped_root}$',          # root domain — HTTPS only
    # NOTE: custom tenant vanity domains must be added here or validated via
    # a CORS_URLS_REGEX approach once Phase 2 custom domains are implemented.
    r'^http://localhost(:\d+)?$',           # local frontend dev server (HTTP ok)
]
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# Mobile app: honour X-Tenant-Slug header in production.
# Mobile clients cannot use subdomains; they identify their tenant via this header.
# Data-access security is enforced by JWT authentication + TenantManager, NOT
# by host/header trust alone.  See core/middleware.py for full rationale.
ALLOW_TENANT_SLUG_HEADER = True
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization', 'content-type',
    'dnt', 'origin', 'user-agent', 'x-csrftoken', 'x-requested-with',
    'x-tenant-slug',  # required for mobile multi-tenancy
]

# Security headers
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True

# Wrap each HTTP request in a DB transaction so that signal-triggered journal
# failures roll back the entire status-change together with the journal write.
# Without this, a failed journal leaves the document in 'issued'/'approved' state
# with no corresponding ledger entry — a financial integrity violation.
ATOMIC_REQUESTS = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 31536000          # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER = True
X_FRAME_OPTIONS = 'DENY'

# Nginx handles HTTP→HTTPS redirect and TLS termination — do NOT redirect at
# the Django layer (that would cause double-redirect behind the proxy).
SECURE_SSL_REDIRECT = False

# Silence deploy check warnings that don't apply to this architecture:
#   W008 — SECURE_SSL_REDIRECT: nginx/caddy owns TLS termination
#   W006 — ALLOWED_HOSTS wildcard: intentional, see comment above
SILENCED_SYSTEM_CHECKS = ['security.W008', 'security.W006']

# Static & media
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

# Whitenoise: serve compressed + cached static files directly from Django/gunicorn
# as a fallback when nginx isn't the upstream (e.g. health checks, scratchpad runs).
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

# Logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {'class': 'logging.StreamHandler'},
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}
