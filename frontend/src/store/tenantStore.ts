import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface PlanInfo {
  id: number
  name: string
  slug: string
}

interface TenantState {
  subdomain: string | null
  tenantName: string | null
  vatEnabled: boolean
  vatRate: number
  /** null = superadmin (unrestricted); string[] = active module keys for this tenant */
  activeModules: string[] | null
  plan: PlanInfo | null
  setTenant: (data: {
    subdomain: string
    name: string
    vat_enabled: boolean
    vat_rate: number
    active_modules?: string[] | null
    plan?: PlanInfo | null
  }) => void
  /** Set only the slug (before full /me/ data is available — e.g. detected from URL) */
  setSubdomain: (slug: string) => void
  clearTenant: () => void
}

export const useTenantStore = create<TenantState>()(
  persist(
    (set) => ({
      subdomain: null,
      tenantName: null,
      vatEnabled: false,
      vatRate: 0.13,
      activeModules: null,
      plan: null,

      setTenant: (data) =>
        set({
          subdomain: data.subdomain,
          tenantName: data.name,
          vatEnabled: data.vat_enabled,
          vatRate: data.vat_rate,
          activeModules: data.active_modules ?? null,
          plan: data.plan ?? null,
        }),

      setSubdomain: (slug) => set((prev) => ({ ...prev, subdomain: slug })),

      clearTenant: () =>
        set({
          subdomain: null,
          tenantName: null,
          vatEnabled: false,
          vatRate: 0.13,
          activeModules: null,
          plan: null,
        }),
    }),
    { name: 'nexus-tenant' }
  )
)
