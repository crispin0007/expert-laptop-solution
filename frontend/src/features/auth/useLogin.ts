import { useMutation } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { AUTH } from '../../api/endpoints'
import { useAuthStore } from '../../store/authStore'
import { useTenantStore } from '../../store/tenantStore'

interface LoginPayload {
  email: string
  password: string
}

interface TokenResponse {
  access: string
  refresh: string
}

export function useLogin() {
  const { setTokens, setUser } = useAuthStore()
  const { setTenant } = useTenantStore()

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await apiClient.post<TokenResponse>(AUTH.TOKEN, payload)
      return data
    },
    onSuccess: async (data) => {
      setTokens(data.access, data.refresh)
      // Fetch the full user profile (includes is_superadmin, full_name, tenants list, etc.)
      const me = await apiClient.get(AUTH.ME, {
        headers: { Authorization: `Bearer ${data.access}` },
      })
      setUser(me.data)

      // Auto-select the first tenant membership so X-Tenant-Slug is sent on all requests
      const tenants: Array<{
        subdomain: string
        name: string
        vat_enabled: boolean
        vat_rate: number
      }> = me.data.tenants ?? []
      if (tenants.length > 0) {
        setTenant({
          subdomain: tenants[0].subdomain,
          name: tenants[0].name,
          vat_enabled: tenants[0].vat_enabled,
          vat_rate: tenants[0].vat_rate,
        })
      }
    },
  })
}
