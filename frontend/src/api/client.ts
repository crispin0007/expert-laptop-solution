import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Detect tenant slug from the URL hostname.
//   test.localhost        → 'test'  (dev subdomain)
//   localhost             → null    (dev root / super admin)
//   els.bms.example.com  → 'els'   (prod subdomain)
//   bms.example.com      → null    (prod root)
function getSlugFromHostname(): string | null {
  const hostname = window.location.hostname

  // Dev: any *.localhost subdomain is a tenant (e.g. test.localhost → 'test')
  if (hostname.endsWith('.localhost')) {
    const slug = hostname.slice(0, hostname.length - '.localhost'.length)
    return slug || null
  }

  // Bare localhost or IP → root / super admin domain
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return null

  // Production subdomain detection via VITE_ROOT_DOMAIN
  const rootDomain = import.meta.env.VITE_ROOT_DOMAIN as string | undefined
  if (!rootDomain) return null
  if (hostname === rootDomain) return null // super admin root
  if (hostname.endsWith('.' + rootDomain)) {
    return hostname.slice(0, hostname.length - rootDomain.length - 1)
  }
  return null
}

/**
 * Returns true when the current URL is definitively the root / super-admin domain.
 * On root domain we must NEVER send X-Tenant-Slug, even if tenantStore has a
 * stale subdomain from a previous tenant session persisted in localStorage.
 */
function isRootDomain(): boolean {
  const hostname = window.location.hostname
  if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return true
  const rootDomain = import.meta.env.VITE_ROOT_DOMAIN as string | undefined
  if (!rootDomain) return true
  return hostname === rootDomain
}

// Token endpoints that must never carry a Bearer Authorization header.
// X-Tenant-Slug is STILL sent on these endpoints — but ONLY when it can be
// derived from the current URL hostname (e.g. pro.localhost → 'pro').
// This is required so the backend middleware can resolve the correct tenant
// during login when Vite's dev proxy rewrites the Host header to localhost:8000.
// Stale localStorage slugs are never sent on token endpoints (only URL-derived).
// (relative to baseURL — no /api/v1 prefix)
const TOKEN_ENDPOINTS = new Set(['/accounts/token/', '/accounts/token/refresh/'])

// Attach access token + tenant slug to every request
apiClient.interceptors.request.use((config) => {
  const url = config.url ?? ''
  const isTokenEndpoint = TOKEN_ENDPOINTS.has(url) ||
    Array.from(TOKEN_ENDPOINTS).some(ep => url.endsWith(ep))

  if (!isTokenEndpoint) {
    // Non-auth requests: attach Bearer token from store
    const token = useAuthStore.getState().accessToken
    if (token) config.headers.Authorization = `Bearer ${token}`
  }

  // Attach X-Tenant-Slug on ALL requests, with source depending on context:
  //   • Token endpoints (login/refresh): ONLY URL-derived slug — never stale localStorage.
  //     On localhost (superadmin), getSlugFromHostname() returns null → no header sent → correct.
  //     On pro.localhost (tenant), it returns 'pro' → sent → backend resolves tenant → correct.
  //   • All other requests: URL slug takes precedence, falls back to store slug.
  const slugFromUrl = getSlugFromHostname()
  if (isTokenEndpoint) {
    if (slugFromUrl) config.headers['X-Tenant-Slug'] = slugFromUrl
  } else {
    const slug = slugFromUrl ?? (isRootDomain() ? null : useTenantStore.getState().subdomain)
    if (slug) config.headers['X-Tenant-Slug'] = slug
  }

  return config
})

// On 401 — try refresh token, else logout.
// Never intercept the token or refresh endpoints themselves — those 401s must
// propagate to the caller (e.g. LoginPage handleSubmit) so it can show a toast.
//
// NOTE: originalRequest.url is the path RELATIVE to baseURL (/api/v1), so
// these must NOT include the /api/v1 prefix.
const AUTH_ENDPOINTS = ['/accounts/token/', '/accounts/token/refresh/']

apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
    const requestUrl: string = originalRequest?.url ?? ''

    // Skip intercept for auth endpoints — let the caller handle the error
    const isAuthEndpoint = AUTH_ENDPOINTS.some(
      (ep) => requestUrl === ep || requestUrl === `/api/v1${ep}` || requestUrl.endsWith(ep)
    )
    if (isAuthEndpoint) return Promise.reject(error)

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        const refresh = useAuthStore.getState().refreshToken
        if (!refresh) throw new Error('No refresh token')
        const { data } = await axios.post('/api/v1/accounts/token/refresh/', {
          refresh,
        })
        useAuthStore.getState().setTokens(data.access, refresh)
        originalRequest.headers.Authorization = `Bearer ${data.access}`
        return apiClient(originalRequest)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
