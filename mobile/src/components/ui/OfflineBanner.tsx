import React from 'react'
import { View, Text } from 'react-native'
import { useUiStore } from '@/store/uiStore'
import { useTheme } from '@/theme/ThemeContext'

export function OfflineBanner() {
  const isOffline = useUiStore((s) => s.isOffline)
  const theme = useTheme()

  if (!isOffline) return null

  return (
    <View
      style={{
        backgroundColor: theme.colors.warning,
        paddingVertical: theme.spacing.xs,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold }}>
        You're offline — showing cached data
      </Text>
    </View>
  )
}
