// Centralised React Query key factory — avoids typos and enables precise cache invalidation
export const QK = {
  // Auth
  me: ['me'] as const,

  // Dashboard
  dashboardStats: ['dashboard', 'stats'] as const,

  // Notifications
  notifications: (params?: object) => ['notifications', params] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  notificationPrefs: ['notifications', 'preferences'] as const,

  // Tickets
  tickets: (params?: object) => ['tickets', params] as const,
  ticket: (id: number | string) => ['tickets', id] as const,
  ticketComments: (id: number | string) => ['tickets', id, 'comments'] as const,
  ticketTimeline: (id: number | string) => ['tickets', id, 'timeline'] as const,
  ticketProducts: (id: number | string) => ['tickets', id, 'products'] as const,
  ticketTypes: ['ticket-types'] as const,
  ticketCategories: ['ticket-categories'] as const,
  categories: (typeId?: number) => ['ticket-categories', typeId] as const,

  // Projects
  projects: (params?: object) => ['projects', params] as const,
  project: (id: number | string) => ['projects', id] as const,
  projectTasks: (id: number | string) => ['projects', id, 'tasks'] as const,
  projectMilestones: (id: number | string) => ['projects', id, 'milestones'] as const,

  // Customers
  customers: (params?: object) => ['customers', params] as const,
  customer: (id: number | string) => ['customers', id] as const,

  // Inventory
  products: (params?: object) => ['products', params] as const,
  product: (id: number) => ['products', id] as const,

  // Accounting
  coins: (params?: object) => ['coins', params] as const,
  payslips: (params?: object) => ['payslips', params] as const,
  invoices: (params?: object) => ['invoices', params] as const,

  // Staff / Departments / Roles
  staff: (params?: object) => ['staff', params] as const,
  departments: ['departments'] as const,
  roles: ['roles'] as const,

  // Tenant
  tenantSettings: ['tenant', 'settings'] as const,
} as const
