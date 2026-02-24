**NEXUS BMS**

**Detailed Development Phases**

Full Roadmap — All 5 Phases with Sprint Breakdown, Features, API Endpoints, DB Models & Acceptance Criteria

|**Phase**|**Name**|**Duration**|**Status**|
| :- | :- | :- | :- |
|Phase 1|Tickets + Projects + Foundation|10–12 weeks|🔴 URGENT — Start Now|
|Phase 2|Inventory Management|5–6 weeks|⏳ After Phase 1|
|Phase 3|Website CMS|5–6 weeks|⏳ After Phase 2|
|Phase 4|Accounting Suite|7–8 weeks|⏳ After Phase 3|
|Phase 5|Mobile App (React Native)|6–8 weeks|⏳ Parallel from Phase 3|

Version 1.0  •  February 2026  •  Confidential



|<p>**PHASE 1**</p><p>**Ticket Management + Project Management**</p><p>Foundation, Auth, Staff, Customers, Tickets, Projects, Coins, Invoices</p><p>**⏱ 10–12 Weeks • 6 Sprints**</p>|
| :- |

Phase 1 is the entire foundation of the platform. Every other phase depends on what is built here. By the end of Phase 1, a business (tenant) can: onboard staff with custom roles, manage customers, raise and assign tickets with SLA tracking, sell products/parts within tickets, manage projects with tasks and milestones, reward staff with coins, and generate invoices.

## **Phase 1 Goals**
- Multi-tenant foundation — subdomain routing, tenant isolation, super admin panel
- Authentication — JWT login, role-based access, custom permissions per role
- Staff & customer management with department structure
- Complete ticket lifecycle — creation, assignment, SLA, transfer, completion
- Inventory hook — products added to tickets auto-trigger stock movements
- Coin reward system — auto-awarded on completion, admin approval queue
- Project management — tasks, milestones, staff assignment, progress tracking
- Invoice generation — per ticket and per project, with VAT support (Nepal 13%)
- Notification system — email (SMTP) + push (Firebase FCM) for key events
- React web frontend for all of the above

## **Sprint 1 — Foundation & Auth (Weeks 1–2)**

|**Sprint 1:** Project Setup, Tenancy, Authentication   (2 weeks)|
| :- |
|<p>✓  Initialize Django 5 project with split settings (base/dev/prod)</p><p>✓  Docker Compose: PostgreSQL 16, Redis, Django, Celery, React (hot reload)</p><p>✓  TenantModel abstract base class with TenantManager (auto-scoped querysets)</p><p>✓  TenantMiddleware — resolve tenant from subdomain on every request</p><p>✓  Tenant CRUD (Super Admin only) — create, suspend, delete tenants</p><p>✓  Custom User model with email login (no username)</p><p>✓  TenantMembership — links User to Tenant with role + department</p><p>✓  JWT authentication via SimpleJWT — login, refresh, logout, /me endpoint</p><p>✓  Role model — tenant-scoped, JSON permission map, system roles + custom roles</p><p>✓  Role permission middleware — checks role permissions on every view</p><p>✓  Super Admin panel — basic tenant list and management UI (React)</p><p>✓  Environment config — .env files, secrets management</p>|

**Sprint 1 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|Tenant|id, name, subdomain, plan, vat\_enabled, vat\_rate (default 13%), currency (NPR), coin\_to\_money\_rate, logo, is\_active, created\_at|
|User|id, email, full\_name, phone, avatar, is\_active, is\_superadmin, date\_joined|
|TenantMembership|user, tenant, role, department, employee\_id, is\_admin, join\_date, is\_active|
|Role|tenant, name, slug, permissions (JSONField), is\_system\_role (Manager/Finance/Technician), created\_by|

**Sprint 1 — API Endpoints**

|**Method**|**Endpoint**|**Description**|
| :- | :- | :- |
|POST|/api/v1/auth/login/|Email + password → access + refresh tokens|
|POST|/api/v1/auth/refresh/|Refresh access token|
|POST|/api/v1/auth/logout/|Blacklist refresh token|
|GET|/api/v1/auth/me/|Current user + membership + permissions|
|GET/POST|/api/v1/tenants/|Super admin — list/create tenants|
|GET/PUT/DEL|/api/v1/tenants/{id}/|Super admin — manage single tenant|
|GET/POST|/api/v1/roles/|List/create roles for current tenant|
|GET/PUT/DEL|/api/v1/roles/{id}/|Manage single role|

## **Sprint 2 — Staff, Customers, Departments (Weeks 3–4)**

|**Sprint 2:** People Management   (2 weeks)|
| :- |
|<p>✓  Staff management — invite staff by email, assign role + department</p><p>✓  Staff profile — personal details, employee ID, join date, avatar</p><p>✓  Department management — create departments, assign head of department</p><p>✓  Customer management — individual and organization types</p><p>✓  Organization contacts — multiple contacts per organization customer</p><p>✓  Staff availability engine — computed from active ticket/task assignments, cached in Redis</p><p>✓  Staff busy/free status API — returns assignment breakdown per staff member</p><p>✓  Admin dashboard skeleton — key metrics widgets (React)</p><p>✓  Staff list + detail UI with availability indicator (React)</p><p>✓  Customer list + detail UI with contact management (React)</p>|

**Sprint 2 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|Department|tenant, name, description, head (FK User), created\_at|
|Customer|tenant, type (individual/organization), name, email, phone, address, vat\_number, pan\_number, notes, is\_active, created\_by|
|CustomerContact|customer, name, email, phone, designation, is\_primary|

**Sprint 2 — API Endpoints**

|**Method**|**Endpoint**|**Description**|
| :- | :- | :- |
|GET/POST|/api/v1/staff/|List all staff, invite new staff member|
|GET/PUT/DEL|/api/v1/staff/{id}/|Staff profile management|
|GET|/api/v1/staff/availability/|All staff free/busy status with assignment details|
|GET/POST|/api/v1/departments/|List/create departments|
|GET/PUT/DEL|/api/v1/departments/{id}/|Manage single department|
|GET/POST|/api/v1/customers/|List/create customers|
|GET/PUT/DEL|/api/v1/customers/{id}/|Manage single customer|
|GET/POST|/api/v1/customers/{id}/contacts/|Manage organization contacts|

## **Sprint 3 — Ticket System Core (Weeks 5–6)**

|**Sprint 3:** Tickets, SLA, Assignment, Transfer, Comments   (2 weeks)|
| :- |
|<p>✓  Ticket Type management — name, default SLA hours, required fields config</p><p>✓  Full ticket CRUD — number auto-generated (TKT-0001), type, customer, title, description, priority</p><p>✓  Ticket status lifecycle — Open → In Progress → Pending Customer → Transferred → Resolved → Closed → Cancelled</p><p>✓  Ticket assignment — assign to staff member, notify via email + push</p><p>✓  SLA tracking — deadline computed on creation, Celery checks every 15 min</p><p>✓  SLA 80% warning notification — email + push to assigned staff and manager</p><p>✓  SLA breach notification — email + push + flagged in dashboard</p><p>✓  Department transfer — with reason, full transfer history log</p><p>✓  Ticket comments — internal (staff only) and external (visible to customer when portal enabled)</p><p>✓  File attachments on tickets and comments — stored in S3/MinIO</p><p>✓  Ticket timeline — chronological log of all status changes, assignments, transfers, comments</p><p>✓  Ticket list + detail UI with timeline sidebar (React)</p><p>✓  Ticket creation wizard UI (React)</p>|

**Sprint 3 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|TicketType|tenant, name, slug, default\_sla\_hours, color, icon, is\_active|
|Ticket|tenant, ticket\_number, type, customer, title, description, status, priority (low/medium/high/critical), assigned\_to, department, created\_by, sla\_deadline, resolved\_at, closed\_at, parent\_ticket (for sub-tickets)|
|TicketSLA|ticket, sla\_hours, breach\_at, warning\_sent\_at, breached, breached\_at|
|TicketTransfer|ticket, from\_department, to\_department, transferred\_by, reason, timestamp|
|TicketComment|ticket, author, body, is\_internal, attachments (JSON), created\_at|
|TicketAttachment|ticket, comment (nullable), file\_url, file\_name, file\_size, uploaded\_by|
|TicketTimeline|ticket, event\_type, description, actor, metadata (JSON), timestamp|

**Sprint 3 — Ticket Status Flow**

|**📋 Flow**|Open → [assign] → In Progress → [staff action] → Pending Customer / Transferred / Resolved → [manager] → Closed. Any status can go to Cancelled by admin. Re-opening a Closed ticket creates a new child ticket linked via parent\_ticket.|
| :- | :- |

**Sprint 3 — API Endpoints**

|**Method**|**Endpoint**|**Description**|
| :- | :- | :- |
|GET/POST|/api/v1/ticket-types/|Manage ticket types|
|GET/POST|/api/v1/tickets/|List (filterable) / create tickets|
|GET/PUT/PATCH|/api/v1/tickets/{id}/|View/update ticket|
|POST|/api/v1/tickets/{id}/assign/|Assign to staff member|
|POST|/api/v1/tickets/{id}/transfer/|Transfer to department|
|POST|/api/v1/tickets/{id}/status/|Change status with reason|
|GET|/api/v1/tickets/{id}/timeline/|Full chronological timeline|
|GET/POST|/api/v1/tickets/{id}/comments/|List/add comments|
|GET|/api/v1/tickets/sla-breached/|All currently breached tickets|
|GET|/api/v1/tickets/sla-warning/|Tickets approaching SLA breach|

## **Sprint 4 — Products in Tickets, Coins, Invoices (Weeks 7–8)**

|**Sprint 4:** Inventory Hook, Coin System, Invoice Generation   (2 weeks)|
| :- |
|<p>✓  Ticket products — add products/parts to a ticket with quantity and price</p><p>✓  Auto stock movement — adding TicketProduct triggers StockMovement(out) via Django signal</p><p>✓  Stock reversal — cancelling ticket auto-reverses all stock movements via signal</p><p>✓  Basic inventory models — Category, Product, StockMovement, StockLevel (for hook only, full module in Phase 2)</p><p>✓  Coin system — CoinTransaction auto-created (pending) when ticket closed</p><p>✓  Coin approval queue — admin sees pending coins, approve or reject with note</p><p>✓  Coin history per staff — accumulated total, period breakdown</p><p>✓  Invoice model — line items from ticket products + service charges</p><p>✓  Invoice number auto-generation (INV-2026-0001)</p><p>✓  VAT calculation — reads tenant.vat\_enabled and tenant.vat\_rate</p><p>✓  Invoice PDF generation — WeasyPrint HTML template, stored in S3</p><p>✓  Invoice email — send PDF to customer email on generation</p><p>✓  Email notification system via Celery — ticket assigned, SLA warning, coin approved</p><p>✓  Ticket products UI — add/remove products within ticket detail (React)</p><p>✓  Coin approval queue UI (React)</p><p>✓  Invoice view + download UI (React)</p>|

**Sprint 4 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|Category|tenant, name, parent (self FK), slug, is\_active|
|Product|tenant, category, name, sku, description, unit\_price, cost\_price, is\_service, track\_stock, reorder\_level, is\_published (for CMS later), is\_active|
|StockLevel|product, quantity\_on\_hand, quantity\_reserved, last\_updated|
|StockMovement|product, movement\_type (in/out/adjustment), quantity, reference\_type (ticket/project/manual), reference\_id, performed\_by, notes, timestamp|
|TicketProduct|ticket, product, quantity, unit\_price (snapshot at time of add), discount, subtotal|
|CoinTransaction|tenant, staff, amount, source\_type (ticket/project/manual), source\_id, status (pending/approved/rejected), approved\_by, approval\_note, created\_at|
|Invoice|tenant, invoice\_number, customer, ticket (nullable), project (nullable), line\_items (JSON), subtotal, discount, vat\_rate, vat\_amount, total, status (draft/sent/paid/cancelled), due\_date, notes, pdf\_url, sent\_at, paid\_at|

**Sprint 4 — API Endpoints**

|**Method**|**Endpoint**|**Description**|
| :- | :- | :- |
|GET/POST|/api/v1/products/|Basic product list/create (full CRUD in Phase 2)|
|GET/POST|/api/v1/tickets/{id}/products/|List/add products to ticket|
|DELETE|/api/v1/tickets/{id}/products/{pid}/|Remove product from ticket|
|GET|/api/v1/coins/pending/|Admin — pending coin approvals|
|POST|/api/v1/coins/{id}/approve/|Admin — approve coin transaction|
|POST|/api/v1/coins/{id}/reject/|Admin — reject with reason|
|GET|/api/v1/coins/staff/{id}/|Coin history for a staff member|
|POST|/api/v1/invoices/generate/|Generate invoice from ticket or project|
|GET|/api/v1/invoices/|List invoices with filters|
|GET|/api/v1/invoices/{id}/|Invoice detail|
|GET|/api/v1/invoices/{id}/pdf/|Download invoice PDF|
|POST|/api/v1/invoices/{id}/send/|Email invoice to customer|

## **Sprint 5 — Project Management + Push Notifications (Weeks 9–10)**

|**Sprint 5:** Projects, Tasks, Milestones, FCM Push   (2 weeks)|
| :- |
|<p>✓  Project CRUD — name, customer, manager, status, dates, description</p><p>✓  Project-product linking — select products needed for the project (M2M)</p><p>✓  Project task management — title, description, assigned staff, due date, hour estimates</p><p>✓  Task status lifecycle — To Do → In Progress → Under Review → Done → Blocked</p><p>✓  Project milestone tracking — milestones with due dates, % completion auto-calculated</p><p>✓  Project stock movements — task completion triggers StockMovement for linked products</p><p>✓  Project coin rewards — task completion triggers CoinTransaction (pending) per assigned staff</p><p>✓  Project invoice generation — products + service charges defined by admin</p><p>✓  Staff availability updated for project tasks — same as tickets (busy if task In Progress)</p><p>✓  Firebase FCM setup — web push for all notification types</p><p>✓  Push notification triggers — ticket assigned, SLA warning/breach, coin approved, task assigned</p><p>✓  Notification preferences per staff — opt in/out per notification type</p><p>✓  Project dashboard UI — Kanban board for tasks, milestone timeline (React)</p><p>✓  Project creation + management UI (React)</p>|

**Sprint 5 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|Project|tenant, name, customer, status (planning/active/on\_hold/completed/cancelled), start\_date, end\_date, manager, description, is\_active, created\_by|
|ProjectProduct|project, product, quantity\_planned, quantity\_used|
|ProjectTask|project, title, description, assigned\_to, status, priority, due\_date, estimated\_hours, actual\_hours, completed\_at|
|ProjectMilestone|project, name, description, due\_date, is\_completed, completed\_at|
|Notification|tenant, recipient, type, title, body, reference\_type, reference\_id, is\_read, sent\_via\_email, sent\_via\_push, created\_at|
|NotificationPreference|staff (user), tenant, notification\_type, via\_email, via\_push|

**Sprint 5 — API Endpoints**

|**Method**|**Endpoint**|**Description**|
| :- | :- | :- |
|GET/POST|/api/v1/projects/|List/create projects|
|GET/PUT/PATCH|/api/v1/projects/{id}/|Project detail/update|
|GET/POST|/api/v1/projects/{id}/tasks/|List/create project tasks|
|PATCH|/api/v1/projects/{id}/tasks/{tid}/|Update task status, hours, etc.|
|GET/POST|/api/v1/projects/{id}/milestones/|List/create milestones|
|PATCH|/api/v1/projects/{id}/milestones/{mid}/|Mark milestone complete|
|GET|/api/v1/projects/{id}/products/|Products linked to project|
|GET|/api/v1/notifications/|Staff notification list|
|POST|/api/v1/notifications/mark-read/|Mark notifications as read|
|GET/PUT|/api/v1/notifications/preferences/|Get/update notification preferences|

## **Sprint 6 — React Frontend Polish + Testing (Weeks 11–12)**

|**Sprint 6:** Frontend Completion, Testing, Deployment   (2 weeks)|
| :- |
|<p>✓  Complete React frontend — all Phase 1 modules with full CRUD UI</p><p>✓  Admin dashboard — KPI cards: open tickets, SLA breaches, active projects, pending coins, revenue this month</p><p>✓  Role-based UI rendering — hide/show nav items and actions based on user role permissions</p><p>✓  Responsive design — works on desktop and tablet (mobile is Phase 5)</p><p>✓  Global notification bell — real-time unread count, dropdown list</p><p>✓  Settings page — tenant VAT config, coin rate, SMTP email config, FCM config</p><p>✓  Super Admin portal — tenant management, subscription overview</p><p>✓  pytest-django unit tests for all models, services, and signals</p><p>✓  API integration tests — all Phase 1 endpoints</p><p>✓  Load testing — verify tenant isolation under concurrent requests</p><p>✓  Docker production config — Nginx, Gunicorn, SSL-ready</p><p>✓  README and developer onboarding documentation</p>|

|**✅ Phase 1 Done When**|All 6 sprints complete. A tenant can: sign up → add staff + roles → add customers → raise tickets → assign + track SLA → add products to tickets → generate invoice → manage projects → reward staff with coins. All tested.|
| :- | :- |



|<p>**PHASE 2**</p><p>**Inventory Management**</p><p>Full stock control, supplier management, purchase orders, product catalog</p><p>**⏱ 5–6 Weeks • 3 Sprints**</p>|
| :- |

Phase 2 expands the basic inventory stub built in Phase 1 into a full inventory management system. By end of Phase 2, the business can manage full product catalog, track stock with complete audit trail, manage suppliers, raise purchase orders, and see inventory valuation reports.

## **Phase 2 Goals**
- Full category tree with unlimited depth (Laptops > HP > HP Pavilion)
- Complete product catalog — physical products, services, bundles
- Supplier management — contacts, payment terms, supply history
- Purchase orders — raise PO to supplier, receive stock, auto-update StockLevel
- Full stock movement audit trail — every in/out with source reference
- Stock adjustment — manual corrections with reason and approval
- Low stock alerts — email + push when stock\_on\_hand <= reorder\_level
- Inventory valuation — FIFO cost calculation, total inventory value report
- Barcode/SKU scanning support — search by SKU, barcode field on product
- Inventory reports — stock movements, valuation, slow-moving items
- Products flagged for website publishing (consumed by Phase 3 CMS)

## **Phase 2 — Sprint Breakdown**

|**Sprint 7:** Full Product Catalog + Categories   (2 weeks)|
| :- |
|<p>✓  Category tree management — nested categories with drag-and-drop reorder UI</p><p>✓  Full product CRUD — all fields: SKU, barcode, images (multiple), weight, dimensions, warranty</p><p>✓  Product variants — size, color, model variants for the same product (e.g. laptop RAM variants)</p><p>✓  Service products — no stock tracking, billable hours/flat rate</p><p>✓  Bundle products — group products sold together as a unit</p><p>✓  Product import — CSV import for bulk product creation</p><p>✓  Product search — by name, SKU, barcode, category</p><p>✓  Product detail page UI with stock level indicator (React)</p>|

|**Sprint 8:** Supplier Management + Purchase Orders   (2 weeks)|
| :- |
|<p>✓  Supplier model — name, contact, email, phone, address, payment terms, bank details</p><p>✓  Purchase Order — raise PO to supplier with line items, expected delivery date</p><p>✓  PO status — Draft → Sent → Partially Received → Received → Cancelled</p><p>✓  Receive stock — mark PO items received, auto-creates StockMovement(in) and updates StockLevel</p><p>✓  Partial receives — receive items in multiple shipments</p><p>✓  PO PDF generation — printable purchase order document</p><p>✓  Supplier payment tracking — how much owed to each supplier</p><p>✓  Supplier list + PO management UI (React)</p>|

|**Sprint 9:** Stock Control + Reports   (2 weeks)|
| :- |
|<p>✓  Stock adjustment — manual in/out with reason (damage, theft, correction) and admin approval</p><p>✓  Stock transfer between locations (if tenant has multiple locations — future hook)</p><p>✓  Low stock alert — Celery task checks daily, sends email + push for products below reorder level</p><p>✓  Full stock movement history — filterable by product, date, type, reference</p><p>✓  Inventory valuation report — total value at cost price, at sell price, margin</p><p>✓  Slow-moving report — products with no movement in last 30/60/90 days</p><p>✓  Top-selling products report — from ticket and project usage</p><p>✓  is\_published flag UI — toggle products for website (consumed by Phase 3)</p>|

**Phase 2 — Additional Models**

|**Model**|**Critical Fields**|
| :- | :- |
|ProductVariant|product, name, sku, barcode, unit\_price, cost\_price, stock\_level (separate per variant)|
|ProductImage|product, image\_url, is\_primary, order|
|Supplier|tenant, name, contact\_person, email, phone, address, payment\_terms, bank\_details, notes, is\_active|
|PurchaseOrder|tenant, po\_number, supplier, status, expected\_date, notes, subtotal, tax, total, created\_by|
|PurchaseOrderItem|po, product, variant, quantity\_ordered, quantity\_received, unit\_cost, subtotal|
|StockAdjustment|tenant, product, adjustment\_type (in/out), quantity, reason, approved\_by, timestamp|



|<p>**PHASE 3**</p><p>**Website CMS**</p><p>Public-facing website builder — product store, services, blog, contact</p><p>**⏱ 5–6 Weeks • 3 Sprints**</p>|
| :- |

Phase 3 gives each tenant a public-facing website that is managed directly from within NEXUS BMS. Product catalog from inventory is the source of truth — products marked is\_published automatically appear on the website. The CMS handles content pages, blog, and inquiry/contact forms.

## **Phase 3 Goals**
- Each tenant gets a public website at their subdomain (or custom domain)
- Product store — auto-synced from inventory, filterable by category
- Service pages — IT services, repair services, CCTV installation, AC servicing listings
- Blog/news — admin publishes articles for SEO and announcements
- Contact/inquiry forms — leads captured and stored as customers in the system
- Homepage, About, Contact page builder — drag-and-drop sections
- SEO meta fields on all content — title, description, OG image
- Custom domain support — point your own domain to the CMS
- Basic analytics — page views, product views, inquiry count
- No payment integration yet — product store is catalog only (payment in future)

## **Phase 3 — Sprint Breakdown**

|**Sprint 10:** CMS Foundation + Product Store   (2 weeks)|
| :- |
|<p>✓  CMS app — Page model, Section model (hero, features, CTA, etc.)</p><p>✓  Product store page — lists all is\_published products, filterable by category</p><p>✓  Product detail page — description, images, specs, inquiry button</p><p>✓  Category navigation — mirrors inventory category tree</p><p>✓  Tenant website settings — site name, logo, tagline, colors, social links</p><p>✓  Custom domain — CNAME record support, SSL via Let's Encrypt</p><p>✓  Public-facing React app (separate from admin panel, same API)</p>|

|**Sprint 11:** Pages, Blog, Contact   (2 weeks)|
| :- |
|<p>✓  Page builder — admin creates pages with sections (no code required)</p><p>✓  Standard pages — Homepage, About Us, Services, Contact pre-built</p><p>✓  Service listing pages — IT repair, CCTV, AC, laptop service with pricing</p><p>✓  Blog — Article model with categories, tags, featured image, publish date</p><p>✓  Contact/inquiry form — fields configurable by admin, leads saved as Customer records</p><p>✓  Inquiry notifications — email + push to admin when new inquiry received</p><p>✓  SEO fields — meta title, description, canonical, OG image on all pages</p><p>✓  Blog + Page management UI in admin panel (React)</p>|

|**Sprint 12:** CMS Admin Tools + Analytics   (2 weeks)|
| :- |
|<p>✓  Media library — upload and manage images used across CMS</p><p>✓  Navigation builder — admin configures header and footer menu links</p><p>✓  Announcement bar — site-wide banner (e.g. 'Free delivery this week')</p><p>✓  Basic analytics — page views per day, top products viewed, inquiry count</p><p>✓  Website preview — admin sees live preview before publishing changes</p><p>✓  Sitemap.xml and robots.txt auto-generated</p><p>✓  Social media links — footer links to Facebook, Instagram, etc.</p>|

**Phase 3 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|WebsiteSettings|tenant, site\_name, tagline, logo\_url, favicon\_url, primary\_color, secondary\_color, custom\_domain, analytics\_id, is\_published|
|Page|tenant, title, slug, meta\_title, meta\_description, og\_image, sections (JSON), is\_published, published\_at|
|Article|tenant, title, slug, body, excerpt, featured\_image, author, category, tags, is\_published, published\_at|
|Inquiry|tenant, name, email, phone, subject, message, source\_page, converted\_to\_customer, created\_at|
|MediaFile|tenant, file\_url, file\_name, file\_type, file\_size, uploaded\_by, uploaded\_at|



|<p>**PHASE 4**</p><p>**Accounting Suite**</p><p>Full double-entry bookkeeping, P&L, payslip, Nepal tax compliance</p><p>**⏱ 7–8 Weeks • 4 Sprints**</p>|
| :- |

Phase 4 is the most complex module. It builds a complete accounting system that ties together invoices from tickets and projects, stock purchase costs, staff payslips with coin earnings, expenses, and bank reconciliation. The output is proper financial statements suitable for Nepal business reporting.

## **Phase 4 Goals**
- Chart of accounts — income, expense, asset, liability, equity accounts
- Double-entry ledger — every financial event creates balanced debit/credit entries
- Invoice management — all invoices from tickets and projects flow here
- Expense tracking — categorized expenses with receipts, linked to accounts
- Bank account management — multiple accounts, balance tracking
- Bank reconciliation — match ledger entries to bank statement
- Staff payslip generation — base salary + coin earnings + bonuses - deductions
- Profit & Loss statement — by month, quarter, year
- Balance sheet — assets, liabilities, equity snapshot
- VAT report — output VAT collected, input VAT on purchases, net VAT payable
- Nepal-specific: PAN number on invoices, VAT registration details, IRD report format

## **Phase 4 — Sprint Breakdown**

|**Sprint 13:** Chart of Accounts + Ledger   (2 weeks)|
| :- |
|<p>✓  Account model — type (asset/liability/equity/income/expense), code, name, description</p><p>✓  Default chart of accounts — pre-loaded for Nepal IT business (revenue, COGS, expenses, etc.)</p><p>✓  LedgerEntry — double-entry: every entry has equal debit and credit</p><p>✓  Auto-posting — invoice payment posts to income account, expense posts to expense account</p><p>✓  Manual journal entries — admin can post manual adjustments with description</p><p>✓  Ledger view — filterable by account, date range, reference</p><p>✓  Account balance calculation — running balance from all ledger entries</p><p>✓  Chart of accounts management UI (React)</p>|

|**Sprint 14:** Invoices, Expenses, Bank Accounts   (2 weeks)|
| :- |
|<p>✓  Invoice lifecycle integration — draft → sent → paid → reconciled flows into ledger</p><p>✓  Partial payments — record partial invoice payments with outstanding balance</p><p>✓  Payment receipts — generate receipt PDF on payment recording</p><p>✓  Expense management — categories, amount, date, receipt upload, account posting</p><p>✓  Recurring expenses — auto-create expenses on schedule (monthly rent, subscriptions)</p><p>✓  Bank account management — name, account number, bank, current balance</p><p>✓  Manual bank entries — deposits, withdrawals, bank charges</p><p>✓  Expense approval workflow — manager approves expense before posting</p><p>✓  Expense and invoice management UI (React)</p>|

|**Sprint 15:** Payslip + Coins Integration   (2 weeks)|
| :- |
|<p>✓  Payslip generation — admin selects staff + period, system pulls approved coins + base salary</p><p>✓  Payslip line items — basic salary, coin earnings (coins × coin\_to\_money\_rate), allowances, bonuses, deductions, PF/CIT</p><p>✓  Payslip PDF — professional payslip format with company header</p><p>✓  Payslip approval — admin reviews and marks as paid</p><p>✓  Payslip history — all past payslips per staff member</p><p>✓  Bulk payslip — generate for all staff for a period in one action</p><p>✓  Payslip posts to ledger — salary expense account auto-posted</p><p>✓  Staff payslip view — staff sees their own payslip history</p><p>✓  Payslip management UI (React)</p>|

|**Sprint 16:** Financial Reports + Nepal Compliance   (2 weeks)|
| :- |
|<p>✓  Profit & Loss report — revenue vs expenses by period, export to Excel/PDF</p><p>✓  Balance sheet — snapshot of assets, liabilities, equity at any date</p><p>✓  Cash flow statement — operating, investing, financing activities</p><p>✓  VAT report — output VAT from sales invoices, input VAT from purchases, net payable</p><p>✓  Bank reconciliation — mark ledger entries as reconciled against bank statement import (CSV)</p><p>✓  Accounts receivable aging — outstanding invoices by customer, 30/60/90+ days</p><p>✓  Accounts payable — outstanding supplier POs</p><p>✓  Nepal IRD VAT format — export VAT report in IRD-compatible format</p><p>✓  Dashboard financial widgets — cash position, receivables, payables, this month P&L</p><p>✓  Reports UI with date filters and export buttons (React)</p>|

**Phase 4 — Key Models**

|**Model**|**Critical Fields**|
| :- | :- |
|Account|tenant, code, name, type (asset/liability/equity/income/expense), parent (FK self), is\_system, balance\_cache|
|LedgerEntry|tenant, account, date, description, debit, credit, reference\_type, reference\_id, posted\_by, is\_reconciled|
|BankAccount|tenant, bank\_name, account\_number, account\_name, branch, current\_balance, is\_active|
|Expense|tenant, category, description, amount, date, account, receipt\_url, approved\_by, status, recurring (bool), recur\_interval|
|Payslip|tenant, staff, period\_start, period\_end, basic\_salary, total\_coins, coin\_rate, coin\_value, allowances (JSON), deductions (JSON), gross, net\_pay, status (draft/approved/paid), generated\_by, paid\_at|
|PaymentRecord|invoice, amount, payment\_date, payment\_method, reference, bank\_account (nullable), recorded\_by|



|<p>**PHASE 5**</p><p>**Mobile App — React Native**</p><p>Staff mobile app for iOS and Android — same API, full offline support</p><p>**⏱ 6–8 Weeks • 3 Sprints**</p>|
| :- |

Phase 5 delivers a React Native mobile app for staff. This is not a full admin app — it is a staff-focused tool for field technicians and project workers who need to update ticket/task status, take photos, log work hours, and receive push notifications on the go. It shares the exact same DRF API built in previous phases.

## **Phase 5 Goals**
- Staff login — same credentials as web, JWT auth
- My tickets — list of assigned tickets, status update, add comments, attach photos
- My tasks — project tasks assigned to me, update status, log actual hours
- Push notifications — receive all notification types via FCM
- Camera integration — take and attach photos directly to tickets or tasks
- Offline support — view cached tickets/tasks when no internet, sync on reconnect
- My coins — view coin balance, transaction history
- My payslips — view payslip history and download PDF
- Staff availability — see who else is free/busy in my team
- iOS (App Store) + Android (Play Store) deployments

## **Phase 5 — Sprint Breakdown**

|**Sprint 17:** App Foundation + Auth + Tickets   (3 weeks)|
| :- |
|<p>✓  Expo setup with TypeScript — same React Query + Zustand patterns as web</p><p>✓  JWT auth flow — login, token refresh, secure storage (Expo SecureStore)</p><p>✓  Push notification setup — FCM via Expo Notifications</p><p>✓  Bottom tab navigation — My Tickets, My Tasks, Notifications, Profile</p><p>✓  Ticket list — assigned tickets, filterable by status and priority</p><p>✓  Ticket detail — full info, timeline, comments, attachments</p><p>✓  Ticket status update — change status with reason from mobile</p><p>✓  Add comment — text + photo attachment from camera/gallery</p><p>✓  Ticket search — by ticket number or keyword</p>|

|**Sprint 18:** Tasks, Coins, Payslip, Camera   (3 weeks)|
| :- |
|<p>✓  My tasks — project tasks assigned to me with project context</p><p>✓  Task status update — To Do → In Progress → Done with hour logging</p><p>✓  Hour logging — log actual hours worked per task</p><p>✓  Camera integration — capture photos, compress, upload to S3</p><p>✓  My coins — balance summary, transaction history, pending/approved breakdown</p><p>✓  My payslips — list of payslips, detail view, download PDF</p><p>✓  Offline mode — cache tickets and tasks in SQLite, sync queue for updates</p><p>✓  Background sync — sync offline changes when connectivity restored</p>|

|**Sprint 19:** Polish, Testing, App Store Deployment   (2 weeks)|
| :- |
|<p>✓  Push notification deep linking — tap notification opens the relevant ticket or task</p><p>✓  Biometric login — Face ID / fingerprint as alternative to password</p><p>✓  Staff availability screen — see team members and their current assignment</p><p>✓  Profile management — update name, phone, avatar</p><p>✓  App icon, splash screen, onboarding screens</p><p>✓  Performance optimization — lazy loading, image caching, query optimization</p><p>✓  Android build — APK/AAB for Play Store submission</p><p>✓  iOS build — IPA for App Store submission</p><p>✓  End-to-end testing — Detox test suite for critical flows</p>|

|**📱 Tech Note**|React Native via Expo managed workflow. Shared TypeScript types with the web frontend. API calls go to the same DRF backend. No new backend work required in Phase 5 — all APIs already exist.|
| :- | :- |


# **Full Roadmap Summary**

|**Phase**|**Module**|**Sprints**|**Weeks**|**Key Deliverable**|
| :- | :- | :- | :- | :- |
|Phase 1|Tickets + Projects + Foundation|1–6|10–12|Full operational system — tickets, projects, coins, invoices|
|Phase 2|Inventory Management|7–9|5–6|Product catalog, suppliers, purchase orders, stock reports|
|Phase 3|Website CMS|10–12|5–6|Public website with product store, blog, inquiry capture|
|Phase 4|Accounting Suite|13–16|7–8|Full double-entry accounting, P&L, payslip, VAT report|
|Phase 5|Mobile App|17–19|6–8|React Native iOS + Android staff app|
|TOTAL|All Modules|19 Sprints|~33–40 weeks|Complete white-label SaaS platform|

|**💡 Parallelization**|Phase 5 (Mobile) can begin in parallel with Phase 3 or 4 since the API is already built. A second developer can start the React Native app while the first continues building CMS and Accounting.|
| :- | :- |

|**🚀 Recommendation**|Ship Phase 1 to your first paying tenant as early as Sprint 5 (before Phase 1 is even fully complete). Real-world usage will validate the design and surface issues before you build the later phases on top.|
| :- | :- |

*— NEXUS BMS Development Phases —*

Confidential  •  Version 1.0  •  February 2026

|<p>**PHASE 2**</p><p>**Inventory Management**</p><p>Full stock control, supplier management, purchase orders, product catalog</p><p>**⏱ 5–6 Weeks • 3 Sprints**</p>|
| :- |

Phase 2 expands the basic inventory stub built in Phase 1 into a full inventory management system. By end of Phase 2, the business can manage full product catalog, track stock with complete audit trail, manage suppliers, raise purchase orders, and see inventory valuation reports.

## **Phase 2 Goals**
- Full category tree with unlimited depth (Laptops > HP > HP Pavilion)
- Complete product catalog — physical products, services, bundles
- Supplier management — contacts, payment terms, supply history
- Purchase orders — raise PO to supplier, receive stock, auto-update StockLevel
- Full stock movement audit trail — every in/out with source reference
- Stock adjustment — manual corrections with reason and approval
- Low stock alerts — email + push when stock\_on\_hand <= reorder\_level
- Inventory valuation — FIFO cost calculation, total inventory value report
- Barcode/SKU scanning support — search by SKU, barcode field on product
- Products flagged for website publishing (consumed by Phase 3 CMS)

## **Phase 2 — Sprint Breakdown**

|**Sprint 7:** Full Product Catalog + Categories   (2 weeks)|
| :- |
|<p>✓  Category tree management — nested categories with drag-and-drop reorder UI</p><p>✓  Full product CRUD — all fields: SKU, barcode, images (multiple), weight, dimensions, warranty</p><p>✓  Product variants — size, color, model variants for the same product</p><p>✓  Service products — no stock tracking, billable hours or flat rate</p><p>✓  Bundle products — group products sold together as a unit</p><p>✓  Product import — CSV import for bulk product creation</p><p>✓  Product search — by name, SKU, barcode, category</p><p>✓  Product detail page UI with stock level indicator (React)</p>|

|**Sprint 8:** Supplier Management + Purchase Orders   (2 weeks)|
| :- |
|<p>✓  Supplier model — name, contact, email, phone, address, payment terms, bank details</p><p>✓  Purchase Order — raise PO to supplier with line items and expected delivery date</p><p>✓  PO status lifecycle — Draft → Sent → Partially Received → Received → Cancelled</p><p>✓  Receive stock — mark PO items received, auto-creates StockMovement(in) and updates StockLevel</p><p>✓  Partial receives — receive items in multiple shipments against same PO</p><p>✓  PO PDF generation — printable purchase order document</p><p>✓  Supplier payment tracking — outstanding amount owed per supplier</p><p>✓  Supplier list + PO management UI (React)</p>|

|**Sprint 9:** Stock Control + Reports   (2 weeks)|
| :- |
|<p>✓  Stock adjustment — manual in/out with reason (damage, theft, correction) and admin approval</p><p>✓  Low stock alert — Celery task checks daily, sends email + push for products below reorder level</p><p>✓  Full stock movement history — filterable by product, date range, type, reference</p><p>✓  Inventory valuation report — total value at cost price, at sell price, margin per product</p><p>✓  Slow-moving report — products with no movement in last 30/60/90 days</p><p>✓  Top-selling products report — from ticket and project product usage</p><p>✓  is\_published flag UI — toggle products for website (consumed by Phase 3)</p><p>✓  Product import/export UI (React)</p>|

**Phase 2 — Additional Models**

|**Model**|**Critical Fields**|
| :- | :- |
|ProductVariant|product, name, sku, barcode, unit\_price, cost\_price, stock\_level|
|ProductImage|product, image\_url, is\_primary, display\_order|
|Supplier|tenant, name, contact\_person, email, phone, address, payment\_terms, bank\_details, is\_active|
|PurchaseOrder|tenant, po\_number, supplier, status, expected\_date, subtotal, tax, total, created\_by|
|PurchaseOrderItem|po, product, variant, quantity\_ordered, quantity\_received, unit\_cost, subtotal|
|StockAdjustment|tenant, product, type (in/out), quantity, reason, approved\_by, timestamp|



|<p>**PHASE 3**</p><p>**Website CMS**</p><p>Public-facing website — product store, services, blog, contact</p><p>**⏱ 5–6 Weeks • 3 Sprints**</p>|
| :- |

Phase 3 gives each tenant a public-facing website managed from within NEXUS BMS. Product catalog from inventory is the source of truth — products marked is\_published automatically appear. The CMS handles content pages, blog, and inquiry forms that create customer records automatically.

## **Phase 3 Goals**
- Each tenant gets a public website at their subdomain or custom domain
- Product store — auto-synced from inventory, filterable by category
- Service pages — IT repair, CCTV installation, AC servicing listings
- Blog/news — admin publishes articles for SEO and announcements
- Contact/inquiry forms — leads captured and stored as customers in the system
- Homepage, About, Contact page builder with drag-and-drop sections
- SEO meta fields on all content — title, description, OG image
- Custom domain support — point your own domain to the CMS
- No payment integration yet — catalog only (payment stubs ready for future)

## **Phase 3 — Sprint Breakdown**

|**Sprint 10:** CMS Foundation + Product Store   (2 weeks)|
| :- |
|<p>✓  CMS app — Page model, Section model (hero, features, CTA, testimonials)</p><p>✓  Product store page — lists all is\_published products, filterable by category</p><p>✓  Product detail page — description, images, specs, inquiry button</p><p>✓  Category navigation — mirrors inventory category tree</p><p>✓  Tenant website settings — site name, logo, tagline, theme colors, social links</p><p>✓  Custom domain — CNAME support, automatic SSL via Let's Encrypt</p><p>✓  Separate public React app (different from admin panel, same DRF API)</p>|

|**Sprint 11:** Pages, Blog, Contact   (2 weeks)|
| :- |
|<p>✓  Page builder — admin creates pages with configurable sections</p><p>✓  Standard pages — Homepage, About Us, Services, Contact pre-built as templates</p><p>✓  Service listing pages — IT repair, CCTV, AC, laptop service with pricing</p><p>✓  Blog — Article model with categories, tags, featured image, publish scheduling</p><p>✓  Contact/inquiry form — fields configurable by admin, leads saved as Customer records</p><p>✓  Inquiry notifications — email + push to admin when new inquiry received</p><p>✓  SEO fields on all pages — meta title, description, canonical, OG image</p><p>✓  Blog + Page management UI in admin panel (React)</p>|

|**Sprint 12:** CMS Admin Tools + Analytics   (2 weeks)|
| :- |
|<p>✓  Media library — upload and manage images used across the CMS</p><p>✓  Navigation builder — admin configures header and footer menu links</p><p>✓  Announcement bar — site-wide dismissible banner</p><p>✓  Basic analytics — page views per day, top products viewed, inquiry count</p><p>✓  Website preview — admin sees live preview of changes before publishing</p><p>✓  Sitemap.xml and robots.txt auto-generated per tenant</p><p>✓  Social media links — footer links to Facebook, Instagram, TikTok, etc.</p>|

|**Model**|**Critical Fields**|
| :- | :- |
|WebsiteSettings|tenant, site\_name, tagline, logo\_url, primary\_color, custom\_domain, is\_published|
|Page|tenant, title, slug, meta\_title, meta\_description, sections (JSON), is\_published, published\_at|
|Article|tenant, title, slug, body, excerpt, featured\_image, author, tags, is\_published, published\_at|
|Inquiry|tenant, name, email, phone, subject, message, source\_page, converted\_to\_customer, created\_at|
|MediaFile|tenant, file\_url, file\_name, file\_type, file\_size, uploaded\_by, uploaded\_at|



|<p>**PHASE 4**</p><p>**Accounting Suite**</p><p>Full double-entry bookkeeping, P&L, payslip, Nepal tax compliance</p><p>**⏱ 7–8 Weeks • 4 Sprints**</p>|
| :- |

Phase 4 is the most complex module. It builds a complete accounting system tying together invoices from tickets and projects, purchase costs from inventory, staff payslips with coin earnings, expenses, and bank reconciliation. Output is financial statements suitable for Nepal business reporting.

## **Phase 4 Goals**
- Chart of accounts — income, expense, asset, liability, equity accounts
- Double-entry ledger — every financial event creates balanced debit/credit pairs
- Invoice management — all invoices from tickets and projects flow in here
- Expense tracking — categorized with receipts, linked to accounts
- Bank account management — multiple accounts, balance tracking
- Bank reconciliation — match ledger entries to bank statement
- Staff payslip generation — base salary + coin earnings + bonuses - deductions
- Profit & Loss statement — by month, quarter, year with drill-down
- Balance sheet — assets, liabilities, equity at any date
- VAT report — output VAT, input VAT, net VAT payable to IRD
- Nepal-specific: PAN number on invoices, VAT registration, IRD export format

## **Phase 4 — Sprint Breakdown**

|**Sprint 13:** Chart of Accounts + Ledger   (2 weeks)|
| :- |
|<p>✓  Account model — type (asset/liability/equity/income/expense), code, name</p><p>✓  Default chart of accounts pre-loaded for Nepal IT business</p><p>✓  LedgerEntry — true double-entry: every transaction has equal debits and credits</p><p>✓  Auto-posting — invoice paid posts to income, PO received posts to COGS</p><p>✓  Manual journal entries — admin posts adjustments with description and reference</p><p>✓  Ledger view — filterable by account, date range, transaction type</p><p>✓  Account balance — running total from all ledger entries</p><p>✓  Chart of accounts management UI (React)</p>|

|**Sprint 14:** Invoices, Expenses, Bank Accounts   (2 weeks)|
| :- |
|<p>✓  Invoice lifecycle — draft → sent → partially paid → paid → reconciled</p><p>✓  Partial payments — record multiple payments against one invoice</p><p>✓  Payment receipts — generate receipt PDF on payment recording</p><p>✓  Expense management — categories, amount, date, receipt upload, account posting</p><p>✓  Recurring expenses — auto-create on schedule (monthly rent, internet, etc.)</p><p>✓  Bank account management — name, number, bank, branch, current balance</p><p>✓  Manual bank entries — deposits, withdrawals, bank charges, transfers</p><p>✓  Expense approval — manager approves before account posting</p>|

|**Sprint 15:** Payslip + Coins Integration   (2 weeks)|
| :- |
|<p>✓  Payslip generation — select staff + period, system pulls approved coins + salary</p><p>✓  Payslip line items — basic salary, coin value (coins × rate), allowances, PF/CIT, deductions</p><p>✓  Payslip PDF — professional format with company letterhead</p><p>✓  Payslip approval flow — admin reviews, then marks as paid</p><p>✓  Bulk payslip — generate for entire staff in one action per period</p><p>✓  Payslip auto-posts to ledger — salary expense account updated</p><p>✓  Staff payslip self-view — staff sees only their own payslip history</p><p>✓  Payslip management UI (React)</p>|

|**Sprint 16:** Financial Reports + Nepal Tax Compliance   (2 weeks)|
| :- |
|<p>✓  Profit & Loss report — revenue vs expenses by period, exportable to Excel/PDF</p><p>✓  Balance sheet — full assets, liabilities, equity at any selected date</p><p>✓  Cash flow statement — operating, investing, financing activities</p><p>✓  VAT report — output VAT from sales, input VAT from purchases, net payable</p><p>✓  Bank reconciliation — mark entries reconciled against CSV bank statement import</p><p>✓  Accounts receivable aging — outstanding invoices by customer (30/60/90+ days)</p><p>✓  Accounts payable — outstanding supplier PO amounts</p><p>✓  Nepal IRD VAT export format — compliant CSV/Excel for submission</p><p>✓  Financial dashboard widgets — cash position, receivables, payables, P&L this month</p>|

|**Model**|**Critical Fields**|
| :- | :- |
|Account|tenant, code, name, type, parent (self FK), is\_system\_account, balance\_cache|
|LedgerEntry|tenant, account, date, description, debit, credit, reference\_type, reference\_id, posted\_by, is\_reconciled|
|BankAccount|tenant, bank\_name, account\_number, account\_name, branch, current\_balance, is\_active|
|Expense|tenant, category, description, amount, date, account, receipt\_url, approved\_by, status, is\_recurring, recur\_interval|
|Payslip|tenant, staff, period\_start, period\_end, basic\_salary, coin\_value, allowances (JSON), deductions (JSON), gross, net\_pay, status, paid\_at|
|PaymentRecord|invoice, amount, payment\_date, method, reference, bank\_account (nullable), recorded\_by|



|<p>**PHASE 5**</p><p>**Mobile App — React Native**</p><p>Staff mobile app for iOS and Android — same API, offline support</p><p>**⏱ 6–8 Weeks • 3 Sprints**</p>|
| :- |

Phase 5 delivers a React Native mobile app for staff members. This is a staff-focused tool for field technicians and project workers who need to update tickets and tasks, capture photos, log hours, and receive push notifications on the go. It uses the same DRF API — no new backend work needed.

## **Phase 5 Goals**
- Staff login with JWT, biometric option (Face ID / fingerprint)
- My tickets — assigned tickets, status update, comments, photo attachments
- My tasks — project tasks, status update, actual hours logging
- Push notifications — all notification types via Firebase FCM
- Camera integration — capture and attach photos to tickets or tasks
- Offline support — view cached data, sync on reconnect
- My coins — balance, transaction history, approval status
- My payslips — history and PDF download
- iOS (App Store) + Android (Play Store) deployments via Expo EAS Build

## **Phase 5 — Sprint Breakdown**

|**Sprint 17:** App Foundation + Auth + Tickets   (3 weeks)|
| :- |
|<p>✓  Expo managed workflow with TypeScript — mirrors web structure</p><p>✓  JWT auth — login, token refresh, Expo SecureStore for token storage</p><p>✓  Push notification setup — Expo Notifications + FCM, deep link on tap</p><p>✓  Bottom tab navigation — My Tickets, My Tasks, Notifications, Profile</p><p>✓  Ticket list — assigned tickets with status, priority, SLA indicator</p><p>✓  Ticket detail — full info, timeline, comments, attachments</p><p>✓  Ticket status update — change status with dropdown and reason</p><p>✓  Add comment with photo — from camera roll or direct camera capture</p>|

|**Sprint 18:** Tasks, Coins, Payslip, Offline   (3 weeks)|
| :- |
|<p>✓  My tasks — project tasks with project name and due date context</p><p>✓  Task status update and actual hours logging</p><p>✓  Camera — capture photos, auto-compress, upload to S3, attach to ticket or task</p><p>✓  My coins — balance summary, pending/approved transaction history</p><p>✓  My payslips — list view, detail breakdown, download PDF via device browser</p><p>✓  Offline mode — SQLite cache for tickets and tasks</p><p>✓  Update queue — changes made offline queued and synced on reconnect</p><p>✓  Network status indicator — banner shown when offline</p>|

|**Sprint 19:** Polish, Testing, Store Deployment   (2 weeks)|
| :- |
|<p>✓  Biometric login — Face ID and fingerprint via Expo LocalAuthentication</p><p>✓  Staff availability screen — see team members and their current assignments</p><p>✓  Profile management — update name, phone, avatar photo</p><p>✓  App icon, splash screen, onboarding flow for first-time users</p><p>✓  Performance — lazy loading lists, image caching with expo-image</p><p>✓  Android build — AAB for Play Store via Expo EAS Build</p><p>✓  iOS build — IPA for App Store via Expo EAS Build with Apple developer account</p><p>✓  End-to-end tests — Detox test suite for login, ticket update, photo capture flows</p>|

|**📱 Tech Note**|React Native via Expo managed workflow. Shared TypeScript API types with the web frontend. Calls the same DRF API. No new backend endpoints needed in Phase 5.|
| :- | :- |


# **Full Roadmap Summary**

|**Phase**|**Module**|**Sprints**|**Weeks**|**Key Deliverable**|
| :- | :- | :- | :- | :- |
|Phase 1|Tickets + Projects + Foundation|1–6|10–12 wks|Full operational system — tickets, projects, coins, invoices|
|Phase 2|Inventory Management|7–9|5–6 wks|Product catalog, suppliers, purchase orders, stock reports|
|Phase 3|Website CMS|10–12|5–6 wks|Public website with product store, blog, inquiry capture|
|Phase 4|Accounting Suite|13–16|7–8 wks|Double-entry accounting, P&L, payslip, VAT report|
|Phase 5|Mobile App|17–19|6–8 wks|React Native iOS + Android staff app|
|TOTAL|All Modules|19 Sprints|~33–40 wks|Complete white-label SaaS platform|

|**💡 Parallelization**|Phase 5 (Mobile) can start in parallel with Phase 3 or 4 — the API is already complete by then. A second developer can build the React Native app while the first continues CMS and Accounting.|
| :- | :- |

|**🚀 Ship Early**|Deploy Phase 1 to your first paying tenant after Sprint 5. Real-world usage validates design and surfaces issues before you build Phase 2–4 on top of it.|
| :- | :- |

*— NEXUS BMS Development Phases —*

Confidential  •  Version 1.0  •  February 2026
NEXUS BMS — Development Phases  •  Page 1 of 2
