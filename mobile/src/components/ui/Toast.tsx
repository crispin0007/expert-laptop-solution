import React, { useEffect, useRef } from 'react'
import { View, Text, Animated } from 'react-native'
import { useUiStore, type Toast } from '@/store/uiStore'
import { useTheme } from '@/theme/ThemeContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function ToastItem({ toast }: { toast: Toast }) {
  const theme = useTheme()
  const opacity = useRef(new Animated.Value(0)).current

  const bgMap = {
    success: theme.colors.success,
    error: theme.colors.error,
    warning: theme.colors.warning,
    info: theme.primary[600],
  }

  useEffect(() => {
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2800),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View
      style={{
        opacity,
        backgroundColor: bgMap[toast.type],
        borderRadius: theme.radius.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        ...theme.shadow.md,
      }}
    >
      <Text style={{ color: '#fff', fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium }}>
        {toast.message}
      </Text>
    </Animated.View>
  )
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts)
  const insets = useSafeAreaInsets()
  const theme = useTheme()

  if (toasts.length === 0) return null

  return (
    <View
      style={{
        position: 'absolute',
        top: insets.top + theme.spacing.md,
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        zIndex: 9999,
      }}
      pointerEvents="none"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </View>
  )
}
