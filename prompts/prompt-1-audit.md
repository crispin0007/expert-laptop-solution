# PROMPT 1 — BMS CODEBASE AUDIT
# PURPOSE: Analyze existing codebase, report all issues before touching anything
# HOW TO USE: Open GitHub Copilot Chat → paste this entire prompt → let it scan
# WHEN TO USE: Run FIRST before any changes
# OUTPUT: Structured audit report with ✅ ⚠️ ❌ per area

---

You are a senior Django/React/React Native software architect auditing an existing
Business Management System (BMS). ANALYZE ONLY — do not fix, do not write code.
Read everything, then produce a structured report.

## SYSTEM CONTEXT

Multi-tenant SaaS BMS:
- Backend: Django + DRF
- Web: React | Mobile: React Native
- DB: PostgreSQL, shared, tenant isolated via tenant ForeignKey
- Auth: JWT (access + refresh)
- Server: Nginx + Gunicorn + Caddy
- Queue: Celery + Redis
- Modules: Core, Staff, Customers, Tickets, Accounting, Inventory
- Domains: client1.mybms.com (dashboard), client1-web.mybms.com (public website)

## PLANNED ADDITIONS (audit must ensure codebase is ready for these)
- Event-driven architecture (modules communicate via events only)
- Module registry (self-registering, zero hardcoding)
- CMS module (AI-generated websites, GrapeJS editor, AI chat assistant)
- AI Assistant module (natural language operations, Gemini + Claude)
- HR & Payroll, Projects, CRM, Appointments, WhatsApp, Reports, Automation modules
- Notification engine (in-app + push + email + WhatsApp)
- Audit log, Webhook engine, Data import/export
- Mobile push notifications (FCM)
- Offline support for React Native

---

## AUDIT AREAS

For each finding report: ✅ Good | ⚠️ Needs improvement | ❌ Critical (fix before anything)

---

### AREA 1: PROJECT STRUCTURE
- Consistent app folder structure under apps/?
- Separation of concerns per app (models, views, serializers, urls, permissions)?
- Settings split into base/development/production?
- Requirements pinned with versions?
- Dead code or unused apps?
- Business logic in wrong layer (e.g. logic in views instead of services)?

---

### AREA 2: MULTI-TENANCY (Most Critical)
A single missing tenant filter = data breach between tenants.

- Every tenant-scoped model has tenant ForeignKey?
- TenantMiddleware resolves request.tenant from subdomain/custom domain?
- EVERY queryset in EVERY view filters by request.tenant?
- tenant injected on save server-side (never trusted from request body)?
- Custom domain resolution works (demo.com → correct tenant)?

Flag every instance of:
```python
# ❌ CRITICAL — missing tenant filter
MyModel.objects.get(id=pk)
MyModel.objects.filter(status='active')

# ✅ Correct
MyModel.objects.get(id=pk, tenant=request.tenant)
MyModel.objects.filter(status='active', tenant=request.tenant)
```

---

### AREA 3: RBAC & PERMISSIONS
- Consistent permission_classes on ALL views?
- Any unprotected endpoints?
- superadmin / tenant_admin / tenant_staff clearly separated?
- Module access checked on every module endpoint?
- Permission logic centralized or duplicated?

```python
# ❌ Missing or inconsistent
class MyView(APIView):
    def get(self, request): ...

# ✅ Correct
class MyView(APIView):
    permission_classes = [IsTenantAdmin, HasModuleAccess('module_name')]
```

---

### AREA 4: MODULE GATING & SUBSCRIPTIONS
- SubscriptionPlan and TenantSubscription models exist?
- Module access checked consistently everywhere?
- Superadmin can toggle modules per tenant?
- Modules hardcoded or self-registering?
- Custom subscription overrides per tenant possible?

---

### AREA 5: API DESIGN & CONSISTENCY
- All views class-based?
- API versioned at /api/v1/?
- Pagination on ALL list endpoints?
- Consistent success/error response format?
- Global exception handler for consistent errors?
- Correct HTTP status codes everywhere?

Expected formats:
```json
{"data": {...}, "message": "Success"}
{"data": [...], "count": 100, "next": "...", "previous": "..."}
{"error": "Message", "code": "ERROR_CODE"}
```

---

### AREA 6: INTER-MODULE COUPLING
- Any module directly importing from another module?
- Any cross-module function calls?
- Any event system in place or all side effects hardcoded?
- Shared logic properly in core/ or duplicated?

```python
# ❌ Tight coupling
from apps.inventory.models import Product   # in tickets app
from apps.accounting.models import Invoice  # in cms app

# ✅ Only import from core
from apps.core.events import EventBus
```

---

### AREA 7: MODELS & DATABASE
- All models have created_at, updated_at?
- Soft delete implemented (is_deleted + deleted_at)?
- Indexes on frequently queried fields (tenant + status, tenant + created_at)?
- Proper on_delete on all ForeignKeys?
- N+1 query problems (missing select_related/prefetch_related)?
- Migrations clean and sequential?
- Sensitive data encrypted?

```python
# ❌ Missing essentials
class Ticket(models.Model):
    title = models.CharField(max_length=200)

# ✅ Complete
class Ticket(models.Model):
    title = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'created_at']),
        ]
```

---

### AREA 8: SERIALIZERS
- Separate serializers for list vs detail?
- Separate serializers for read vs write?
- Sensitive data accidentally exposed anywhere?
- Heavy DB queries inside serializers?
- Base serializer that all others extend?

---

### AREA 9: SECURITY
- JWT with access + refresh tokens?
- Token blacklisting on logout?
- Rate limiting on login?
- All secrets in environment variables (never hardcoded)?
- DEBUG=False in production?
- CORS not wildcard in production?
- File upload validation (type + size)?
- HTTPS enforced?

---

### AREA 10: CELERY & BACKGROUND TASKS
- Celery configured and working?
- Long-running tasks offloaded to Celery?
- Celery Beat for recurring tasks?
- Retry logic on task failures?
- Tasks idempotent (safe to retry)?

---

### AREA 11: MOBILE API READINESS
- API versioned (/api/v1/) for mobile compatibility?
- Lightweight responses (no over-fetching)?
- UserDevice model for FCM push tokens?
- Sync endpoint for offline support (/api/v1/sync/?since=timestamp)?
- File upload endpoints accept multipart/form-data?
- JWT refresh token long enough for mobile (30+ days)?
- Mobile-specific lightweight dashboard endpoint?

---

### AREA 12: REACT FRONTEND
- Centralized axios instance with JWT interceptors?
- Auto token refresh on 401?
- Tenant context globally available?
- Loading/error/empty states handled everywhere?
- Sidebar dynamic (based on enabled modules) or hardcoded?
- Consistent component and folder structure?

---

### AREA 13: MISSING INFRASTRUCTURE
Check if each exists. Flag as missing if not:

- [ ] Event Bus (modules communicate via events, not direct imports)
- [ ] Module Registry (self-registering, not hardcoded)
- [ ] Notification Engine (unified: in-app + push + email + WhatsApp)
- [ ] Audit Log (tamper-proof: who did what, when, on which record)
- [ ] Webhook Engine (outbound webhooks for tenant integrations)
- [ ] Automation Engine (if-this-then-that no-code workflows)
- [ ] Scheduled Jobs UI (tenants configure recurring automations)
- [ ] Data Import/Export (CSV/Excel bulk operations per module)
- [ ] Global Exception Handler (consistent error responses)
- [ ] Request Logging Middleware
- [ ] Health Check Endpoint (/api/health/)
- [ ] AI Provider Layer (Gemini + Claude routing)

---

## REPORT FORMAT

Produce exactly this format:

```
# BMS AUDIT REPORT

## SUMMARY
Critical Issues (❌): X
Needs Improvement (⚠️): X
All Good (✅): X
Ready for new features: YES / NO

## FINDINGS BY AREA

### AREA 1: PROJECT STRUCTURE
✅/⚠️/❌ [finding with file location]

### AREA 2: MULTI-TENANCY
✅/⚠️/❌ [finding with file location]

[... all 13 areas ...]

## PRIORITY FIX LIST

🔴 CRITICAL — Fix before adding anything new:
1. [issue] — [exact file] — [why critical]

🟡 IMPORTANT — Fix soon:
1. [issue] — [exact file]

🟢 NICE TO HAVE — When time allows:
1. [issue] — [exact file]

## MISSING INFRASTRUCTURE
[Everything from Area 13 that is absent]

## VERDICT
[What must be fixed before proceeding to Prompt 2]
```

Scan the entire codebase now and produce this report.
Do NOT suggest fixes. Do NOT write code. Report only.
