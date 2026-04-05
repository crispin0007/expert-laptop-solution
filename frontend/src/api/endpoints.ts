// All API endpoint constants — import from here, never hard-code URLs in components

export const AUTH = {
  TOKEN: '/accounts/token/',
  REFRESH: '/accounts/token/refresh/',
  ME: '/accounts/me/',
  TWO_FA_SETUP: '/accounts/2fa/setup/',
  TWO_FA_CONFIRM: '/accounts/2fa/confirm-setup/',
  TWO_FA_VERIFY: '/accounts/2fa/verify/',
  TWO_FA_DISABLE: '/accounts/2fa/disable/',
  TWO_FA_BACKUP_CODES: '/accounts/2fa/backup-codes/',
  TWO_FA_REGEN_BACKUP: '/accounts/2fa/backup-codes/regenerate/',
} as const

export const DASHBOARD = {
  STATS: '/dashboard/stats/',
} as const

export const TICKETS = {
  LIST: '/tickets/',
  DETAIL: (id: number) => `/tickets/${id}/`,
  COMMENTS: (id: number) => `/tickets/${id}/comments/`,
  COMMENT_DETAIL: (ticketId: number, commentId: number) => `/tickets/${ticketId}/comments/${commentId}/`,
  ASSIGN: (id: number) => `/tickets/${id}/assign/`,
  TRANSFER: (id: number) => `/tickets/${id}/transfer/`,
  STATUS: (id: number) => `/tickets/${id}/status/`,
  TIMELINE: (id: number) => `/tickets/${id}/timeline/`,
  TICKET_PRODUCTS: (id: number) => `/tickets/${id}/products/`,
  TICKET_PRODUCT_DETAIL: (ticketId: number, productId: number) => `/tickets/${ticketId}/products/${productId}/`,
  TICKET_ATTACHMENTS: (id: number) => `/tickets/${id}/attachments/`,
  TICKET_ATTACHMENT_DETAIL: (ticketId: number, attachId: number) => `/tickets/${ticketId}/attachments/${attachId}/`,
  TYPES: '/tickets/types/',
  TYPE_DEACTIVATE: (id: number) => `/tickets/types/${id}/deactivate/`,
  TYPE_REACTIVATE: (id: number) => `/tickets/types/${id}/reactivate/`,
  CATEGORIES: '/tickets/categories/',
  CATEGORY_DETAIL: (id: number) => `/tickets/categories/${id}/`,
  CATEGORY_SUBCATEGORIES: (id: number) => `/tickets/categories/${id}/subcategories/`,
  SUBCATEGORIES: '/tickets/subcategories/',
  SUBCATEGORY_DETAIL: (id: number) => `/tickets/subcategories/${id}/`,
  TRANSFERS: '/tickets/transfers/',
  PRODUCTS: '/tickets/products/',
  SLA: '/tickets/sla/',
  SLA_BREACHED: '/tickets/sla-breached/',
  SLA_WARNING: '/tickets/sla-warning/',
  ATTACHMENTS: '/tickets/attachments/',
  CLOSE: (id: number) => `/tickets/${id}/close/`,
  VEHICLES: '/tickets/vehicles/',
  VEHICLE_DETAIL: (id: number) => `/tickets/vehicles/${id}/`,
  VEHICLE_LOGS: '/tickets/vehicle-logs/',
  VEHICLE_LOG_DETAIL: (id: number) => `/tickets/vehicle-logs/${id}/`,
  VEHICLE_TICKET_LOGS: (ticketId: number) => `/tickets/vehicle-logs/?ticket=${ticketId}`,
} as const

export const CUSTOMERS = {
  LIST: '/customers/',
  DETAIL: (id: number) => `/customers/${id}/`,
  CONTACTS: (id: number) => `/customers/${id}/contacts/`,
  GEO_OVERVIEW: '/customers/geo-overview/',
} as const

export const PROJECTS = {
  LIST: '/projects/',
  DETAIL: (id: number) => `/projects/${id}/`,
  TASKS: (id: number) => `/projects/${id}/tasks/`,
  TASK_DETAIL: (projectId: number, taskId: number) => `/projects/${projectId}/tasks/${taskId}/`,
  TASK_STATUS: (projectId: number, taskId: number) => `/projects/${projectId}/tasks/${taskId}/status/`,
  MILESTONES: (id: number) => `/projects/${id}/milestones/`,
  MILESTONE_DETAIL: (projectId: number, milestoneId: number) => `/projects/${projectId}/milestones/${milestoneId}/`,
  MILESTONE_TOGGLE: (projectId: number, milestoneId: number) => `/projects/${projectId}/milestones/${milestoneId}/toggle/`,
  PROJECT_PRODUCTS: (id: number) => `/projects/${id}/project-products/`,
  PROJECT_PRODUCT_DETAIL: (projectId: number, ppId: number) => `/projects/${projectId}/project-products/${ppId}/`,
  ATTACHMENTS: (id: number) => `/projects/${id}/attachments/`,
  ATTACHMENT_DETAIL: (projectId: number, attachId: number) => `/projects/${projectId}/attachments/${attachId}/`,
  PRODUCT_REQUESTS: (id: number) => `/projects/${id}/product-requests/`,
  PRODUCT_REQUEST_DETAIL: (projectId: number, reqId: number) => `/projects/${projectId}/product-requests/${reqId}/`,
  PRODUCT_REQUEST_APPROVE: (projectId: number, reqId: number) => `/projects/${projectId}/product-requests/${reqId}/approve/`,
  PRODUCT_REQUEST_REJECT: (projectId: number, reqId: number) => `/projects/${projectId}/product-requests/${reqId}/reject/`,
  SCHEDULES: (id: number) => `/projects/${id}/schedules/`,
  SCHEDULE_DETAIL: (projectId: number, schedId: number) => `/projects/${projectId}/schedules/${schedId}/`,
  SCHEDULE_MARK_PRESENT: (projectId: number, schedId: number) => `/projects/${projectId}/schedules/${schedId}/mark-present/`,
} as const

export const NOTIFICATIONS = {
  LIST: '/notifications/',
  UNREAD_COUNT: '/notifications/unread-count/',
  MARK_READ: (id: number) => `/notifications/${id}/read/`,
  MARK_ALL_READ: '/notifications/mark-all-read/',
  DISMISS: (id: number) => `/notifications/${id}/`,
  CLEAR_READ: '/notifications/clear-read/',
  PREFERENCES: '/notifications/preferences/',
} as const

export const DEPARTMENTS = {
  LIST: '/departments/',
  DETAIL: (id: number) => `/departments/${id}/`,
} as const

export const STAFF = {
  LIST: '/staff/',
  DETAIL: (id: number) => `/staff/${id}/`,
  DEACTIVATE: (id: number) => `/staff/${id}/deactivate/`,
  REACTIVATE: (id: number) => `/staff/${id}/reactivate/`,
  RESET_PASSWORD: (id: number) => `/staff/${id}/reset_password/`,
  ASSIGN_ROLE: (id: number) => `/staff/${id}/assign-role/`,
  AVAILABILITY: '/staff/availability/',
} as const

export const ROLES = {
  LIST: '/roles/',
  DETAIL: (id: number) => `/roles/${id}/`,
  PERMISSION_MAP: '/roles/permission-map/',
  SEED_PRELOADS: '/roles/seed-preloads/',
} as const

export const ACCOUNTING = {
  // ── Chart of Accounts ───────────────────────────────────────────────────
  ACCOUNTS: '/accounting/accounts/',
  ACCOUNT_DETAIL: (id: number) => `/accounting/accounts/${id}/`,
  ACCOUNTS_TRIAL_BALANCE: '/accounting/accounts/trial-balance/',
  ACCOUNTS_RESET_TO_DEFAULT: '/accounting/accounts/reset-to-default/',
  ACCOUNT_GROUPS: '/accounting/account-groups/',

  // ── Bank Accounts ────────────────────────────────────────────────────────
  BANK_ACCOUNTS: '/accounting/bank-accounts/',
  BANK_ACCOUNT_DETAIL: (id: number) => `/accounting/bank-accounts/${id}/`,

  // ── Journal Entries ──────────────────────────────────────────────────────
  JOURNALS: '/accounting/journals/',
  JOURNAL_DETAIL: (id: number) => `/accounting/journals/${id}/`,
  JOURNAL_POST: (id: number) => `/accounting/journals/${id}/post/`,

  // ── Bills ────────────────────────────────────────────────────────────────
  BILLS: '/accounting/bills/',
  BILL_DETAIL: (id: number) => `/accounting/bills/${id}/`,
  BILL_APPROVE: (id: number) => `/accounting/bills/${id}/approve/`,
  BILL_VOID: (id: number) => `/accounting/bills/${id}/void/`,
  BILL_MARK_PAID: (id: number) => `/accounting/bills/${id}/mark-paid/`,

  // ── Payments ─────────────────────────────────────────────────────────────
  PAYMENTS: '/accounting/payments/',
  PAYMENT_DETAIL: (id: number) => `/accounting/payments/${id}/`,
  PAYMENT_ALLOCATE: (id: number) => `/accounting/payments/${id}/allocate/`,
  PAYMENT_CHEQUE_STATUS: (id: number) => `/accounting/payments/${id}/cheque-status/`,
  PAYMENT_BOUNCE:        (id: number) => `/accounting/payments/${id}/bounce/`,

  // ── Credit Notes ─────────────────────────────────────────────────────────
  CREDIT_NOTES: '/accounting/credit-notes/',
  CREDIT_NOTE_DETAIL: (id: number) => `/accounting/credit-notes/${id}/`,
  CREDIT_NOTE_ISSUE: (id: number) => `/accounting/credit-notes/${id}/issue/`,
  CREDIT_NOTE_APPLY: (id: number) => `/accounting/credit-notes/${id}/apply/`,
  CREDIT_NOTE_VOID: (id: number) => `/accounting/credit-notes/${id}/void/`,

  // ── Reports ───────────────────────────────────────────────────────────────
  REPORT_PL: '/accounting/reports/profit-loss/',
  REPORT_BALANCE_SHEET: '/accounting/reports/balance-sheet/',
  REPORT_TRIAL_BALANCE: '/accounting/reports/trial-balance/',
  REPORT_AGED_RECEIVABLES: '/accounting/reports/aged-receivables/',
  REPORT_AGED_PAYABLES: '/accounting/reports/aged-payables/',
  REPORT_VAT: '/accounting/reports/vat-report/',
  REPORT_CASH_FLOW: '/accounting/reports/cash-flow/',
  REPORT_RATIO_ANALYSIS: '/accounting/reports/ratio-analysis/',
  REPORT_COST_CENTRE_PL: '/accounting/reports/cost-centre-pl/',
  REPORT_CASH_BOOK: '/accounting/reports/cash-book/',
  REPORT_FISCAL_YEAR_STATUS: '/accounting/reports/fiscal-year-status/',
  REPORT_CLOSE_FISCAL_YEAR: '/accounting/reports/close-fiscal-year/',
  // Cost Centres (for dropdown)
  COST_CENTRES: '/accounting/cost-centres/',
  // GL
  REPORT_GL_SUMMARY: '/accounting/reports/gl-summary/',
  REPORT_GL_MASTER: '/accounting/reports/gl-master/',
  // Receivables
  REPORT_CUSTOMER_RECEIVABLE_SUMMARY: '/accounting/reports/customer-receivable-summary/',
  REPORT_INVOICE_AGE: '/accounting/reports/invoice-age-detail/',
  REPORT_CUSTOMER_STATEMENT: '/accounting/reports/customer-statement/',
  // Payables
  REPORT_SUPPLIER_PAYABLE_SUMMARY: '/accounting/reports/supplier-payable-summary/',
  REPORT_BILL_AGE: '/accounting/reports/bill-age-detail/',
  REPORT_SUPPLIER_STATEMENT: '/accounting/reports/supplier-statement/',
  // Sales
  REPORT_SALES_BY_CUSTOMER: '/accounting/reports/sales-by-customer/',
  REPORT_SALES_BY_ITEM: '/accounting/reports/sales-by-item/',
  REPORT_SALES_BY_CUSTOMER_MONTHLY: '/accounting/reports/sales-by-customer-monthly/',
  REPORT_SALES_BY_ITEM_MONTHLY: '/accounting/reports/sales-by-item-monthly/',
  REPORT_SALES_MASTER: '/accounting/reports/sales-master/',
  REPORT_SALES_SUMMARY: '/accounting/reports/sales-summary/',
  // Purchases
  REPORT_PURCHASE_BY_SUPPLIER: '/accounting/reports/purchase-by-supplier/',
  REPORT_PURCHASE_BY_ITEM: '/accounting/reports/purchase-by-item/',
  REPORT_PURCHASE_BY_SUPPLIER_MONTHLY: '/accounting/reports/purchase-by-supplier-monthly/',
  REPORT_PURCHASE_BY_ITEM_MONTHLY: '/accounting/reports/purchase-by-item-monthly/',
  REPORT_PURCHASE_MASTER: '/accounting/reports/purchase-master/',
  // Tax / IRD
  REPORT_SALES_REGISTER: '/accounting/reports/sales-register/',
  REPORT_SALES_RETURN_REGISTER: '/accounting/reports/sales-return-register/',
  REPORT_PURCHASE_REGISTER: '/accounting/reports/purchase-register/',
  REPORT_PURCHASE_RETURN_REGISTER: '/accounting/reports/purchase-return-register/',
  REPORT_TDS: '/accounting/reports/tds-report/',
  REPORT_ANNEX_13: '/accounting/reports/annex-13/',
  REPORT_ANNEX_5: '/accounting/reports/annex-5/',
  // Inventory
  REPORT_INVENTORY_POSITION: '/accounting/reports/inventory-position/',
  REPORT_INVENTORY_MOVEMENT: '/accounting/reports/inventory-movement/',
  REPORT_INVENTORY_MASTER: '/accounting/reports/inventory-master/',
  REPORT_PRODUCT_PROFITABILITY: '/accounting/reports/product-profitability/',
  // Drill-down: vouchers for a single account
  REPORT_ACCOUNT_VOUCHERS: '/accounting/reports/account-vouchers/',
  // Generic drill-down endpoint
  REPORT_DRILL: '/accounting/reports/drill/',
  // System
  REPORT_ACTIVITY_LOG: '/accounting/reports/activity-log/',
  REPORT_USER_LOG: '/accounting/reports/user-log/',
  // Services
  REPORT_SERVICE_LEDGER: '/accounting/reports/service-ledger/',
  REPORT_SERVICE_REPORT: '/accounting/reports/service-report/',

  // ── Coins ─────────────────────────────────────────────────────────────────
  COINS: '/accounting/coins/',
  COINS_SUMMARY: '/accounting/coins/summary/',
  COIN_DETAIL: (id: number) => `/accounting/coins/${id}/`,
  COIN_APPROVE: (id: number) => `/accounting/coins/${id}/approve/`,
  COIN_REJECT: (id: number) => `/accounting/coins/${id}/reject/`,
  COINS_PENDING: '/accounting/coins/pending/',
  COINS_AWARD: '/accounting/coins/award/',
  COINS_STAFF_HISTORY: (staffId: number) => `/accounting/coins/staff/${staffId}/`,

  // ── Payslips ──────────────────────────────────────────────────────────────
  PAYSLIPS: '/accounting/payslips/',
  PAYSLIP_DETAIL: (id: number) => `/accounting/payslips/${id}/`,
  PAYSLIP_GENERATE: '/accounting/payslips/generate/',
  PAYSLIP_ISSUE: (id: number) => `/accounting/payslips/${id}/issue/`,
  PAYSLIP_MARK_PAID: (id: number) => `/accounting/payslips/${id}/mark-paid/`,

  // ── Staff Salary Profiles ─────────────────────────────────────────────────
  SALARY_PROFILES: '/accounting/salary-profiles/',
  SALARY_PROFILE_DETAIL: (id: number) => `/accounting/salary-profiles/${id}/`,

  // ── Invoices ──────────────────────────────────────────────────────────────
  INVOICES: '/accounting/invoices/',
  INVOICE_DETAIL: (id: number) => `/accounting/invoices/${id}/`,
  INVOICE_GENERATE: '/accounting/invoices/generate/',
  INVOICE_GENERATE_FROM_TICKET: '/accounting/invoices/generate-from-ticket/',
  INVOICE_ISSUE: (id: number) => `/accounting/invoices/${id}/issue/`,
  INVOICE_MARK_PAID: (id: number) => `/accounting/invoices/${id}/mark-paid/`,
  INVOICE_VOID: (id: number) => `/accounting/invoices/${id}/void/`,
  INVOICE_PDF: (id: number) => `/accounting/invoices/${id}/pdf/`,
  INVOICE_SEND: (id: number) => `/accounting/invoices/${id}/send/`,
  INVOICE_COLLECT_PAYMENT: (id: number) => `/accounting/invoices/${id}/collect-payment/`,
  INVOICE_FINANCE_REVIEW: (id: number) => `/accounting/invoices/${id}/finance-review/`,
  INVOICES_BY_TICKET: (ticketId: number) => `/accounting/invoices/?ticket=${ticketId}`,
  INVOICES_PENDING_FINANCE: '/accounting/invoices/?finance_status=submitted',

  // ── Quotations ────────────────────────────────────────────────────────────
  QUOTATIONS: '/accounting/quotations/',
  QUOTATION_DETAIL: (id: number) => `/accounting/quotations/${id}/`,
  QUOTATION_SEND: (id: number) => `/accounting/quotations/${id}/send/`,
  QUOTATION_ACCEPT: (id: number) => `/accounting/quotations/${id}/accept/`,
  QUOTATION_DECLINE: (id: number) => `/accounting/quotations/${id}/decline/`,
  QUOTATION_CONVERT: (id: number) => `/accounting/quotations/${id}/convert/`,

  // ── Debit Notes ───────────────────────────────────────────────────────────
  DEBIT_NOTES: '/accounting/debit-notes/',
  DEBIT_NOTE_DETAIL: (id: number) => `/accounting/debit-notes/${id}/`,
  DEBIT_NOTE_ISSUE: (id: number) => `/accounting/debit-notes/${id}/issue/`,
  DEBIT_NOTE_VOID: (id: number) => `/accounting/debit-notes/${id}/void/`,

  // ── TDS (Nepal Tax Deducted at Source) ────────────────────────────────────
  TDS: '/accounting/tds/',
  TDS_DETAIL: (id: number) => `/accounting/tds/${id}/`,
  TDS_MARK_DEPOSITED: (id: number) => `/accounting/tds/${id}/mark-deposited/`,
  TDS_SUMMARY: '/accounting/tds/summary/',

  // ── Bank Reconciliation ───────────────────────────────────────────────────
  BANK_RECONCILIATIONS: '/accounting/bank-reconciliations/',
  BANK_RECONCILIATION_DETAIL: (id: number) => `/accounting/bank-reconciliations/${id}/`,
  BANK_RECONCILIATION_ADD_LINE: (id: number) => `/accounting/bank-reconciliations/${id}/add-line/`,
  BANK_RECONCILIATION_MATCH_LINE: (id: number) => `/accounting/bank-reconciliations/${id}/match-line/`,
  BANK_RECONCILIATION_UNMATCH_LINE: (id: number) => `/accounting/bank-reconciliations/${id}/unmatch-line/`,
  BANK_RECONCILIATION_RECONCILE: (id: number) => `/accounting/bank-reconciliations/${id}/reconcile/`,

  // ── Recurring Journals ────────────────────────────────────────────────────
  RECURRING_JOURNALS: '/accounting/recurring-journals/',
  RECURRING_JOURNAL_DETAIL: (id: number) => `/accounting/recurring-journals/${id}/`,
  RECURRING_JOURNAL_RUN: (id: number) => `/accounting/recurring-journals/${id}/run/`,

  // ── Expenses ──────────────────────────────────────────────────────────────
  EXPENSES: '/accounting/expenses/',
  EXPENSE_DETAIL: (id: number) => `/accounting/expenses/${id}/`,
  EXPENSE_APPROVE: (id: number) => `/accounting/expenses/${id}/approve/`,
  EXPENSE_REJECT: (id: number) => `/accounting/expenses/${id}/reject/`,
  EXPENSE_POST: (id: number) => `/accounting/expenses/${id}/post/`,

  // ── Account Ledger + Day Book (report-style) ──────────────────────────────
  REPORT_LEDGER: '/accounting/reports/ledger/',
  REPORT_DAY_BOOK: '/accounting/reports/day-book/',
} as const

export const SETTINGS = {
  LIST: '/settings/',
  UPLOAD: '/settings/upload/',
  SMTP: '/settings/smtp/',
  SMTP_TEST: '/settings/smtp/test/',
} as const

export const TENANTS = {
  LIST: '/tenants/',
  DETAIL: (id: number) => `/tenants/${id}/`,
  SUSPEND: (id: number) => `/tenants/${id}/suspend/`,
  ACTIVATE: (id: number) => `/tenants/${id}/activate/`,
  MEMBERS: (id: number) => `/tenants/${id}/members/`,
  MEMBER: (id: number, mid: number) => `/tenants/${id}/members/${mid}/`,
  MODULE_OVERRIDES: (id: number) => `/tenants/${id}/module_overrides/`,
  MODULE_OVERRIDE_DELETE: (tenantId: number, moduleId: number) =>
    `/tenants/${tenantId}/module_overrides/${moduleId}/`,
} as const

export const PLANS = {
  LIST: '/plans/',
  DETAIL: (id: number) => `/plans/${id}/`,
  TOGGLE_MODULE: (id: number) => `/plans/${id}/toggle_module/`,
} as const

export const MODULES = {
  LIST: '/modules/',
} as const



export const INVENTORY = {
  PRODUCTS: '/inventory/products/',
  PRODUCT_DETAIL: (id: number) => `/inventory/products/${id}/`,
  CATEGORIES: '/inventory/categories/',
  CATEGORY_DETAIL: (id: number) => `/inventory/categories/${id}/`,
  CATEGORY_TREE: '/inventory/categories/tree/',
  PRODUCT_IMAGES: '/inventory/product-images/',
  PRODUCT_IMAGE_DETAIL: (id: number) => `/inventory/product-images/${id}/`,
  PRODUCT_IMAGE_SET_PRIMARY: (id: number) => `/inventory/product-images/${id}/set-primary/`,
  STOCK_LEVELS: '/inventory/stock-levels/',
  MOVEMENTS: '/inventory/movements/',
  MOVEMENT_DETAIL: (id: number) => `/inventory/movements/${id}/`,
  LOW_STOCK: '/inventory/products/low-stock/',
  SUPPLIERS: '/inventory/suppliers/',
  SUPPLIER_DETAIL: (id: number) => `/inventory/suppliers/${id}/`,
  PURCHASE_ORDERS: '/inventory/purchase-orders/',
  PURCHASE_ORDER_DETAIL: (id: number) => `/inventory/purchase-orders/${id}/`,
  PURCHASE_ORDER_RECEIVE: (id: number) => `/inventory/purchase-orders/${id}/receive/`,
  PURCHASE_ORDER_SEND: (id: number) => `/inventory/purchase-orders/${id}/send/`,
  PURCHASE_ORDER_CANCEL: (id: number) => `/inventory/purchase-orders/${id}/cancel/`,
  // Units of Measure
  UOM: '/inventory/uom/',
  UOM_DETAIL: (id: number) => `/inventory/uom/${id}/`,
  // Product Variants
  VARIANTS: '/inventory/variants/',
  VARIANT_DETAIL: (id: number) => `/inventory/variants/${id}/`,
  // Return to Supplier
  RETURN_ORDERS: '/inventory/return-orders/',
  RETURN_ORDER_DETAIL: (id: number) => `/inventory/return-orders/${id}/`,
  RETURN_ORDER_SEND: (id: number) => `/inventory/return-orders/${id}/send/`,
  RETURN_ORDER_ACCEPT: (id: number) => `/inventory/return-orders/${id}/accept/`,
  RETURN_ORDER_CANCEL: (id: number) => `/inventory/return-orders/${id}/cancel/`,
  // Reports
  REPORT_VALUATION: '/inventory/reports/valuation/',
  REPORT_DEAD_STOCK: '/inventory/reports/dead-stock/',
  REPORT_ABC: '/inventory/reports/abc-analysis/',
  REPORT_FORECAST: '/inventory/reports/forecast/',
  REPORT_EXPORT_CSV: '/inventory/reports/export-csv/',
  REPORT_TOP_SELLING: '/inventory/reports/top-selling/',
  // CSV Import
  PRODUCT_IMPORT_CSV: '/inventory/products/import-csv/',
  // Auto-Reorder
  REPORT_AUTO_REORDER: '/inventory/reports/auto-reorder/',
  // Supplier–Product Catalog
  SUPPLIER_PRODUCTS: '/inventory/supplier-products/',
  SUPPLIER_PRODUCT_DETAIL: (id: number) => `/inventory/supplier-products/${id}/`,
  // Stock Counts (Stocktake)
  STOCK_COUNTS: '/inventory/stock-counts/',
  STOCK_COUNT_DETAIL: (id: number) => `/inventory/stock-counts/${id}/`,
  STOCK_COUNT_START: (id: number) => `/inventory/stock-counts/${id}/start/`,
  STOCK_COUNT_ITEM: (id: number) => `/inventory/stock-counts/${id}/count-item/`,
  STOCK_COUNT_COMPLETE: (id: number) => `/inventory/stock-counts/${id}/complete/`,
  STOCK_COUNT_CANCEL: (id: number) => `/inventory/stock-counts/${id}/cancel/`,
  // Serial Numbers / Warranty
  SERIAL_NUMBERS: '/inventory/serial-numbers/',
  SERIAL_NUMBER_DETAIL: (id: number) => `/inventory/serial-numbers/${id}/`,
  SERIAL_NUMBER_MARK_USED: (id: number) => `/inventory/serial-numbers/${id}/mark-used/`,
  SERIAL_NUMBER_MARK_RETURNED: (id: number) => `/inventory/serial-numbers/${id}/mark-returned/`,
  // Product Bundles
  PRODUCT_BUNDLES: '/inventory/product-bundles/',
  PRODUCT_BUNDLE_DETAIL: (id: number) => `/inventory/product-bundles/${id}/`,
  // Supplier Payments
  SUPPLIER_PAYMENTS: '/inventory/supplier-payments/',
  SUPPLIER_PAYMENT_DETAIL: (id: number) => `/inventory/supplier-payments/${id}/`,
  SUPPLIER_PAYMENT_SUMMARY: '/inventory/supplier-payments/summary/',
  // Purchase Order PDF
  PO_PDF: (id: number) => `/inventory/purchase-orders/${id}/pdf/`,
  // Service catalog
  SERVICES: '/inventory/services/',
  SERVICE_DETAIL: (id: number) => `/inventory/services/${id}/`,
} as const

export const HRM = {
  DASHBOARD:            '/hrm/dashboard/',
  LEAVE_TYPES:          '/hrm/leave-types/',
  LEAVE_TYPE_DETAIL:    (id: number) => `/hrm/leave-types/${id}/`,
  LEAVE_TYPE_SEED:      '/hrm/leave-types/seed_defaults/',
  LEAVE_BALANCES:       '/hrm/leave-balances/',
  LEAVE_BALANCE_SEED:   '/hrm/leave-balances/seed_year/',
  LEAVE_REQUESTS:       '/hrm/leave-requests/',
  LEAVE_REQUEST_DETAIL: (id: number) => `/hrm/leave-requests/${id}/`,
  LEAVE_REQUEST_APPROVE:(id: number) => `/hrm/leave-requests/${id}/approve/`,
  LEAVE_REQUEST_REJECT: (id: number) => `/hrm/leave-requests/${id}/reject/`,
  LEAVE_REQUEST_CANCEL: (id: number) => `/hrm/leave-requests/${id}/cancel/`,
  PROFILES:             '/hrm/profiles/',
  PROFILE_DETAIL:       (id: number) => `/hrm/profiles/${id}/`,

  // Attendance
  ATTENDANCE_POLICY:        '/hrm/attendance-policy/',
  ATTENDANCE:               '/hrm/attendance/',
  ATTENDANCE_DETAIL:        (id: number) => `/hrm/attendance/${id}/`,
  ATTENDANCE_CLOCK_IN:      '/hrm/attendance/clock_in/',
  ATTENDANCE_CLOCK_OUT:     '/hrm/attendance/clock_out/',
  ATTENDANCE_MANUAL_MARK:   '/hrm/attendance/manual_mark/',
  ATTENDANCE_TODAY:         '/hrm/attendance/today/',
  ATTENDANCE_SUMMARY:       '/hrm/attendance/summary/',
  ATTENDANCE_DAILY_REPORT:  '/hrm/attendance/daily_report/',
  ATTENDANCE_MONTHLY_REPORT:'/hrm/attendance/monthly_report/',
  // Shifts
  SHIFTS:                   '/hrm/shifts/',
  SHIFT_DETAIL:             (id: number) => `/hrm/shifts/${id}/`,
  SHIFT_ASSIGNMENTS:        '/hrm/shift-assignments/',
  SHIFT_ASSIGNMENT_DETAIL:  (id: number) => `/hrm/shift-assignments/${id}/`,
} as const

export const CMS = {
  // Site
  SITE:            '/cms/site/',
  SITE_PUBLISH:    (action: 'publish' | 'unpublish') => `/cms/site/${action}/`,

  // Pages
  PAGES:           '/cms/pages/',
  PAGE_DETAIL:     (id: number) => `/cms/pages/${id}/`,
  PAGE_PUBLISH:    (id: number, action: 'publish' | 'unpublish') => `/cms/pages/${id}/${action}/`,
  PAGE_GRAPES:     (id: number) => `/cms/pages/${id}/grapes/`,

  // Blocks
  BLOCKS:          (pageId: number) => `/cms/pages/${pageId}/blocks/`,
  BLOCK_DETAIL:    (pageId: number, blockId: number) => `/cms/pages/${pageId}/blocks/${blockId}/`,
  BLOCK_REORDER:   (pageId: number) => `/cms/pages/${pageId}/blocks/reorder/`,
  MEDIA_UPLOAD:    '/cms/media/',

  // Blog
  BLOG:            '/cms/blog/',
  BLOG_POST:       (id: number) => `/cms/blog/${id}/`,
  BLOG_PUBLISH:    (id: number, action: 'publish' | 'unpublish') => `/cms/blog/${id}/${action}/`,

  // Custom domain
  DOMAIN:          '/cms/domain/',

  // AI generation
  GENERATE:        '/cms/generate/',
  GENERATE_DETAIL: (id: number) => `/cms/generate/${id}/`,

  // Public (no auth — Next.js renderer)
  PUBLIC_SITE:     (subdomain: string) => `/cms/public/${subdomain}/`,
  PUBLIC_PAGE:     (subdomain: string, slug: string) => `/cms/public/${subdomain}/pages/${slug}/`,
  PUBLIC_BLOG:     (subdomain: string) => `/cms/public/${subdomain}/blog/`,
  PUBLIC_POST:     (subdomain: string, slug: string) => `/cms/public/${subdomain}/blog/${slug}/`,

  // Inquiries
  INQUIRIES:          '/cms/inquiries/',
  INQUIRY_DETAIL:     (id: number) => `/cms/inquiries/${id}/`,
  INQUIRY_CONVERT:    (id: number) => `/cms/inquiries/${id}/convert/`,

  // Analytics
  ANALYTICS:          '/cms/analytics/',
} as const
