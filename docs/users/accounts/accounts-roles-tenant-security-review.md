# Accounts & Roles — Tenant Security Review

**Module:** `accounts` + `roles`  
**Sprint:** Phase 1 — Sprint 1 & 2  
**Reviewed:** 2026-04-01  
**Status:** Hardened

---

## Summary

The accounts and roles modules form the authentication and authorization backbone of NEXUS BMS. They handle user identity, JWT issuance, 2FA, tenant membership management, and permission-based access control. This review covers findings, fixes applied, and remaining gaps.

---

## Findings

### CRITICAL — Fixed

#### 1. TenantMembership IDOR via POST body
- **File:** `accounts/serializers.py` — `TenantMembershipSerializer`
- **File:** `accounts/views.py` — `TenantMembershipViewSet`
- **Risk:** `tenant` field was writable in `TenantMembershipSerializer`. The `TenantMembershipViewSet` did not override `perform_create`, so an admin user on Tenant B could POST `{"tenant": A.id, "role": "admin"}` to `/api/v1/accounts/memberships/` and create a membership record in Tenant A.
- **Fix:**
  - Added `read_only_fields = ('tenant', 'created_at')` to `TenantMembershipSerializer.Meta`.
  - Added `perform_create(self, serializer)` override in `TenantMembershipViewSet` that calls `serializer.save(tenant=self.tenant)` — tenant is always injected server-side.
- **Test:** `test_tenant_membership_create_rejects_cross_tenant_body` (passes ✅)

---

### MEDIUM — Fixed

#### 2. Cross-tenant department assignment via staff invite
- **File:** `accounts/serializers.py` — `InviteStaffSerializer`, `UpdateStaffSerializer`
- **Risk:** Both serializers used `Department.objects.all()` (unscoped) for the `department` PrimaryKeyRelatedField. While `validate_department` caught cross-tenant assignment attempts, the unscoped queryset allowed enumeration of PKs across all tenants (403-style not 404-style response on cross-tenant PK).
- **Fix:** Both serializers now override `__init__` to scope the `department` queryset to the current tenant via `Department.objects.filter(tenant=tenant)`. Cross-tenant department PKs now fail at the field level with a standard 404-style invalid PK error.
- **Test:** `test_invite_staff_rejects_cross_tenant_department` (passes ✅)

#### 3. MeSerializer permission keys did not match PERMISSION_MAP
- **File:** `accounts/serializers.py` — `MeSerializer.get_membership()`
- **Risk:** Four permission keys in the `_perm()` calls used non-canonical keys that do not exist in `roles/permissions_map.py`:
  - `coins.view` → should be `accounting.view_coins`
  - `coins.approve` → should be `accounting.manage_coins`
  - `accounting.view` → should be `accounting.view_invoices`
  - `accounting.manage` → should be `accounting.manage_invoices`
  - Custom role users would never get the correct permission resolution for these four flags — the `_perm()` function would always return the default (role-based) value, making custom role overrides for coins/accounting ineffective.
- **Fix:** Updated all four keys to match `PERMISSION_MAP` exactly.
- **Test:** `test_me_serializer_permission_keys_match_permission_map` (passes ✅)

---

### ARCHITECTURE — Addressed

#### 4. No EventBus hooks for staff lifecycle events
- **Files:** `accounts/views.py` (StaffViewSet)
- **Gap:** No domain events were published on staff invite, deactivate, reactivate, or role assignment. Downstream modules (notifications, audit) had no way to react to these state changes.
- **Fix:** Added `EventBus.publish()` calls in:
  - `StaffViewSet.create` → `staff.created`
  - `StaffViewSet.deactivate` → `staff.updated` (change: `deactivated`)
  - `StaffViewSet.reactivate` → `staff.updated` (change: `reactivated`)
  - `StaffViewSet.assign_role` → `staff.updated` (change: `role_assigned`)
- **Note:** EventBus is in transitional state — events are logged via Django logger. Full Celery-backed async dispatch is Phase 2.

#### 5. No EventBus implementation existed
- **File:** `core/events.py` — **new file**
- **Gap:** EventBus was referenced in architecture docs but not implemented.
- **Fix:** Created minimal `core/events.py` with:
  - `EventBus.publish(event_name, payload, tenant)` — logs event, ready for Celery extension
  - `@listens_to(event_name, module_id)` — marker decorator, Phase 2 auto-registration target

#### 6. Missing tasks.py, listeners.py for accounts and roles
- **Fix:** Created stub files:
  - `accounts/tasks.py` — `task_send_staff_invite_email`, `task_send_staff_reactivated`
  - `accounts/listeners.py` — stubbed `on_tenant_created`, `on_user_login`
  - `roles/tasks.py` — `task_seed_preload_roles`
  - `roles/listeners.py` — stubbed `on_tenant_created` to auto-seed PRELOAD_ROLES

---

## Security Posture: Accounts

| Area | Status |
|------|--------|
| JWT tenant binding (tenant_id claim) | ✅ Implemented |
| JWT tenant signature (HMAC per-tenant secret) | ✅ Implemented |
| Token cross-tenant rejection | ✅ Implemented |
| Login rate throttling | ✅ Implemented |
| 2FA TOTP + backup codes | ✅ Implemented |
| Staff invite — tenant injection prevention | ✅ Fixed |
| TenantMembership create — tenant injection prevention | ✅ Fixed |
| Department FK cross-tenant scoping | ✅ Fixed |
| MeSerializer permission key accuracy | ✅ Fixed |
| Audit logging on login success/failure | ✅ Implemented |
| Audit logging on 2FA enable/disable | ✅ Implemented |
| Superadmin IP allowlist | ✅ Implemented |

---

## Security Posture: Roles

| Area | Status |
|------|--------|
| Role queryset scoped to `self.tenant` | ✅ Implemented |
| `perform_create` injects `tenant=self.tenant` | ✅ Implemented |
| System role name protection | ✅ Implemented |
| Custom permission key validation against PERMISSION_MAP | ✅ Implemented |
| Admin-only access to all role endpoints | ✅ Implemented |

---

## Remaining Gaps

| # | Gap | Priority | Phase |
|---|-----|----------|-------|
| 1 | `TenantMembership` does not prevent owner-role self-demotion (last owner can lock themselves out) | Medium | P1 |
| 2 | No module-level unit test suite for accounts/roles (`accounts/tests/`, `roles/tests/`) | Medium | P1 |
| 3 | EventBus is transitional — no actual async dispatch to listeners | Medium | P2 |
| 4 | `on_tenant_created` listener (auto-seed roles) is commented out | Low | P2 |
| 5 | Password reset endpoint sends plaintext password email — should send a reset link instead | Medium | P2 |

---

## Docker Test Results

```
Ran 12 tests in 1.717s — OK

test_tenant_membership_create_rejects_cross_tenant_body  ✅
test_invite_staff_rejects_cross_tenant_department        ✅
test_me_serializer_permission_keys_match_permission_map  ✅
(+ 9 previously existing tests all pass)
```

---

## Files Changed

| File | Change Type |
|------|-------------|
| `backend/core/events.py` | New — EventBus + listens_to |
| `backend/accounts/serializers.py` | Fix — TenantMembershipSerializer read_only tenant; scoped department queryset; MeSerializer permission keys |
| `backend/accounts/views.py` | Fix — TenantMembershipViewSet.perform_create; EventBus.publish in StaffViewSet |
| `backend/accounts/tasks.py` | New — Celery task stubs |
| `backend/accounts/listeners.py` | New — Event listener stubs |
| `backend/roles/tasks.py` | New — Celery task stubs |
| `backend/roles/listeners.py` | New — Event listener stubs |
| `backend/core/tests/test_security.py` | New tests — 3 accounts/roles regression tests added |
