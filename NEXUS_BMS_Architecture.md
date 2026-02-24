**NEXUS BMS**

Business Management System

White-Label SaaS Platform — Full System Architecture

|<p>**Stack**</p><p>Django + DRF</p>|<p>**Frontend**</p><p>React (Web)</p>|<p>**Mobile**</p><p>React Native</p>|<p>**DB**</p><p>PostgreSQL</p>|
| :-: | :-: | :-: | :-: |

Version 1.0  |  February 2026  |  Confidential


# **1. Platform Overview**
NEXUS BMS is a multi-tenant, white-label business management platform designed for IT and technology service companies. It is architected to be sold to multiple businesses, each operating in their own isolated workspace (tenant) while sharing the same underlying infrastructure.

|**🏢 Target**|IT companies, repair shops, CCTV/AC installers, tech product sellers — Nepal market first, globally extensible.|
| :- | :- |

|**🌐 Delivery**|Subdomain-per-tenant (business.nexusbms.com) with single PostgreSQL database, tenant\_id isolation on all tables.|
| :- | :- |

|**📦 Modules**|Ticket Management, Project Management, Inventory, Accounting, Website CMS — modular, Phase 1 first.|
| :- | :- |

## **1.1 User Hierarchy**

|**Role**|**Scope**|**Capabilities**|
| :- | :- | :- |
|Super Admin|Platform-wide|Manage tenants, subscriptions, global settings, platform health|
|Tenant Admin|Within tenant|Full control — staff, roles, customers, products, tickets, accounting|
|Manager|Department/Team|Assign tickets, approve coins, view reports for their team|
|Technician|Assigned tickets|View/update assigned tickets and tasks, log work|
|Finance|Accounting module|Invoices, ledger, payslip, accounting reports|
|Custom Roles|Configurable|Admin defines permissions per module per role|


# **2. System Architecture**
## **2.1 High-Level Architecture**
The platform follows a clean separation between the Super Admin layer (platform management) and the Tenant layer (business operations). All communication between the React frontend and Django backend happens via a versioned REST API.

|**Layer**|**Technology**|**Purpose**|
| :- | :- | :- |
|Frontend Web|React + Vite + TailwindCSS|Tenant admin and staff panels, responsive web app|
|Mobile|React Native (Expo)|Staff mobile app — same DRF API, Phase 2|
|Backend API|Django 5 + Django REST Framework|Core business logic, all modules|
|Auth|JWT + SimpleJWT + django-guardian|Token auth, object-level permissions|
|Database|PostgreSQL 16|Primary data store, tenant\_id on all tenant tables|
|Cache|Redis|Session cache, real-time availability, task queue|
|Task Queue|Celery + Redis|Async: email, push notifications, report generation|
|File Storage|AWS S3 / MinIO (self-hosted option)|Documents, invoice PDFs, product images|
|Email|SMTP (per-tenant configurable)|Ticket notifications, invoice delivery|
|Push|Firebase FCM|Web push + mobile push notifications|
|Containerization|Docker + Docker Compose|Development and production deployment|

## **2.2 Multi-Tenancy Design**
Every request goes through TenantMiddleware which resolves the tenant from the subdomain and injects it into the request. All querysets are automatically scoped via a TenantManager that appends .filter(tenant=request.tenant) ensuring zero data leakage between tenants.

|**⚡ Key Rule**|Every model that belongs to a tenant inherits from TenantModel (abstract base class with tenant ForeignKey + TenantManager). Core models like User are linked to a tenant via TenantMembership.|
| :- | :- |

## **2.3 Folder Structure — Django Backend**

|<p>nexus\_bms/</p><p>├── config/               # Django settings (base, dev, prod)</p><p>├── core/                 # Shared: TenantModel, middleware, permissions</p><p>├── tenants/              # Super Admin: tenant CRUD, subscriptions</p><p>├── accounts/             # Auth: User, TenantMembership, custom roles</p><p>├── customers/            # Customer management (individual, org)</p><p>├── tickets/              # Ticket system: types, SLA, assignments</p><p>├── projects/             # Project management: tasks, tracking</p><p>├── inventory/            # Products, categories, stock movements</p><p>├── accounting/           # Ledger, invoices, payslip, P&L</p><p>├── notifications/        # Email + FCM push abstraction</p><p>├── cms/                  # Website CMS (Phase 3)</p><p>└── api/                  # Versioned API router (v1/)</p>|
| :- |

## **2.4 Folder Structure — React Frontend**

|<p>nexus-web/</p><p>├── src/</p><p>│   ├── api/              # Axios instances, endpoint constants</p><p>│   ├── app/              # React Router, layout, protected routes</p><p>│   ├── components/       # Shared UI components</p><p>│   ├── features/         # Feature modules (mirrors Django apps)</p><p>│   │   ├── tickets/</p><p>│   │   ├── projects/</p><p>│   │   ├── inventory/</p><p>│   │   ├── accounting/</p><p>│   │   └── cms/</p><p>│   ├── hooks/            # Custom React hooks</p><p>│   ├── store/            # Zustand global state</p><p>│   └── utils/            # Helpers, formatters, validators</p>|
| :- |


# **3. Core Database Schema**
## **3.1 Tenant & Auth Models**

|**Model**|**Key Fields**|**Notes**|
| :- | :- | :- |
|Tenant|id, name, subdomain, plan, vat\_enabled, vat\_rate, currency, coin\_to\_money\_rate, is\_active|One per business customer|
|User|id, email, full\_name, phone, is\_active, date\_joined|Shared User model, tenant-linked via membership|
|TenantMembership|user, tenant, role, department, is\_admin, date\_joined|User can belong to multiple tenants|
|Role|tenant, name, permissions (JSON), is\_system\_role|Fully customizable per tenant|
|Department|tenant, name, head (FK User)|Org structure for ticket transfers|

## **3.2 Customer Models**

|**Model**|**Key Fields**|
| :- | :- |
|Customer|tenant, type (individual/organization), name, email, phone, address, vat\_number, notes, created\_by|
|CustomerContact|customer, name, email, phone, role (for organization contacts)|

## **3.3 Ticket Models**

|**Model**|**Key Fields**|**Notes**|
| :- | :- | :- |
|TicketType|tenant, name, default\_sla\_hours, requires\_product|e.g. Repair, Installation, Support|
|Ticket|tenant, ticket\_number, type, customer, title, description, status, priority, assigned\_to, department, created\_by, sla\_deadline, parent\_ticket|Core ticket entity|
|TicketProduct|ticket, product, quantity, unit\_price, discount|Products/parts used in ticket|
|TicketTransfer|ticket, from\_dept, to\_dept, transferred\_by, reason, timestamp|Department transfer log|
|TicketComment|ticket, author, body, is\_internal, attachments|Internal/external comments|
|TicketSLA|ticket, sla\_hours, breached, breach\_at, notified|SLA tracking per ticket|

## **3.4 Project Models**

|**Model**|**Key Fields**|**Notes**|
| :- | :- | :- |
|Project|tenant, name, customer, status, start\_date, end\_date, manager, description, products (M2M)|Linked to products and customer|
|ProjectTask|project, title, description, assigned\_to, status, due\_date, estimated\_hours, actual\_hours|Individual task within project|
|ProjectMilestone|project, name, due\_date, is\_completed|Track progress milestones|

## **3.5 Inventory Models**

|**Model**|**Key Fields**|**Notes**|
| :- | :- | :- |
|Category|tenant, name, parent (self FK), description|Nested categories/subcategories|
|Product|tenant, category, name, sku, description, unit\_price, cost\_price, is\_service, track\_stock, reorder\_level, images|Services flagged as is\_service|
|StockMovement|product, movement\_type (in/out/transfer/adjustment), quantity, reference\_type (ticket/project/manual), reference\_id, performed\_by, notes|Full audit trail|
|StockLevel|product, quantity\_on\_hand, quantity\_reserved, last\_updated|Current stock snapshot|

## **3.6 Coin & Payslip Models**

|**Model**|**Key Fields**|**Notes**|
| :- | :- | :- |
|CoinTransaction|tenant, staff (user), amount, source\_type (ticket/project/manual), source\_id, status (pending/approved/rejected), approved\_by, note|Auto-created on completion, needs admin approval|
|Payslip|tenant, staff, period\_start, period\_end, base\_salary, total\_coins, coin\_value, bonus, deductions, net\_pay, status, generated\_by|Aggregates coin value + salary|

## **3.7 Accounting Models**

|**Model**|**Key Fields**|**Notes**|
| :- | :- | :- |
|Invoice|tenant, invoice\_number, customer, ticket, project, line\_items (JSON), subtotal, vat\_amount, vat\_rate, discount, total, status, due\_date, paid\_at|Generated per ticket or project|
|Account|tenant, name, type (cash/bank/income/expense/asset/liability), balance, account\_number|Chart of accounts|
|LedgerEntry|tenant, account, date, description, debit, credit, reference\_type, reference\_id, balance\_after|Double-entry bookkeeping|
|BankAccount|tenant, bank\_name, account\_number, account\_name, current\_balance|Bank accounts for reconciliation|
|Expense|tenant, category, amount, description, date, receipt\_url, account, approved\_by|Expense tracking|


# **4. API Design**
## **4.1 API Conventions**

|**Convention**|**Detail**|
| :- | :- |
|Base URL|https://{subdomain}.nexusbms.com/api/v1/|
|Auth|Bearer JWT token in Authorization header|
|Tenant Resolution|Resolved from subdomain via TenantMiddleware — no tenant\_id in URL|
|Pagination|cursor-based, page\_size configurable, default 25|
|Filtering|django-filter on all list endpoints|
|Response Format|{ "success": true, "data": {}, "meta": {}, "errors": [] }|
|Versioning|URL-based: /api/v1/ — v2 can coexist when needed|

## **4.2 Core API Endpoints — Phase 1**

|**Module**|**Endpoints**|
| :- | :- |
|Auth|POST /auth/login, POST /auth/refresh, POST /auth/logout, GET /auth/me|
|Staff & Roles|CRUD /staff/, CRUD /roles/, GET /staff/availability/|
|Customers|CRUD /customers/, CRUD /customers/{id}/contacts/|
|Ticket Types|CRUD /ticket-types/|
|Tickets|CRUD /tickets/, POST /tickets/{id}/transfer/, POST /tickets/{id}/assign/, GET /tickets/{id}/timeline/|
|Ticket Products|CRUD /tickets/{id}/products/ — auto triggers stock movement|
|SLA|GET /tickets/sla-breached/, GET /tickets/{id}/sla/|
|Projects|CRUD /projects/, CRUD /projects/{id}/tasks/, CRUD /projects/{id}/milestones/|
|Coins|GET /coins/my/, GET /coins/staff/{id}/, POST /coins/{id}/approve/, POST /coins/{id}/reject/|
|Inventory|CRUD /categories/, CRUD /products/, GET /products/{id}/stock/, GET /stock-movements/|
|Invoices|POST /invoices/generate/, GET /invoices/, GET /invoices/{id}/pdf/|


# **5. Module Specifications**
## **5.1 Ticket Management — Core Flow**
This is the heart of the system. Every ticket goes through a well-defined lifecycle with SLA tracking, department transfers, product attachment, and auto-coin reward on completion.

|**Status**|**Description**|**Who Can Set**|
| :- | :- | :- |
|Open|Ticket created, not yet assigned|Auto on creation|
|In Progress|Assigned to staff, work started|Assigned staff / Manager|
|Pending Customer|Waiting for customer response or part|Assigned staff|
|Transferred|Moved to another department|Manager / Admin|
|Resolved|Work done, pending closure|Assigned staff|
|Closed|Verified and closed|Manager / Admin|
|Cancelled|Cancelled with reason|Admin|

|**🔔 SLA**|SLA deadline is calculated from ticket creation time + TicketType.default\_sla\_hours. Celery checks every 15 minutes and sends email + push notification when 80% elapsed and on breach.|
| :- | :- |

|**📦 Inventory Hook**|When a product is added to a ticket via TicketProduct, a StockMovement (type=out) is automatically created. If ticket is cancelled, stock is reversed. No manual stock management needed.|
| :- | :- |

|**🪙 Coins**|When ticket status changes to Closed, a CoinTransaction (status=pending) is auto-created for the assigned staff. Admin sees a Coin Approval queue and approves/rejects. Approved coins accumulate in the staff's payslip for the current period.|
| :- | :- |

## **5.2 Project Management**
Projects are for longer-running work like CCTV installation, network setup, or AC servicing contracts. A project contains tasks, milestones, and can reference products that will be used.

|**Feature**|**Detail**|
| :- | :- |
|Products on Project|Admin selects products needed for the project — linked to inventory, movements recorded when task completed|
|Task Assignment|Each task assigned to one staff member with due date and hour estimates|
|Staff Availability|System marks staff as busy if they have open ticket or incomplete project task assigned to them|
|Progress Tracking|% complete = completed tasks / total tasks. Milestone completion tracked separately|
|Invoice|Invoice can be generated per project with product costs + service charges defined by admin|
|Coin Rewards|Task completion triggers coin pending approval — same flow as tickets|

## **5.3 Staff Availability Engine**
Staff availability is computed in real-time from active assignments. A staff member is BUSY if they have any ticket with status In Progress or Pending Customer assigned to them, OR any project task with status In Progress assigned to them.

|**⚡ Performance**|Availability is cached in Redis per staff member and invalidated when ticket/task status changes. GET /staff/availability/ returns a list with status (free/busy), current assignments count, and module breakdown.|
| :- | :- |

## **5.4 Inventory Management**

|**Feature**|**Detail**|
| :- | :- |
|Categories|Unlimited depth nesting (Laptops > HP > HP Pavilion Series)|
|Products|Physical products (track stock) + Services (no stock tracking)|
|Stock Movements|Every in/out is logged with source reference (ticket ID, project ID, or manual)|
|Low Stock Alert|When stock\_on\_hand <= reorder\_level, email + push notification to admin|
|Website Sync|Products flagged is\_published=True appear on the CMS website (Phase 3)|
|Pricing|unit\_price is the sell price, cost\_price is purchase cost — margin calculated in accounting|

## **5.5 Accounting Module**

|**Feature**|**Detail**|
| :- | :- |
|Double-Entry|Every financial event creates balanced LedgerEntry pairs (debit + credit)|
|VAT|VAT toggle per tenant. When enabled, VAT rate (default 13% Nepal) applied to invoices. Can be overridden per invoice|
|Invoice|Auto-generated from ticket or project. Includes line items, VAT breakdown, discount, total in NPR|
|Profit & Loss|Auto-calculated from ledger entries: Revenue accounts vs Expense accounts per period|
|Payslip|Admin generates payslip per staff per period. Shows base salary + (total\_approved\_coins × coin\_to\_money\_rate) + bonuses - deductions|
|Cash Ledger|Manual cash in/out entries with category and description|
|Bank Accounts|Multiple bank accounts per tenant with balance tracking and reconciliation|


# **6. Development Phases**
## **Phase 1 — Foundation + Tickets + Projects (URGENT)**

|**⏱ Target**|8–12 weeks for a lean, production-ready Phase 1|
| :- | :- |

|**Sprint**|**Deliverables**|
| :- | :- |
|Sprint 1 (2 weeks)|Django project setup, PostgreSQL, Docker, Tenant middleware, User auth + JWT, Role system, Super Admin panel basics|
|Sprint 2 (2 weeks)|Customer management, Staff management, Department management, Custom role builder, Staff availability engine|
|Sprint 3 (2 weeks)|Ticket Types + SLA config, Full ticket CRUD, Ticket assignment + transfer, Ticket comments + attachments|
|Sprint 4 (2 weeks)|Ticket products (inventory hook), Coin system + approval queue, Basic invoice generation, Email notifications|
|Sprint 5 (2 weeks)|Project CRUD + task management, Milestone tracking, Project-product linking, Project invoice, Push notifications (FCM)|
|Sprint 6 (1-2 weeks)|React frontend — Auth, Dashboard, Ticket module UI, Project module UI, Polish + testing|

## **Phase 2 — Inventory Management**
Full inventory module with category tree, stock movements, low-stock alerts, supplier management, and purchase orders. Estimated 4–6 weeks.

## **Phase 3 — Website CMS**
Public-facing website builder per tenant — product catalog from inventory, service pages, contact forms, blog. Estimated 4–6 weeks.

## **Phase 4 — Accounting Suite**
Full chart of accounts, P&L statements, balance sheet, bank reconciliation, tax reports for Nepal. Estimated 6–8 weeks.

## **Phase 5 — Mobile App (React Native)**
Staff mobile app — view assigned tickets and tasks, update status, take photos, push notifications. Shares the same DRF API. Estimated 4–6 weeks.


# **7. Integration Architecture & Future-Proofing**
## **7.1 Payment Gateway — Stubbed**
The Invoice model includes payment\_gateway (nullable), payment\_status, payment\_reference fields. A PaymentProvider abstract class exists in the codebase with adapters stubbed for eSewa, Khalti, and Stripe. When you're ready to activate, you implement the adapter and flip a feature flag per tenant.

## **7.2 Customer Portal — Stubbed**
TenantSettings includes a customer\_portal\_enabled flag (default False). The URL routes and permission checks are in place but return 403 until enabled. No UI built yet. When activated, customers can log in to view their ticket status and invoices.

## **7.3 Notification Architecture**

|**Event**|**Email**|**Push**|
| :- | :- | :- |
|Ticket assigned to staff|✓|✓|
|Ticket transferred|✓|✓|
|SLA 80% warning|✓|✓|
|SLA breached|✓|✓|
|Coin pending approval|✓ (admin)|✓ (admin)|
|Coin approved/rejected|✓ (staff)|✓ (staff)|
|Invoice generated|✓ (customer)|—|
|Low stock alert|✓ (admin)|✓ (admin)|
|Task assigned (project)|✓|✓|

## **7.4 Super Admin — Platform Controls**

|**Feature**|**Detail**|
| :- | :- |
|Tenant Management|Create, suspend, delete tenants. View tenant health dashboard|
|Subscription Plans|Define plans with module access flags. Restrict modules by plan|
|Platform Analytics|Active tenants, ticket volumes, storage usage across all tenants|
|Feature Flags|Toggle features per tenant (customer portal, CMS, mobile app, etc.)|
|Impersonation|Super admin can log in as any tenant admin for support purposes (logged)|


# **8. Key Technology Decisions**

|**Decision**|**Choice**|**Reason**|
| :- | :- | :- |
|ORM|Django ORM + django-filter|Mature, secure, auto-scoped with TenantManager|
|State Management|Zustand (React)|Lightweight, no boilerplate, ideal for modular features|
|API Client|Axios + React Query|Caching, background refetch, mutation handling|
|PDF Generation|WeasyPrint (server-side)|Clean invoice PDFs from HTML templates, no JS needed|
|File Uploads|django-storages + S3/MinIO|Swap S3 for MinIO in self-hosted, same code|
|Real-time|Django Channels (WebSocket)|Phase 2 — for live ticket/staff status updates|
|Testing|pytest-django + Factory Boy|Fast, isolated tests per module|
|CI/CD|GitHub Actions + Docker|Automated test + deploy pipeline|

|**🔐 Security**|Every API view enforces: (1) JWT auth, (2) tenant scope via TenantMixin, (3) role permission via custom has\_permission. No raw SQL. All user inputs validated via DRF serializers.|
| :- | :- |

# **9. Immediate Next Steps**
You are ready to start building. Here is the recommended order:

- 1. Initialize monorepo — Django backend + React frontend in one Git repo with separate folders
- 2. Set up Docker Compose — PostgreSQL, Redis, Django, React with hot reload
- 3. Build TenantMiddleware + TenantModel abstract base — this is the foundation everything else sits on
- 4. Build Auth: User registration, JWT login, TenantMembership, Role system
- 5. Build Staff + Customer CRUD with role-based permissions
- 6. Build Ticket system with SLA, assignment, transfer, products hook
- 7. Build Coin system + approval queue
- 8. Build basic Invoice generator
- 9. Build Project management on top of the same patterns
- 10. Wire up React frontend module by module

|**💡 Tip**|Start coding the backend first. Get the API solid and tested before building the React UI. This way the frontend team (or you later) can build UI against a stable, documented API.|
| :- | :- |

*— NEXUS BMS Architecture Document —*

Confidential • Version 1.0 • February 2026
NEXUS BMS Architecture  •  Page  of 
