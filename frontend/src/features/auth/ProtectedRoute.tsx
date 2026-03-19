import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useTenantStore } from '../../store/tenantStore'
import apiClient from '../../api/client'
import { type ReactNode } from 'react'

/**
 * ProtectedRoute — guards all authenticated pages.
 *
 * On every app load / page refresh it calls /accounts/me/ to:
 *  1. Re-hydrate the user object (in case the store is stale)
 *  2. Re-populate tenantStore.subdomain so X-Tenant-Slug is sent on every
 *     subsequent request — even when the user navigates directly to a URL
 *     (e.g. 192.168.100.100:5173/staff) without going through the login flow.
 *
 * Also runs a silent background refresh every PERMISSIONS_REFRESH_MS so that
 * role/permission changes made by a tenant admin take effect without a page reload.
 */

/** How often to silently re-fetch /accounts/me/ to pick up role/permission changes (ms). */
const PERMISSIONS_REFRESH_MS = 5 * 60 * 1000

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, accessToken, logout } = useAuthStore()
  const { subdomain, setTenant, clearTenant } = useTenantStore()
  const [ready, setReady] = useState(false)

  /** Fetches /me/ and updates the auth + tenant stores. Logs out on 401. */
  function refreshMe() {
    return apiClient
      .get('/accounts/me/')
      .then((res) => {
        const tenants: Array<{
          subdomain: string
          name: string
          logo?: string
          favicon?: string
          vat_enabled: boolean
          vat_rate: number
        }> = res.data.tenants ?? []

        if (res.data.is_superadmin) {
          clearTenant()
        } else {
          // Use the current subdomain (from URL/store) or fall back to first tenant
          const resolvedSubdomain = subdomain ?? tenants[0]?.subdomain
          const tenantMeta = tenants.find(t => t.subdomain === resolvedSubdomain) ?? tenants[0]
          if (resolvedSubdomain && tenantMeta) {
            // Always refresh — includes active_modules from the backend (reflects
            // the latest plan assignment — e.g. after an admin changes the plan)
            setTenant({
              subdomain: tenantMeta.subdomain,
              name: tenantMeta.name,
              logo: tenantMeta.logo ?? null,
              favicon: tenantMeta.favicon ?? null,
              vat_enabled: tenantMeta.vat_enabled,
              vat_rate: tenantMeta.vat_rate,
              active_modules: res.data.active_modules ?? null,
              plan: res.data.plan ?? null,
            })
          }
        }
      })
      .catch(() => {
        // Access token is expired / invalid — log out and redirect
        logout()
      })
  }

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setReady(true)
      return
    }

    // Initial fetch on mount — shows spinner until resolved
    refreshMe().finally(() => setReady(true))

    // Periodic silent refresh so role/permission changes take effect within
    // PERMISSIONS_REFRESH_MS without requiring the user to reload the page.
    const interval = setInterval(refreshMe, PERMISSIONS_REFRESH_MS)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  if (!isAuthenticated) return <Navigate to="/login" replace />

  // Show a minimal full-screen spinner while we wait for /me/ to resolve
  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <>{children}</>
}

