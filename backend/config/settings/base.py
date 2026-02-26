import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'replace-me')

# Root domain for subdomain resolution and Caddy cert verification
ROOT_DOMAIN = os.environ.get('ROOT_DOMAIN', 'bms.techyatra.com.np')

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
    }
}

# Redis / Celery
REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

# Celery Beat — periodic tasks
CELERY_BEAT_SCHEDULE = {
    'check-sla-deadlines-every-15min': {
        'task': 'notifications.tasks.task_check_sla_deadlines',
        'schedule': 900,  # 15 minutes in seconds
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
    # Rate limiting — brute-force protection on auth endpoints.
    # Anon: 10/min (login attempts).  User: 1000/day (normal API usage).
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '10/min',
        'user': '1000/day',
        'login': '5/min',   # dedicated scope used by LoginRateThrottle
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
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': REDIS_URL,
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

