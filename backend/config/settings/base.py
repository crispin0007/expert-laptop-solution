import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

# ── Security ──────────────────────────────────────────────────────────────────
# Fail loudly at startup if the secret key is missing or still the placeholder.
_raw_secret = os.environ.get('DJANGO_SECRET_KEY', '')
if not _raw_secret or _raw_secret in ('replace-me', 'changeme', 'secret'):
    sys.exit(
        'FATAL: DJANGO_SECRET_KEY env var is not set or is using a placeholder value.\n'
        'Generate one with: python -c "from django.core.management.utils import '
        'get_random_secret_key; print(get_random_secret_key())"'
    )
SECRET_KEY = _raw_secret

# Root domain for subdomain resolution and Caddy cert verification
ROOT_DOMAIN = os.environ.get('ROOT_DOMAIN', 'bms.techyatra.com.np')

# IP allowlist for super-admin API access.
# When non-empty, any request to IsSuperAdmin-gated views from an IP not in
# this list is rejected with 403 and logged as SUPERADMIN_IP_BLOCKED.
# Set via environment: SUPERADMIN_ALLOWED_IPS=1.2.3.4,5.6.7.8
# Leave empty (default) to allow all IPs — suitable for dev/testing only.
SUPERADMIN_ALLOWED_IPS = [
    ip.strip()
    for ip in os.environ.get('SUPERADMIN_ALLOWED_IPS', '').split(',')
    if ip.strip()
]

# ── Admin domain isolation (Phase 4 — Item #6) ───────────────────────────────
# A second secret used ONLY for main-domain (superadmin) JWT domain_sig claims.
# Set this to a value DIFFERENT from DJANGO_SECRET_KEY in production.
# When set separately, leaking DJANGO_SECRET_KEY does NOT allow forging admin
# tokens — the attacker also needs SUPERADMIN_JWT_SECRET.
# Falls back to SECRET_KEY when not set (no isolation, acceptable for dev).
SUPERADMIN_JWT_SECRET = os.environ.get('SUPERADMIN_JWT_SECRET', _raw_secret)

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # third party
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',

    # local — Sprint 1
    'core',
    'tenants',
    'accounts',

    # local — Sprint 2
    'customers',
    'departments',
    'roles',

    # local — Sprint 3
    'tickets',

    # local — Sprint 4
    'inventory',
    'accounting',
    'notifications',

    # local — Sprint 5
    'projects',

    # local — CMS
    'cms',

    # local — Phase 3 stubs
    'ai_assistant',

    # local — HRM
    'hrm',
]

# Use a custom user model provided by the accounts app
AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',

    # Tenant middleware must run early so views and managers can access request.tenant
    'core.middleware.TenantMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# Database — keep defaults; dev/prod override as needed
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'techyatra'),
        'USER': os.environ.get('POSTGRES_USER', 'nexus'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', 'nexus_password'),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', '5432'),
        # Keep a live DB connection per worker thread for 60 s instead of
        # opening a new one on every request. Dramatically reduces connection
        # churn under load without requiring PgBouncer.
        'CONN_MAX_AGE': int(os.environ.get('CONN_MAX_AGE', 60)),
    }
}

# ── Redis URL helpers ─────────────────────────────────────────────────────────
# REDIS_URL is the base connection string (without DB suffix).
# Split into three logical databases to isolate concerns:
#   DB 0 — Celery task broker  (tasks / queues — volatile, OK to lose on restart)
#   DB 1 — Celery result store (task results)
#   DB 2 — Django cache        (tenant slugs, staff availability, throttle counters)
#
# In compose the env-var already includes the DB number for legacy compat;
# strip it and re-add the correct suffix so all three Redis usages share one
# Redis instance without stepping on each other.
def _redis_db(base_url: str, db: int) -> str:
    """Return *base_url* with the path replaced by /<db>."""
    from urllib.parse import urlparse, urlunparse
    p = urlparse(base_url)
    return urlunparse(p._replace(path=f'/{db}'))


_REDIS_BASE = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
REDIS_URL          = _redis_db(_REDIS_BASE, 0)   # canonical alias used elsewhere
CELERY_BROKER_URL  = _redis_db(_REDIS_BASE, 0)
CELERY_RESULT_BACKEND = _redis_db(_REDIS_BASE, 1)
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

# Celery Beat — periodic tasks
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    'check-sla-deadlines-every-15min': {
        'task': 'notifications.tasks.task_check_sla_deadlines',
        'schedule': 900,  # 15 minutes in seconds
    },
    # Purge expired SimpleJWT tokens every night at 03:00 UTC.
    # Without this the OutstandingToken + BlacklistedToken tables grow forever
    # and every token validation becomes slower as the unbounded table is scanned.
    'flush-expired-jwt-tokens-daily': {
        'task': 'notifications.tasks.task_flush_expired_tokens',
        'schedule': crontab(hour=3, minute=0),
    },
    # Anomaly detection: scan for IPs with repeated probe events and auto-ban them.
    # Runs every 5 minutes; bans IPs that exceed ANOMALY_PROBE_THRESHOLD (default 5)
    # probe events within ANOMALY_WINDOW_MINUTES (default 15) minutes.
    'anomaly-detection-every-5min': {
        'task': 'core.tasks.task_detect_and_ban_probe_ips',
        'schedule': 300,  # 5 minutes
    },
    # Auto-generate draft payslips on the 1st of each month at 00:05 UTC.
    # Iterates all StaffSalaryProfiles and creates a Payslip for the previous
    # calendar month (idempotent — skips if one already exists).
    'auto-generate-monthly-payslips': {
        'task': 'accounting.tasks.task_generate_monthly_payslips',
        'schedule': crontab(day_of_month=1, hour=0, minute=5),
    },
    # Process scheduled reversing journal entries daily at 00:10 UTC.
    # Finds all posted JournalEntries with reversal_date <= today and no reversal yet.
    'process-reversals-daily': {
        'task': 'accounting.tasks.task_process_reversals',
        'schedule': crontab(hour=0, minute=10),
    },
    # Check all tenants for low-stock products daily at 07:00 UTC.
    # Dispatches individual per-tenant tasks so each is retried independently.
    'check-low-stock-daily': {
        'task': 'inventory.tasks.task_dispatch_low_stock_checks',
        'schedule': crontab(hour=7, minute=0),
    },
    # Flag overdue post-dated cheques daily at 08:00 UTC.
    # Logs warnings for cheques in 'issued' or 'presented' status past their date.
    'flag-overdue-pdcs-daily': {
        'task': 'accounting.tasks.task_flag_overdue_pdcs',
        'schedule': crontab(hour=8, minute=0),
    },
    # Seed HRM leave balances for all tenants on Nepal New Year (Baisakh 1 ≈ April 14).
    # Runs daily in April only — idempotent get_or_create means retries are safe.
    'seed-yearly-leave-balances': {
        'task': 'hrm.tasks.task_seed_yearly_leave_balances_all_tenants',
        'schedule': crontab(hour=1, minute=0, month_of_year='4', day_of_month='14,15,16'),
    },
    # Mark absent: runs at 15:15 UTC (≈ 21:00 Nepal UTC+5:45) every day.
    # Any staff with no attendance record for today are marked absent.
    # Skips non-work days per AttendancePolicy.work_days.
    'mark-absent-daily': {
        'task': 'hrm.tasks.task_mark_absent_all_tenants',
        'schedule': crontab(hour=15, minute=15),
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Trust the X-Forwarded-Host header set by Vite dev proxy / Caddy in prod.
# Required so request.build_absolute_uri() returns the correct public URL
# instead of the internal Docker service hostname (web:8000).
USE_X_FORWARDED_HOST = True
# Also trust X-Forwarded-Proto so HTTPS is detected correctly behind Caddy.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        # Custom auth class — validates standard JWT claims PLUS the tenant_id
        # claim that is embedded in every token at login time.
        # A token issued for tenant A is rejected on tenant B at this layer,
        # before any view or permission class executes.
        'accounts.authentication.TenantJWTAuthentication',
    ],
    # Central exception handler — converts ALL exceptions into ApiResponse envelope.
    # See core/exception_handler.py for full documentation.
    'EXCEPTION_HANDLER': 'core.exception_handler.nexus_exception_handler',
    # Pagination — cursor-based by default; no COUNT(*) on every list request.
    # Use NexusPageNumberPagination only for report endpoints that need random access.
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.NexusCursorPagination',
    'PAGE_SIZE': 25,
    # Rate limiting — three layers: per-IP (anon), per-user, per-tenant.
    # Anon: 10/min (login attempts).  User: 1000/day (normal API usage).
    # Tenant: 2000/min aggregate (overridden to 1000/min in prod).
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'core.throttles.TenantRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '10/min',
        'user': '1000/day',
        'login': '5/min',        # dedicated scope used by LoginRateThrottle
        'tenant': '2000/min',    # per-tenant aggregate (all users in workspace)
        'anon_strict': '20/min', # stricter anon scope for registration endpoints
    },
}

# SimpleJWT settings
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
    # Use our tenant-scoped token classes so every token embeds a tenant_id claim.
    # TenantJWTAuthentication validates this claim on every request.
    'TOKEN_OBTAIN_SERIALIZER': 'rest_framework_simplejwt.serializers.TokenObtainPairSerializer',
}

# CORS — allow Vite dev server and the secondary PC on the local network
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://192.168.100.100:5173',
    'http://192.168.100.100:5174',
]
# Also allow any *.localhost subdomain (e.g. pro.localhost:5173, els.localhost:5173)
# so tenant subdomains work in local dev without listing every slug explicitly.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r'^http://[a-z0-9-]+\.localhost(:\d+)?$',
]
CORS_ALLOW_CREDENTIALS = True

# Redis cache (for staff availability and other short-lived data)
# Uses DB 2 — isolated from Celery broker (DB 0) and results (DB 1).
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': _redis_db(_REDIS_BASE, 2),
    }
}

# ── Email / SMTP ──────────────────────────────────────────────────────────────
# Override any of these via environment variables in production.
# Dev defaults to Gmail SMTP (credentials set in dev.py / docker-compose env).
EMAIL_BACKEND  = os.environ.get('EMAIL_BACKEND', 'django.core.mail.backends.smtp.EmailBackend')
EMAIL_HOST     = os.environ.get('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT     = int(os.environ.get('EMAIL_PORT', 587))
EMAIL_USE_TLS  = os.environ.get('EMAIL_USE_TLS', 'True') == 'True'
EMAIL_HOST_USER     = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL  = os.environ.get('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER)
SERVER_EMAIL        = DEFAULT_FROM_EMAIL

# ── Structured Logging ────────────────────────────────────────────────────────
# Uses the 'nexus.*' logger hierarchy so every module-level logger created as
# logging.getLogger(__name__) inside core.*, tickets.*, accounting.*, etc.
# automatically inherits the correct handler and level.
#
# Logger naming convention:
#   nexus.views      — HTTP layer (INFO: requests, warnings: auth fails)
#   nexus.services   — Business logic (DEBUG in dev, INFO in prod)
#   nexus.errors     — Unexpected exceptions (always ERROR)
#   nexus.signals    — Signal handlers (DEBUG)
#   nexus.tasks      — Celery tasks (INFO)
#
# In production (prod.py) swap the console handler for a JSON formatter
# compatible with your log aggregator (Loki, CloudWatch, etc.).
import os as _os
_LOG_DIR = BASE_DIR / 'logs'
_LOG_DIR.mkdir(exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname:<8} {name} — {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file_errors': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(BASE_DIR / 'logs' / 'errors.log'),
            'maxBytes': 10 * 1024 * 1024,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
            'level': 'ERROR',
            'encoding': 'utf-8',
        },
    },
    'loggers': {
        # Root NEXUS logger — all app code should use getLogger(__name__)
        # which resolves to nexus.* because all apps live under the nexus package
        # hierarchy. Adjust level per environment in dev.py / prod.py.
        'nexus': {
            'handlers': ['console', 'file_errors'],
            'level': 'DEBUG',
            'propagate': False,
        },
        # Suppress noisy Django internals in non-debug mode
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['console', 'file_errors'],
            'level': 'ERROR',
            'propagate': False,
        },
        # SQL query logging — set to DEBUG to see every query (dev only)
        'django.db.backends': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        # DRF and simplejwt internals — only warnings
        'rest_framework': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        # Our app loggers — inherit from nexus root by default.
        # Override individual levels here if needed.
        'core': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
        'tickets': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
        'accounting': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
        'projects': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
        'inventory': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
        'notifications': {'handlers': ['console', 'file_errors'], 'level': 'INFO', 'propagate': False},
        'accounts': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
        'tenants': {'handlers': ['console', 'file_errors'], 'level': 'DEBUG', 'propagate': False},
    },
}

