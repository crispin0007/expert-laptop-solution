import React from 'react'
import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import apiClient from '@/api/client'
import { AUTH } from '@/api/endpoints'
import { useAuthStore } from '@/store/authStore'
import { useTenantStore } from '@/store/tenantStore'
import { useTheme } from '@/theme/ThemeContext'
import { useUiStore } from '@/store/uiStore'
import { DrawerToggle } from '@/components/ui/AppDrawer'
import { RoleGuardAny } from '@/guards/RoleGuard'
import * as SecureStore from 'expo-secure-store'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

interface MenuItemProps {
  icon: IoniconName
  label: string
  sublabel?: string
  onPress: () => void
  danger?: boolean
  showArrow?: boolean
}

function MenuItem({ icon, label, sublabel, onPress, danger, showArrow = true }: MenuItemProps) {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 18, paddingVertical: 14,
        borderBottomWidth: 0.5, borderBottomColor: theme.colors.border,
      }}
    >
      <View style={{
        width: 34, height: 34, borderRadius: 10,
        backgroundColor: danger ? '#fee2e2' : theme.colors.background,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons
          name={icon}
          size={18}
          color={danger ? theme.colors.error : theme.primary[600]}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: danger ? theme.colors.error : theme.colors.text }}>
          {label}
        </Text>
        {sublabel && (
          <Text style={{ fontSize: 12, color: theme.colors.textMuted, marginTop: 1 }}>{sublabel}</Text>
        )}
      </View>
      {showArrow && (
        <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
      )}
    </TouchableOpacity>
  )
}

export default function MoreScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const clearTenant = useTenantStore((s) => s.clearTenant)
  const showToast = useUiStore((s) => s.showToast)

  async function handleLogout() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            const refresh = await SecureStore.getItemAsync('nexus_refresh_token')
            if (refresh) await apiClient.post(AUTH.LOGOUT, { refresh })
          } catch { /* ignore — clear locally regardless */ }
          await clearAuth()
          showToast('Signed out successfully', 'success')
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* User header */}
      <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 18, paddingBottom: 24, backgroundColor: theme.primary[600] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <DrawerToggle />
          <Text style={{ fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5 }}>Menu</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: 'rgba(255,255,255,0.2)',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
          }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>
              {user?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#fff' }}>{user?.full_name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 }}>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600', textTransform: 'capitalize' }}>{user?.role}</Text>
              </View>
              {user?.department_name && (
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>{user.department_name}</Text>
              )}
            </View>
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{user?.email}</Text>
          </View>
        </View>
      </View>

      {/* Account */}
      <View style={{ backgroundColor: theme.colors.surface, marginTop: 16, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Account</Text>
        <MenuItem icon="person-outline" label="My Profile" onPress={() => router.push('/(app)/profile')} />
        <MenuItem icon="notifications-outline" label="Notifications" onPress={() => router.push('/(app)/notifications')} />
        <MenuItem icon="shield-checkmark-outline" label="Two-Factor Auth" sublabel={user?.is_2fa_enabled ? 'Enabled' : 'Not enabled'} onPress={() => router.push('/(app)/profile/2fa')} />
      </View>

      {/* Workspace */}
      <RoleGuardAny permissions={['settings.manage', 'accounting.view', 'staff.view', 'departments.view']}>
        <View style={{ backgroundColor: theme.colors.surface, marginTop: 12, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 }}>Workspace</Text>
          <RoleGuardAny permissions={['accounting.view']}>
            <MenuItem icon="cash-outline" label="Accounting" sublabel="Coins, payslips, invoices" onPress={() => router.push('/(app)/accounting' as never)} />
          </RoleGuardAny>
          <RoleGuardAny permissions={['staff.view']}>
            <MenuItem icon="people-outline" label="Staff" sublabel="Manage team members" onPress={() => router.push('/(app)/staff' as never)} />
          </RoleGuardAny>
          <RoleGuardAny permissions={['departments.view']}>
            <MenuItem icon="git-branch-outline" label="Departments" sublabel="Manage departments" onPress={() => router.push('/(app)/departments' as never)} />
          </RoleGuardAny>
          <RoleGuardAny permissions={['roles.manage']}>
            <MenuItem icon="shield-outline" label="Roles & Permissions" sublabel="Custom role config" onPress={() => router.push('/(app)/roles' as never)} />
          </RoleGuardAny>
          <RoleGuardAny permissions={['settings.manage']}>
            <MenuItem icon="settings-outline" label="Settings" onPress={() => router.push('/(app)/settings')} />
          </RoleGuardAny>
        </View>
      </RoleGuardAny>

      {/* Sign out */}
      <View style={{ backgroundColor: theme.colors.surface, marginTop: 12, borderRadius: 16, marginHorizontal: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 }}>
        <MenuItem icon="log-out-outline" label="Sign out" onPress={handleLogout} danger showArrow={false} />
      </View>

      {/* Version */}
      <Text style={{ textAlign: 'center', marginTop: 24, fontSize: theme.fontSize.xs, color: theme.colors.textMuted }}>
        NEXUS BMS v1.0.0
      </Text>
    </ScrollView>
  )
}
