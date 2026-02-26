from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

# Development-specific settings
INSTALLED_APPS += []

# Disable throttling in dev — no rate limits during local testing
REST_FRAMEWORK['DEFAULT_THROTTLE_CLASSES'] = []
REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'] = {}

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

