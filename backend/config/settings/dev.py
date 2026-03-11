from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

# Development-specific settings
INSTALLED_APPS += []

# In dev, allow ALL origins so any IP/port can access the API without CORS
# errors. This covers local dev from 192.168.x.x IP addresses, Vite on any
# port, mobile emulators, etc. Never use this in production.
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# Disable ALL throttling in dev — no rate limits during local testing.
# This also neutralises LoginRateThrottle which uses the 'login' scope.
REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = []
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {
    'anon': '1000/min',
    'user': '100000/day',
    'login': '1000/min',     # effectively unlimited in dev
    'tenant': '100000/min',
    'anon_strict': '1000/min',
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} | {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'loggers': {
        # Tenant isolation / security events — always log these
        'nexus.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        # General access logging
        'nexus.access': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        # Django request errors
        'django.request': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# ── SMTP — dev uses console backend by default so no SMTP credentials needed.
# To test real email, copy .env.example → .env and set EMAIL_* vars there,
# OR set EMAIL_BACKEND to smtp in docker-compose.yml environment section.
EMAIL_BACKEND = os.environ.get(
    'EMAIL_BACKEND', 'django.core.mail.backends.console.EmailBackend'
)
# Remaining EMAIL_* vars are inherited from base.py (read from env).

