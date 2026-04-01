# Inventory Tenant Security and Architecture Review

Date: 2026-04-01
Module: backend/inventory
Phase: 1 (active)

## Executive Summary

Inventory endpoints are tenant-scoped at the view/query level, but serializer-level foreign key validation had cross-tenant write risks. Those risks were patched in this update.

- Read/list query scoping is generally correct in inventory viewsets.
- Multiple write serializers previously accepted foreign keys from other tenants.
- Cross-tenant serializer validation was added for key inventory write paths.
- Inventory architecture is signal-driven but not fully EventBus-driven.

## Tenant Filtering and Security Findings

## 1. View/query tenant scoping

Status: Mostly correct

Evidence:

- Inventory viewsets call `self.ensure_tenant()` and filter querysets with `tenant=self.tenant`.
- Critical movement/order/report queries are tenant-scoped in view logic.

Risk:

- Low for direct cross-tenant read leakage in main list/retrieve endpoints.

## 2. Cross-tenant write integrity via foreign keys

Status: Fixed in current patch

Previous risk:

- Several write serializers accepted related object IDs without tenant ownership checks.
- This could allow linking another tenant's records into current-tenant writes if IDs were known.

Patched serializers:

- Product serializer: validates `category` and `uom` tenant ownership.
- PurchaseOrder write serializer: validates supplier and nested item products belong to current tenant.
- ProductVariant serializer: validates parent product tenant ownership.
- ReturnOrder write serializer: validates supplier, purchase order, and nested item products.
- SupplierProduct serializer: validates supplier and product tenant ownership.
- StockCount write serializer: validates category tenant ownership.

Risk:

- Reduced from Medium/High to Low after deployment of this patch.

## 3. Inventory-specific security design notes

- Stock levels are computed from stock movements and guarded through scoped movement creation.
- Signals update stock levels and handle ticket-cancellation reversals.
- Signal pathways still rely on cross-module model usage, not EventBus contracts.

## Is Inventory Module Event-Driven?

Status: Partially, but not fully event-driven

Current state:

- Uses Django signals for stock-level updates and side effects.
- Uses notifications service calls for status-change notifications.

Missing for full event-driven architecture:

- No explicit `EventBus.publish(...)` from inventory service layer.
- No formal inventory listeners based on centralized event catalogue contracts.
- No outbox/event contract governance in runtime path.

## Missing Features and Gaps

## Security and Integrity

1. Add endpoint-level regression tests for cross-tenant write attempts in inventory APIs.
2. Add tests covering `return-orders`, `supplier-products`, `stock-counts`, and `purchase-orders` write validation.
3. Consider model-level tenant-consistency assertions where feasible.

## Architecture

1. Move business logic from view actions into inventory service layer methods.
2. Publish inventory domain events from services (using event catalogue governance).
3. Keep signals as transitional adapters where needed, then reduce direct cross-module coupling.

## Quality and Testing

1. Create dedicated inventory test suite for tenant isolation and permissions.
2. Add tests for low-stock/report endpoints with tenant boundaries.
3. Add contract tests for signal side effects and movement/stock consistency.

## Recommended Priority Plan

## P0

1. Deployed in this patch: serializer tenant-ownership validation across critical write paths.
2. Deployed in this patch: regression tests for cross-tenant serializer rejection.

## P1

1. Add inventory endpoint integration tests for cross-tenant access and IDOR attempts.
2. Add inventory service layer and migrate write actions out of views.

## P2

1. Introduce inventory event publication/listeners under centralized event governance.
2. Add observability on failed/blocked cross-tenant write attempts.

## Conclusion

- Inventory read scoping is generally in place.
- Cross-tenant write-link risks in serializers were identified and fixed in this patch.
- Inventory is currently signal-driven, not fully EventBus-driven.
- Next priority is robust inventory test coverage and service/event architecture alignment.
