/**
 * useModules — copied from web frontend/src/hooks/useModules.ts
 * Adapted to use the mobile authStore (user.modules) instead of tenantStore.
 *
 * Rules mirror the web exactly:
 *  - Superadmins              → always true (unrestricted)
 *  - modules === null          → not yet loaded; default to true (optimistic)
 *  - Otherwise                → check user.modules list
 *
 * Usage:
 *   const { has } = useModules()
 *   if (!has('tickets')) return null
 */
import { useAuthStore } from '@/store/authStore'

export function useModules() {
  const user = useAuthStore((s) => s.user)

  /**
   * Returns true when the given module key is active for the current tenant.
   * Superadmins and null (not-yet-loaded) always return true.
   */
  function has(moduleKey: string): boolean {
    if (!user) return false
    if (user.is_superadmin) return true
    if (user.modules === null) return true   // optimistic until API confirms
    return user.modules.includes(moduleKey)
  }

  return { has, modules: user?.modules ?? null }
}
