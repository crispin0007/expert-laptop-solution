import { useEffect } from 'react'
import Router from './app/Router'
import { useTenantStore } from './store/tenantStore'

/**
 * Detect the tenant slug from the current URL hostname.
 *   els.bms.techyatra.com.np  → 'els'   (tenant subdomain)
 *   bms.techyatra.com.np      → null     (super admin root)
 *   localhost / 127.0.0.1     → null     (dev — use store)
 */
function getSlugFromHostname(): string | null {
  const hostname = window.location.hostname
  const rootDomain = import.meta.env.VITE_ROOT_DOMAIN as string | undefined
  if (!rootDomain || hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null
  }
  if (hostname === rootDomain) return null
  if (hostname.endsWith('.' + rootDomain)) {
    return hostname.slice(0, hostname.length - rootDomain.length - 1)
  }
  return null
}

function App() {
  const { setSubdomain, clearTenant } = useTenantStore()

  useEffect(() => {
    const slug = getSlugFromHostname()
    if (slug) {
      // Pre-populate subdomain so X-Tenant-Slug is sent from the very first request
      setSubdomain(slug)
    } else if (import.meta.env.VITE_ROOT_DOMAIN) {
      // We're on the root admin domain — clear any leftover tenant from a previous session
      clearTenant()
    }
  }, [])

  return <Router />
}

export default App
