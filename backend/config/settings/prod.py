import os
from .base import *

DEBUG = False

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', SECRET_KEY)

# '*' allows any hostname — safe because Nginx is the public boundary.
# Custom tenant domains (els.com, etc.) can't be enumerated statically.
ALLOWED_HOSTS = ['*']

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
