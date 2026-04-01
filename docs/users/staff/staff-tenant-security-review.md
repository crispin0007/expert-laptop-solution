# Staff Tenant Security and Architecture Review

Date: 2026-04-01
Module: backend/accounts (staff endpoints)
Phase: 1 (active)

## Executive Summary

Staff APIs are mostly tenant-scoped at the view level, but there are architecture and coverage gaps.

- Staff list/retrieve/update actions scope memberships by request tenant.
- Cross-tenant department assignment is guarded in staff serializers.
- Staff module is not event-driven yet (no EventBus publish for staff lifecycle).
- No dedicated staff test suite exists for tenant isolation and IDOR regressions.

## Tenant Filtering and Security Findings

## 1. Staff endpoint scoping

Status: Mostly correct

Evidence:

- Staff list and detail actions query `TenantMembership` with `tenant=self.tenant` before resolving users.
- Availability endpoint uses tenant-specific cache key and blocks `tenant=None` requests.
- Tenant membership management viewset filters to current tenant in `get_queryset`.

Risk:

- Low for direct cross-tenant read leakage through current staff view paths.

## 2. Serializer tenant checks

Status: Correct, but defensive patterns can be improved

Evidence:

- `InviteStaffSerializer.validate_department` ensures selected department belongs to current tenant.
- `UpdateStaffSerializer.validate_department` applies same tenant check.

Risk:

- Low for cross-tenant department assignment from staff endpoints.

## 3. Model and architecture gaps

Status: Gaps present

Findings:

- `TenantMembership` is not based on `TenantModel` (project architecture mismatch).
- Staff business logic remains in views/serializers (no dedicated service layer).
- No customer-style event publication for staff lifecycle actions.

Risk:

- Medium architectural risk (maintainability, audit consistency, cross-module reactions).

## Is Staff Module Event-Driven?

Status: Not yet

Findings:

- No `EventBus.publish(...)` calls in staff create/update/deactivate/reactivate/reset-password flows.
- Notification calls are direct/fallback style, not driven by canonical events.

Recommended events:

- `staff.created`
- `staff.updated`
- `staff.deleted` (or deactivated state event)
- `staff.absent` (when feature is active)

## Missing Features and Gaps

## Security and Integrity

1. Add staff-specific tenant isolation tests for list/retrieve/update/deactivate/reactivate.
2. Add explicit tests for cross-tenant user ID probing on staff detail routes.
3. Consider model-level constraints or service-level checks ensuring department/user tenant consistency.

## Architecture

1. Introduce staff service layer and move business logic out of serializers/views.
2. Emit staff lifecycle events from service layer.
3. Add listeners/tasks for downstream reactions (notifications, audit enrichment).

## Quality and Testing

1. Create `backend/accounts/tests/` coverage for staff endpoints.
2. Add regression tests for role assignment and membership updates across tenants.
3. Add API envelope consistency checks for staff endpoints.

## Recommended Priority Plan

## P0

1. Add tenant-isolation tests for staff endpoints.
2. Add IDOR regression tests for staff detail/update actions.

## P1

1. Introduce staff service layer.
2. Publish `staff.created|updated|deleted` events via EventBus.

## P2

1. Align `TenantMembership` model approach with architecture standards.
2. Expand observability/audit metadata on staff lifecycle actions.

## Conclusion

- Staff endpoint tenant filtering is largely correct in current implementation.
- Major remaining gaps are event-driven architecture and missing security test coverage.
- Immediate next step is adding staff-specific tenant isolation tests.
