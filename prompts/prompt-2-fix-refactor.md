# PROMPT 2 — BMS FIX & REFACTOR
# PURPOSE: Fix all issues found in Prompt 1 audit + add missing infrastructure
# HOW TO USE: After running Prompt 1 → paste this → provide audit report findings
# WHEN TO USE: After Prompt 1 audit is complete
# NOTE: Fix existing code. Do not add new modules yet. Foundation first.

---

You are a senior Django/React/React Native engineer.
You have the audit report from Prompt 1. Now fix everything — in priority order.
Follow the patterns below exactly. This becomes the foundation for all future modules.

## SYSTEM CONTEXT (same as Prompt 1)

Multi-tenant SaaS BMS:
- Backend: Django + DRF
- Web: React | Mobile: React Native
- DB: PostgreSQL, shared, tenant isolated via tenant ForeignKey
- Auth: JWT | Server: Nginx + Gunicorn + Caddy | Queue: Celery + Redis
- Modules: Core, Staff, Customers, Tickets, Accounting, Inventory
- Domains: client1.mybms.com (dashboard) | client1-web.mybms.com (public site)

---

## FIX ORDER (strict — do not skip steps)

```
Step 1: Project structure
Step 2: Multi-tenancy isolation (critical security)
Step 3: RBAC & permissions
Step 4: Module registry & subscription system
Step 5: API consistency & versioning
Step 6: Model standards (timestamps, soft delete, indexes)
Step 7: Core infrastructure (Event Bus, Notifications, Audit Log)
Step 8: Celery & background tasks
Step 9: Mobile API readiness
Step 10: React frontend fixes
```

---

## STEP 1: PROJECT STRUCTURE

Enforce this structure. Move files if needed:

```
project/
├── apps/
│   ├── core/               ← shared: base models, event bus, registry, permissions
│   ├── tenants/            ← tenant model, middleware, subscription
│   ├── staff/
│   ├── customers/
│   ├── tickets/
│   ├── accounting/
│   └── inventory/
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   └── production.py
│   ├── urls.py
│   ├── wsgi.py
│   └── celery.py
├── frontend/
├── mobile/
├── .env.example
└── manage.py
```

Each app must have:
```
apps/myapp/
├── __init__.py
├── apps.py
├── models.py
├── views.py
├── serializers.py
├── urls.py
├── permissions.py
├── services.py       ← business logic (not in views)
├── tasks.py          ← celery tasks
├── listeners.py      ← event listeners
├── module.py         ← module registry definition
└── admin.py
```

---

## STEP 2: MULTI-TENANCY — FIX ALL QUERYSETS

### TenantMiddleware (ensure this exists and works)
```python
# apps/tenants/middleware.py

class TenantMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = request.get_host().split(':')[0].lower()
        request.tenant = None

        # Check custom domain first
        tenant = Tenant.objects.filter(
            custom_domain=host,
            is_active=True
        ).first()

        # Fall back to subdomain
        if not tenant:
            subdomain = host.replace('.mybms.com', '')
            tenant = Tenant.objects.filter(
                slug=subdomain,
                is_active=True
            ).select_related('subscription').first()

        if tenant:
            request.tenant = tenant

        return self.get_response(request)
```

### Base Model (all tenant models must extend this)
```python
# apps/core/models.py

class TenantModel(models.Model):
    """
    Base class for ALL tenant-scoped models.
    Enforces tenant isolation and standard fields.
    """
    tenant = models.ForeignKey(
        'tenants.Tenant',
        on_delete=models.CASCADE,
        db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True

    def soft_delete(self):
        from django.utils import timezone
        self.is_deleted = True
        self.deleted_at = timezone.now()
        self.save(update_fields=['is_deleted', 'deleted_at'])


class TenantQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_deleted=False)

    def for_tenant(self, tenant):
        return self.filter(tenant=tenant, is_deleted=False)


class TenantManager(models.Manager):
    def get_queryset(self):
        return TenantQuerySet(self.model, using=self._db)

    def for_tenant(self, tenant):
        return self.get_queryset().for_tenant(tenant)
```

### Fix ALL existing models to extend TenantModel
```python
# ❌ Before
class Ticket(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    title = models.CharField(max_length=200)

# ✅ After
class Ticket(TenantModel):  # extends TenantModel — gets all fields automatically
    title = models.CharField(max_length=200)
    objects = TenantManager()

    class Meta(TenantModel.Meta):
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'created_at']),
        ]
```

### Fix ALL views to use tenant-scoped queries
```python
# ❌ Before
ticket = Ticket.objects.get(id=pk)

# ✅ After
ticket = Ticket.objects.get(id=pk, tenant=request.tenant)

# Even better — use the manager
ticket = Ticket.objects.for_tenant(request.tenant).get(id=pk)
```

---

## STEP 3: RBAC & PERMISSIONS

### Base Permission Classes
```python
# apps/core/permissions.py

from rest_framework.permissions import BasePermission

class IsSuperAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.user.role == 'superadmin'
        )


class IsTenantAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.tenant is not None and
            request.user.role in ['superadmin', 'tenant_admin'] and
            (request.user.role == 'superadmin' or
             request.user.tenant == request.tenant)
        )


class IsTenantUser(BasePermission):
    """Any authenticated user belonging to this tenant"""
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated and
            request.tenant is not None and
            (request.user.role == 'superadmin' or
             request.user.tenant == request.tenant)
        )


class HasModuleAccess(BasePermission):
    def __init__(self, module_id):
        self.module_id = module_id

    def has_permission(self, request, view):
        if not request.tenant:
            return False
        return request.tenant.subscription.has_module(self.module_id)

    # Allow passing module_id when using in permission_classes list
    def __call__(self):
        return self
```

---

## STEP 4: MODULE REGISTRY & SUBSCRIPTION SYSTEM

### Module Registry
```python
# apps/core/registry.py

class ModuleRegistry:
    _modules = {}

    @classmethod
    def register(cls, module_class):
        instance = module_class()
        cls._modules[instance.id] = instance
        return module_class

    @classmethod
    def get(cls, module_id):
        return cls._modules.get(module_id)

    @classmethod
    def all(cls):
        return list(cls._modules.values())

    @classmethod
    def get_nav_items(cls, enabled_module_ids):
        items = []
        for mod_id in enabled_module_ids:
            mod = cls.get(mod_id)
            if mod and hasattr(mod, 'nav') and mod.nav:
                items.append({**mod.nav, 'id': mod_id})
        return sorted(items, key=lambda x: x.get('order', 99))


def register_module(cls):
    """Decorator — use on every module class"""
    ModuleRegistry.register(cls)
    return cls


class BMSModule:
    """Base class for all BMS modules"""
    id = None
    name = None
    description = ''
    icon = 'box'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    permissions = []
    requires = ['core']
    nav = None

    def is_available_for(self, tenant):
        return tenant.subscription.has_module(self.id)
```

### Example module.py (fix existing modules to use this pattern)
```python
# apps/tickets/module.py

from apps.core.registry import BMSModule, register_module

@register_module
class TicketsModule(BMSModule):
    id = 'tickets'
    name = 'Ticket Management'
    description = 'Manage customer support tickets'
    icon = 'ticket'
    is_premium = False
    base_price = 0
    requires = ['core', 'customers']
    permissions = [
        'tickets.view',
        'tickets.create',
        'tickets.assign',
        'tickets.close',
        'tickets.delete',
    ]
    nav = {
        'label': 'Tickets',
        'icon': 'ticket',
        'order': 4,
        'url': '/tickets',
        'mobile': True,  # show in mobile app nav
    }
```

### Auto-Discovery in AppConfig
```python
# apps/core/apps.py

class CoreConfig(AppConfig):
    name = 'apps.core'

    def ready(self):
        import importlib, os
        apps_dir = os.path.dirname(os.path.dirname(__file__))

        for app_folder in os.listdir(apps_dir):
            app_path = os.path.join(apps_dir, app_folder)
            if not os.path.isdir(app_path):
                continue
            for file in ['module', 'listeners']:
                try:
                    importlib.import_module(f"apps.{app_folder}.{file}")
                except ImportError:
                    pass
```

### Subscription Models
```python
# apps/tenants/models.py

class SubscriptionPlan(models.Model):
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    price_monthly = models.DecimalField(max_digits=10, decimal_places=2)
    price_yearly = models.DecimalField(max_digits=10, decimal_places=2)
    modules = models.JSONField(default=list)  # ['core', 'staff', 'tickets']
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TenantSubscription(models.Model):
    tenant = models.OneToOneField(
        'Tenant',
        on_delete=models.CASCADE,
        related_name='subscription'
    )
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    extra_modules = models.JSONField(default=list)     # custom additions
    disabled_modules = models.JSONField(default=list)  # custom removals
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    @property
    def enabled_modules(self):
        base = set(self.plan.modules)
        base.update(self.extra_modules)
        base.difference_update(self.disabled_modules)
        return list(base)

    def has_module(self, module_id: str) -> bool:
        return module_id in self.enabled_modules
```

---

## STEP 5: API CONSISTENCY

### Base API View
```python
# apps/core/views.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

class BMSAPIView(APIView):
    """Base view — all BMS views must extend this"""

    def success(self, data=None, message='Success', status_code=200):
        return Response({
            'data': data,
            'message': message
        }, status=status_code)

    def created(self, data=None, message='Created successfully'):
        return self.success(data, message, status.HTTP_201_CREATED)

    def error(self, message, code='ERROR', status_code=400):
        return Response({
            'error': message,
            'code': code
        }, status=status_code)

    def not_found(self, message='Not found'):
        return self.error(message, 'NOT_FOUND', 404)

    def forbidden(self, message='Permission denied'):
        return self.error(message, 'FORBIDDEN', 403)
```

### Global Exception Handler
```python
# apps/core/exceptions.py

from rest_framework.views import exception_handler
from rest_framework.response import Response

def bms_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        return Response({
            'error': response.data.get('detail', str(response.data)),
            'code': exc.__class__.__name__.upper(),
        }, status=response.status_code)

    # Unexpected errors
    import logging
    logger = logging.getLogger(__name__)
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    return Response({
        'error': 'An unexpected error occurred',
        'code': 'INTERNAL_ERROR'
    }, status=500)
```

```python
# config/settings/base.py — add this
REST_FRAMEWORK = {
    'EXCEPTION_HANDLER': 'apps.core.exceptions.bms_exception_handler',
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.BMSPagination',
    'PAGE_SIZE': 20,
}
```

### Standard Pagination
```python
# apps/core/pagination.py

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

class BMSPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            'data': data,
            'count': self.page.paginator.count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'total_pages': self.page.paginator.num_pages,
            'current_page': self.page.number,
        })
```

### API Versioning
```python
# config/urls.py
urlpatterns = [
    path('api/v1/', include('config.urls_v1')),
    path('api/health/', HealthCheckView.as_view()),
    path('admin/', admin.site.urls),
]
```

---

## STEP 6: EVENT BUS INFRASTRUCTURE

```python
# apps/core/events.py

import logging
from django.db import models

logger = logging.getLogger(__name__)


class EventBus:
    _listeners = {}

    @classmethod
    def subscribe(cls, event_name: str, handler, module_id: str):
        if event_name not in cls._listeners:
            cls._listeners[event_name] = []
        handler._module_id = module_id
        cls._listeners[event_name].append(handler)

    @classmethod
    def publish(cls, event_name: str, payload: dict, tenant):
        """
        Fire event. Never raises. Always async via Celery.
        Only fires to modules enabled for this tenant.
        """
        from apps.core.tasks import handle_event

        # Log event
        try:
            EventLog.objects.create(
                tenant=tenant,
                event=event_name,
                payload=payload
            )
        except Exception as e:
            logger.error(f"EventLog write failed: {e}")

        listeners = cls._listeners.get(event_name, [])

        for handler in listeners:
            module_id = getattr(handler, '_module_id', None)

            # Skip if module not enabled for tenant
            if module_id and not tenant.subscription.has_module(module_id):
                continue

            handler_path = f"{handler.__module__}.{handler.__qualname__}"
            handle_event.delay(handler_path, payload, tenant.id, event_name)

    @classmethod
    def all_events(cls):
        return list(cls._listeners.keys())


def listens_to(event_name: str, module_id: str):
    """
    Decorator for event handlers.
    Usage:
        @listens_to('order.placed', module_id='inventory')
        def reduce_stock(payload, tenant): ...
    """
    def decorator(func):
        EventBus.subscribe(event_name, func, module_id)
        return func
    return decorator


class EventLog(TenantModel):
    STATUS_CHOICES = [
        ('published', 'Published'),
        ('handled', 'Handled'),
        ('failed', 'Failed'),
        ('skipped', 'Skipped'),
    ]
    event = models.CharField(max_length=200, db_index=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='published')
    error = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'event']),
            models.Index(fields=['tenant', 'created_at']),
        ]
```

```python
# apps/core/tasks.py

from celery import shared_task
import importlib
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def handle_event(self, handler_path: str, payload: dict, tenant_id: int, event_name: str):
    """Async event handler — runs in background, never blocks main request"""
    try:
        from apps.tenants.models import Tenant
        from apps.core.events import EventLog

        tenant = Tenant.objects.get(id=tenant_id)

        # Import and call handler
        module_path, func_name = handler_path.rsplit('.', 1)
        module = importlib.import_module(module_path)
        handler = getattr(module, func_name)
        handler(payload, tenant)

        EventLog.objects.filter(
            tenant=tenant, event=event_name
        ).order_by('-created_at').first().update_status('handled')

    except Exception as exc:
        logger.error(f"Event handler failed: {handler_path} — {exc}")
        raise self.retry(exc=exc)
```

### Standard Event Catalogue (add to existing modules)
```python
# apps/core/event_catalogue.py
# Reference — these are the events modules should fire

EVENTS = {
    # Tickets
    'ticket.created':       'New ticket created',
    'ticket.assigned':      'Ticket assigned to staff',
    'ticket.resolved':      'Ticket resolved',
    'ticket.overdue':       'Ticket past SLA',

    # Customers
    'customer.created':     'New customer added',
    'customer.birthday':    'Customer birthday today',

    # Inventory
    'inventory.low_stock':  'Product below threshold',
    'inventory.restocked':  'Stock added to product',

    # Accounting
    'invoice.created':      'Invoice generated',
    'invoice.paid':         'Invoice marked paid',
    'invoice.overdue':      'Invoice payment overdue',

    # Staff
    'staff.joined':         'New staff member added',
    'staff.absent':         'Staff marked absent',

    # CMS (coming)
    'order.placed':         'Customer order via website',
    'cms.published':        'Website published',

    # Appointments (coming)
    'appointment.booked':   'New appointment scheduled',
    'appointment.reminder': 'Appointment upcoming',

    # CRM (coming)
    'lead.created':         'New lead added',
    'deal.won':             'Deal won',
}
```

---

## STEP 7: NOTIFICATION ENGINE

```python
# apps/core/notifications.py

from django.db import models

class NotificationEngine:

    @classmethod
    def send(cls, tenant, user, title: str, body: str, data: dict = None, notification_type: str = 'info'):
        """Single entry point for ALL notifications"""

        # Save in-app notification always
        InAppNotification.objects.create(
            tenant=tenant,
            user=user,
            title=title,
            body=body,
            data=data or {},
            notification_type=notification_type
        )

        # Get user preferences
        prefs = getattr(user, 'notification_preferences', None)

        # Push notification (mobile)
        if user.devices.filter(is_active=True).exists():
            from apps.core.tasks import send_push_notification
            tokens = list(user.devices.filter(is_active=True).values_list('fcm_token', flat=True))
            send_push_notification.delay(tokens, title, body, data or {})

        # Email
        if prefs and prefs.email_enabled:
            from apps.core.tasks import send_email_notification
            send_email_notification.delay(user.email, title, body)

        # WhatsApp
        if (prefs and prefs.whatsapp_enabled and
                tenant.subscription.has_module('whatsapp') and
                user.phone):
            from apps.core.tasks import send_whatsapp_notification
            send_whatsapp_notification.delay(user.phone, body)


class InAppNotification(TenantModel):
    TYPE_CHOICES = [
        ('info', 'Info'), ('success', 'Success'),
        ('warning', 'Warning'), ('error', 'Error'),
    ]
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=200)
    body = models.TextField()
    data = models.JSONField(default=dict)
    notification_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='info')
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', 'is_read'])]


class UserDevice(TenantModel):
    PLATFORM_CHOICES = [('ios', 'iOS'), ('android', 'Android'), ('web', 'Web')]
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='devices')
    fcm_token = models.TextField()
    platform = models.CharField(max_length=10, choices=PLATFORM_CHOICES)
    device_name = models.CharField(max_length=200, blank=True)
    app_version = models.CharField(max_length=20, blank=True)
    last_active = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ['user', 'fcm_token']


class UserNotificationPreferences(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='notification_preferences')
    in_app_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=True)
    whatsapp_enabled = models.BooleanField(default=False)
```

---

## STEP 8: AUDIT LOG

```python
# apps/core/audit.py

from django.db import models

class AuditLog(TenantModel):
    ACTION_CHOICES = [
        ('create', 'Created'), ('update', 'Updated'),
        ('delete', 'Deleted'), ('view', 'Viewed'),
        ('login', 'Logged In'), ('logout', 'Logged Out'),
        ('export', 'Exported'), ('import', 'Imported'),
    ]
    user = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    module = models.CharField(max_length=100)
    resource = models.CharField(max_length=200)   # e.g. "Ticket #123"
    resource_id = models.CharField(max_length=100, blank=True)
    changes = models.JSONField(default=dict)       # before/after values
    ip_address = models.GenericIPAddressField(null=True)
    user_agent = models.TextField(blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'module']),
            models.Index(fields=['tenant', 'user']),
            models.Index(fields=['tenant', 'created_at']),
        ]


def audit(request, action: str, module: str, resource: str, resource_id=None, changes=None):
    """Helper — call this in views when important actions happen"""
    AuditLog.objects.create(
        tenant=request.tenant,
        user=request.user,
        action=action,
        module=module,
        resource=resource,
        resource_id=str(resource_id) if resource_id else '',
        changes=changes or {},
        ip_address=get_client_ip(request),
        user_agent=request.META.get('HTTP_USER_AGENT', '')
    )

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0]
    return request.META.get('REMOTE_ADDR')
```

---

## STEP 9: MOBILE API READINESS

### Device Registration Endpoints
```python
# apps/core/views.py (add these)

class RegisterDeviceView(BMSAPIView):
    permission_classes = [IsTenantUser]

    def post(self, request):
        UserDevice.objects.update_or_create(
            user=request.user,
            fcm_token=request.data['fcm_token'],
            defaults={
                'tenant': request.tenant,
                'platform': request.data.get('platform', 'android'),
                'device_name': request.data.get('device_name', ''),
                'app_version': request.data.get('app_version', ''),
                'is_active': True,
            }
        )
        return self.success(message='Device registered')


class SyncView(BMSAPIView):
    """Mobile offline sync — returns everything changed since timestamp"""
    permission_classes = [IsTenantUser]

    def get(self, request):
        since = request.query_params.get('since')  # ISO timestamp
        tenant = request.tenant

        if not since:
            return self.error('since parameter required')

        from django.utils.dateparse import parse_datetime
        since_dt = parse_datetime(since)

        # Return delta — only changed records
        data = {
            'tickets': TicketSerializer(
                Ticket.objects.for_tenant(tenant).filter(updated_at__gte=since_dt),
                many=True
            ).data,
            'customers': CustomerSerializer(
                Customer.objects.for_tenant(tenant).filter(updated_at__gte=since_dt),
                many=True
            ).data,
            'sync_timestamp': timezone.now().isoformat(),
        }

        return self.success(data)
```

---

## STEP 10: REACT FRONTEND FIXES

### Centralized API Service
```javascript
// frontend/src/services/api.js

import axios from 'axios'

const api = axios.create({
    baseURL: '/api/v1/',
    timeout: 30000,
})

// Request interceptor — add JWT token
api.interceptors.request.use(config => {
    const token = localStorage.getItem('access_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

// Response interceptor — handle token refresh
api.interceptors.response.use(
    response => response,
    async error => {
        const originalRequest = error.config

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true
            try {
                const refresh = localStorage.getItem('refresh_token')
                const res = await axios.post('/api/v1/auth/token/refresh/', { refresh })
                localStorage.setItem('access_token', res.data.access)
                originalRequest.headers.Authorization = `Bearer ${res.data.access}`
                return api(originalRequest)
            } catch {
                localStorage.clear()
                window.location.href = '/login'
            }
        }
        return Promise.reject(error)
    }
)

export default api
```

### Dynamic Sidebar (module-aware)
```javascript
// frontend/src/components/Sidebar.jsx

import { useEffect, useState } from 'react'
import api from '../services/api'

export default function Sidebar() {
    const [navItems, setNavItems] = useState([])

    useEffect(() => {
        api.get('core/nav/')
            .then(res => setNavItems(res.data.data))
    }, [])

    return (
        <nav>
            {navItems.map(item => (
                <NavItem
                    key={item.id}
                    label={item.label}
                    icon={item.icon}
                    url={item.url}
                />
            ))}
        </nav>
    )
}
```

---

## HEALTH CHECK

Add this — required for monitoring:
```python
# apps/core/views.py

class HealthCheckView(APIView):
    permission_classes = []  # public

    def get(self, request):
        from django.db import connection
        from django_redis import get_redis_connection

        checks = {}

        try:
            connection.ensure_connection()
            checks['database'] = 'ok'
        except Exception:
            checks['database'] = 'error'

        try:
            redis = get_redis_connection('default')
            redis.ping()
            checks['redis'] = 'ok'
        except Exception:
            checks['redis'] = 'error'

        all_ok = all(v == 'ok' for v in checks.values())

        return Response({
            'status': 'healthy' if all_ok else 'degraded',
            'checks': checks,
        }, status=200 if all_ok else 503)
```

---

After completing all steps:
1. Run all migrations
2. Run existing tests (fix any broken by refactor)
3. Manually test each existing module still works
4. Confirm audit report issues are resolved
5. Then proceed to Prompt 3 for new modules
