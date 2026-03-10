import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { buildTheme, type Theme } from '@/theme/buildTheme'

const TENANT_KEY = 'nexus_tenant_config'

export interface TenantConfig {
  id?: number
  slug: string
  name: string
  logo: string | null
  currency: string
  vat_enabled: boolean
  vat_rate: string
  primary_color: string
  coin_to_money_rate?: string
}

/** Call once at app boot to restore persisted tenant into the store. */
export async function loadPersistedTenantAsync(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(TENANT_KEY)
    if (!raw) return
    const t: TenantConfig = JSON.parse(raw)
    useTenantStore.getState().setTenant(t)
  } catch {
    // ignore corrupt data
  }
}

interface TenantState {
  tenant: TenantConfig | null
  theme: Theme
  setTenant: (t: TenantConfig) => void
  clearTenant: () => void
}

const defaultTheme = buildTheme({ primary_color: '#4f46e5', name: 'NEXUS BMS' })

export const useTenantStore = create<TenantState>((set) => ({
  tenant: null,
  theme: defaultTheme,

  setTenant: (t) => {
    SecureStore.setItemAsync(TENANT_KEY, JSON.stringify(t)).catch(() => {})
    set({ tenant: t, theme: buildTheme(t) })
  },

  clearTenant: () => {
    SecureStore.deleteItemAsync(TENANT_KEY).catch(() => {})
    set({ tenant: null, theme: defaultTheme })
  },
}))
