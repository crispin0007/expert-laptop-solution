/**
 * usePermissions — copied from web frontend/src/hooks/usePermissions.ts
 * Adapted to use the mobile authStore which uses dot-notation permission keys.
 *
 * Usage:
 *   const { isAdmin, can } = usePermissions()
 *   if (!can('tickets.view')) return null
 */
import { useAuthStore, type PermissionKey } from '@/store/authStore'

export interface PermissionContext {
  loading: boolean
  isSuperAdmin: boolean
  isOwner: boolean
  isAdmin: boolean
  isManager: boolean
  isStaff: boolean
  isViewer: boolean
  role: string | null
  can: (perm: PermissionKey) => boolean
}

export function usePermissions(): PermissionContext {
  const user = useAuthStore((s) => s.user)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const role = user?.role ?? null

  return {
    loading: user === null,
    isSuperAdmin: !!(user?.is_superadmin),
    isOwner: !!(user?.is_superadmin || role === 'owner'),
    isAdmin: !!(user?.is_superadmin || role === 'owner' || role === 'admin'),
    isManager: !!(user?.is_superadmin || ['owner', 'admin', 'manager'].includes(role ?? '')),
    isStaff: !!(user?.is_superadmin || ['owner', 'admin', 'manager', 'staff'].includes(role ?? '')),
    isViewer: role === 'viewer',
    role,
    can: (perm) => hasPermission(perm),
  }
}
