# Departments Tenant Security and Architecture Review

Date: 2026-04-01
Module: backend/departments
Phase: 1 (active)

## Executive Summary

Department endpoints are tenant-scoped in views. A department head tenant-integrity gap was identified and fixed in this update.

- Department list/detail/write queries are scoped by request tenant.
- Department head assignment is now validated to ensure active membership in current tenant.
- Departments module is not event-driven yet.
- No department-specific tests currently verify tenant isolation behavior.

## Tenant Filtering and Security Findings

## 1. Department endpoint scoping

Status: Correct

Evidence:

- `DepartmentViewSet.get_queryset()` filters `Department.objects.filter(tenant=self.tenant)`.
- `perform_create()` injects tenant server-side.
- `TenantMixin` protects update operations by re-pinning tenant on save.

Risk:

- Low for direct cross-tenant read/write through primary CRUD route.

## 2. Department head assignment integrity

Status: Fixed in current patch

Previous behavior:

- Serializer accepted any user ID for `head` without tenant membership validation.

Current behavior:

- `DepartmentSerializer.validate_head` checks that selected head is an active `TenantMembership` in current tenant.
- Invalid cross-tenant head assignment now fails validation.

Risk:

- Low after patch deployment.

## Is Departments Module Event-Driven?

Status: Not yet

Findings:

- No `EventBus.publish(...)` in create/update/delete department actions.
- No module listeners/tasks for department lifecycle events.

Recommended events:

- `staff.updated` (when department changes impact staff assignment)
- `department.created` (if added to event catalogue)
- `department.updated` (if added to event catalogue)
- `department.deleted` (if added to event catalogue)

Note:

- Department-specific events are not in the current catalogue. Add them to core event catalogue before use.

## Missing Features and Gaps

## Security and Integrity

1. Add tests for cross-tenant read/update/delete on departments.
2. Add tests for invalid head assignment from another tenant.
3. Add tests for tenant FK tampering attempts on update.

## Architecture

1. Move department business logic into a service layer.
2. Publish department lifecycle events from service layer.
3. Add listeners for dependent modules where needed.

## Quality and Testing

1. Create `backend/departments/tests/` with tenant-isolation coverage.
2. Add permission matrix tests (read all roles, write manager+, delete admin+).
3. Add API envelope consistency tests.

## Recommended Priority Plan

## P0

1. Add department tenant isolation and head-validation regression tests.
2. Verify current fix in CI and production-like environment.

## P1

1. Introduce department service layer.
2. Add event publication and listeners according to catalogue governance.

## P2

1. Improve admin scoping ergonomics for safer operator workflows.
2. Add monitoring for repeated invalid cross-tenant head assignment attempts.

## Conclusion

- Department CRUD tenant filtering is in place.
- Department head cross-tenant integrity gap is fixed in this patch.
- Primary remaining gaps are event-driven architecture and missing test coverage.
