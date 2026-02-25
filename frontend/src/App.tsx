import { useEffect } from 'react'
import Router from './app/Router'
import { useTenantStore } from './store/tenantStore'

/**
 * Detect the tenant slug from the current URL hostname.
 *   test.localhost             → 'test'  (dev tenant subdomain)
 *   localhost                  → null    (dev root / super admin)
 *   els.bms.techyatra.com.np  → 'els'   (prod tenant subdomain)
 *   bms.techyatra.com.np      → null    (prod super admin root)
 */
function getSlugFromHostname(): string | null {
  const hostname = window.location.hostname

  // Dev: *.localhost subdomains are tenant workspaces
  if (hostname.endsWith('.localhost')) {
    const slug = hostname.slice(0, hostname.length - '.localhost'.length)
    return slug || null
  }

  // Bare localhost or IP → root domain
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null

  // Production
  const rootDomain = import.meta.env.VITE_ROOT_DOMAIN as string | undefined
  if (!rootDomain) return null
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
    } else {
      // Root domain (localhost or prod root) — always clear any leftover tenant
      // from a previous session so stale slugs don't leak into login requests
      clearTenant()
    }
  }, [])

  return <Router />
}

export default App
