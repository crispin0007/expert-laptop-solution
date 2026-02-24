// All API endpoint constants — import from here, never hard-code URLs in components

export const AUTH = {
  TOKEN: '/accounts/token/',
  REFRESH: '/accounts/token/refresh/',
  ME: '/accounts/me/',
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
} as const

export const CUSTOMERS = {
  LIST: '/customers/',
  DETAIL: (id: number) => `/customers/${id}/`,
  CONTACTS: (id: number) => `/customers/${id}/contacts/`,
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
  AVAILABILITY: '/staff/availability/',
} as const

export const ACCOUNTING = {
  COINS: '/accounting/coins/',
  COIN_DETAIL: (id: number) => `/accounting/coins/${id}/`,
  COIN_APPROVE: (id: number) => `/accounting/coins/${id}/approve/`,
  COIN_REJECT: (id: number) => `/accounting/coins/${id}/reject/`,
  INVOICES: '/accounting/invoices/',
  INVOICE_DETAIL: (id: number) => `/accounting/invoices/${id}/`,
  INVOICE_GENERATE: '/accounting/invoices/generate/',
  INVOICE_GENERATE_FROM_TICKET: '/accounting/invoices/generate-from-ticket/',
  INVOICE_MARK_PAID: (id: number) => `/accounting/invoices/${id}/mark-paid/`,
  INVOICE_VOID: (id: number) => `/accounting/invoices/${id}/void/`,
  PAYSLIPS: '/accounting/payslips/',
  COINS_PENDING: '/accounting/coins/pending/',
  COINS_AWARD: '/accounting/coins/award/',
  COINS_STAFF_HISTORY: (staffId: number) => `/accounting/coins/staff/${staffId}/`,
} as const

export const SETTINGS = '/settings/' as const

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
} as const
