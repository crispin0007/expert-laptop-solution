import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

// ── API → Client permission key mapping ─────────────────────────────────────
// The backend uses snake_case boolean flags under membership.permissions.
// We map them to dot-notation keys used throughout the mobile app.
const API_PERM_MAP: Record<string, string> = {
  can_view_tickets:       'tickets.view',
  can_create_tickets:     'tickets.create',
  can_update_tickets:     'tickets.edit',
  can_delete_tickets:     'tickets.delete',
  can_assign_tickets:     'tickets.assign',
  can_transfer_tickets:   'tickets.transfer',
  can_close_tickets:      'tickets.close',
  can_view_projects:      'projects.view',
  can_create_projects:    'projects.create',
  can_delete_projects:    'projects.edit',
  can_view_customers:     'customers.view',
  can_create_customers:   'customers.create',
  can_delete_customers:   'customers.edit',
  can_view_inventory:     'inventory.view',
  can_manage_inventory:   'inventory.edit',
  can_view_accounting:    'accounting.view',
  can_approve_coins:      'accounting.coins.approve',
  can_view_staff:         'staff.view',
  can_manage_staff:       'staff.manage',
  can_view_departments:   'departments.view',
  can_manage_departments: 'departments.view',
  can_manage_settings:    'settings.manage',
  can_manage_roles:       'roles.manage',
}

// Normalize the raw /accounts/me/ response into the flat User shape.
export function normalizeApiUser(raw: Record<string, unknown>): User {
  const membership = (raw.membership ?? {}) as Record<string, unknown>
  const rawPerms = (membership.permissions ?? {}) as Record<string, unknown>

  // Map backend flags (can_view_tickets) → app keys (tickets.view)
  const permissions: UserPermissions = {}
  for (const [apiKey, appKey] of Object.entries(API_PERM_MAP)) {
    permissions[appKey] = !!rawPerms[apiKey]
  }

  const fullName = (raw.full_name as string) ?? ''
  const nameParts = fullName.trim().split(' ')

  // Extract subscription modules — mirrors web tenantStore.activeModules logic.
  // Read from top-level active_modules first (web convention), then membership.modules fallback.
  // null means not returned by API yet → optimistic (show all), same as web's useModules.
  const rawModules =
    (raw.active_modules as string[] | null | undefined) ??
    ((membership.modules as string[] | null | undefined)) ??
    null
  const modules: string[] | null = rawModules

  return {
    id: raw.id as number,
    email: raw.email as string,
    full_name: fullName,
    first_name: nameParts[0] ?? '',
    last_name: nameParts.slice(1).join(' ') ?? '',
    phone: (raw.phone as string | null) || null,
    avatar: (raw.avatar as string | null) || null,
    is_superadmin: !!(raw.is_superadmin),
    is_2fa_enabled: !!(raw.is_2fa_enabled),
    role: (membership.role as User['role']) ?? 'staff',
    department_id: (membership.department as number | null) ?? null,
    department_name: (membership.department_name as string | null) ?? null,
    employee_id: (membership.employee_id as string | null) || null,
    staff_number: (membership.staff_number as string | null) || null,
    permissions,
    modules,
  }
}

// ── Permission Keys ─────────────────────────────────────────────────────────
export type PermissionKey =
  | 'tickets.view' | 'tickets.create' | 'tickets.edit' | 'tickets.delete'
  | 'tickets.assign' | 'tickets.transfer' | 'tickets.close'
  | 'projects.view' | 'projects.create' | 'projects.edit' | 'projects.manage'
  | 'customers.view' | 'customers.create' | 'customers.edit' | 'customers.manage'
  | 'inventory.view' | 'inventory.edit'
  | 'accounting.view' | 'accounting.manage' | 'accounting.coins.approve' | 'accounting.payslip.view'
  | 'staff.view' | 'staff.manage'
  | 'departments.view' | 'departments.manage'
  | 'roles.manage'
  | 'settings.manage'

export interface UserPermissions {
  [key: string]: boolean
}

// Module keys that correspond to backend Module.key slugs.
// Core modules (staff, settings, departments) are always present.
// Optional modules depend on the tenant plan + overrides.
export type ModuleKey =
  | 'tickets'
  | 'projects'
  | 'customers'
  | 'inventory'
  | 'accounting'
  | 'staff'
  | 'departments'
  | 'roles'
  | 'settings'

export interface User {
  id: number
  email: string
  full_name: string
  first_name: string
  last_name: string
  phone: string | null
  avatar: string | null
  is_superadmin: boolean
  is_2fa_enabled: boolean
  role: 'owner' | 'admin' | 'manager' | 'staff' | 'viewer' | 'custom'
  department_id: number | null
  department_name: string | null
  employee_id: string | null
  staff_number: string | null
  permissions: UserPermissions
  // Subscription-level module access for the current tenant.
  // null = not yet loaded from API → treat as unrestricted (optimistic, mirrors web useModules)
  modules: string[] | null
}

interface AuthState {
  // Memory-only — never persisted
  accessToken: string | null
  user: User | null
  isBootstrapped: boolean

  // Actions
  setTokens: (access: string, refresh: string) => Promise<void>
  setUser: (user: User) => void
  setUserFromApi: (raw: Record<string, unknown>) => void  // normalizes API response
  clearAuth: () => Promise<void>
  // Layer 2: role-based permission within a tenant
  hasPermission: (key: PermissionKey) => boolean
  canAny: (...keys: PermissionKey[]) => boolean
  // Layer 1: subscription-based module access
  hasModule: (key: ModuleKey) => boolean
  canAccessAnyModule: (...keys: ModuleKey[]) => boolean
  bootstrap: () => Promise<string | null> // returns refresh token or null
}

const REFRESH_KEY = 'nexus_refresh_token'

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  user: null,
  isBootstrapped: false,

  setTokens: async (access, refresh) => {
    await SecureStore.setItemAsync(REFRESH_KEY, refresh)
    set({ accessToken: access })
  },

  setUser: (user) => set({ user }),

  setUserFromApi: (raw) => set({ user: normalizeApiUser(raw) }),

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(REFRESH_KEY)
    set({ accessToken: null, user: null })
  },

  hasPermission: (key) => {
    const { user } = get()
    if (!user) return false
    // Owners and admins have all permissions
    if (user.role === 'owner' || user.role === 'admin' || user.is_superadmin) return true
    return !!user.permissions?.[key]
  },

  canAny: (...keys) => keys.some((k) => get().hasPermission(k)),

  // Layer 1: subscription module check.
  // Mirrors web useModules.has(): null = optimistic (show all), superadmin = always true.
  hasModule: (key) => {
    const { user } = get()
    if (!user) return false
    if (user.is_superadmin) return true
    if (user.modules === null) return true   // not yet loaded from API → optimistic
    return user.modules.includes(key)
  },

  canAccessAnyModule: (...keys) => keys.some((k) => get().hasModule(k)),

  bootstrap: async () => {
    const refresh = await SecureStore.getItemAsync(REFRESH_KEY)
    set({ isBootstrapped: true })
    return refresh
  },
}))

// Helper role predicates
export const isOwner = (u: User | null) => u?.role === 'owner'
export const isAdmin = (u: User | null) => ['owner', 'admin'].includes(u?.role ?? '')
export const isManager = (u: User | null) => ['owner', 'admin', 'manager'].includes(u?.role ?? '')
export const isStaff = (u: User | null) => ['owner', 'admin', 'manager', 'staff'].includes(u?.role ?? '')
