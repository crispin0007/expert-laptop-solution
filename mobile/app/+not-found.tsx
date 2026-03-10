import React from 'react'
import { View, Text } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { Button } from '@/components/ui/Button'

export default function NotFoundScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <Text style={{ fontSize: 72, marginBottom: 20 }}>🔍</Text>
      <Text style={{ fontSize: theme.fontSize['2xl'], fontWeight: theme.fontWeight.bold, color: theme.colors.text, marginBottom: 8, textAlign: 'center' }}>Page Not Found</Text>
      <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 32, maxWidth: 280 }}>The screen you're looking for doesn't exist or you don't have permission to view it.</Text>
      <Button label="Go to Dashboard" variant="primary" onPress={() => router.replace('/(app)/(tabs)/dashboard')} />
      <View style={{ marginTop: 12 }}>
        <Button label="Go Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  )
}
