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

// Attach access token + tenant slug to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`

  // Priority: URL subdomain → store (fallback for dev/localhost)
  const slug = getSlugFromHostname() ?? useTenantStore.getState().subdomain
  if (slug) config.headers['X-Tenant-Slug'] = slug

  return config
})

// On 401 — try refresh token, else logout
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config
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
