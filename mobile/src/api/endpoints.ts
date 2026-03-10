// All API endpoints — mirrors the Django URL structure
// Mobile uses X-Tenant-Slug header; no subdomain required.

export const AUTH = {
  TOKEN: '/accounts/token/',
  REFRESH: '/accounts/token/refresh/',
  LOGOUT: '/accounts/logout/',
  ME: '/accounts/me/',
  TWO_FA_SETUP: '/accounts/2fa/setup/',
  TWO_FA_CONFIRM: '/accounts/2fa/confirm-setup/',
  TWO_FA_VERIFY: '/accounts/2fa/verify/',
  TWO_FA_DISABLE: '/accounts/2fa/disable/',
  TWO_FA_BACKUP_CODES: '/accounts/2fa/backup-codes/',
  TWO_FA_REGEN_BACKUP: '/accounts/2fa/backup-codes/regenerate/',
  // Aliases for mobile 2FA screen readability
  TOTP_SETUP_INIT: '/accounts/2fa/setup/',
  TOTP_SETUP_CONFIRM: '/accounts/2fa/confirm-setup/',
  TOTP_DISABLE: '/accounts/2fa/disable/',
  TOTP_BACKUP_CODES: '/accounts/2fa/backup-codes/regenerate/',
} as const

export const TENANT = {
  RESOLVE: '/tenants/resolve/', // GET ?slug=xxx — public, no auth
  SETTINGS: '/settings/',
} as const

export const DASHBOARD = {
  STATS: '/dashboard/stats/',
} as const

export const NOTIFICATIONS = {
  LIST: '/notifications/',
  UNREAD_COUNT: '/notifications/unread-count/',
  PREFERENCES: '/notifications/preferences/',
  MARK_ALL_READ: '/notifications/mark-all-read/',
  MARK_READ: (id: number) => `/notifications/${id}/read/`,
  DEVICES: '/notifications/devices/',
  DEVICE: (token: string) => `/notifications/devices/${encodeURIComponent(token)}/`,
} as const

export const TICKETS = {
  LIST: '/tickets/',
  DETAIL: (id: number | string) => `/tickets/${id}/`,
  CREATE: '/tickets/',
  COMMENTS: (id: number | string) => `/tickets/${id}/comments/`,
  COMMENT_DETAIL: (ticketId: number | string, commentId: number | string) => `/tickets/${ticketId}/comments/${commentId}/`,
  ATTACHMENTS: (id: number | string) => `/tickets/${id}/attachments/`,
  ATTACHMENT_DETAIL: (ticketId: number | string, attachId: number | string) => `/tickets/${ticketId}/attachments/${attachId}/`,
  TRANSFER: (id: number | string) => `/tickets/${id}/transfer/`,
  ASSIGN: (id: number | string) => `/tickets/${id}/assign/`,
  CLOSE: (id: number | string) => `/tickets/${id}/close/`,
  STATUS: (id: number | string) => `/tickets/${id}/status/`,
  TIMELINE: (id: number | string) => `/tickets/${id}/timeline/`,
  PRODUCTS: (id: number | string) => `/tickets/${id}/products/`,
  PRODUCT_DETAIL: (ticketId: number | string, productId: number | string) => `/tickets/${ticketId}/products/${productId}/`,
  TYPES: '/tickets/types/',
  TYPE_DETAIL: (id: number | string) => `/tickets/types/${id}/`,
  TYPE_DEACTIVATE: (id: number | string) => `/tickets/types/${id}/deactivate/`,
  TYPE_REACTIVATE: (id: number | string) => `/tickets/types/${id}/reactivate/`,
  CATEGORIES: '/tickets/categories/',
  CATEGORY_DETAIL: (id: number | string) => `/tickets/categories/${id}/`,
  SUBCATEGORIES: '/tickets/subcategories/',
  SUBCATEGORY_DETAIL: (id: number | string) => `/tickets/subcategories/${id}/`,
  SLA: '/tickets/sla/',
  SLA_BREACHED: '/tickets/sla-breached/',
  VEHICLES: '/tickets/vehicles/',
  VEHICLE_DETAIL: (id: number | string) => `/tickets/vehicles/${id}/`,
} as const

export const PROJECTS = {
  LIST: '/projects/',
  DETAIL: (id: number | string) => `/projects/${id}/`,
  CREATE: '/projects/',
  TASKS: (id: number | string) => `/projects/${id}/tasks/`,
  TASK_DETAIL: (projectId: number | string, taskId: number | string) => `/projects/${projectId}/tasks/${taskId}/`,
  TASK_STATUS: (projectId: number | string, taskId: number | string) => `/projects/${projectId}/tasks/${taskId}/status/`,
  MILESTONES: (id: number | string) => `/projects/${id}/milestones/`,
  MILESTONE_DETAIL: (projectId: number | string, milestoneId: number | string) => `/projects/${projectId}/milestones/${milestoneId}/`,
  MILESTONE_TOGGLE: (projectId: number | string, milestoneId: number | string) => `/projects/${projectId}/milestones/${milestoneId}/toggle/`,
  PROJECT_PRODUCTS: (id: number | string) => `/projects/${id}/project-products/`,
  PROJECT_PRODUCT_DETAIL: (projectId: number | string, ppId: number | string) => `/projects/${projectId}/project-products/${ppId}/`,
  ATTACHMENTS: (id: number | string) => `/projects/${id}/attachments/`,
  ATTACHMENT_DETAIL: (projectId: number | string, attachId: number | string) => `/projects/${projectId}/attachments/${attachId}/`,
  PRODUCT_REQUESTS: (id: number | string) => `/projects/${id}/product-requests/`,
  PRODUCT_REQUEST_DETAIL: (projectId: number | string, reqId: number | string) => `/projects/${projectId}/product-requests/${reqId}/`,
  PRODUCT_REQUEST_APPROVE: (projectId: number | string, reqId: number | string) => `/projects/${projectId}/product-requests/${reqId}/approve/`,
  PRODUCT_REQUEST_REJECT: (projectId: number | string, reqId: number | string) => `/projects/${projectId}/product-requests/${reqId}/reject/`,
  SCHEDULES: (id: number | string) => `/projects/${id}/schedules/`,
  SCHEDULE_DETAIL: (projectId: number | string, schedId: number | string) => `/projects/${projectId}/schedules/${schedId}/`,
  SCHEDULE_MARK_PRESENT: (projectId: number | string, schedId: number | string) => `/projects/${projectId}/schedules/${schedId}/mark-present/`,
} as const

export const CUSTOMERS = {
  LIST: '/customers/',
  DETAIL: (id: number | string) => `/customers/${id}/`,
  CREATE: '/customers/',
  CONTACTS: (id: number | string) => `/customers/${id}/contacts/`,
} as const

export const INVENTORY = {
  PRODUCTS: '/inventory/products/',
  PRODUCT: (id: number) => `/inventory/products/${id}/`,
  STOCK_LEVELS: '/inventory/stock-levels/',
} as const

export const ACCOUNTING = {
  // Coins
  COINS: '/accounting/coins/',
  COIN_DETAIL: (id: number | string) => `/accounting/coins/${id}/`,
  COIN_APPROVE: (id: number | string) => `/accounting/coins/${id}/approve/`,
  COIN_REJECT: (id: number | string) => `/accounting/coins/${id}/reject/`,
  COINS_PENDING: '/accounting/coins/pending/',
  COINS_AWARD: '/accounting/coins/award/',
  COINS_STAFF_HISTORY: (staffId: number | string) => `/accounting/coins/staff/${staffId}/`,
  // Payslips
  PAYSLIPS: '/accounting/payslips/',
  PAYSLIP: (id: number | string) => `/accounting/payslips/${id}/`,
  PAYSLIP_GENERATE: '/accounting/payslips/generate/',
  PAYSLIP_ISSUE: (id: number | string) => `/accounting/payslips/${id}/issue/`,
  PAYSLIP_MARK_PAID: (id: number | string) => `/accounting/payslips/${id}/mark-paid/`,
  // Salary profiles
  SALARY_PROFILES: '/accounting/salary-profiles/',
  SALARY_PROFILE_DETAIL: (id: number | string) => `/accounting/salary-profiles/${id}/`,
  // Invoices
  INVOICES: '/accounting/invoices/',
  INVOICE: (id: number | string) => `/accounting/invoices/${id}/`,
  INVOICE_GENERATE: '/accounting/invoices/generate/',
  INVOICE_GENERATE_FROM_TICKET: '/accounting/invoices/generate-from-ticket/',
  INVOICE_ISSUE: (id: number | string) => `/accounting/invoices/${id}/issue/`,
  INVOICE_MARK_PAID: (id: number | string) => `/accounting/invoices/${id}/mark-paid/`,
  INVOICE_VOID: (id: number | string) => `/accounting/invoices/${id}/void/`,
  INVOICE_PDF: (id: number | string) => `/accounting/invoices/${id}/pdf/`,
  INVOICE_SEND: (id: number | string) => `/accounting/invoices/${id}/send/`,
  INVOICE_COLLECT_PAYMENT: (id: number | string) => `/accounting/invoices/${id}/collect-payment/`,
  INVOICES_BY_TICKET: (ticketId: number | string) => `/accounting/invoices/?ticket=${ticketId}`,
  // Quotations
  QUOTATIONS: '/accounting/quotations/',
  QUOTATION_DETAIL: (id: number | string) => `/accounting/quotations/${id}/`,
  QUOTATION_CONVERT: (id: number | string) => `/accounting/quotations/${id}/convert/`,
  // Chart of Accounts
  ACCOUNTS: '/accounting/accounts/',
  ACCOUNT_DETAIL: (id: number | string) => `/accounting/accounts/${id}/`,
  ACCOUNTS_TRIAL_BALANCE: '/accounting/accounts/trial-balance/',
  // Bank Accounts
  BANK_ACCOUNTS: '/accounting/bank-accounts/',
  BANK_ACCOUNT_DETAIL: (id: number | string) => `/accounting/bank-accounts/${id}/`,
  // Journals
  JOURNALS: '/accounting/journals/',
  JOURNAL_DETAIL: (id: number | string) => `/accounting/journals/${id}/`,
  JOURNAL_POST: (id: number | string) => `/accounting/journals/${id}/post/`,
  // Reports
  REPORT_PL: '/accounting/reports/profit-loss/',
  REPORT_BALANCE_SHEET: '/accounting/reports/balance-sheet/',
  REPORT_TRIAL_BALANCE: '/accounting/reports/trial-balance/',
  REPORT_VAT: '/accounting/reports/vat-report/',
  REPORT_LEDGER: '/accounting/reports/ledger/',
  REPORT_DAY_BOOK: '/accounting/reports/day-book/',
} as const

export const STAFF = {
  LIST: '/staff/',
  DETAIL: (id: number | string) => `/staff/${id}/`,
  AVAILABILITY: '/staff/availability/',
  INVITE: '/staff/',
  DEACTIVATE: (id: number | string) => `/staff/${id}/deactivate/`,
  REACTIVATE: (id: number | string) => `/staff/${id}/reactivate/`,
  RESET_PASSWORD: (id: number | string) => `/staff/${id}/reset-password/`,
  ASSIGN_ROLE: (id: number | string) => `/staff/${id}/assign-role/`,
  GENERATE_ID: '/staff/generate_employee_id/',
} as const

export const DEPARTMENTS = {
  LIST: '/departments/',
  DETAIL: (id: number | string) => `/departments/${id}/`,
  CREATE: '/departments/',
  UPDATE: (id: number | string) => `/departments/${id}/`,
  DELETE: (id: number | string) => `/departments/${id}/`,
} as const

export const ROLES = {
  LIST: '/roles/',
  DETAIL: (id: number | string) => `/roles/${id}/`,
  CREATE: '/roles/',
  UPDATE: (id: number | string) => `/roles/${id}/`,
  DELETE: (id: number | string) => `/roles/${id}/`,
  PERMISSIONS: '/roles/permissions/',
  PERMISSION_MAP: '/roles/permission-map/',
  SEED_PRELOADS: '/roles/seed-preloads/',
} as const

// ── Tenants / Plans / Modules (super-admin) ─────────────────────────────────

export const TENANTS = {
  LIST: '/tenants/',
  DETAIL: (id: number | string) => `/tenants/${id}/`,
  SUSPEND: (id: number | string) => `/tenants/${id}/suspend/`,
  ACTIVATE: (id: number | string) => `/tenants/${id}/activate/`,
  MEMBERS: (id: number | string) => `/tenants/${id}/members/`,
  MODULE_OVERRIDES: (id: number | string) => `/tenants/${id}/module_overrides/`,
} as const

export const PLANS = {
  LIST: '/plans/',
  DETAIL: (id: number | string) => `/plans/${id}/`,
  TOGGLE_MODULE: (id: number | string) => `/plans/${id}/toggle_module/`,
} as const

export const MODULES = {
  LIST: '/modules/',
} as const

// ── Inventory (Phase 2 — stubs only) ───────────────────────────────────────

export const INVENTORY_FULL = {
  PRODUCTS: '/inventory/products/',
  PRODUCT_DETAIL: (id: number | string) => `/inventory/products/${id}/`,
  STOCK_LEVELS: '/inventory/stock-levels/',
  LOW_STOCK: '/inventory/products/low-stock/',
  STOCK_COUNTS: '/inventory/stock-counts/',
  STOCK_COUNT_DETAIL: (id: number | string) => `/inventory/stock-counts/${id}/`,
  MOVEMENTS: '/inventory/movements/',
  SUPPLIERS: '/inventory/suppliers/',
  PURCHASE_ORDERS: '/inventory/purchase-orders/',
} as const

// ── CMS / Website Builder ──────────────────────────────────────────────────

export const CMS = {
  // Private (authenticated)
  SITE:         '/cms/site/',
  PAGES:        '/cms/pages/',
  BLOG:         '/cms/blog/',
  GENERATE:     '/cms/generate/',

  // Public (no auth — Next.js renderer / mobile preview)
  PUBLIC_SITE:  (subdomain: string) => `/cms/public/${subdomain}/`,
  PUBLIC_PAGE:  (subdomain: string, slug: string) => `/cms/public/${subdomain}/pages/${slug}/`,
  PUBLIC_BLOG:  (subdomain: string) => `/cms/public/${subdomain}/blog/`,
  PUBLIC_POST:  (subdomain: string, slug: string) => `/cms/public/${subdomain}/blog/${slug}/`,
} as const
