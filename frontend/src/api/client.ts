import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useTenantStore } from '../store/tenantStore'

const apiClient = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

// Attach access token + tenant slug to every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) config.headers.Authorization = `Bearer ${token}`

  const subdomain = useTenantStore.getState().subdomain
  if (subdomain) config.headers['X-Tenant-Slug'] = subdomain

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
