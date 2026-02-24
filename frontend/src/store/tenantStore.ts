import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TenantState {
  subdomain: string | null
  tenantName: string | null
  vatEnabled: boolean
  vatRate: number
  setTenant: (data: { subdomain: string; name: string; vat_enabled: boolean; vat_rate: number }) => void
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

      setTenant: (data) =>
        set({
          subdomain: data.subdomain,
          tenantName: data.name,
          vatEnabled: data.vat_enabled,
          vatRate: data.vat_rate,
        }),

      setSubdomain: (slug) => set((prev) => ({ ...prev, subdomain: slug })),

      clearTenant: () =>
        set({ subdomain: null, tenantName: null, vatEnabled: false, vatRate: 0.13 }),
    }),
    { name: 'nexus-tenant' }
  )
)
