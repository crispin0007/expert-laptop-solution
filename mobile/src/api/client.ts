import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import Constants from 'expo-constants'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useUiStore } from '@/store/uiStore'
import { AUTH } from './endpoints'

const BASE_URL: string =
  Constants.expoConfig?.extra?.apiBaseUrl ?? 'https://bms.techyatra.com.np/api/v1'

// Derive the root host so we can build tenant subdomain URLs dynamically.
// e.g. BASE_URL = https://bms.techyatra.com.np/api/v1 → ROOT_HOST = bms.techyatra.com.np
// Tenant URL  = https://account.bms.techyatra.com.np/api/v1
const _parsedBase = new URL(BASE_URL)
const ROOT_HOST = _parsedBase.host          // bms.techyatra.com.np
const API_PATH  = _parsedBase.pathname       // /api/v1

export function tenantBaseUrl(slug: string): string {
  return `https://${slug}.${ROOT_HOST}${API_PATH}`
}

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// ── Request interceptor ───────────────────────────────────────────────────────
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken
  const slug = useTenantStore.getState().tenant?.slug

  if (token) config.headers['Authorization'] = `Bearer ${token}`

  if (slug) {
    // Route every request to the tenant's own subdomain so Django's
    // TenantMiddleware resolves the tenant from the Host header — the same
    // way the web frontend works. The root domain (bms.techyatra.com.np)
    // is super-admin only and rejects staff logins regardless of headers.
    config.baseURL = tenantBaseUrl(slug)
    config.headers['X-Tenant-Slug'] = slug  // belt-and-suspenders fallback
  }

  return config
})

// ── Token refresh with queuing ────────────────────────────────────────────────
let refreshPromise: Promise<string> | null = null
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (err: unknown) => void
}> = []

function processQueue(token: string | null, error: unknown = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token)
    else reject(error)
  })
  failedQueue = []
}

async function refreshAccessToken(): Promise<string> {
  const { SecureStore } = await import('expo-secure-store')
  const refresh = await SecureStore.getItemAsync('nexus_refresh_token')
  if (!refresh) throw new Error('No refresh token stored')

  // Use the tenant subdomain for refresh too — root domain rejects staff tokens
  const slug = useTenantStore.getState().tenant?.slug
  const refreshBase = slug ? tenantBaseUrl(slug) : BASE_URL
  const response = await axios.post(`${refreshBase}${AUTH.REFRESH}`, { refresh })
  const { access, refresh: newRefresh } = response.data

  await useAuthStore.getState().setTokens(access, newRefresh)
  return access
}

// ── Response interceptor ──────────────────────────────────────────────────────
apiClient.interceptors.response.use(
  (response) => {
    // Clear offline state on any successful response
    if (useUiStore.getState().isOffline) {
      useUiStore.getState().setOffline(false)
    }
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    // Handle network errors
    if (!error.response) {
      useUiStore.getState().setOffline(true)
      return Promise.reject(error)
    }

    const { status } = error.response

    // 401 → attempt token refresh once
    if (status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      if (refreshPromise) {
        // Another request already refreshing — enqueue this one
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              if (originalRequest.headers)
                originalRequest.headers['Authorization'] = `Bearer ${token}`
              resolve(apiClient(originalRequest))
            },
            reject,
          })
        })
      }

      // Start the refresh
      refreshPromise = refreshAccessToken()
        .then((token) => {
          processQueue(token)
          return token
        })
        .catch((err) => {
          processQueue(null, err)
          // Could not refresh — force logout
          useAuthStore.getState().clearAuth()
          throw err
        })
        .finally(() => {
          refreshPromise = null
        })

      try {
        const newToken = await refreshPromise
        if (originalRequest.headers)
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        return apiClient(originalRequest)
      } catch {
        return Promise.reject(error)
      }
    }

    // 403 → show permission error toast
    if (status === 403) {
      useUiStore.getState().showToast('You do not have permission to perform this action.', 'error')
    }

    return Promise.reject(error)
  },
)

export default apiClient
