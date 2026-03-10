# PROMPT 3 — ADD NEW BMS MODULE
# PURPOSE: Template for adding ANY new module to BMS correctly
# HOW TO USE: Paste this + tell Copilot which module to build
# WHEN TO USE: Every time you add a new module after Prompt 2 is complete
# EXAMPLE: "Using the pattern below, build the CMS module"

---

You are a senior Django/React/React Native engineer adding a new module
to an existing BMS platform. Follow every pattern below exactly.
The codebase already has the foundation from Prompt 2 in place.

## SYSTEM CONTEXT

Multi-tenant SaaS BMS — foundation already built:
- TenantModel base class (all models extend this)
- TenantManager for scoped queries
- EventBus for inter-module communication
- ModuleRegistry with @register_module decorator
- NotificationEngine for all notification channels
- AuditLog for tamper-proof action logging
- BMSAPIView base class with consistent response helpers
- BMSPagination for all list endpoints
- JWT auth with device registration
- Celery for async tasks
- Mobile-ready API (versioned, paginated, lightweight)

## MODULE TO BUILD
[REPLACE THIS LINE with the module you want, e.g: "Build the Ticket Management module"]

---

## REQUIRED FILE STRUCTURE

Create ALL of these files for every new module:

```
apps/[module_name]/
├── __init__.py
├── apps.py
├── module.py          ← registry definition
├── models.py          ← data models
├── serializers.py     ← API serializers
├── views.py           ← API views
├── urls.py            ← URL routing
├── permissions.py     ← module-specific permissions
├── services.py        ← business logic
├── tasks.py           ← celery background tasks
├── listeners.py       ← event listeners
└── admin.py           ← django admin
```

---

## FILE TEMPLATES — FOLLOW EXACTLY

### 1. module.py
```python
# apps/[module]/module.py

from apps.core.registry import BMSModule, register_module

@register_module
class [ModuleName]Module(BMSModule):
    id = '[module_id]'                        # e.g. 'tickets', 'cms', 'hr'
    name = '[Human Readable Name]'
    description = '[What this module does]'
    icon = '[icon_name]'                      # icon identifier for frontend
    version = '1.0.0'
    is_premium = False                        # True for paid add-ons
    base_price = 0                            # monthly price if premium
    requires = ['core']                       # dependencies

    permissions = [
        '[module].view',
        '[module].create',
        '[module].update',
        '[module].delete',
    ]

    nav = {
        'label': '[Display Name]',
        'icon': '[icon_name]',
        'order': [number],                    # position in sidebar
        'url': '/[module]',
        'mobile': True,                       # show in mobile app nav
    }
```

---

### 2. models.py
```python
# apps/[module]/models.py

from django.db import models
from apps.core.models import TenantModel, TenantManager

class [ModelName](TenantModel):
    """
    Always extend TenantModel — never models.Model directly.
    TenantModel provides: tenant, created_at, updated_at, is_deleted, deleted_at
    """

    # Your fields here
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=[('active', 'Active'), ('inactive', 'Inactive')],
        default='active',
        db_index=True
    )

    objects = TenantManager()

    class Meta(TenantModel.Meta):
        ordering = ['-created_at']
        verbose_name = '[Model Name]'
        verbose_name_plural = '[Model Names]'
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'created_at']),
            # Add more indexes for fields you filter by often
        ]

    def __str__(self):
        return self.name
```

---

### 3. serializers.py
```python
# apps/[module]/serializers.py

from rest_framework import serializers
from .models import [ModelName]

class [ModelName]ListSerializer(serializers.ModelSerializer):
    """Lightweight — for list endpoints. Mobile-friendly (minimal fields)."""
    class Meta:
        model = [ModelName]
        fields = ['id', 'name', 'status', 'created_at']  # minimal fields only


class [ModelName]DetailSerializer(serializers.ModelSerializer):
    """Full detail — for single record endpoints."""
    class Meta:
        model = [ModelName]
        fields = '__all__'
        read_only_fields = ['tenant', 'created_at', 'updated_at', 'is_deleted']


class [ModelName]WriteSerializer(serializers.ModelSerializer):
    """For create/update — never expose tenant, never allow tenant from input."""
    class Meta:
        model = [ModelName]
        exclude = ['tenant', 'is_deleted', 'deleted_at']  # never writable by client

    def create(self, validated_data):
        # tenant always injected from view, never from request body
        return super().create(validated_data)
```

---

### 4. views.py
```python
# apps/[module]/views.py

from apps.core.views import BMSAPIView
from apps.core.permissions import IsTenantUser, IsTenantAdmin, HasModuleAccess
from apps.core.audit import audit
from apps.core.events import EventBus
from .models import [ModelName]
from .serializers import [ModelName]ListSerializer, [ModelName]DetailSerializer, [ModelName]WriteSerializer

MODULE_ID = '[module_id]'

class [ModelName]ListView(BMSAPIView):
    permission_classes = [IsTenantUser, HasModuleAccess(MODULE_ID)]

    def get(self, request):
        """List all records for this tenant — paginated"""
        queryset = [ModelName].objects.for_tenant(request.tenant)

        # Optional filters from query params
        status = request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)

        # Paginate
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = [ModelName]ListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = [ModelName]ListSerializer(queryset, many=True)
        return self.success(serializer.data)

    def post(self, request):
        """Create new record"""
        serializer = [ModelName]WriteSerializer(data=request.data)
        if serializer.is_valid():
            instance = serializer.save(tenant=request.tenant)  # always inject tenant

            # Fire event — let other modules react
            EventBus.publish('[module].[model].created', {
                'id': instance.id,
                'name': instance.name,
            }, tenant=request.tenant)

            # Audit log
            audit(request, 'create', MODULE_ID, str(instance), instance.id)

            return self.created([ModelName]DetailSerializer(instance).data)

        return self.error(str(serializer.errors))


class [ModelName]DetailView(BMSAPIView):
    permission_classes = [IsTenantUser, HasModuleAccess(MODULE_ID)]

    def get_object(self, request, pk):
        try:
            # ALWAYS filter by tenant — never just by pk
            return [ModelName].objects.for_tenant(request.tenant).get(id=pk)
        except [ModelName].DoesNotExist:
            return None

    def get(self, request, pk):
        instance = self.get_object(request, pk)
        if not instance:
            return self.not_found()
        return self.success([ModelName]DetailSerializer(instance).data)

    def put(self, request, pk):
        instance = self.get_object(request, pk)
        if not instance:
            return self.not_found()

        # Capture before state for audit
        before = [ModelName]DetailSerializer(instance).data

        serializer = [ModelName]WriteSerializer(instance, data=request.data)
        if serializer.is_valid():
            instance = serializer.save()

            after = [ModelName]DetailSerializer(instance).data

            # Fire event
            EventBus.publish('[module].[model].updated', {
                'id': instance.id,
            }, tenant=request.tenant)

            # Audit with before/after
            audit(request, 'update', MODULE_ID, str(instance), instance.id,
                  changes={'before': dict(before), 'after': dict(after)})

            return self.success([ModelName]DetailSerializer(instance).data)

        return self.error(str(serializer.errors))

    def delete(self, request, pk):
        instance = self.get_object(request, pk)
        if not instance:
            return self.not_found()

        instance.soft_delete()  # never hard delete

        # Fire event
        EventBus.publish('[module].[model].deleted', {
            'id': pk,
        }, tenant=request.tenant)

        audit(request, 'delete', MODULE_ID, str(instance), pk)

        return self.success(message='Deleted successfully')
```

---

### 5. urls.py
```python
# apps/[module]/urls.py

from django.urls import path
from . import views

urlpatterns = [
    path('[model]/', views.[ModelName]ListView.as_view()),
    path('[model]/<int:pk>/', views.[ModelName]DetailView.as_view()),
    # Add more endpoints as needed
]
```

```python
# Add to config/urls_v1.py
path('[module]/', include('apps.[module].urls')),
```

---

### 6. tasks.py
```python
# apps/[module]/tasks.py

from celery import shared_task
import logging

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def [module]_background_task(self, tenant_id: int, data: dict):
    """
    Example background task.
    Always idempotent — safe to retry.
    Always filter by tenant_id.
    """
    try:
        from apps.tenants.models import Tenant
        tenant = Tenant.objects.get(id=tenant_id)
        # Do work here
    except Exception as exc:
        logger.error(f"[module] task failed: {exc}")
        raise self.retry(exc=exc)
```

---

### 7. listeners.py
```python
# apps/[module]/listeners.py
# This module reacts to events from OTHER modules.
# It does NOT import from other modules — only from core.

from apps.core.events import listens_to

# Example: react to an event from another module
# @listens_to('invoice.paid', module_id='[module_id]')
# def handle_invoice_paid(payload, tenant):
#     """React to invoice being paid"""
#     pass

# @listens_to('customer.created', module_id='[module_id]')
# def handle_new_customer(payload, tenant):
#     """React to new customer"""
#     pass

# Add your listeners here based on what events this module cares about.
# See apps/core/event_catalogue.py for all available events.
```

---

### 8. admin.py
```python
# apps/[module]/admin.py

from django.contrib import admin
from .models import [ModelName]

@admin.register([ModelName])
class [ModelName]Admin(admin.ModelAdmin):
    list_display = ['name', 'tenant', 'status', 'created_at']
    list_filter = ['status', 'tenant']
    search_fields = ['name']
    readonly_fields = ['tenant', 'created_at', 'updated_at']
```

---

### 9. apps.py
```python
# apps/[module]/apps.py

from django.apps import AppConfig

class [ModuleName]Config(AppConfig):
    name = 'apps.[module]'
    verbose_name = '[Human Readable Name]'
    # No ready() needed — auto-discovery handled by core
```

---

## MOBILE CONSIDERATIONS

For every new module, ensure:

### Lightweight list endpoint
```python
# List serializer must be minimal for mobile
class [ModelName]ListSerializer(serializers.ModelSerializer):
    class Meta:
        model = [ModelName]
        fields = ['id', 'name', 'status', 'created_at']  # minimal — not __all__
```

### Push notification on key events
```python
# In services.py — when something important happens
from apps.core.notifications import NotificationEngine

NotificationEngine.send(
    tenant=tenant,
    user=assigned_user,
    title='New [Item] Assigned',
    body=f'You have been assigned: {instance.name}',
    data={'type': '[module]', 'id': str(instance.id)},  # for deep linking
    notification_type='info'
)
```

### Mobile deep link data
Always include `data` in notifications for mobile deep linking:
```python
data = {
    'type': '[module]',      # mobile app knows which screen to open
    'id': str(instance.id),  # which record to show
    'action': 'view',        # what to do
}
```

---

## AI ASSISTANT INTEGRATION

If this module supports natural language commands, add to event catalogue:

```python
# In apps/ai_assistant/commands.py — add command handler

COMMAND_HANDLERS = {
    # existing...
    'create_[model]': {
        'module': '[module_id]',
        'required_fields': ['name'],
        'optional_fields': ['description', 'status'],
        'handler': 'apps.[module].services.create_from_ai',
    }
}
```

```python
# In apps/[module]/services.py — add AI creation handler

def create_from_ai(extracted_data: dict, tenant, user):
    """Called by AI Assistant when user types natural language command"""
    serializer = [ModelName]WriteSerializer(data=extracted_data)
    if serializer.is_valid():
        return serializer.save(tenant=tenant)
    raise ValueError(serializer.errors)
```

---

## CHECKLIST BEFORE MARKING MODULE COMPLETE

- [ ] module.py with @register_module created
- [ ] All models extend TenantModel (not models.Model)
- [ ] All models have TenantManager
- [ ] All views extend BMSAPIView
- [ ] All views have permission_classes with HasModuleAccess
- [ ] All queries filter by request.tenant
- [ ] tenant never accepted from request body (always injected in view)
- [ ] Separate list/detail/write serializers
- [ ] Soft delete used (never hard delete)
- [ ] EventBus.publish() called on create/update/delete
- [ ] AuditLog audit() called on important actions
- [ ] List endpoints are paginated
- [ ] tasks.py created (even if empty initially)
- [ ] listeners.py created with relevant event listeners
- [ ] admin.py registered
- [ ] URLs added to config/urls_v1.py
- [ ] App added to INSTALLED_APPS
- [ ] Migrations created and applied
- [ ] Push notification sent on key events (mobile)
- [ ] List serializer is lightweight (mobile-friendly)
- [ ] Deep link data included in notifications

---

## SPECIFIC MODULE NOTES

### CMS Module
- Also needs: Next.js public renderer, Caddy domain provisioning, Claude API (server-side only)
- AI generation rate limited to 10/day per tenant
- All AI HTML sanitized with bleach before storing
- Two serializers: private (BMS) and public (Next.js) — never mixed
- GrapeJS in Phase 2, AI chat editor in Phase 3

### AI Assistant Module
- Use Gemini Flash for simple extraction tasks (free)
- Use Claude only for complex generation (CMS, GrapeJS edits)
- Always confirm with user before executing action
- Multi-turn conversation for missing fields
- Rate limit: 50 AI actions/day on basic plan, unlimited on pro

### WhatsApp Module
- Twilio or official WhatsApp Business API
- Template messages only (for compliance)
- Opt-in required from customers
- Listens to events from all other modules

### HR & Payroll
- Salary is sensitive — encrypt at rest
- Payslips generated as PDF (never editable)
- Payroll runs as Celery task (never in request cycle)
- Listen to staff.absent events for attendance deduction

### Appointments Module
- Calendar view required on mobile (not just list)
- Reminder fires 24hrs and 1hr before (Celery Beat)
- Fires appointment.booked event → WhatsApp/push confirmation

Now build the module. Follow every pattern above without exception.
