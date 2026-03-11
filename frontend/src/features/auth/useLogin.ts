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

// Returned when 2FA is required — not a final token yet
interface TwoFAPendingResponse {
  requires_2fa: true
  two_factor_token: string
}

type LoginResponse = TokenResponse | TwoFAPendingResponse

export function isTwoFAPending(r: LoginResponse): r is TwoFAPendingResponse {
  return (r as TwoFAPendingResponse).requires_2fa === true
}

export function useLogin() {
  const { setTokens, setUser } = useAuthStore()
  const { setTenant, clearTenant } = useTenantStore()

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await apiClient.post<LoginResponse>(AUTH.TOKEN, payload)
      return data
    },
    onSuccess: async (data) => {
      // 2FA gate — caller handles the pending state, skip token storage here
      if (isTwoFAPending(data)) return

      setTokens(data.access, data.refresh)
      // Fetch the full user profile (includes is_superadmin, full_name, tenants list, etc.)
      const me = await apiClient.get(AUTH.ME, {
        headers: { Authorization: `Bearer ${data.access}` },
      })
      setUser(me.data)

      if (me.data.is_superadmin) {
        clearTenant()
      } else {
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
            active_modules: me.data.active_modules ?? null,
            plan: me.data.plan ?? null,
          })
        }
      }
    },
  })
}

/** Second step: exchange 2FA OTP for real JWT pair. */
export function useTwoFAVerify() {
  const { setTokens, setUser } = useAuthStore()
  const { setTenant } = useTenantStore()

  return useMutation({
    mutationFn: async (payload: { two_factor_token: string; code: string }) => {
      const { data } = await apiClient.post<TokenResponse>(AUTH.TWO_FA_VERIFY, payload)
      return data
    },
    onSuccess: async (data) => {
      setTokens(data.access, data.refresh)
      const me = await apiClient.get(AUTH.ME, {
        headers: { Authorization: `Bearer ${data.access}` },
      })
      setUser(me.data)

      if (!me.data.is_superadmin) {
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
            active_modules: me.data.active_modules ?? null,
            plan: me.data.plan ?? null,
          })
        }
      }
    },
  })
}

