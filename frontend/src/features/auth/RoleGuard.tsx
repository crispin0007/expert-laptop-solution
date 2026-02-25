/**
 * RoleGuard — route-level and component-level RBAC guard.
 *
 * Two usage patterns:
 *
 * 1. As a route wrapper (redirect on failure):
 *    <RoleGuard require="isAdmin" redirect="/">
 *      <SettingsPage />
 *    </RoleGuard>
 *
 * 2. As a conditional renderer (hide on failure):
 *    <RoleGuard require="can_manage_staff" silent>
 *      <button>Invite Staff</button>
 *    </RoleGuard>
 *
 * Props
 * -----
 * require   — A role predicate ('isAdmin', 'isManager', etc.) OR a permission
 *             key from UserPermissions ('can_manage_ticket_types', etc.).
 * redirect  — Path to redirect to when `silent` is false. Defaults to '/'.
 * silent    — When true, renders null instead of redirecting. Use for hiding
 *             UI elements (buttons, sections) inside pages.
 * fallback  — Custom element to render when the guard fails (overrides redirect/silent).
 */
import { Navigate } from 'react-router-dom'
import { usePermissions } from '../../hooks/usePermissions'
import type { UserPermissions } from '../../store/authStore'
import type { ReactNode } from 'react'

type RolePredicateKey = 'isSuperAdmin' | 'isOwner' | 'isAdmin' | 'isManager' | 'isStaff'

type GuardRequirement = RolePredicateKey | keyof UserPermissions

interface RoleGuardProps {
  /** The role predicate or permission flag that must be true. */
  require: GuardRequirement
  /** Redirect destination when not silent. Defaults to '/'. */
  redirect?: string
  /** When true, render nothing on failure instead of redirecting. */
  silent?: boolean
  /** Custom fallback UI (overrides redirect + silent). */
  fallback?: ReactNode
  children: ReactNode
}

const PREDICATE_KEYS = new Set<string>([
  'isSuperAdmin', 'isOwner', 'isAdmin', 'isManager', 'isStaff',
])

export default function RoleGuard({
  require,
  redirect = '/',
  silent = false,
  fallback,
  children,
}: RoleGuardProps) {
  const perms = usePermissions()

  let allowed: boolean

  if (PREDICATE_KEYS.has(require)) {
    // Role predicate check
    allowed = perms[require as RolePredicateKey] ?? false
  } else {
    // Fine-grained permission check
    allowed = perms.can(require as keyof UserPermissions)
  }

  if (allowed) return <>{children}</>

  if (fallback !== undefined) return <>{fallback}</>
  if (silent) return null
  return <Navigate to={redirect} replace />
}
