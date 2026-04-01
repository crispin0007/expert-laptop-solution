# Customers Module — Production Hardening Review

**Date:** 2026-04-01
**Sprint:** Phase 1 Production Hardening
**Status:** ✅ Complete

---

## Summary

The customers module had a sound security posture (all queries already scoped via `NexusViewSet`/`TenantMixin`). The hardening pass added the missing service layer, EventBus hooks, and stub files required by the module checklist.

---

## Security Findings

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| 1 | No IDOR gaps found — `get_queryset()` already filters `tenant=self.tenant, is_deleted=False` | — | Already correct |
| 2 | Contact create already validates `customer__tenant=self.tenant` on parent lookup | — | Already correct |
| 3 | No tenant injection risk — serializer `tenant`, `created_by`, `is_deleted` are all `read_only_fields` | — | Already correct |

---

## Architecture Gaps Fixed

### Service Layer (new)

- Created `backend/customers/services.py` with three public functions:
  - `create_customer(*, tenant, created_by, data)` — creates and returns Customer, publishes `customer.created`
  - `update_customer(*, instance, tenant, data)` — applies updates, publishes `customer.updated`
  - `soft_delete_customer(*, instance, tenant)` — validates tenant ownership, calls `instance.soft_delete()`, publishes `customer.deleted`. Raises `ValueError` on cross-tenant attempt.

### Views wired to service layer

- `CustomerViewSet.create()` → calls `customer_service.create_customer()`
- `CustomerViewSet.perform_update()` → calls `customer_service.update_customer()`
- `CustomerViewSet.destroy()` → calls `customer_service.soft_delete_customer()`
- Business logic no longer lives in the view.

### Stub files created

| File | Purpose |
|------|---------|
| `customers/tasks.py` | `task_send_customer_birthday_greetings`, `task_flag_inactive_customers` — Phase 2 stubs |
| `customers/listeners.py` | `on_customer_birthday`, `on_customer_inactive` — @listens_to stubs (commented, Phase 2) |

---

## Events Published

| Event | Fired From | Payload |
|-------|-----------|---------|
| `customer.created` | `create_customer()` | `id, tenant_id, name, type` |
| `customer.updated` | `update_customer()` | `id, tenant_id` |
| `customer.deleted` | `soft_delete_customer()` | `id, tenant_id` |

All events drawn from `EVENT_CATALOGUE`. Decimal fields use `str()` (none present in customer payloads).

---

## Regression Tests Added

Three new tests added to `core/tests/test_security.py::CrossTenantIDORTest`:

| Test | What It Verifies |
|------|----------------|
| `test_customer_delete_blocked_cross_tenant` | DELETE on a customer from another tenant returns 404; record untouched |
| `test_customer_contact_update_blocked_cross_tenant` | PATCH on a contact from another tenant returns 404; field unchanged |
| `test_soft_delete_customer_service_rejects_cross_tenant` | `soft_delete_customer()` raises `ValueError` with correct message; record not soft-deleted |

**Test run result:** 15/15 pass (`Ran 15 tests in 2.140s OK`)

---

## Checklist Status

```
Backend:
- [x] models.py — all models extend TenantModel
- [x] All models have TenantManager (via TenantModel)
- [x] services.py — all business logic here
- [x] serializers.py — list / detail / write separated
- [x] views.py — extends NexusViewSet
- [x] views.py — HasModuleAccess on all endpoints (required_module = 'customers')
- [x] urls.py — registered in config/urls_v1.py
- [x] tasks.py — Celery stubs created
- [x] listeners.py — @listens_to stubs created
- [x] admin.py — registered (pre-existing)
- [x] migrations created and applied
- [x] App in INSTALLED_APPS

Events:
- [x] EventBus.publish() in service on create/update/delete
- [x] Event names from EVENT_CATALOGUE only
- [x] Payloads include id + tenant_id
- [x] listeners.py stubs for future incoming events

Security:
- [x] tenant always injected server-side (read_only_fields covers serializer)
- [x] All queries scoped to request.tenant via NexusViewSet
- [x] soft_delete_customer() validates tenant ownership explicitly
- [x] Permission classes on every endpoint
- [x] Soft delete used — no hard deletes
```
