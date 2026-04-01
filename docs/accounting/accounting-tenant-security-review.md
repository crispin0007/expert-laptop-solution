# Accounting Tenant Security and Architecture Review

Date: 2026-04-01
Module: backend/accounting
Phase: 1 (active)

## Executive Summary

Accounting module has solid tenant-scoped query patterns in views/services, but had serializer/service foreign-key validation gaps for cross-tenant write integrity. Those gaps were patched in this update.

- Read/list query scoping is mostly correct.
- Multiple write paths previously allowed cross-tenant FK linking by guessed IDs.
- Cross-tenant ownership validation was added for key accounting serializers and payment service links.
- Accounting remains signal-driven and service-driven, not fully EventBus-driven.

## Tenant Filtering and Security Findings

## 1. View/query tenant scoping

Status: Mostly correct

Evidence:

- Accounting viewsets call `self.ensure_tenant()` and/or service methods with tenant-scoped querysets.
- Coin, payslip, invoice, bill, and payment lists are filtered with `tenant=self.tenant`.

Risk:

- Low for direct cross-tenant read leakage from primary list/retrieve endpoints.

## 2. Cross-tenant FK write integrity

Status: Fixed in current patch

Previous risk:

- Accounting serializers and payment service accepted related object IDs without validating tenant ownership.
- This could allow linking another tenant's customer/invoice/bill/bank account/project/ticket into writes.

Patched items:

- `InvoiceSerializer`: validates `customer`, `ticket`, `project` tenant ownership.
- `BillSerializer`: validates supplier tenant ownership.
- `PaymentSerializer`: validates `invoice`, `bill`, `bank_account` tenant ownership and forbids invoice+bill together.
- `CoinTransactionSerializer`: validates staff membership in current tenant.
- `StaffSalaryProfileSerializer`: validates staff membership in current tenant.
- `PayslipSerializer`: validates staff membership and bank account tenant ownership.
- `record_payment(...)` service: validates invoice/bill/bank_account tenant ownership before create.

Risk:

- Reduced from Medium/High to Low after patch deployment.

## 3. Event-driven architecture status

Status: Partially event-driven (signals), not full EventBus model

Current state:

- Uses services for core business operations.
- Uses Django signals for accounting side effects.

Missing for full target architecture:

- No `EventBus.publish(...)` usage in accounting services.
- No centralized event contract-driven listeners pattern for accounting lifecycle events.

## Missing Features and Gaps

## Security and Integrity

1. Add endpoint-level integration tests for accounting cross-tenant write attempts.
2. Expand tests to cover invoice, bill, payment, payslip, and coin create/update rejection cases.
3. Add service-level guardrails in additional service methods where external FK input is accepted.

## Architecture

1. Introduce EventBus publication in service layer for major lifecycle events.
2. Keep signal pathways minimal and progressively move to explicit event listeners.
3. Standardize event payload fields (`id`, `tenant_id`, decimal fields as string).

## Quality and Testing

1. Add accounting tenant-isolation suite under `backend/accounting/tests/`.
2. Add permission matrix tests for staff/manager/admin behavior.
3. Add regression tests for invalid cross-tenant FK linking in all write serializers.

## Recommended Priority Plan

## P0

1. Deployed in this patch: serializer-level tenant/staff validation for critical accounting writes.
2. Deployed in this patch: payment service tenant-link validation for invoice/bill/bank account.
3. Deployed in this patch: regression tests for accounting cross-tenant FK rejection.

## P1

1. Add endpoint integration tests for all accounting write endpoints.
2. Add missing tenant validation in any remaining write DTOs/services.

## P2

1. Introduce accounting EventBus lifecycle publication and listeners.
2. Add observability metrics/logs for blocked cross-tenant write attempts.

## Conclusion

- Accounting tenant read scoping is mostly in place.
- Cross-tenant FK write-link issues were identified and fixed in this patch.
- Accounting is currently service/signal based, not fully EventBus-driven.
- Next priority is full accounting tenant-isolation test coverage and event architecture alignment.
