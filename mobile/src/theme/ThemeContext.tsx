import React, { createContext, useContext } from 'react'
import { useTenantStore } from '@/store/tenantStore'
import type { Theme } from './buildTheme'
import { buildTheme } from './buildTheme'

const ThemeContext = createContext<Theme>(buildTheme({}))

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useTenantStore((s) => s.theme)
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  return useContext(ThemeContext)
}
