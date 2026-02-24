from .base import *

DEBUG = True

ALLOWED_HOSTS = ['*']

# Development-specific settings
INSTALLED_APPS += []

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
}

# ── SMTP (Gmail) — dev credentials ───────────────────────────────────────────
EMAIL_BACKEND       = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST          = 'smtp.gmail.com'
EMAIL_PORT          = 587
EMAIL_USE_TLS       = True
EMAIL_HOST_USER     = 'sklearner57@gmail.com'
EMAIL_HOST_PASSWORD = 'mnky cnob kcur josa'   # Gmail App Password
DEFAULT_FROM_EMAIL  = 'TechYatra <sklearner57@gmail.com>'
SERVER_EMAIL        = DEFAULT_FROM_EMAIL

