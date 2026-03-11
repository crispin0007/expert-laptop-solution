import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Permission flags returned by /accounts/me/ ───────────────────────────────
export interface UserPermissions {
  // Tickets
  can_view_tickets: boolean
  can_create_tickets: boolean
  can_update_tickets: boolean
  can_delete_tickets: boolean
  can_assign_tickets: boolean
  can_transfer_tickets: boolean
  can_close_tickets: boolean
  can_manage_ticket_types: boolean
  // Customers
  can_view_customers: boolean
  can_create_customers: boolean
  can_delete_customers: boolean
  // Projects
  can_view_projects: boolean
  can_create_projects: boolean
  can_delete_projects: boolean
  // Departments
  can_view_departments: boolean
  can_manage_departments: boolean
  // Staff
  can_view_staff: boolean
  can_manage_staff: boolean
  // Inventory
  can_view_inventory: boolean
  can_manage_inventory: boolean
  // Accounting
  can_view_accounting: boolean
  can_manage_accounting: boolean
  // Coins
  can_view_coins: boolean
  can_approve_coins: boolean
  // Settings & roles
  can_manage_settings: boolean
  can_manage_roles: boolean
}

export interface Membership {
  role: string
  role_display: string
  is_admin: boolean
  department: number | null
  department_name: string | null
  employee_id: string | null
  staff_number: string | null
  permissions: UserPermissions
}

export interface User {
  id: number
  username: string
  email: string
  full_name: string
  first_name: string
  last_name: string
  is_staff: boolean
  is_superadmin: boolean
  is_2fa_enabled: boolean
  /** 'main' when accessed via the main domain (super admin portal), 'tenant' on a workspace subdomain */
  domain_type: 'main' | 'tenant' | null
  is_main_domain: boolean
  membership: Membership | null
}

// ── Role hierarchy helpers ────────────────────────────────────────────────────
const MANAGER_ROLES = new Set(['owner', 'admin', 'manager'])
const ADMIN_ROLES = new Set(['owner', 'admin'])
const STAFF_ROLES = new Set(['owner', 'admin', 'manager', 'staff'])

export function isSuperAdmin(user: User | null): boolean {
  return !!user?.is_superadmin
}

export function isOwner(user: User | null): boolean {
  if (!user) return false
  if (user.is_superadmin) return true
  return user.membership?.role === 'owner'
}

export function isAdmin(user: User | null): boolean {
  if (!user) return false
  if (user.is_superadmin) return true
  return ADMIN_ROLES.has(user.membership?.role ?? '')
}

export function isManager(user: User | null): boolean {
  if (!user) return false
  if (user.is_superadmin) return true
  return MANAGER_ROLES.has(user.membership?.role ?? '')
}

export function isStaff(user: User | null): boolean {
  if (!user) return false
  if (user.is_superadmin) return true
  return STAFF_ROLES.has(user.membership?.role ?? '')
}

export function isViewer(user: User | null): boolean {
  if (!user) return false
  return user.membership?.role === 'viewer'
}

/** Return a specific permission flag from the user's membership. */
export function hasPermission(user: User | null, perm: keyof UserPermissions): boolean {
  if (!user) return false
  if (user.is_superadmin) return true
  return user.membership?.permissions?.[perm] ?? false
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  setTokens: (access: string, refresh: string) => void
  setUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (access, refresh) =>
        set({ accessToken: access, refreshToken: refresh, isAuthenticated: true }),

      setUser: (user) => set({ user }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'nexus-auth',
      // Bump this version whenever the stored shape changes.
      // Zustand calls migrate() when the stored version differs — returning {}
      // falls back to the initial state, clearing any stale tokens/user data.
      version: 1,
      migrate: () => ({}),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

