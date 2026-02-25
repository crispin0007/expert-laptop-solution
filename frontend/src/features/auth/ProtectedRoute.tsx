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
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, accessToken, setUser, logout } = useAuthStore()
  const { subdomain, setTenant } = useTenantStore()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setReady(true)
      return
    }

    // Always re-fetch /me/ on mount so tenant context is fresh after a refresh
    apiClient
      .get('/accounts/me/')
      .then((res) => {
        setUser(res.data)
        const tenants: Array<{
          subdomain: string
          name: string
          vat_enabled: boolean
          vat_rate: number
        }> = res.data.tenants ?? []

        // Superadmins always operate on the root domain — never pin them to a
        // tenant subdomain, otherwise X-Tenant-Slug leaks into every request.
        if (!res.data.is_superadmin) {
          // Use the current subdomain (from URL/store) or fall back to first tenant
          const resolvedSubdomain = subdomain ?? tenants[0]?.subdomain
          const tenantMeta = tenants.find(t => t.subdomain === resolvedSubdomain) ?? tenants[0]
          if (resolvedSubdomain && tenantMeta) {
            // Always refresh — includes active_modules from the backend (reflects
            // the latest plan assignment — e.g. after an admin changes the plan)
            setTenant({
              subdomain: tenantMeta.subdomain,
              name: tenantMeta.name,
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
      .finally(() => setReady(true))
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

