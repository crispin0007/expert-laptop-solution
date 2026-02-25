/**
 * usePermissions — convenience hook exposing the current user's role and
 * computed permission flags derived from their membership in the active tenant.
 *
 * All values are derived from authStore (persisted + refreshed on mount by
 * ProtectedRoute via /accounts/me/), so they are always up-to-date after
 * each page load without additional API calls.
 *
 * Usage:
 *   const { isAdmin, can } = usePermissions()
 *   if (!can('can_manage_ticket_types')) return null
 */
import { useAuthStore, isAdmin, isManager, isStaff, isViewer, isSuperAdmin, hasPermission } from '../store/authStore'
import type { UserPermissions } from '../store/authStore'

export interface PermissionContext {
  /** True if no user is loaded yet. */
  loading: boolean

  // ── Role predicates ────────────────────────────────────────────────────────
  isSuperAdmin: boolean
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
  isStaff: boolean
  isViewer: boolean

  /** Current role string, e.g. 'admin', 'staff', 'viewer'. */
  role: string | null

  // ── Fine-grained permission check ─────────────────────────────────────────
  /**
   * Returns the value of a specific permission flag.
   * Superadmins always return true.
   * Falls back to false when the user has no membership in the current tenant.
   */
  can: (perm: keyof UserPermissions) => boolean
}

export function usePermissions(): PermissionContext {
  const user = useAuthStore((s) => s.user)

  return {
    loading: user === null,

    isSuperAdmin: isSuperAdmin(user),
    isOwner: !!(user?.is_superadmin || user?.membership?.role === 'owner'),
    isAdmin: isAdmin(user),
    isManager: isManager(user),
    isStaff: isStaff(user),
    isViewer: isViewer(user),

    role: user?.membership?.role ?? null,

    can: (perm) => hasPermission(user, perm),
  }
}
