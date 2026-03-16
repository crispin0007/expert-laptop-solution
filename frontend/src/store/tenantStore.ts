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
  logo: string | null
  favicon: string | null
  vatEnabled: boolean
  vatRate: number
  /** null = superadmin (unrestricted); string[] = active module keys for this tenant */
  activeModules: string[] | null
  plan: PlanInfo | null
  setTenant: (data: {
    subdomain: string
    name: string
    logo?: string | null
    favicon?: string | null
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
      logo: null,
      favicon: null,
      vatEnabled: false,
      vatRate: 0.13,
      activeModules: null,
      plan: null,

      setTenant: (data) =>
        set({
          subdomain: data.subdomain,
          tenantName: data.name,
          logo: data.logo ?? null,
          favicon: data.favicon ?? null,
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
          logo: null,
          favicon: null,
          vatEnabled: false,
          vatRate: 0.13,
          activeModules: null,
          plan: null,
        }),
    }),
    {
      name: 'nexus-tenant',
      // Version strategy:
      //   • Only bump when a stored field is REMOVED or RENAMED (breaking change).
      //   • Adding new nullable fields does NOT require a version bump — the
      //     migrate() merge function fills them in from defaults automatically.
      // ⚠️  NEVER return {} from migrate() — that wipes the whole store (including
      //     subdomain) and can cause timing issues in the login flow.
      version: 2,
      migrate: (persistedState: unknown, _version: number) => {
        // Merge the stored state with explicit defaults for every field.
        // New fields added to TenantState simply default to their zero-value here
        // — no version bump needed for adding nullable fields.
        const s = (persistedState ?? {}) as Record<string, unknown>
        return {
          subdomain:     (s.subdomain     as string | null)  ?? null,
          tenantName:    (s.tenantName    as string | null)  ?? null,
          logo:          (s.logo          as string | null)  ?? null,
          favicon:       (s.favicon       as string | null)  ?? null,
          vatEnabled:    (s.vatEnabled    as boolean)        ?? false,
          vatRate:       (s.vatRate       as number)         ?? 0.13,
          activeModules: (s.activeModules as string[] | null)?? null,
          plan:          (s.plan          as object | null)  ?? null,
        }
      },
    }
  )
)
