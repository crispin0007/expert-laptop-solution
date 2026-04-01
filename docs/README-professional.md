# NEXUS BMS

Multi-tenant Business Management SaaS platform for IT and technology service companies.

This README is the operational and engineering guide for the current codebase state.

## System Overview and Objectives

NEXUS BMS is designed to let multiple businesses run isolated workspaces on shared infrastructure.

Core objectives:

1. Provide strict tenant isolation across all business modules.
2. Support end-to-end operations: staff, customers, tickets, projects, inventory, accounting, CMS.
3. Enable modular growth without rewriting the core platform.
4. Maintain production reliability using Docker, PostgreSQL, Redis, Celery, and DRF APIs.

Long-term product vision:

1. Mature into a full modular platform with event-driven cross-module orchestration.
2. Expand module ecosystem cleanly (appointments, CRM, deeper accounting, AI assistant).
3. Preserve backward-compatible APIs for web and mobile clients.
4. Evolve to service decomposition only where scale and ownership boundaries justify it.

## Current Architecture

Current architecture style is a modular Django monolith with asynchronous workers.

Core stack:

1. Backend: Django 5 + Django REST Framework.
2. Database: PostgreSQL 16.
3. Queue and cache: Redis + Celery + Celery Beat.
4. Web frontend: React + Vite.
5. Mobile: React Native (Expo).
6. Deployment: Docker Compose with dedicated web, worker, beat, db, redis services.

Current design characteristics:

1. Tenant resolution via middleware from subdomain/host context.
2. Tenant-scoped models based on shared tenant abstractions.
3. Service-layer logic in some modules, mixed with view/serializer logic in others.
4. Heavy use of Django signals for side effects.
5. Partial event-hook patterns, but no fully active centralized EventBus runtime.

Architectural gaps and limitations identified:

1. Event-driven architecture is partial, not standardized across modules.
2. Service-layer adoption is inconsistent by module.
3. Cross-module side effects are still signal-coupled in several domains.
4. Test coverage for tenant-isolation is uneven across modules.
5. Some modules required recent serializer/service FK hardening for cross-tenant write integrity.

## Feature Overview

Implemented and active capabilities include:

1. Multi-tenant auth, memberships, roles, and permission gating.
2. Customer management with nested contacts and tenant scoping.
3. Staff and department management with role-based access.
4. Ticket lifecycle with SLA, assignment, comments, products, and downstream accounting hooks.
5. Inventory operations: products, stock movements, purchase/return flows, reporting endpoints.
6. Accounting operations: invoices, bills, payments, coins, payslips, reporting.
7. CMS site/page/block/blog/public rendering and AI-generation job pipeline (with stubs/partial flows).

Missing or incomplete functionality:

1. Centralized EventBus implementation and enforced event contracts.
2. Uniform service-first architecture across all modules.
3. Full tenant-isolation integration tests for every write endpoint.
4. Mature domain-level observability for event and side-effect tracing.
5. Some roadmap features remain staged by phase and should not be overbuilt prematurely.

## Engineering Improvements

Performance and scalability improvements:

1. Add targeted indexes based on high-volume tenant + status + date queries.
2. Use selective prefetch/select-related patterns consistently in hot list endpoints.
3. Add request-level and domain-level cache strategy for read-heavy endpoints.
4. Introduce outbox-style async dispatch for reliable event delivery and retries.
5. Expand background task partitioning by queue for workload isolation.

DRY and maintainability improvements:

1. Centralize repeated tenant FK validation helpers by domain.
2. Consolidate duplicated workflow state transition logic in service layer.
3. Standardize serializer validation patterns for tenant ownership and membership checks.
4. Enforce response envelope consistency in all API endpoints.
5. Introduce module-level coding templates (models, services, serializers, views, tests, listeners, tasks).

Code structure improvements:

1. Keep views thin: auth, permission, request validation, service call, response.
2. Move business decisions and side effects into services.
3. Keep serializers for schema and data validation only.
4. Keep signals transitional and minimal where event listeners are not ready.

## Future-Ready Design

Guidelines for adding new modules seamlessly:

1. Register each module through module metadata and capability flags.
2. Define explicit module boundaries and avoid direct cross-module imports.
3. Emit domain events from service layer for cross-module reactions.
4. Introduce listeners in receiving modules, not direct caller dependencies.
5. Keep tenant isolation non-negotiable for every model and query path.

Recommended architecture patterns:

1. Modular monolith as the default operating model.
2. Event-driven integration using standardized event names and payload contracts.
3. Transactional outbox for durable event publication.
4. Idempotent consumer/listener handlers with retry safety.
5. Optional microservice extraction only for proven high-scale bounded contexts.

Design goals:

1. Loose coupling between modules.
2. High cohesion inside each module.
3. Clear ownership of side effects and state transitions.

## Required Upgrades

Immediate technical priorities:

1. Expand tenant-isolation test coverage module-by-module.
2. Complete service-layer migration where business logic still sits in views/serializers.
3. Implement centralized EventBus runtime and event catalogue enforcement.
4. Add robust event observability and failure handling.
5. Harden CI quality gates for security, typing, and architecture rules.

Refactoring priorities:

1. Normalize write-path FK and membership validation patterns across all modules.
2. Remove implicit cross-module coupling through signal-heavy side effects.
3. Introduce module-level integration test suites for IDOR and cross-tenant write attempts.

Tooling and infrastructure upgrades:

1. Add static analysis gates for security hotspots and architectural drift.
2. Add API contract checks and schema regression tests.
3. Add task queue monitoring and dead-letter handling strategy.
4. Add structured logs with correlation IDs across request, task, and domain flows.

## AI Module-by-Module Execution Prompt

Use this standard prompt to harden one module at a time with tests and production readiness gates:

1. [prompts/prompt-4-module-production-hardening.md](../prompts/prompt-4-module-production-hardening.md)

Recommended module order for stabilization:

1. accounts and roles
2. customers
3. departments and staff
4. tickets
5. inventory
6. accounting
7. cms
8. projects
9. notifications

Execution workflow:

1. Pick one module only.
2. Run the prompt with module name and module path filled.
3. Require Docker test execution before marking the module complete.
4. Update module review documentation after each pass.
5. Do not move to next module until current module passes security and test gates.

## Security Considerations

Current security posture:

1. Tenant middleware and scoped queries provide strong baseline isolation.
2. JWT tenant-binding and domain context checks are in place.
3. Recent hardening patches addressed cross-tenant FK linkage risks in multiple modules.

Current security gaps to close:

1. Incomplete endpoint-level tenant-isolation test matrix.
2. Inconsistent validation in legacy write paths outside recently hardened areas.
3. Partial domain verification logic in CMS custom-domain flow.

Security best practices to enforce:

1. Validate ownership of every FK and related object on write operations.
2. Enforce role and module permissions on every endpoint.
3. Sanitize all user-provided HTML before persistence.
4. Keep secrets in environment/config, never in code.
5. Apply least privilege for staff, managers, admins, and super-admin domains.
6. Add auditable logs for sensitive actions and blocked cross-tenant attempts.

## Design for Extensibility

Standards for future modules:

1. Required files: module metadata, models, serializers, views, services, tasks, listeners, tests, admin.
2. Tenant-scoped data models must follow tenant base model conventions.
3. All module APIs must use versioned routes and standard response envelope.
4. All side-effect-causing actions should emit events from service layer.
5. All new events must be registered in the central event catalogue before use.

Conventions to minimize disruption:

1. Backward-compatible API changes only.
2. Additive schema evolution with migrations and safe defaults.
3. Feature flags for staged rollout.
4. Integration tests for cross-module and cross-tenant behavior before release.

## Module Security Review Index

Detailed module reviews and gap analyses are maintained under docs:

1. [docs/README.md](docs/README.md)
2. [docs/ticket/ticket-management-system.md](docs/ticket/ticket-management-system.md)
3. [docs/ticket/ticket-architecture-gap-analysis.md](docs/ticket/ticket-architecture-gap-analysis.md)
4. [docs/users/customers/customers-tenant-security-review.md](docs/users/customers/customers-tenant-security-review.md)
5. [docs/users/staff/staff-tenant-security-review.md](docs/users/staff/staff-tenant-security-review.md)
6. [docs/users/departments/departments-tenant-security-review.md](docs/users/departments/departments-tenant-security-review.md)
7. [docs/inventory/inventory-tenant-security-review.md](docs/inventory/inventory-tenant-security-review.md)
8. [docs/accounting/accounting-tenant-security-review.md](docs/accounting/accounting-tenant-security-review.md)
9. [docs/cms/cms-tenant-security-review.md](docs/cms/cms-tenant-security-review.md)

## Local Development and Runtime

Docker-first workflow:

1. Copy environment file and adjust values.
2. Build and start services.
3. Run migrations and tests inside web container.

Example commands:

```bash
cp .env.example .env
docker compose up --build -d
docker exec nexus_bms-web-1 python manage.py migrate
docker exec nexus_bms-web-1 python manage.py test
```

## Stakeholder Summary

NEXUS BMS already operates as a strong multi-tenant modular platform with core business modules in place. Recent engineering work materially improved tenant write-path safety in customers, departments, inventory, accounting, and CMS. The next maturity step is architecture standardization: complete service-layer consistency, full tenant-isolation test coverage, and centralized event-driven infrastructure for scalable module growth.
