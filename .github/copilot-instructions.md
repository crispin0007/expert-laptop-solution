# NEXUS BMS — Copilot Agent Instructions
# Version: 2.0 — Updated with Event System, Module Registry, CMS, AI Assistant
# Source of truth: This file + NEXUS BMS/architecture.md

---

## What This Project Is
A white-label, multi-tenant Business Management SaaS platform for IT/technology companies.
Businesses buy access and each gets their own isolated workspace (tenant).
Full architecture is documented in `NEXUS BMS/architecture.md` — read it before making decisions.

---

## Tech Stack
- **Backend:** Django 5 + Django REST Framework
- **Frontend:** React + Vite + TailwindCSS
- **Mobile:** React Native (Expo)
- **Database:** PostgreSQL 16
- **Cache/Queue:** Redis + Celery + Celery Beat
- **Auth:** JWT via SimpleJWT + 2FA (TOTP)
- **Containerization:** Docker + Docker Compose
- **Reverse Proxy:** Caddy (auto SSL, wildcard subdomains)
- **AI Providers:** Gemini Flash (free tier) + Claude API (premium tasks)

---

## Project Structure
```
nexus-bms/
├── backend/
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py
│   │   │   ├── dev.py
│   │   │   └── prod.py
│   │   ├── urls.py
│   │   ├── urls_v1.py
│   │   └── celery.py
│   ├── core/             # TenantModel, EventBus, ModuleRegistry, permissions, audit
│   ├── tenants/          # Tenant CRUD, subscription, module gating
│   ├── accounts/         # User, TenantMembership, Roles, devices
│   ├── customers/        # Customer management
│   ├── tickets/          # Ticket system, SLA, transfers, coin system
│   ├── projects/         # Project + task management
│   ├── inventory/        # Products, stock movements
│   ├── accounting/       # Invoices, ledger, payslip
│   ├── notifications/    # Unified: email + FCM + WhatsApp + in-app
│   ├── cms/              # Phase 3 — AI website generation (stub only now)
│   └── ai_assistant/     # Phase 3 — Natural language commands (stub only now)
├── frontend/
│   └── src/
│       ├── features/     # One folder per Django app
│       ├── api/          # Axios instance + interceptors
│       ├── store/        # Zustand global state
│       └── components/
├── mobile/               # React Native (Expo)
│   └── src/
│       ├── features/
│       ├── api/
│       ├── store/
│       └── guards/
├── NEXUS BMS/
│   └── architecture.md   # Full system architecture — source of truth
└── docker-compose.yml
```

---

## Build Phases — Respect This Always

```
Phase 1 — IN PROGRESS (build this now)
  Sprint 1: Django setup, Docker, Tenant middleware, Auth + JWT, Role system
  Sprint 2: Customer, Staff, Departments, Staff availability
  Sprint 3: Ticket Types + SLA, Ticket CRUD, Assignment + Transfer, Comments
  Sprint 4: Ticket products (inventory hook), Coin system, Invoice, Email notifications
  Sprint 5: Project CRUD, Tasks, Milestones, Project invoice, Push notifications (FCM)
  Sprint 6: React frontend — Auth, Dashboard, Ticket UI, Project UI

Phase 2 — Inventory (stub only until Phase 1 complete)
Phase 3 — CMS + AI Assistant (stub only until Phase 2 complete)
Phase 4 — Accounting full (stub only until Phase 3 complete)
```

**Do NOT build Phase 2, 3, or 4 features. Stub hooks and flags only.**

---

## CORE ARCHITECTURE RULES — NEVER BREAK THESE

---

### 1. Multi-Tenancy

- Every tenant-scoped model MUST inherit `TenantModel` — never `models.Model` directly
- `TenantManager` automatically scopes to `request.tenant` — never manually `.filter(tenant=...)`in views
- Tenant resolved from subdomain in `TenantMiddleware` → stored as `request.tenant`
- Never use `request.user.tenant` — always `request.tenant`
- Never expose one tenant's data to another — always verify in tests
- `tenant` is NEVER accepted from request body — always injected server-side in view/service

```python
# ❌ WRONG — never do this
MyModel.objects.get(id=pk)
MyModel.objects.filter(status='active')
request.user.tenant  # User has no tenant attribute

# ✅ CORRECT
MyModel.objects.for_tenant(request.tenant).get(id=pk)
MyModel.objects.for_tenant(request.tenant).filter(status='active')
request.tenant  # always from middleware
```

---

### 2. Module Registry — Self-Registering

Every module defines itself. Zero hardcoding anywhere.

```python
# apps/[module]/module.py
from core.registry import BMSModule, register_module

@register_module
class MyModule(BMSModule):
    id = 'my_module'
    name = 'My Module'
    description = 'What it does'
    icon = 'icon-name'
    version = '1.0.0'
    is_premium = False
    base_price = 0
    requires = ['core']
    permissions = ['my_module.view', 'my_module.create', 'my_module.update', 'my_module.delete']
    nav = {'label': 'My Module', 'icon': 'icon', 'order': 5, 'url': '/my-module', 'mobile': True}
```

Auto-discovered on Django startup — no manual registration needed.

---

### 3. Event-Driven Architecture — Modules Never Import Each Other

Modules communicate ONLY via events. Never import across modules.

```python
# ❌ WRONG — tight coupling
from apps.inventory.models import Product    # in tickets app
from apps.accounting.models import Invoice   # in cms app

# ✅ CORRECT — fire event, let listeners react
from core.events import EventBus
EventBus.publish('ticket.created', {'id': ticket.id, 'tenant_id': tenant.id}, tenant=request.tenant)
```

```python
# ❌ WRONG — listener importing from another module
# apps/inventory/listeners.py
from apps.accounting.models import Invoice  # cross-module import

# ✅ CORRECT — only import own models + core
from core.events import listens_to
from .models import Product  # own models only

@listens_to('cms.order.placed', module_id='inventory')
def reduce_stock(payload: dict, tenant) -> None:
    Product.objects.for_tenant(tenant).filter(id=payload['product_id']).update(...)
```

---

### 4. Event Naming Convention

```
Format: [module].[noun].[verb]   e.g. ticket.status.changed
Never:  ticket_status_changed    (underscore style)
Never:  ticketStatusChanged      (camelCase)
```

### Complete Event Catalogue — Use Only These Names

```python
# core/event_catalogue.py — single source of truth

EVENT_CATALOGUE = {
    # TICKETS
    'ticket.created':            'New ticket created',
    'ticket.assigned':           'Ticket assigned to staff',
    'ticket.status.changed':     'Ticket status changed',
    'ticket.resolved':           'Ticket resolved',
    'ticket.closed':             'Ticket closed',
    'ticket.reopened':           'Ticket reopened',
    'ticket.overdue':            'Ticket past SLA deadline',
    'ticket.escalated':          'Ticket escalated',
    'ticket.comment.added':      'Comment added to ticket',

    # CUSTOMERS
    'customer.created':          'New customer added',
    'customer.updated':          'Customer profile updated',
    'customer.deleted':          'Customer soft deleted',
    'customer.birthday':         'Customer birthday today',
    'customer.inactive':         'Customer inactive 30+ days',

    # INVENTORY
    'inventory.product.created': 'New product added',
    'inventory.product.updated': 'Product updated',
    'inventory.product.deleted': 'Product deleted',
    'inventory.stock.low':       'Stock below threshold',
    'inventory.stock.out':       'Product out of stock',
    'inventory.stock.added':     'Stock quantity increased',
    'inventory.product.published': 'Product published to website',

    # ACCOUNTING
    'invoice.created':           'Invoice generated',
    'invoice.sent':              'Invoice sent to customer',
    'invoice.paid':              'Invoice paid',
    'invoice.overdue':           'Invoice overdue',
    'invoice.cancelled':         'Invoice cancelled',
    'expense.created':           'Expense recorded',
    'expense.approved':          'Expense approved',
    'payroll.processed':         'Payroll run completed',
    'payroll.payslip.generated': 'Payslip generated',

    # STAFF / HR
    'staff.created':             'New staff added',
    'staff.updated':             'Staff profile updated',
    'staff.deleted':             'Staff removed',
    'staff.absent':              'Staff absent',
    'staff.leave.requested':     'Leave requested',
    'staff.leave.approved':      'Leave approved',
    'staff.leave.rejected':      'Leave rejected',

    # CMS (Phase 3)
    'cms.site.generated':        'AI generated website designs',
    'cms.design.selected':       'Tenant selected design',
    'cms.site.published':        'Website published',
    'cms.site.unpublished':      'Website taken offline',
    'cms.page.updated':          'CMS page updated',
    'cms.blog.published':        'Blog post published',
    'cms.domain.verified':       'Custom domain verified',
    'cms.order.placed':          'Order via website',

    # APPOINTMENTS (Phase 2)
    'appointment.created':       'Appointment booked',
    'appointment.confirmed':     'Appointment confirmed',
    'appointment.cancelled':     'Appointment cancelled',
    'appointment.rescheduled':   'Appointment rescheduled',
    'appointment.reminder.24h':  'Appointment in 24 hours',
    'appointment.reminder.1h':   'Appointment in 1 hour',
    'appointment.completed':     'Appointment completed',
    'appointment.noshow':        'No show',

    # CRM (Phase 2)
    'lead.created':              'New lead added',
    'lead.assigned':             'Lead assigned',
    'lead.converted':            'Lead converted to customer',
    'deal.created':              'Deal created',
    'deal.stage.changed':        'Deal stage changed',
    'deal.won':                  'Deal won',
    'deal.lost':                 'Deal lost',

    # PROJECTS
    'project.created':           'Project created',
    'project.completed':         'Project completed',
    'task.created':              'Task created',
    'task.assigned':             'Task assigned',
    'task.completed':            'Task completed',
    'task.overdue':              'Task overdue',

    # WHATSAPP (Phase 2)
    'whatsapp.message.received': 'Inbound WhatsApp message',
    'whatsapp.message.failed':   'WhatsApp delivery failed',

    # AI ASSISTANT (Phase 3)
    'ai.command.executed':       'AI command executed',
    'ai.command.failed':         'AI command failed',
    'ai.generation.completed':   'AI website generation done',

    # SYSTEM
    'tenant.created':            'New tenant onboarded',
    'tenant.suspended':          'Tenant suspended',
    'subscription.changed':      'Plan changed',
    'module.enabled':            'Module enabled for tenant',
    'module.disabled':           'Module disabled for tenant',
    'user.login':                'User logged in',
    'user.logout':               'User logged out',
    'user.password.changed':     'Password changed',
}
```

**If you need a new event not in this catalogue → add it to `core/event_catalogue.py` first, then use it.**

---

### 5. Event Payload Standards

Every payload MUST include minimum fields:

```python
# Minimum for every event
{
    'id': instance.id,
    'tenant_id': tenant.id,   # always include for async Celery handlers
}

# ticket.created
{'id': ticket.id, 'tenant_id': tenant.id, 'customer_id': ticket.customer_id,
 'assigned_to_id': ticket.assigned_to_id, 'priority': ticket.priority}

# invoice.paid
{'id': invoice.id, 'tenant_id': tenant.id, 'customer_id': invoice.customer_id,
 'amount': str(invoice.amount), 'paid_at': invoice.paid_at.isoformat()}

# cms.order.placed
{'id': order.id, 'tenant_id': tenant.id, 'product_id': product.id,
 'customer_id': customer.id, 'quantity': quantity, 'amount': str(amount)}

# Always use str() for Decimal fields in payloads — JSON does not support Decimal
```

---

### 6. API Conventions

- All endpoints under `/api/v1/`
- Response format: `{ "success": bool, "data": {}, "meta": {}, "errors": [] }`
- All views use `TenantMixin` + JWT auth + Role permission check + `HasModuleAccess`
- Cursor-based pagination default, `page_size=25`
- `django-filter` for all list filtering
- Global exception handler — never return raw 500s
- HTTP status codes: 200 (ok), 201 (created), 400 (bad input), 401 (unauth), 403 (forbidden), 404 (not found)

```python
# ❌ WRONG
return Response({'status': 'ok'})  # raw dict, no envelope

# ✅ CORRECT
return ApiResponse.success(data=serializer.data, message='Created')
return ApiResponse.error(errors=serializer.errors, message='Validation failed')
```

---

### 7. Model Standards

```python
# Every tenant-scoped model follows this pattern
class MyModel(TenantModel):  # ← TenantModel, never models.Model
    name = models.CharField(max_length=200)
    status = models.CharField(max_length=20, choices=[...], db_index=True)

    # TenantModel already provides:
    # tenant (FK), created_at, updated_at, is_deleted, deleted_at

    objects = TenantManager()

    class Meta(TenantModel.Meta):
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'created_at']),
        ]
```

- Soft delete always — never hard delete critical records
- No raw SQL — Django ORM only
- Decimal fields in payloads → always `str()` for JSON safety
- Never hardcode: tenant IDs, VAT rates, coin rates, currency

---

### 8. Business Logic Layers

```
Request → View (validate, permissions only)
              ↓
          Service (business logic, DB ops, event firing)
              ↓
          Repository (complex queries, if needed)
              ↓
          Model (data only)
```

- Views: permission checks, serializer validation, call service
- Services: all business logic, `EventBus.publish()`, `AuditLog`, notifications
- Serializers: data shape only — no DB queries, no business logic
- Signals: inventory hook, coin system (existing — do not change pattern)

---

### 9. Existing Critical Hooks — Never Bypass

```python
# Inventory Hook (signals.py — DO NOT change)
# TicketProduct added → StockMovement(type=out) auto-created via signal
# Ticket cancelled → StockMovement reversed via signal
# Never manually update StockLevel — always computed from StockMovement aggregation

# Coin System (signals.py — DO NOT change)
# Ticket closed → CoinTransaction(status=pending) auto-created via signal
# Admin approves/rejects from coin queue
# Approved coins accumulate in payslip for current period
# coin_to_money_rate set per tenant by tenant admin — never hardcode
```

---

### 10. VAT Rules

```python
# Nepal VAT = 13% default
# Always read from tenant — never hardcode
vat_rate = request.tenant.vat_rate       # ✅
vat_rate = 0.13                          # ❌ never

# Toggle per tenant
if request.tenant.vat_enabled:
    vat_amount = subtotal * tenant.vat_rate

# VAT breakdown must appear separately on all invoices
```

---

### 11. Notification Rules

```python
# ✅ CORRECT — always via notification service (async Celery)
from notifications.service import NotificationService
NotificationService.send(tenant=tenant, user=user, title='...', body='...', data={})

# ❌ WRONG — never directly from views or signals
send_mail(...)           # never in views
FCMDevice.send(...)      # never in signals
requests.post(fcm_url)   # never inline
```

Notification channels (respects user preferences):
- In-app (always)
- Push FCM (if device registered + preference enabled)
- Email (if preference enabled)
- WhatsApp (if module enabled + preference enabled)

Push payload must always include deep link data:
```python
data = {
    'type': '[module]',      # screen to open in mobile
    'id': str(instance.id),  # record to show
    'action': 'view',
}
```

---

### 12. Security Rules

```python
# tenant never from request body — always injected
instance = serializer.save(tenant=request.tenant)  # ✅
# ❌ never: tenant_id = request.data['tenant_id']

# Claude/Gemini API keys — backend only, never frontend
# Keys in environment variables only — never in code
# All AI-generated HTML sanitized with bleach before storing

# CORS — explicit origins only in prod (no wildcards)
# File uploads — validate type + size before saving
# Passwords — hashed only, never stored plain
# JWT — blacklist on logout, short access token, long refresh for mobile
```

---

### 13. Celery & Background Tasks

```python
# Always idempotent — safe to retry
# Always pass tenant_id (not tenant object) to tasks
# Always use bind=True + max_retries + default_retry_delay
# Use iterator(chunk_size=200) for bulk operations — never .all()

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def my_task(self, tenant_id: int, data: dict):
    try:
        tenant = Tenant.objects.get(id=tenant_id)
        # do work
    except Exception as exc:
        raise self.retry(exc=exc)
```

Celery Beat periodic tasks must run as a **separate Docker Compose service** — not the main worker.

Queue routing (separate queues, separate workers):
- `default` — general tasks
- `notifications` — push/email/WhatsApp delivery
- `ai` — AI generation tasks (slow, expensive)
- `beat` — scheduled/periodic tasks

---

### 14. Mobile API Standards

- All list endpoints paginated — never return unbounded lists
- List serializers minimal (4-6 fields max) — mobile data is expensive
- API versioned `/api/v1/` — never break old mobile app versions
- JWT refresh token: 30+ day expiry for mobile
- Device registration endpoint for FCM tokens
- Sync endpoint: `/api/v1/sync/?since=<iso_timestamp>` for offline support
- File uploads: `multipart/form-data` + base64 fallback

---

### 15. React / React Native Standards

```
// API — always via configured instance, never raw fetch
import { apiClient } from '@/api/client'   // ✅
fetch('/api/v1/...')                        // ❌ never

// State
React Query → server state (API data)
Zustand     → global UI state (auth, tenant, preferences)

// Styling (web)
TailwindCSS only — no inline styles, no CSS modules

// Error handling
<ErrorBoundary> wraps entire app — no white screens
apiClient interceptor handles 401 token refresh automatically
```

---

## NEW MODULE CHECKLIST
Every new module must have all of these before marking done:

```
Backend:
- [ ] module.py with @register_module
- [ ] models.py — all models extend TenantModel
- [ ] All models have TenantManager
- [ ] services.py — all business logic here
- [ ] serializers.py — list / detail / write separated
- [ ] views.py — extends NexusViewSet or TenantMixin
- [ ] views.py — HasModuleAccess on all endpoints
- [ ] urls.py — registered in config/urls_v1.py
- [ ] tasks.py — Celery tasks (even if empty)
- [ ] listeners.py — @listens_to event handlers
- [ ] signals.py — if Django signals needed
- [ ] admin.py — registered
- [ ] tests/ — unit tests with pytest-django + factory_boy
- [ ] migrations created and applied
- [ ] App added to INSTALLED_APPS

Events:
- [ ] EventBus.publish() called in service on create/update/delete
- [ ] Event names from EVENT_CATALOGUE only
- [ ] Payloads include id + tenant_id minimum
- [ ] Decimal fields → str() in payloads
- [ ] listeners.py handles relevant incoming events
- [ ] New events added to core/event_catalogue.py if needed

Notifications:
- [ ] Push notification sent on key actions
- [ ] Deep link data included in push payload
- [ ] NotificationService used (never direct FCM/email)

Mobile:
- [ ] List serializer is lightweight (4-6 fields)
- [ ] List endpoint is paginated
- [ ] Cursor pagination used (not page number)

Security:
- [ ] tenant always injected server-side (never from request body)
- [ ] All queries scoped to request.tenant
- [ ] Permission classes on every endpoint
- [ ] Soft delete used (never hard delete)
- [ ] AuditLog called on important actions

Quality:
- [ ] Business logic in service layer (not views/serializers)
- [ ] No cross-module imports (events only)
- [ ] Tests written and passing
- [ ] Inline docstrings on public methods
```

---

## DO NOT DO — Ever

```
❌ request.user.tenant — always request.tenant
❌ .filter(tenant=...) in views — TenantManager handles this
❌ Hardcode tenant IDs, VAT rates, coin rates, currency
❌ Business logic in views or serializers — use services
❌ Cross-module imports — use EventBus
❌ Direct FCM/email/WhatsApp calls — use NotificationService
❌ Raw fetch() in frontend/mobile — use apiClient
❌ Hard delete critical records — soft delete only
❌ Inline styles in React — TailwindCSS only
❌ Skip migrations review before applying
❌ Build Phase 2/3/4 features while Phase 1 is in progress
❌ Add frontend deps without checking React Query / Zustand coverage
❌ Build customer portal (flagged future)
❌ Activate payment gateways (eSewa, Khalti, Stripe stubs exist — inactive)
❌ Claude/Gemini API keys in frontend — backend only
❌ Raw AI HTML without bleach sanitization
❌ Wildcard CORS in production
❌ .all() in bulk Celery tasks — use .iterator(chunk_size=200)
❌ EventBus.publish() from views — always from services
❌ Invent event names — use EVENT_CATALOGUE only
```

---

## PHASE 3 STUBS (CMS + AI) — Do Not Implement Yet

When stubbing Phase 3 modules, only create:
- Empty `module.py` with `@register_module` and correct `id`
- Empty `models.py` with a comment `# Phase 3 — not implemented`
- Empty `listeners.py` with relevant `@listens_to` stubs (commented out)

### CMS Module Notes (for when Phase 3 begins)
- AI generation: Claude API server-side only — never frontend
- Generate 3 design variants per tenant
- Sanitize all AI HTML with `bleach` before storing
- Two serializers: private (BMS dashboard) and public (Next.js renderer) — never mixed
- Rate limit: 10 generations/day per tenant
- GrapeJS drag & drop in Phase 3.2
- AI chat editor inside GrapeJS in Phase 3.3
- Public website domain: `client1-web.mybms.com` (default) or custom domain via CNAME

### AI Assistant Module Notes (for when Phase 3 begins)
- Gemini Flash for simple extraction (tickets, customers, expenses) — free tier
- Claude API for complex generation (CMS, GrapeJS edits) — paid
- Always confirm with user before executing extracted action
- Multi-turn for missing required fields
- Rate limit: 50 AI actions/day basic, unlimited pro
- Natural language → structured data → confirm → execute → EventBus.publish()

---

## Definition of Done (Any Feature)

- [ ] Django model + migration created
- [ ] DRF serializer + viewset/view created
- [ ] URL registered in `config/urls_v1.py`
- [ ] Module access permission checked in view
- [ ] Events fired via EventBus in service
- [ ] Unit tests written and passing
- [ ] Inline docstrings on public methods
- [ ] Mobile API readiness verified (pagination, lightweight serializer)