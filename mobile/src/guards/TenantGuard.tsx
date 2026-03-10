import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { useTenantStore } from '@/store/tenantStore'
import { useTheme } from '@/theme/ThemeContext'

/**
 * Ensures tenant config is loaded before rendering protected screens.
 * Shows a spinner while resolving.
 */
export function TenantGuard({ children }: { children: React.ReactNode }) {
  const tenant = useTenantStore((s) => s.tenant)
  const theme = useTheme()

  if (!tenant) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.primary[500]} />
      </View>
    )
  }

  return <>{children}</>
}
