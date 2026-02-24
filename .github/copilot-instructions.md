# NEXUS BMS — Copilot Agent Instructions

## What This Project Is
A white-label, multi-tenant Business Management SaaS platform for IT/technology companies.
Businesses buy access and each gets their own isolated workspace (tenant).
Full architecture is documented in `NEXUS BMS/NEXUS_BMS_Phases_Detailed_1` — read it before making decisions.

## Tech Stack
- **Backend:** Django 5 + Django REST Framework
- **Frontend:** React + Vite + TailwindCSS
- **Database:** PostgreSQL 16
- **Cache/Queue:** Redis + Celery
- **Auth:** JWT via SimpleJWT
- **Containerization:** Docker + Docker Compose

## Project Structure
```
nexus-bms/
├── backend/          # Django project
│   ├── config/       # Settings (base, dev, prod)
│   ├── core/         # TenantModel, middleware, base permissions
│   ├── tenants/      # Tenant CRUD, super admin
│   ├── accounts/     # User, TenantMembership, Roles
│   ├── customers/    # Customer management
│   ├── tickets/      # Ticket system, SLA, transfers
│   ├── projects/     # Project + task management
│   ├── inventory/    # Products, stock movements
│   ├── accounting/   # Invoices, ledger, payslip
│   └── notifications/# Email + FCM abstraction
├── frontend/         # React app
│   └── src/
│       ├── features/ # One folder per Django app
│       ├── api/      # Axios + React Query
│       ├── store/    # Zustand global state
│       └── components/
├── NEXUS BMS/
│   └── architecture.md  # Full system architecture — source of truth
└── docker-compose.yml
```

## Core Architecture Rules — Never Break These

### Multi-Tenancy
- Every tenant-scoped model MUST inherit from `TenantModel` (abstract base with `tenant` FK + `TenantManager`)
- TenantManager automatically filters by `request.tenant` — never manually add `.filter(tenant=...)` in views
- Tenant is resolved from subdomain in `TenantMiddleware` and stored in `request.tenant`
- Never expose one tenant's data to another — always verify tenant scope in tests

### API Conventions
- All endpoints live under `/api/v1/`
- Response format: `{ "success": bool, "data": {}, "meta": {}, "errors": [] }`
- All views must use `TenantMixin` + JWT auth + Role permission check
- Use cursor-based pagination, default page_size=25
- Use `django-filter` for all list endpoint filtering

### Models
- Use `TenantModel` as base for all tenant-scoped models
- Always add `created_at`, `updated_at` (auto) and `created_by` (FK to User) on main entities
- Soft delete preferred over hard delete — add `is_deleted` + `deleted_at` fields on critical models
- Never use raw SQL — Django ORM only

### Inventory Hook (Critical)
- When a product is added to a ticket (`TicketProduct`), a `StockMovement(type=out)` is auto-created via Django signal
- When a ticket is cancelled, the stock movement is reversed via signal
- Never manually update `StockLevel` — it is always computed from `StockMovement` aggregation

### Coin System
- Ticket closed → `CoinTransaction(status=pending)` auto-created for assigned staff via signal
- Admin approves/rejects from coin approval queue
- Approved coins accumulate in payslip for the current period
- `coin_to_money_rate` is set per tenant by the tenant admin

### VAT
- Nepal VAT = 13% (default)
- VAT is toggled per tenant via `Tenant.vat_enabled`
- Never hardcode VAT rate — always read from `tenant.vat_rate`
- VAT breakdown must appear separately on all invoices

## Django Coding Standards
- Class-based views using DRF `ModelViewSet` or `GenericAPIView`
- Serializers in `serializers.py`, business logic in `services.py`, signals in `signals.py`
- Never put business logic in views or serializers — use service functions
- Always write tests in `tests/` folder per app using `pytest-django` + `factory_boy`
- Settings split: `config/settings/base.py`, `dev.py`, `prod.py`

## React Coding Standards
- One feature folder per backend app under `src/features/`
- API calls via Axios instance in `src/api/` — never use fetch directly
- Server state via React Query (`useQuery`, `useMutation`)
- Global UI state via Zustand store
- TailwindCSS only for styling — no inline styles, no CSS modules
- No `any` types if using TypeScript

## Current Build Phase
**Phase 1 — IN PROGRESS**
Sprint order:
1. Django setup, Docker, Tenant middleware, Auth + JWT, Role system
2. Customer management, Staff management, Departments, Staff availability
3. Ticket Types + SLA, Ticket CRUD, Assignment + Transfer, Comments
4. Ticket products (inventory hook), Coin system, Invoice generation, Email notifications
5. Project CRUD, Tasks, Milestones, Project invoice, Push notifications (FCM)
6. React frontend — Auth, Dashboard, Ticket UI, Project UI

Do NOT build Phase 2 (Inventory), Phase 3 (CMS), or Phase 4 (Accounting) features yet.
Stub out hooks and flags for them, but no full implementation.

## What "Done" Means for Any Feature
- Django model + migration created
- DRF serializer + viewset created
- URL registered in `api/v1/urls.py`
- Permissions checked in view
- Unit tests written and passing
- Documented in inline docstrings

## Notifications
- Email via `notifications/email.py` — wraps Django email backend (SMTP, configurable per tenant)
- Push via `notifications/push.py` — wraps Firebase FCM
- Never send email/push directly from views or signals — always call notification service functions
- All notification triggers are async via Celery tasks

## Do Not Do
- Do not use `request.user.tenant` — always use `request.tenant` from middleware
- Do not hardcode tenant IDs, VAT rates, coin rates, or currency
- Do not skip `TenantMixin` on any viewset
- Do not generate migrations without reviewing them first
- Do not add frontend dependencies without checking if React Query or Zustand already covers the need
- Do not build customer portal features (flagged for future, not Phase 1)
- Do not integrate payment gateways (stub only — eSewa, Khalti, Stripe adapters exist but inactive)