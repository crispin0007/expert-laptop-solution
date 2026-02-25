import os
from .base import *

DEBUG = False

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', SECRET_KEY)

# '*' allows any hostname — safe because Nginx is the public boundary and
# validates Host headers before requests reach Django. Custom tenant domains
# (els.com, etc.) cannot be enumerated statically so wildcard is intentional.
ALLOWED_HOSTS = ['*']

# Throttle rates are tighter in production (base.py sets up the class list)
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    'anon': '5/min',   # auth endpoints — stricter in prod
    'user': '2000/day',
    'login': '5/min',  # dedicated scope on LoginRateThrottle
}

# CORS — allow all tenant subdomains in production (HTTP + HTTPS)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https?://.*\.bms\.techyatra\.com\.np$',
    r'^https://bms\.techyatra\.com\.np$',
    r'^http://92\.4\.89\.25$',
    r'^http://localhost(:\d+)?$',
]
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# Security headers
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = True
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

# Silence the deploy check warning about SECURE_SSL_REDIRECT — nginx owns it.
SILENCED_SYSTEM_CHECKS = ['security.W008']

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
