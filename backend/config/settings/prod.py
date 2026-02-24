import os
from .base import *

DEBUG = False

# Read from environment — set ALLOWED_HOSTS=92.4.89.25,yourdomain.com in .env
ALLOWED_HOSTS = os.environ.get('ALLOWED_HOSTS', 'localhost').split(',')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', SECRET_KEY)

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
