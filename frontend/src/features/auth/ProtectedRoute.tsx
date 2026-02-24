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

        // Only overwrite if subdomain is missing — preserve any explicitly
        // selected tenant (future: multi-tenant picker)
        if (!subdomain && tenants.length > 0) {
          setTenant({
            subdomain: tenants[0].subdomain,
            name: tenants[0].name,
            vat_enabled: tenants[0].vat_enabled,
            vat_rate: tenants[0].vat_rate,
          })
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

