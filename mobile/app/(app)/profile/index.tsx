import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { useAuthStore } from '@/store/authStore'
import { useProfile } from '@/features/auth/useAuth'

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  const theme = useTheme()
  return (
    <View style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted, flex: 1 }}>{label}</Text>
      <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium, flex: 2, textAlign: 'right' }} numberOfLines={1}>
        {value ?? '—'}
      </Text>
    </View>
  )
}

export default function ProfileScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)

  const { data: profile, isLoading } = useProfile()

  const initials = (profile?.full_name ?? user?.full_name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: theme.primary[600], fontSize: theme.fontSize.sm }}>←</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.text }}>Profile</Text>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {/* Avatar section */}
          <View style={{ alignItems: 'center', paddingVertical: 28, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 30, fontWeight: theme.fontWeight.bold, color: theme.primary[700] }}>{initials}</Text>
            </View>
            <Text style={{ fontSize: theme.fontSize.xl, fontWeight: theme.fontWeight.bold, color: theme.colors.text }}>{profile?.full_name}</Text>
            {profile?.role && (
              <View style={{ marginTop: 6, paddingHorizontal: 12, paddingVertical: 3, backgroundColor: theme.primary[100], borderRadius: 99 }}>
                <Text style={{ fontSize: theme.fontSize.xs, color: theme.primary[700], fontWeight: theme.fontWeight.semibold, textTransform: 'capitalize' }}>{profile.role.replace(/_/g, ' ')}</Text>
              </View>
            )}
          </View>

          {/* Info card */}
          <View style={{ marginTop: 24, marginHorizontal: 16, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
            <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Account Details</Text>
            <InfoRow label="Email" value={profile?.email} />
            <InfoRow label="Phone" value={profile?.phone} />
            <InfoRow label="Department" value={profile?.department?.name} />
            {profile?.staff_number && <InfoRow label="Staff Number" value={profile.staff_number} />}
            <InfoRow label="Member since" value={profile?.date_joined ? new Date(profile.date_joined).toLocaleDateString() : undefined} />
          </View>

          {/* Security card */}
          <View style={{ marginTop: 20, marginHorizontal: 16, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>
            <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>Security</Text>
            <TouchableOpacity onPress={() => router.push('/(app)/profile/2fa' as never)} activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 18 }}>🔐</Text>
                  <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text }}>Two-Factor Authentication</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99, backgroundColor: profile?.is_2fa_enabled ? theme.colors.successBg : theme.colors.errorBg }}>
                    <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: profile?.is_2fa_enabled ? theme.colors.success : theme.colors.error }}>
                      {profile?.is_2fa_enabled ? 'ON' : 'OFF'}
                    </Text>
                  </View>
                  <Text style={{ color: theme.colors.textMuted, fontSize: theme.fontSize.base }}>›</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  )
}
