# CMS Tenant Security and Architecture Review

Date: 2026-04-01
Module: backend/cms
Phase: 3 feature area (currently implemented in this codebase)

## Executive Summary

CMS has strong tenant-scoped access patterns in private views and safe public tenant resolution via middleware context. A concrete cross-tenant integrity gap in blog author assignment was identified and patched in this update.

- Private CMS endpoints consistently scope by request tenant.
- Public endpoints depend on tenant middleware and published-site checks.
- Blog author assignment now enforces active membership in the same tenant.
- CMS uses service + signals, but not a centralized EventBus contract.

## Tenant Filtering and Security Findings

## 1. Private endpoint scoping

Status: Mostly correct

Evidence:

- Page, block, blog, generation job, and domain operations query with `tenant=request.tenant`.
- Nested block routes verify block ownership under page context.
- Draft preview routes are auth-protected and tenant-scoped.

Risk:

- Low for direct cross-tenant read/write via CMS private API paths.

## 2. Public endpoint scoping

Status: Correct with expected constraints

Evidence:

- Public endpoints rely on tenant resolved from host/subdomain middleware.
- Public site/page/blog APIs require published site and published content as applicable.

Risk:

- Low for cross-tenant data leakage from CMS public renderer endpoints.

## 3. Blog author tenant-integrity

Status: Fixed in current patch

Previous behavior:

- Blog create/update could assign `author` without validating tenant membership.

Current behavior:

- CMS service now verifies `author` is an active member of site tenant on create/update.
- Invalid cross-tenant author assignment raises validation error.

Risk:

- Reduced from Medium to Low after patch deployment.

## Is CMS Module Event-Driven?

Status: Partially

Current state:

- Service layer emits internal event hooks via `_fire_event(...)` helper.
- Django signals dispatch async generation/domain tasks.
- Listener stubs exist but centralized EventBus is not active.

Gap:

- Not yet aligned with strict centralized EventBus + event catalogue workflow.

## Missing Features and Gaps

## Security and Integrity

1. Add endpoint-level tests for CMS cross-tenant IDOR on page/block/blog/domain routes.
2. Add regression tests for blog author assignment update path with foreign-tenant user.
3. Improve domain verification flow to enforce TXT ownership checks (not just DNS resolution).

## Architecture

1. Align CMS event emission to centralized EventBus when available.
2. Convert listener stubs to active listeners after EventBus activation.
3. Standardize payloads with `id` + `tenant_id` minimum for all CMS lifecycle events.

## Quality and Testing

1. Create dedicated CMS test suite under `backend/cms/tests/`.
2. Add tests for public endpoint publication gating and tenant isolation.
3. Add tests for generation-job daily limit and failure-state idempotency.

## Recommended Priority Plan

## P0

1. Deployed in this patch: blog author tenant-membership enforcement in service layer.
2. Deployed in this patch: regression test for cross-tenant blog author rejection.

## P1

1. Add CMS API integration tests for tenant isolation and IDOR.
2. Harden custom-domain ownership verification with DNS TXT checks.

## P2

1. Migrate CMS event hooks to centralized EventBus lifecycle.
2. Add observability around blocked cross-tenant write attempts.

## Conclusion

- CMS tenant scoping is generally strong in current implementation.
- Blog author cross-tenant assignment integrity gap is fixed in this patch.
- CMS is service/signal-driven but not yet fully centralized EventBus-driven.
- Next priority is comprehensive CMS test coverage and event architecture alignment.
