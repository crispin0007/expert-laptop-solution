import React from 'react'
import { useAuthStore, type PermissionKey } from '@/store/authStore'

interface RoleGuardProps {
  /** Permission key to check, e.g. 'tickets.create' */
  permission: PermissionKey
  /** Element to render when permission check fails. Defaults to null (hidden). */
  fallback?: React.ReactNode
  children: React.ReactNode
}

/**
 * Renders children only when the current user has the specified permission.
 * Use as a wrapper around buttons, FABs, tabs, and form sections.
 *
 * @example
 * <RoleGuard permission="tickets.create">
 *   <FAB onPress={openNewTicket} />
 * </RoleGuard>
 */
export function RoleGuard({ permission, fallback = null, children }: RoleGuardProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission)
  if (!hasPermission(permission)) return <>{fallback}</>
  return <>{children}</>
}

/** Allows rendering if ANY of the permissions match */
export function RoleGuardAny({
  permissions,
  fallback = null,
  children,
}: {
  permissions: PermissionKey[]
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const canAny = useAuthStore((s) => s.canAny)
  if (!canAny(...permissions)) return <>{fallback}</>
  return <>{children}</>
}
