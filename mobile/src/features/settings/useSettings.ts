/**
 * Settings service hooks — tenant workspace settings.
 * Only owners/admins can write; all authenticated users can read.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { TENANT } from '@/api/endpoints'
import { QK } from '@/constants/queryKeys'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TenantSettings {
  name: string
  slug: string
  timezone: string
  currency: string
  vat_enabled: boolean
  vat_rate: string
  coin_to_money_rate: string
  sla_warn_before_minutes: number
  logo_url: string | null
  plan_name: string | null
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function useTenantSettings() {
  return useQuery<TenantSettings>({
    queryKey: QK.tenantSettings,
    queryFn: () => apiClient.get(TENANT.SETTINGS).then((r) => r.data.data ?? r.data),
    staleTime: 2 * 60_000,
  })
}

// ── Write ─────────────────────────────────────────────────────────────────────

export function useSaveTenantSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<TenantSettings>) =>
      apiClient.patch(TENANT.SETTINGS, payload).then((r) => r.data.data ?? r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.tenantSettings })
    },
  })
}
