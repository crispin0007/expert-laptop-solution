import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Membership {
  role: string
  is_admin: boolean
  department: number | null
  employee_id: string | null
}

interface User {
  id: number
  username: string
  email: string
  full_name: string
  first_name: string
  last_name: string
  is_staff: boolean
  is_superadmin: boolean
  membership: Membership | null
}

const MANAGER_ROLES = new Set(['owner', 'admin', 'manager'])

/** Returns true if the current user is a manager, admin, owner, or superadmin. */
export function isManager(user: User | null): boolean {
  if (!user) return false
  if (user.is_superadmin) return true
  return MANAGER_ROLES.has(user.membership?.role ?? '')
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
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
