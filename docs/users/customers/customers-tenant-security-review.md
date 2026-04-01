# Customers Tenant Security and Architecture Review

Date: 2026-04-01
Module: `backend/customers`
Phase: 1 (active)

## Executive Summary

Customer list/detail endpoints are tenant-scoped. A write-path gap in nested contact creation was identified and patched in this update.

- Read isolation for `Customer` is mostly correct.
- `CustomerContact` create path is now protected against cross-tenant parent-customer access.
- `customers` module is not yet event-driven.
- Tenant isolation tests were expanded for nested contact create IDOR.

## Ticket Docs Reorganization

Ticket docs were moved to:

- `docs/ticket/ticket-management-system.md`
- `docs/ticket/ticket-architecture-gap-analysis.md`

## Tenant Filtering and Security Findings

## 1. Customer model and list/detail scoping

Status: Mostly correct

Evidence:

- `Customer` and `CustomerContact` inherit `TenantModel`.
- Customer list/detail queryset in `CustomerViewSet.get_queryset()` filters:
  - `Customer.objects.filter(tenant=self.tenant, is_deleted=False)`
- Main cross-tenant read test exists:
  - `backend/core/tests/test_security.py::CrossTenantIDORTest.test_cannot_read_other_tenant_customer`

Risk:

- Low for direct customer read leakage from this endpoint implementation.

## 2. Nested customer contacts create path

Status: Fixed in current patch

Evidence:

- `CustomerContactViewSet.get_queryset()` is tenant-safe for read operations:
  - filters by `customer_id=self.kwargs['customer_pk']` and `customer__tenant=self.tenant`
- Previous behavior:
  - `serializer.save(customer_id=self.kwargs['customer_pk'])`
  - Missing parent ownership check and missing tenant injection.
- Current behavior:
  - Verifies parent customer exists in current tenant before create.
  - Saves with `serializer.save(customer=customer, tenant=self.tenant)`.

Impact:

- Cross-tenant parent-customer contact create is now blocked.
- New contacts now persist with tenant set explicitly.

Risk:

- Low after patch (assuming deployment of this change).

## 3. Serializer fallback behavior

Status: Potentially unsafe fallback path

Evidence:

- In `CustomerSerializer.validate()`, when tenant context is missing:
  - `qs = Customer.objects.filter(tenant__isnull=True, is_deleted=False)`

Impact:

- This does not directly leak tenant data on normal API requests.
- It can hide bugs by allowing validation logic to run against null-tenant records instead of failing fast.

Risk:

- Medium (defense-in-depth gap and data hygiene risk).

## Is Customers Module Event-Driven?

Status: Not yet

Findings:

- No `services.py` business layer is used by customer views.
- No `EventBus.publish(...)` in create/update/delete flows.
- No `listeners.py` for customer lifecycle handling.

Architecture mismatch vs project rules:

- Current implementation is view-centric CRUD.
- Required architecture says service layer should own business logic and event publication.

## Missing Features and Gaps

## Security

1. Keep nested contacts create/update enforcing parent customer belongs to `request.tenant`.
2. Keep contact create/update persisting `tenant=request.tenant`.
3. Add/maintain tests for:
   - cross-tenant contact create should return 404/403,
   - cross-tenant contact retrieve/update/delete should fail,
   - contact rows must always persist with tenant set.

## Architecture

1. Move customer business logic to `customers/services.py`.
2. Publish catalogue events from service layer:
   - `customer.created`
   - `customer.updated`
   - `customer.deleted`
3. Standardize payload minimum:
   - `id`, `tenant_id` (and extra fields as needed).

## Data and Quality

1. Remove or hard-fail serializer fallback for `tenant is None` in tenant-scoped APIs.
2. Add module-level tests for list/search/update/delete tenant isolation.
3. Add audit logs for customer create/update/delete if not already centralized.

## Recommended Priority Plan

## P0 (Immediate)

1. Deployed in this patch: `CustomerContactViewSet.create()` tenant ownership validation and tenant injection.
2. Deployed in this patch: regression test for nested contact create IDOR.

## P1 (Next sprint)

1. Introduce `customers/services.py`.
2. Move create/update/delete logic from views into service.
3. Emit `customer.created|updated|deleted` events from service layer.

## P2 (Hardening)

1. Expand test matrix for filters (`search`, `minimal`, soft-deleted behavior).
2. Add observability: log suspicious `customer_pk` cross-tenant probes.

## Conclusion

- Customer read scoping is mostly in place.
- Nested contact create cross-tenant write gap is fixed in this patch.
- The module is currently not event-driven and has service-layer gaps against architecture standards.
- Next priority should be event-driven/service-layer alignment and broader test coverage.
