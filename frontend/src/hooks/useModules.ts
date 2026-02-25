/**
 * useModules — check whether a module is active for the current tenant.
 *
 * Rules:
 *  - Super-admins (on root domain) → always return true (unrestricted)
 *  - activeModules === null          → not yet loaded; default to true (optimistic)
 *  - Otherwise                       → check the activeModules list
 */
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'

export function useModules() {
  const user = useAuthStore((s) => s.user)
  const subdomain = useTenantStore((s) => s.subdomain)
  const activeModules = useTenantStore((s) => s.activeModules)

  const isSuperAdmin = (user?.is_superadmin ?? false) && !subdomain

  /**
   * Returns true when the given module key is active for the current tenant.
   * Super-admins and null (not-yet-loaded) always return true.
   */
  function has(moduleKey: string): boolean {
    if (isSuperAdmin) return true
    if (activeModules === null) return true   // optimistic until hydrated
    return activeModules.includes(moduleKey)
  }

  return { has, activeModules, isSuperAdmin }
}
