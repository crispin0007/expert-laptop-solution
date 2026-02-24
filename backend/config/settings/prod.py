import os
from .base import *

DEBUG = False

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', SECRET_KEY)

# Leading dot = wildcard for all subdomains (e.g. els.bms.techyatra.com.np)
# Also allow root domain + IP for direct access
ALLOWED_HOSTS = [
    '.bms.techyatra.com.np',   # *.bms.techyatra.com.np + bms.techyatra.com.np
    '92.4.89.25',
    'localhost',
]
# Allow overriding via env if needed
_extra = os.environ.get('ALLOWED_HOSTS', '')
if _extra:
    ALLOWED_HOSTS += [h.strip() for h in _extra.split(',') if h.strip()]

# CORS — allow all tenant subdomains in production
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^https?://.*\.bms\.techyatra\.com\.np$',
    r'^http://92\.4\.89\.25$',
    r'^http://localhost(:\d+)?$',
]
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# Security headers
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SESSION_COOKIE_SECURE = False  # Set True when SSL is enabled
CSRF_COOKIE_SECURE = False     # Set True when SSL is enabled

# Static & media
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

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
