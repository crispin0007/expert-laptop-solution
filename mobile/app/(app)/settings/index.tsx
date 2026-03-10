import React, { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/theme/ThemeContext'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RoleGuard } from '@/guards/RoleGuard'
import { useTenantSettings, useSaveTenantSettings, type TenantSettings } from '@/features/settings/useSettings'

export default function SettingsScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const isOwner = useAuthStore((s) => s.user?.role === 'owner')
  const isAdmin = useAuthStore((s) => s.user?.role === 'admin')
  const canEdit = isOwner || isAdmin

  const { data: settings, isLoading } = useTenantSettings()

  const [vatEnabled, setVatEnabled] = useState<boolean | null>(null)
  const [vatRate, setVatRate] = useState('')
  const [coinRate, setCoinRate] = useState('')
  const [slaWarn, setSlaWarn] = useState('')
  const [dirty, setDirty] = useState(false)

  // Sync form when data loads
  React.useEffect(() => {
    if (settings && !dirty) {
      setVatEnabled(settings.vat_enabled)
      setVatRate(settings.vat_rate)
      setCoinRate(settings.coin_to_money_rate)
      setSlaWarn(String(settings.sla_warn_before_minutes))
    }
  }, [settings])

  const saveMutation = useSaveTenantSettings()

  function handleSave() {
    saveMutation.mutate(
      { vat_enabled: vatEnabled ?? settings?.vat_enabled, vat_rate: vatRate, coin_to_money_rate: coinRate, sla_warn_before_minutes: Number(slaWarn) },
      { onSuccess: () => { setDirty(false); Alert.alert('Saved', 'Settings updated successfully.') }, onError: () => Alert.alert('Error', 'Could not save settings. Please try again.') },
    )
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={{ marginTop: 24, marginHorizontal: 16 }}>
        <Text style={{ fontSize: theme.fontSize.xs, fontWeight: theme.fontWeight.semibold, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{title}</Text>
        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }}>{children}</View>
      </View>
    )
  }

  function SettingRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted }}>{label}</Text>
        <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text, fontWeight: theme.fontWeight.medium }}>{value}</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: theme.primary[600], fontSize: theme.fontSize.sm }}>←</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: theme.colors.text }}>Workspace Settings</Text>
        </View>
        {canEdit && dirty && (
          <TouchableOpacity onPress={handleSave} disabled={saveMutation.isPending}>
            <Text style={{ color: theme.primary[600], fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.sm }}>Save</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          {/* Read-only info */}
          <Section title="Workspace">
            <SettingRow label="Name" value={settings?.name ?? '—'} />
            <SettingRow label="Timezone" value={settings?.timezone ?? '—'} />
            <SettingRow label="Currency" value={settings?.currency ?? '—'} />
          </Section>

          {/* VAT */}
          <Section title="Tax">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.text }}>Enable VAT</Text>
              <Switch
                value={vatEnabled ?? settings?.vat_enabled ?? false}
                onValueChange={(v) => { setVatEnabled(v); setDirty(true) }}
                disabled={!canEdit}
                trackColor={{ true: theme.primary[500] }}
              />
            </View>
            {(vatEnabled ?? settings?.vat_enabled) && (
              <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                <Input
                  label="VAT Rate (%)"
                  value={vatRate}
                  onChangeText={(v) => { setVatRate(v); setDirty(true) }}
                  placeholder="13.00"
                  keyboardType="decimal-pad"
                  editable={canEdit}
                />
                <Text style={{ fontSize: theme.fontSize.xs, color: theme.colors.textMuted, marginTop: 4 }}>Nepal default is 13%</Text>
              </View>
            )}
          </Section>

          {/* Coin system */}
          <Section title="Coin System">
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Input
                label="Coin to Money Rate"
                value={coinRate}
                onChangeText={(v) => { setCoinRate(v); setDirty(true) }}
                placeholder="1.00"
                keyboardType="decimal-pad"
                editable={canEdit}
                hint="How much currency (in your base currency) is 1 coin worth on a payslip"
              />
            </View>
          </Section>

          {/* SLA */}
          <Section title="SLA">
            <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
              <Input
                label="Warn Before Breach (minutes)"
                value={slaWarn}
                onChangeText={(v) => { setSlaWarn(v); setDirty(true) }}
                placeholder="30"
                keyboardType="number-pad"
                editable={canEdit}
                hint="Send warning notification this many minutes before an SLA deadline"
              />
            </View>
          </Section>

          {canEdit && dirty && (
            <View style={{ marginHorizontal: 16, marginTop: 24 }}>
              <Button label="Save Settings" variant="primary" onPress={handleSave} loading={saveMutation.isPending} fullWidth />
            </View>
          )}

          {!canEdit && (
            <View style={{ margin: 16, padding: 14, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border }}>
              <Text style={{ fontSize: theme.fontSize.sm, color: theme.colors.textMuted, textAlign: 'center' }}>Settings can only be edited by Owners and Admins.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}
