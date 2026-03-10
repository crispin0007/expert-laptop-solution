import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '@/api/client'
import { AUTH } from '@/api/endpoints'
import { useAuthStore, type User } from '@/store/authStore'
import { useTheme } from '@/theme/ThemeContext'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/components/ui/Button'
import { OtpInput } from '@/components/ui/OtpInput'

export default function Verify2FAScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { two_factor_token } = useLocalSearchParams<{ two_factor_token: string }>()
  const { setTokens, setUser } = useAuthStore.getState()
  const showToast = useUiStore((s) => s.showToast)

  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [useBackup, setUseBackup] = useState(false)

  async function handleVerify() {
    if (!two_factor_token) return
    setLoading(true)
    setError('')
    try {
      const res = await apiClient.post(AUTH.TWO_FA_VERIFY, {
        two_factor_token,
        code: code.trim(),
      })
      const payload = res.data.data ?? res.data
      await setTokens(payload.access, payload.refresh)

      const meRes = await apiClient.get(AUTH.ME)
      const user: User = meRes.data.data ?? meRes.data
      setUser(user)

      showToast(`Welcome back, ${user.full_name}!`, 'success')
      router.replace('/(app)/(tabs)/dashboard')
    } catch {
      setError('Invalid code. Please try again.')
      setCode('')
    } finally {
      setLoading(false)
    }
  }

  const codeLength = useBackup ? 8 : 6

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
          backgroundColor: theme.colors.background,
          justifyContent: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Shield icon header */}
        <View style={{ alignItems: 'center', marginBottom: 36 }}>
          <View style={{
            width: 88, height: 88, borderRadius: 44,
            backgroundColor: theme.primary[50],
            borderWidth: 2.5, borderColor: theme.primary[200],
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 20,
          }}>
            <Ionicons name="shield-checkmark" size={44} color={theme.primary[500]} />
          </View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: theme.colors.text, textAlign: 'center' }}>
            Two-Factor Authentication
          </Text>
          <Text style={{ fontSize: 14, color: theme.colors.textMuted, marginTop: 8, textAlign: 'center', lineHeight: 22 }}>
            {useBackup
              ? 'Enter one of your 8-character backup codes'
              : 'Enter the 6-digit code from your authenticator app'}
          </Text>
        </View>

        {/* Card */}
        <View style={{
          backgroundColor: theme.colors.surface,
          borderRadius: 20,
          padding: 24,
          gap: 20,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.07,
          shadowRadius: 12,
          elevation: 4,
        }}>
          {/* Mode label */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={useBackup ? 'key-outline' : 'phone-portrait-outline'}
              size={14}
              color={theme.primary[500]}
            />
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary[600], letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {useBackup ? 'Backup Code' : 'Authenticator App'}
            </Text>
          </View>

          <OtpInput
            length={codeLength}
            value={code}
            onChange={(v) => { setCode(v); if (error) setError('') }}
            onComplete={handleVerify}
            alphanumeric={useBackup}
            autoFocus
            error={!!error}
          />

          {error ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="alert-circle-outline" size={14} color={theme.colors.error} />
              <Text style={{ fontSize: 13, color: theme.colors.error }}>{error}</Text>
            </View>
          ) : null}

          <Button
            label="Verify & Sign In"
            onPress={handleVerify}
            loading={loading}
            disabled={code.length < codeLength}
            fullWidth
            size="lg"
          />

          {/* Toggle mode */}
          <TouchableOpacity
            onPress={() => { setUseBackup(!useBackup); setCode(''); setError('') }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
          >
            <Ionicons
              name={useBackup ? 'phone-portrait-outline' : 'key-outline'}
              size={14}
              color={theme.primary[600]}
            />
            <Text style={{ fontSize: 13, color: theme.primary[600], fontWeight: '600' }}>
              {useBackup ? 'Use authenticator app instead' : 'Use a backup code instead'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Back link */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}
        >
          <Ionicons name="arrow-back-outline" size={15} color={theme.colors.textMuted} />
          <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
