# NEXUS BMS — Complete System Memory
# Last Updated: 2026-04-04
# Purpose: Full institutional memory for Claude/Copilot agents working on this codebase

---

## 1. WHAT THIS SYSTEM IS

**NEXUS BMS** (also branded as TechYatra BMS) is a white-label, multi-tenant Business Management SaaS platform for IT/technology service companies in Nepal. Businesses buy access and each gets their own isolated workspace (tenant) identified by subdomain (e.g., `acme.bms.techyatra.com.np`).

- **Target market:** IT repair shops, CCTV/AC installers, tech product sellers — Nepal first, globally extensible
- **Multi-tenancy:** Subdomain-per-tenant, single PostgreSQL DB, `tenant_id` isolation on every table
- **Phase:** Phase 1 is COMPLETE and deployed. Phase 2 (Inventory+ / CRM) and Phase 3 (CMS + AI) exist as live but partially-stubbed modules
- **Git remote:** `github.com:crispin0007/expert-laptop-solution.git` — branch `main`
- **Latest commit:** `8ea3e87` — feat(hrm): shift-aware attendance
- **Total commits:** 140

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Backend | Django 5 + Django REST Framework |
| Frontend | React + Vite + TailwindCSS |
| Mobile | React Native (Expo) |
| Database | PostgreSQL 16 |
| Cache / Queue | Redis + Celery + Celery Beat |
| Auth | JWT via SimpleJWT + 2FA (TOTP) |
| Containerization | Docker + Docker Compose |
| Reverse Proxy | Caddy (auto SSL, wildcard subdomains + on-demand TLS for custom domains) |
| AI Providers | Gemini Flash (free tier) + Claude API (premium tasks) — backend only |
| Push Notifications | Firebase FCM (web + mobile) |
| Email | SMTP per-tenant configurable |

### Docker containers (production):
- `nexus_bms-frontend-1` — Nginx serving React build
- `nexus_bms-web-1` — Django Gunicorn (healthy)
- `nexus_bms-celery-1` — Celery worker
- `nexus_bms-celery-beat-1` — Celery Beat scheduler
- `nexus_bms-db-1` — PostgreSQL 16 (healthy)
- `nexus_bms-redis-1` — Redis

---

## 3. CORE ARCHITECTURE RULES (NEVER BREAK)

### Multi-Tenancy
- Every tenant-scoped model MUST inherit `TenantModel` — never `models.Model` directly
- `TenantManager` auto-scopes to `request.tenant` — never call `.filter(tenant=...)` in views
- Tenant resolved from subdomain in `TenantMiddleware` → stored as `request.tenant`
- **Never** use `request.user.tenant` — always `request.tenant`
- `tenant` is NEVER accepted from request body — always injected server-side

```python
# WRONG
MyModel.objects.filter(status='active')
# CORRECT
MyModel.objects.for_tenant(request.tenant).filter(status='active')
```

### API Response Envelope
All responses use `ApiResponse.success()` / `ApiResponse.error()`:
```json
{ "success": true, "data": {}, "meta": {}, "errors": [] }
```

### Business Logic Layers
```
View (validate + permissions) → Service (business logic + EventBus + AuditLog) → Repository (complex queries) → Model (data only)
```

### Event-Driven Architecture
Modules communicate ONLY via `EventBus.publish()` — never import another module's models at top level. Lazy imports inside listeners are OK.

### VAT (Nepal)
- Default 13%, always read from `request.tenant.vat_rate` — never hardcoded
- Toggle per tenant via `request.tenant.vat_enabled`
- VAT breakdown always shown separately on invoices

### Notifications
Always via `NotificationService.send()` — never raw FCM/email/WhatsApp calls from views
Always include deep link `data = {'type': '[module]', 'id': str(id), 'action': 'view'}`

---

## 4. PROJECT STRUCTURE

```
nexus-bms/
├── backend/
│   ├── config/           # Django settings (base, dev, prod), urls.py, urls_v1 (inline), celery.py
│   ├── core/             # TenantModel, TenantManager, TenantMiddleware, EventBus, ModuleRegistry, permissions, audit
│   ├── tenants/          # Tenant CRUD, Plan, Module, TenantModuleOverride, subscription, module gating
│   ├── accounts/         # User, TenantMembership, Roles, 2FA/TOTP, devices, staff availability
│   ├── customers/        # Customer, CustomerContact
│   ├── tickets/          # TicketType, Ticket, SLA, TicketProduct, Transfer, Comment, Timeline, Vehicle, VehicleLog
│   ├── projects/         # Project, Milestone, Task, ProjectProduct, ProductRequest, MemberSchedule, Attachment
│   ├── inventory/        # Product, Category, UoM, StockMovement, StockLevel, Supplier, PurchaseOrder, Returns, Variants, StockCount
│   ├── accounting/       # Full double-entry: Account, JournalEntry, Invoice, Bill, Payment, CreditNote, Payslip, Coin, Expense, FiscalYear, FixedAsset, BankRecon, Depreciation...
│   ├── notifications/    # Notification, NotificationPreference, FCMDevice
│   ├── departments/      # Department, head FK
│   ├── roles/            # Role, permissions JSON
│   ├── hrm/              # LeaveType, LeaveBalance, LeaveRequest, StaffProfile, AttendancePolicy, AttendanceRecord, Shift, ShiftAssignment
│   ├── cms/              # CMSSite, CMSPage, CMSBlock (16 block types), BlogPost, ContactSubmission, PublishedVersion
│   └── ai_assistant/     # Phase 3 stub only — empty models
├── frontend/src/features/
│   ├── auth/             # Login, 2FA verify
│   ├── dashboard/        # Admin dashboard with stats
│   ├── tickets/          # TicketListPage, TicketDetailPage, CreateTicketWizard, TicketTypeManagementPage
│   ├── projects/         # ProjectDetailPage, project list
│   ├── customers/        # Customer CRM
│   ├── staff/            # StaffProfileDrawer
│   ├── inventory/        # InventoryPage (12 tabs, ~4276 lines)
│   ├── accounting/       # AccountingPage (10470 lines, full CoA + journal + invoices + payroll + reports), CoinsPage
│   ├── hrm/tabs/         # HrmDashboard, StaffDirectory, AttendanceTab, LeaveTab, ShiftTab, ReportsTab, LeaveSettingsPane
│   ├── cms/              # PageBlockManager, public/Blocks.tsx
│   ├── reports/          # ReportsPage (2312 lines)
│   ├── settings/         # SettingsPage (1628 lines, smtp/branding/vat/coin)
│   ├── departments/      # Departments UI
│   ├── roles/            # RBAC roles UI
│   ├── admin/            # TenantDetailPage (super admin)
│   └── upgrade/          # Plan upgrade UI
├── mobile/
│   └── src/features/     # auth, dashboard, customers, staff, tickets, projects, inventory, accounting, departments, roles, settings, notifications, cms
│   └── app/(app)/        # accounting, cms, departments, inventory, notifications, profile, roles, settings, staff, tickets
└── nginx/, docker-compose.yml, docker-compose.prod.yml, Caddyfile
```

---

## 5. ALL BACKEND MODULES — STATUS AND MIGRATIONS

| Module | Migrations | Status | Key Models |
|---|---|---|---|
| `core` | 8 | COMPLETE | TenantModel, TenantManager, TenantMiddleware, EventBus, next_seq, AuditLog |
| `tenants` | 19 | COMPLETE | Tenant, Plan, Module, TenantModuleOverride, TenantSmtpConfig, SlugReservation |
| `accounts` | 8 | COMPLETE | User (AbstractUser), TenantMembership, Device, StaffAvailability |
| `customers` | 7 | COMPLETE | Customer, CustomerContact |
| `departments` | 2 | COMPLETE | Department |
| `roles` | 3 | COMPLETE | Role (permissions as JSON) |
| `tickets` | 16 | COMPLETE | TicketCategory, TicketSubCategory, TicketType, Ticket, TicketSLA, TicketComment, TicketAttachment, TicketTransfer, TicketTimeline, TicketProduct, Vehicle, VehicleLog |
| `projects` | 12 | COMPLETE | Project, ProjectMilestone, ProjectTask, ProjectProduct, ProjectProductRequest, ProjectMemberSchedule, ProjectAttachment |
| `inventory` | 11 (latest: 0006) | COMPLETE | UnitOfMeasure, Category, Product, ProductImage, StockMovement, StockLevel, Supplier, PurchaseOrder, PurchaseOrderItem, ProductVariant, VariantStockLevel, ReturnOrder, ReturnOrderItem, SupplierProduct, StockCount, StockCountItem |
| `accounting` | 31 | COMPLETE | AccountGroup, Account, BankAccount, JournalEntry, JournalLine, CoinTransaction, StaffSalaryProfile, Payslip, Invoice, Bill, Payment, CreditNote, Quotation, DebitNote, TDSEntry, BankReconciliation, Expense, CostCentre, FiscalYearClose, PaymentAllocation, RecurringJournal, Currency, ExchangeRate, FixedAsset |
| `notifications` | 3 | COMPLETE | Notification, NotificationPreference, FCMDevice |
| `hrm` | 6 (latest: 0006_shift_work_days) | COMPLETE | LeaveType, LeaveBalance, LeaveRequest, StaffProfile, AttendancePolicy, AttendanceRecord, Shift, ShiftAssignment |
| `cms` | 6 | LIVE (Phase 3) | CMSSite, CMSPage, CMSBlock (16 types), BlogPost, ContactSubmission, PublishedVersion |
| `ai_assistant` | — | STUB | Empty — Phase 3 |

---

## 6. ACCOUNTING MODULE — DEEP DETAIL

The accounting module is the most complex. 31 migrations. 1937-line models.py. 12 service files.

### Service Files
| Service | Purpose |
|---|---|
| `journal_service.py` (1689 lines) | Double-entry journal creation, seed CoA, `_make_entry()` |
| `report_service.py` (3244 lines) | P&L, Balance Sheet, Trial Balance, cash flow |
| `invoice_service.py` (577 lines) | Invoice CRUD, issue, void, generate PDF |
| `ticket_invoice_service.py` (349 lines) | Generate invoice from ticket |
| `bill_service.py` (300 lines) | Supplier bills CRUD |
| `payment_service.py` (215 lines) | Payments — incoming/outgoing |
| `payslip_service.py` (384 lines) | Payroll, TDS, coin integration |
| `coin_service.py` (220 lines) | Coin queue, approve/reject, accumulate in payslip |
| `expense_service.py` (291 lines) | Staff expenses |
| `credit_note_service.py` (130 lines) | Credit/debit notes |
| `fiscal_year_service.py` (161 lines) | Fiscal year open/close, BS year-end |
| `depreciation_service.py` (147 lines) | Fixed asset depreciation (straight-line) |

### Chart of Accounts (Auto-Seeded Per Tenant)
```
1000 Assets
  1100 Cash
  1200 Accounts Receivable  ← linked to all invoices
  1300 Inventory Asset       ← COGS counterpart

2000 Liabilities
  2100 Accounts Payable
  2200 VAT Payable           ← Nepal 13% VAT
  2300 TDS Payable           ← Tax Deducted at Source

3000 Equity
  3100 Retained Earnings

4000 Revenue
  4100 Service Revenue
  4200 Product Revenue

5000 Expenses
  5100 Cost of Goods Sold
  5200 Salary Expense
  5300 Other Expenses
```

### Journal Entry Auto-Creation (via Django Signals)
| Trigger | Journal Created |
|---|---|
| Invoice issued | Dr 1200 AR / Cr 4100-4200 Revenue / Cr 2200 VAT |
| Invoice voided | Reversal of above |
| Bill approved | Dr 5300 Expense + Dr 2200 VAT / Cr 2100 AP |
| Payment received | Dr Cash/Bank / Cr 1200 AR |
| Payment sent | Dr 2100 AP / Cr Cash/Bank |
| Payslip paid | Dr 5200 Salary / Cr 2300 TDS + Cr Cash/Bank (net) |
| COGS (product sold) | Dr 5100 COGS / Cr 1300 Inventory |
| Credit note issued | Dr 4100-4200 Revenue + Dr 2200 VAT / Cr 1200 AR |

### Coin System
- Ticket close → `CoinTransaction(status=pending)` auto-created via signal
- Task completion → `CoinTransaction(status=pending)` via signal
- Admin approves/rejects from coin queue
- Approved coins accumulate in payslip for current pay period
- `coin_to_money_rate` set per tenant — never hardcoded
- Coins included in `gross_salary` in payslip journal entry

---

## 7. INVENTORY MODULE — DEEP DETAIL

### Stock Level Architecture
- `StockLevel` is **NEVER written directly** — all stock changes go through `StockMovement`
- `StockMovement.post_save` signal computes delta and updates `StockLevel` atomically
- ADJUSTMENT type movements skip signal — handled by `StockCount.complete()` directly
- `TicketProduct` created → `StockMovement(type=OUT)` via signal
- Ticket cancelled → `StockMovement(type=RETURN)` reversal via signal
- Invoice issued with product lines → `StockMovement(type=OUT)` via EventBus listener

### Stock Count Flow
```
draft → start() [snapshots StockLevel into items] → count_item PATCH → complete() [atomic: creates ADJUSTMENT movements + updates StockLevel via F expressions] | cancel()
```

### Cross-Module Links
- `TicketProduct.product` → `inventory.Product` FK
- `ProjectProduct.product` → `inventory.Product` FK
- `ProjectProductRequest` → approval workflow that upserts `ProjectProduct`

---

## 8. HRM MODULE — DEEP DETAIL

### Models
- `LeaveType` — customizable leave types per tenant
- `LeaveBalance` — per-staff, per-type balance tracking
- `LeaveRequest` — leave applications with approve/reject workflow
- `StaffProfile` — extended profile linked to TenantMembership
- `AttendancePolicy` — work hours, OT rules, break rules per tenant
- `AttendanceRecord` — daily clock-in/out records with computed fields
- `Shift` — named shift with timing + `work_days: JSONField` (NEW in migration 0006)
- `ShiftAssignment` — assigns shifts to staff

### `Shift.work_days` Field (Migration 0006)
Added in session: `work_days = JSONField(default=list)` storing Python `weekday()` integers.
Nepal default work days: `[0, 1, 2, 3, 4, 6]` (Mon–Fri + Sun).
- Migration `0006_shift_work_days` — **APPLIED** to `nexus_bms-web-1`

### Attendance Service (`attendance_service.py`, 731 lines)
| Method | What It Does |
|---|---|
| `clock_in()` | Records entry, captures active shift |
| `clock_out()` | Records exit, computes work_hours, OT, early exit |
| `manual_mark()` | Admin force-mark + snapshots active shift onto record |
| `get_monthly_report()` | Per-staff monthly summary — returns `working_days` (shift-aware) |
| `get_deduction()` | Late deduction calc — uses shift's `work_days` for working day count + shift timing for per-minute rate |
| `_count_working_days()` | NEW helper — counts weekdays in date range matching `work_days` list |

### HRM Frontend Tabs
- `HrmDashboard.tsx` — summary cards
- `StaffDirectory.tsx` — staff list with profile drawer
- `AttendanceTab.tsx` — today's status, weekly summary, manual mark panel (fixed), not_recorded chip
- `LeaveTab.tsx` — leave requests + approval
- `ShiftTab.tsx` — shift CRUD with weekday picker + working day chips
- `ReportsTab.tsx` — monthly/daily reports with shift_name display, working_days StatCard
- `LeaveSettingsPane.tsx` — leave type configuration

### HRM Frontend Fixes Applied (Most Recent Session)
1. **`working_days` field name mismatch**: Backend returns `working_days`, frontend now reads it correctly (`working_days ?? total_days` fallback)
2. **Dead Manual Mark button**: Was setting `staffId: 0` so modal never opened. Fixed with `showManualPicker` state + inline staff/date picker panel
3. **`shift_name` missing**: Added to `DailyRecord`, `MonthlyRecord`, `TodayRecord` interfaces and rendered in tables
4. **`not_recorded` missing**: Added to `AttendanceSummary` interface, rendered as chip when `> 0`
5. **`work_days` in ShiftTab**: Added to `Shift` interface, weekday checkbox form, day chips on cards

---

## 9. CMS MODULE — DETAIL

### Status: LIVE (Phase 3 features available but experimental)

### Models
- `CMSSite` — one website per tenant, has domain, theme, SEO, analytics
- `CMSPage` — pages (home, about, contact, etc.)
- `CMSBlock` — 16 block types: hero, text, services, gallery, testimonials, cta, contact_form, pricing, team, faq, html, video, stats, newsletter, product_catalog, blog_preview
- `BlogPost` — blog entries with publish/draft
- `ContactSubmission` — form submissions from public site
- `PublishedVersion` — snapshot of published site

### Services (`services.py`, 1287 lines)
- AI generation via Claude API (server-side only — never frontend)
- GrapeJS drag & drop block editing
- Public renderer endpoint
- Custom domain support via Caddy on-demand TLS

### Frontend
- `PageBlockManager.tsx` (1280 lines) — block editor
- `cms/public/Blocks.tsx` (847 lines) — public renderer components

### Security
- All AI-generated HTML sanitized with `bleach` before storing
- Claude/Gemini API keys backend-only — environment variables only

---

## 10. TICKETS MODULE — DETAIL

### Models
- `TicketCategory`, `TicketSubCategory` — classification hierarchy
- `TicketType` — e.g., Repair, Installation, Support (configurable per tenant)
- `Ticket` — core entity with: ticket_number, type, customer, title, description, status, priority, assigned_to, department, created_by, sla_deadline, parent_ticket
- `TicketSLA` — SLA tracking, breach detection
- `TicketProduct` — parts/products used in ticket (linked to inventory)
- `TicketTransfer` — department transfer log
- `TicketComment` — internal/external comments with attachments
- `TicketTimeline` — audit trail of all status changes
- `Vehicle`, `VehicleLog` — vehicle tracking for field service tickets

### Frontend
- `TicketListPage.tsx` (816 lines) — list with advanced filters (type, category, party name, created by, date range)
- `TicketDetailPage.tsx` (2276 lines) — full ticket detail with tabbed sub-sections
- `CreateTicketWizard.tsx` (1284 lines) — multi-step ticket creation wizard
- `TicketTypeManagementPage.tsx` (1062 lines) — ticket type + SLA admin

### Service (`ticket_service.py`, 774 lines)
- `create()`, `update()`, `assign()`, `transfer()`, `close()`, `reopen()`
- On close: fires `ticket.closed` → triggers coin queue creation via signal
- SLA deadline auto-computed from `TicketType.default_sla_hours`

---

## 11. PROJECTS MODULE — DETAIL

### Models
- `Project` — title, customer, status, budget, start/end dates
- `ProjectMilestone` — named milestones with due dates
- `ProjectTask` — tasks with assignee, due date, estimated hours, status
- `ProjectProduct` — products/parts allocated to project
- `ProjectProductRequest` — approval workflow for product requests
- `ProjectMemberSchedule` — member schedule/availability for project
- `ProjectAttachment` — file attachments

### Frontend
- `ProjectDetailPage.tsx` (1947 lines) — full project view with tasks, milestones, products, schedule

### Service (`services.py`, 215 lines)
- Fires `project.created`, `project.completed` events
- On complete: EventBus triggers inventory stock movement for project products

---

## 12. EVENT CATALOGUE AND ACTIVE LISTENERS

### Active EventBus Listeners

| Listener File | Event → Action |
|---|---|
| `notifications/listeners.py` | `ticket.assigned/status.changed/comment.added/overdue` → push/in-app |
| `notifications/listeners.py` | `invoice.sent/paid` → email/in-app |
| `notifications/listeners.py` | `inventory.stock.low` → push |
| `notifications/listeners.py` | `task.assigned/completed` → push/in-app |
| `notifications/listeners.py` | `staff.created` → welcome in-app |
| `inventory/listeners.py` | `invoice.sent` → `StockMovement(OUT)` per invoice product line |
| `inventory/listeners.py` | `invoice.cancelled` → reverses invoice OUT movements |
| `inventory/listeners.py` | `project.completed` → `StockMovement(OUT)` per `ProjectProduct` |
| `inventory/listeners.py` | `project.cancelled` → reverses project OUT movements |
| `tickets/listeners.py` | `customer.deleted` → detach customer from open tickets |
| `tickets/listeners.py` | `staff.deleted` → unassign staff from open tickets |
| `departments/listeners.py` | `staff.deleted` → clear department head FK |

### Django Signals (Intra-module, NOT EventBus)

| Signal | Action |
|---|---|
| `inventory/signals.py` | `TicketProduct.post_save` → `StockMovement(OUT)` |
| `inventory/signals.py` | `StockMovement.post_save` → recompute `StockLevel` |
| `accounting/signals.py` | `Ticket.cancelled` → reject pending `CoinTransactions` |
| `accounting/signals.py` | `Invoice.issued` → journal entry (Dr AR / Cr Revenue) |
| `accounting/signals.py` | `Invoice.void` → reversal journal entry |
| `projects/signals.py` | `Task.done` → create pending `CoinTransaction` |
| `tenants/signals.py` | `Tenant.post_save` → `seed_chart_of_accounts(tenant)` |

### Stubbed Listeners (Uncomment When Phase Begins)

| File | Event | Phase |
|---|---|---|
| `inventory/listeners.py` | `cms.order.placed` → stock out | Phase 3 |
| `accounting/listeners.py` | `ticket.resolved` → auto draft invoice | Phase 2 |
| `accounting/listeners.py` | `project.completed` → auto draft invoice | Phase 2 |
| `projects/listeners.py` | `deal.won` → auto-create project | Phase 2 |
| `roles/listeners.py` | `tenant.created` → seed preload roles | Phase 2 |

### EventBus Architecture Note
EventBus is **synchronous** in Phase 1. Phase 2 will replace `_dispatch()` with Celery — all call sites will remain unchanged. `EventBus.publish()` is called ONLY from the service layer — never from views, signals, or serializers.

---

## 13. FRONTEND — STATUS AND STRUCTURE

### Tech
- React + Vite + TailwindCSS
- TanStack Query (React Query v5) — server state
- Zustand — global UI state (auth, tenant, preferences)
- Axios via `apiClient` — never raw `fetch()`
- All form validation via Zod
- Lucide React icons — **no emojis ever**

### 66 frontend TSX files across 16 feature folders

### Major Pages by Line Count
| File | Lines |
|---|---|
| `accounting/AccountingPage.tsx` | 10,470 |
| `inventory/InventoryPage.tsx` | 4,276 |
| `reports/ReportsPage.tsx` | 2,312 |
| `tickets/TicketDetailPage.tsx` | 2,276 |
| `projects/ProjectDetailPage.tsx` | 1,947 |
| `settings/SettingsPage.tsx` | 1,628 |
| `tickets/CreateTicketWizard.tsx` | 1,284 |
| `cms/PageBlockManager.tsx` | 1,280 |
| `tickets/TicketTypeManagementPage.tsx` | 1,062 |
| `accounting/CoinsPage.tsx` | 795 |
| `tickets/TicketListPage.tsx` | 816 |

### Total frontend feature code: ~44,905 lines

### Settings Page Tabs
- Branding (logo, primary colour)
- SMTP (per-tenant email config + test send)
- VAT (toggle + rate)
- Coin rate
- Subscription/plan
- Module management

---

## 14. MOBILE APP — STATUS AND STRUCTURE

### Tech
- React Native (Expo)
- Expo Router (file-based routing)
- TanStack Query for server state
- Zustand for auth/tenant state
- Expo Notifications for push (FCM)

### 38 mobile TypeScript/TSX files

### Screens Built
| Screen | Status |
|---|---|
| Login + 2FA verify | Complete |
| Dashboard | Complete |
| Tickets (list + new) | Complete |
| Staff (list + detail) | Complete |
| Inventory (3-tab: Products, Low Stock, Movements) | Complete (read-only) |
| Accounting | Complete |
| Departments | Complete |
| Roles | Complete |
| Notifications | Complete |
| Profile + 2FA setup | Complete |
| Settings | Complete |
| CMS | Stub |

### Mobile API Standards Applied
- All list endpoints use cursor pagination
- List serializers: 4-6 fields max (mobile-optimised)
- JWT refresh token: 30+ day expiry
- FCM device registration endpoint
- Sync endpoint: `/api/v1/sync/?since=<iso_timestamp>` for offline

---

## 15. DEPLOYMENT AND INFRASTRUCTURE

### Docker Compose Services
- `web` — Django Gunicorn, port 8000
- `frontend` — Nginx serving React build, port 80
- `celery` — Celery worker (queues: default, notifications, ai)
- `celery-beat` — Periodic task scheduler (SEPARATE service — required)
- `db` — PostgreSQL 16
- `redis` — Redis 7

### Caddy (Reverse Proxy)
- Wildcard subdomain: `*.bms.techyatra.com.np` → SSL auto-managed
- On-demand TLS for custom domains via `/internal/verify-domain/` endpoint
- `/admin/` blocked on all tenant subdomains (only accessible on root domain)

### Celery Queue Routing
```
default       — general tasks
notifications — push/email/WhatsApp delivery
ai            — AI generation tasks (slow, expensive)
beat          — scheduled/periodic tasks
```

### Key Config Files
- `backend/config/settings/base.py` — base settings
- `backend/config/settings/dev.py` — dev overrides
- `backend/config/settings/prod.py` — production overrides
- `docker-compose.yml` — development
- `docker-compose.prod.yml` — production
- `nginx/Caddyfile` — Caddy reverse proxy config

---

## 16. MULTI-TENANCY ARCHITECTURE

### User Hierarchy
| Role | Scope | Capabilities |
|---|---|---|
| Super Admin | Platform-wide | Manage tenants, subscriptions, global settings, platform health |
| Tenant Admin | Within tenant | Full control — staff, roles, customers, products, tickets, accounting |
| Manager | Department/Team | Assign tickets, approve coins, view reports for their team |
| Technician | Assigned tickets | View/update assigned tickets, log work |
| Finance | Accounting module | Invoices, ledger, payslip, accounting reports |
| Custom Roles | Configurable | Admin defines permissions per module per role — stored as JSON |

### Tenant Model Key Fields
```
slug                — subdomain identifier (also used for reservation on delete)
vat_rate            — tenant-specific VAT rate (default 0.13 for Nepal)
vat_enabled         — bool toggle
coin_to_money_rate  — NPR value per coin (arbitrary, tenant-configured)
currency            — display currency
plan                — FK to Plan
```

### Tenant Sequence System
`next_seq(tenant, model_class, field_name)` — generates sequential numbers per tenant.
Used for: `Ticket.ticket_number`, `Invoice.invoice_number`, `JournalEntry.entry_number`, etc.

### Module Gating
`HasModuleAccess` permission class checks `TenantModuleOverride` table. Module registry autodiscovered from `module.py` in each app at startup.

---

## 17. SECURITY IMPLEMENTED

- JWT with short access token + long refresh (30d mobile)
- JWT blacklist on logout
- 2FA (TOTP) — required-per-user configuration
- `tenant` never accepted from request body — always middleware-injected
- CORS: explicit origins only in prod (no wildcards)
- `/admin/` blocked on tenant subdomains — only accessible on root domain
- Subdomain slug reuse prevention via `SlugReservation` model
- IP ban middleware (handles `/health/`, `/favicon.ico`, `/api/v1/tenants/resolve/` as exempt)
- File uploads: type + size validated before saving
- All AI-generated HTML sanitized with `bleach`
- Claude/Gemini API keys in environment variables only — never in code or frontend

---

## 18. KNOWN GAPS AND FUTURE WORK

### Accounting
1. No EventBus — still uses Django signals for journal creation (hard to trace)
2. COGS silently skipped if `product.cost_price` is 0 — no user warning
3. `Expense.account` optional — if null, posting fails silently
4. Account balances computed on-demand (slow for large ledgers — no cached denormalized field)
5. Bank reconciliation not tight with Payment journal (no auto-match suggestions)
6. TDS/VAT remittance is manual — no IRD integration
7. No industry-specific CoA templates — every tenant gets identical seeded CoA

### HRM
1. `StaffDirectory.tsx` doesn't yet show shift assignment in profile drawer (identified, not implemented)
2. Payslip service could auto-derive `working_days_per_month` from shift schedule (currently takes param override)
3. Aggregate monthly report (all-staff view) doesn't have per-staff drill-down table

### Inventory
1. No barcode scanner in mobile (no `expo-camera` / `expo-barcode-scanner` installed)
2. Write ops (purchase orders, adjustments, suppliers) are web-only — no mobile write

### Notifications
1. WhatsApp channel stubbed — module enabled/disabled but no active provider
2. Email notifications depend on per-tenant SMTP config — if not configured, silent failure

### CMS (Phase 3)
- Rate limit: 10 AI generations/day per tenant (implemented in service, needs testing)
- GrapeJS drag & drop (Phase 3.2) — model exists, editor not wired
- AI chat editor inside GrapeJS (Phase 3.3) — not started

### Phase 2 Stubs Only (Do Not Build Yet)
- Appointments module
- CRM (leads, deals)
- WhatsApp channel (messaging)

---

## 19. CRITICAL CODE PATTERNS

### TenantModel Base
```python
class MyModel(TenantModel):  # Never models.Model
    name = models.CharField(max_length=200)
    objects = TenantManager()

    class Meta(TenantModel.Meta):
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
        ]
```

### Service Layer Pattern
```python
class MyService:
    def create(self, tenant, data: dict):
        with transaction.atomic():
            instance = MyModel.objects.create(tenant=tenant, **data)
            AuditLog.record(...)
            EventBus.publish('my_module.created', {
                'id': instance.id,
                'tenant_id': tenant.id,
            }, tenant=tenant)
            NotificationService.send(...)
            return instance
```

### EventBus Listener
```python
from core.events import listens_to

@listens_to('some.event', module_id='my_module')
def handle_event(payload: dict, tenant) -> None:
    from .models import MyModel  # lazy import — never top-level
    MyModel.objects.for_tenant(tenant).filter(id=payload['id']).update(...)
```

### Celery Task
```python
@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def my_task(self, tenant_id: int, data: dict):
    try:
        tenant = Tenant.objects.get(id=tenant_id)
        # Bulk: always use .iterator(chunk_size=200)
        for item in MyModel.objects.for_tenant(tenant).iterator(chunk_size=200):
            pass
    except Exception as exc:
        raise self.retry(exc=exc)
```

### API Response
```python
# List view
return ApiResponse.success(data=serializer.data, meta={'count': qs.count()})
# Create
return ApiResponse.success(data=serializer.data, message='Created', status=201)
# Error
return ApiResponse.error(errors=serializer.errors, message='Validation failed', status=400)
```

---

## 20. GIT HISTORY HIGHLIGHTS (140 commits total)

| Commit | Summary |
|---|---|
| `8ea3e87` | feat(hrm): shift-aware attendance — work_days, manual mark fix, report gaps |
| `ba4386f` | fix: invalid tenant subdomain causes infinite reload loop |
| `7871403` | Fix: ticket coin awards — one-time only, locked after close |
| `946e99a` | fix(build): resolve all TypeScript build errors across 11 files |
| `76ca3ac` | fix(accounting): sync bank↔CoA on delete |
| `4cf9118` | fix(accounting): invalidate CoA accounts cache on bank create/update/delete |
| `211dbc2` | fix: exempt public-info/health from IP ban; add favicon.ico |
| `a049574` | fix(hrm): use correct .memberships related_name |
| `f299a46` | feat: HRM Phase A — leave management + staff profiles + tests (107 passing) |
| `a6a2909` | audit: fix N1-N4 accounting blockers + 79 tests passing |
| `2fd184a` | feat: Phase 1 complete — module gating, RBAC, security hardening, collapsible sidebar |
| `721e407` | Add SSL/HTTPS: Let's Encrypt wildcard cert, redirect HTTP→HTTPS, secure cookies |
| `ae94f16` | Custom domain support + tenant-branded sidebar + wildcard ALLOWED_HOSTS |
| `f0365dc` | Subdomain multi-tenancy: wildcard nginx, ALLOWED_HOSTS, auto URL slug detection |
| `c6a7807` | Rebrand: NEXUS BMS → TechYatra across all files |
| `f04fc79` | Initial commit — NEXUS BMS Phase 1 complete |

---

## 21. WHAT HAS BEEN BUILT vs WHAT IS STUBBED

### FULLY BUILT (Production Ready)
- Multi-tenancy infrastructure (TenantMiddleware, TenantModel, TenantManager)
- Auth (JWT + 2FA + device management)
- Role-based access control (RBAC) with custom per-tenant roles
- Module registry and module gating per tenant plan
- Super Admin panel (tenant management, plan management)
- Customer management
- Department management
- Ticket management (full: types, SLA, assignment, transfer, comments, timeline, vehicle logs)
- Inventory management (all 15 models, stock count, purchase orders, returns, variants)
- Projects (milestones, tasks, products, member schedules, attachments)
- Full double-entry accounting (CoA, journals, invoices, bills, payments, credit notes, payslip, coins, expenses, fiscal year, fixed assets, bank reconciliation, recurring journals)
- Notifications (in-app + email + FCM push)
- HRM (leave types, leave requests, staff profiles, attendance policy, attendance records, shifts, shift assignments)
- CMS website builder (16 block types, blog, contact form, AI generation, public renderer)
- React frontend (all modules above — 66 TSX files, ~45k lines)
- React Native mobile (read-oriented for all modules)
- Docker + Caddy deployment with wildcard SSL + custom domain SSL

### STUBBED ONLY (Do Not Build Yet)
- `ai_assistant/` — Phase 3, empty models
- WhatsApp channel — service wired but no active provider
- Appointment module — Phase 2, not started
- CRM (leads, deals) — Phase 2, not started
- GrapeJS visual editor in CMS — Phase 3.2
- AI chat editor in CMS — Phase 3.3
- Payment gateways (eSewa, Khalti, Stripe) — stubs exist, inactive
- Customer portal — flagged future, not built

---

## 22. API ENDPOINTS REGISTERED

```
GET  /health/
GET  /api/v1/dashboard/stats/
GET  /internal/verify-domain/

# Accounts + Auth
/api/v1/accounts/

# Tenants
/api/v1/tenants/resolve/      (public, no auth)
/api/v1/tenants/
/api/v1/plans/
/api/v1/modules/

# Staff
/api/v1/staff/availability/
/api/v1/staff/
/api/v1/customers/
/api/v1/departments/
/api/v1/roles/

# Tickets
/api/v1/tickets/

# Inventory + Accounting
/api/v1/inventory/
/api/v1/accounting/

# Settings
/api/v1/settings/
/api/v1/settings/upload/
/api/v1/settings/smtp/
/api/v1/settings/smtp/test/

# Projects + Notifications
/api/v1/projects/
/api/v1/notifications/

# HRM + CMS
/api/v1/hrm/
/api/v1/cms/
```

All prefixed `/api/v1/`. Cursor pagination default. `page_size=25`.

---

## 23. ENVIRONMENT AND RUNNING

### Development
```bash
docker compose up
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
# Django admin: http://localhost:8000/admin/ (superuser only)
```

### Migrations
```bash
docker exec nexus_bms-web-1 python manage.py migrate
docker exec nexus_bms-web-1 python manage.py migrate <app> <migration_name>
```

### Run Tests
```bash
docker exec nexus_bms-web-1 pytest
# 107+ tests passing across hrm, accounting, tickets, inventory
```

### Frontend Build
```bash
cd frontend && npm run build
# Current build time: ~2.17s
# Build passes cleanly as of commit 8ea3e87
```

### Bootstrap New Tenant
```bash
docker exec nexus_bms-web-1 python manage.py bootstrap_tenant <slug>
# Creates tenant + seeds CoA + seeds default roles
```

---

## 24. IMPORTANT DECISIONS AND CONVENTIONS

1. **Nepali BS (Bikram Sambat) calendar** — BS reference date for conversion: April 14, 1943 (corrected from April 13 per Hamro Patro). Used in date pickers and fiscal year displays.

2. **`StaffDirectory.tsx` is a separate component** from `HrmPage.tsx` — not a tab inside AttendanceTab.

3. **AccountingPage.tsx** is the largest single frontend file at 10,470 lines. It has tab-per-section architecture. Do not split unless explicitly asked.

4. **`InventoryPage.tsx`** (~4,276 lines) — single file, 12 tabs, tab state via `useSearchParams`.

5. **Tenant deletion**: Reserves slug in `SlugReservation` to prevent reuse (JWT scope confusion risk).

6. **Decimal fields in EventBus payloads**: Always `str(decimal_value)` — JSON does not support Decimal.

7. **`JournalLine` does NOT extend `TenantModel`** — it inherits tenant isolation from its parent `JournalEntry` FK.

8. **CMS public renderer vs private editor**: Two separate serializers — never mix. Public: Next.js compatible JSON. Private: Full BMS dashboard detail.

9. **Coin system tickets**: Coin award is one-time only per ticket — locked after first close (fixed in commit `7871403`).

10. **`generate_issued()` in invoice_service**: Fires `invoice.sent` same as `issue()` — both trigger stock movement via EventBus.
