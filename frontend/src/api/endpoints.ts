// All API endpoint constants — import from here, never hard-code URLs in components

export const AUTH = {
  TOKEN: '/accounts/token/',
  REFRESH: '/accounts/token/refresh/',
  ME: '/accounts/me/',
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
} as const

export const NOTIFICATIONS = {
  LIST: '/notifications/',
  UNREAD_COUNT: '/notifications/unread-count/',
  MARK_READ: (id: number) => `/notifications/${id}/read/`,
  MARK_ALL_READ: '/notifications/mark-all-read/',
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

  // ── Coins ─────────────────────────────────────────────────────────────────
  COINS: '/accounting/coins/',
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

  // ── Invoices ──────────────────────────────────────────────────────────────
  INVOICES: '/accounting/invoices/',
  INVOICE_DETAIL: (id: number) => `/accounting/invoices/${id}/`,
  INVOICE_GENERATE: '/accounting/invoices/generate/',
  INVOICE_GENERATE_FROM_TICKET: '/accounting/invoices/generate-from-ticket/',
  INVOICE_MARK_PAID: (id: number) => `/accounting/invoices/${id}/mark-paid/`,
  INVOICE_VOID: (id: number) => `/accounting/invoices/${id}/void/`,
  INVOICE_PDF: (id: number) => `/accounting/invoices/${id}/pdf/`,
  INVOICE_SEND: (id: number) => `/accounting/invoices/${id}/send/`,
} as const

export const SETTINGS = '/settings/' as const

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
} as const
