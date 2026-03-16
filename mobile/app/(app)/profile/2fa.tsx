import React, { useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@/theme/ThemeContext'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { OtpInput } from '@/components/ui/OtpInput'
import {
  use2FAStatus, useSetup2FA, useConfirm2FA,
  useRegen2FABackup, useDisable2FA,
  type SetupInitResponse,
} from '@/features/auth/useAuth'

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = 'status' | 'setup_qr' | 'backup_codes' | 'confirm_disable'

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
      {[1, 2].map((n, i) => {
        const done = current > n
        const active = current === n
        return (
          <View key={n} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {i > 0 && (
              <View style={{ width: 40, height: 2, backgroundColor: done ? theme.primary[500] : theme.colors.border, marginHorizontal: 6 }} />
            )}
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: done ? theme.primary[500] : active ? theme.primary[600] : theme.colors.border,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {done
                ? <Ionicons name="checkmark" size={16} color="#fff" />
                : <Text style={{ fontSize: 13, fontWeight: '800', color: active ? '#fff' : theme.colors.textMuted }}>{n}</Text>
              }
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ─── Status sub-screen ────────────────────────────────────────────────────────

function StatusScreen({
  enabled, backupRemaining, setupLoading, regenLoading, onSetup, onRegen, onDisable,
}: {
  enabled: boolean; backupRemaining: number
  setupLoading: boolean; regenLoading: boolean
  onSetup: () => void; onRegen: () => void; onDisable: () => void
}) {
  const theme = useTheme()
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
      {/* Hero card */}
      <View style={{
        backgroundColor: theme.colors.surface, borderRadius: 20, borderWidth: 1,
        borderColor: theme.colors.border, padding: 24, alignItems: 'center', gap: 14,
      }}>
        <View style={{
          width: 80, height: 80, borderRadius: 40,
          backgroundColor: enabled ? '#dcfce7' : theme.primary[50],
          borderWidth: 2.5, borderColor: enabled ? '#86efac' : theme.primary[200],
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name={enabled ? 'shield-checkmark' : 'shield-outline'} size={38} color={enabled ? '#16a34a' : theme.primary[400]} />
        </View>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: theme.colors.text }}>Two-Factor Authentication</Text>
          <View style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 99, backgroundColor: enabled ? '#dcfce7' : theme.colors.errorLight }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: enabled ? '#15803d' : theme.colors.error, letterSpacing: 0.6 }}>
              {enabled ? '● ENABLED' : '○ DISABLED'}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, color: theme.colors.textMuted, lineHeight: 22, textAlign: 'center' }}>
          {enabled
            ? `Your account is protected with TOTP. You have ${backupRemaining} backup code${backupRemaining === 1 ? '' : 's'} remaining.`
            : 'Add an extra layer of security with Google Authenticator, Authy, or any TOTP app.'}
        </Text>
      </View>

      {/* How it works */}
      {!enabled && (
        <View style={{ backgroundColor: theme.primary[50], borderRadius: 14, borderWidth: 1, borderColor: theme.primary[100], padding: 16, gap: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.primary[600], letterSpacing: 0.6, textTransform: 'uppercase' }}>How it works</Text>
          {[
            { icon: 'phone-portrait-outline' as const, text: 'Install an authenticator app (Authy, Google Authenticator, 1Password).' },
            { icon: 'qr-code-outline' as const, text: 'Scan the QR code shown in the next step to link your account.' },
            { icon: 'keypad-outline' as const, text: 'Enter the 6-digit code each time you sign in for an extra verification.' },
          ].map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: theme.primary[100], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ionicons name={item.icon} size={15} color={theme.primary[600]} />
              </View>
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, flex: 1 }}>{item.text}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Backup code warnings */}
      {enabled && backupRemaining === 0 && (
        <View style={{ backgroundColor: theme.colors.errorLight, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.error + '50', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="alert-circle-outline" size={18} color={theme.colors.error} />
          <Text style={{ fontSize: 13, color: theme.colors.error, flex: 1 }}>No backup codes left — regenerate them now to avoid lockout.</Text>
        </View>
      )}
      {enabled && backupRemaining > 0 && backupRemaining <= 2 && (
        <View style={{ backgroundColor: '#fef3c7', borderRadius: 12, borderWidth: 1, borderColor: '#fbbf24', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="warning-outline" size={18} color="#d97706" />
          <Text style={{ fontSize: 13, color: '#92400e', flex: 1 }}>Only {backupRemaining} backup code{backupRemaining === 1 ? '' : 's'} left — consider regenerating.</Text>
        </View>
      )}

      {/* Action buttons */}
      {enabled ? (
        <View style={{ gap: 10 }}>
          <Button label="Regenerate Backup Codes" variant="secondary" onPress={onRegen} loading={regenLoading} fullWidth />
          <Button label="Disable 2FA" variant="destructive" onPress={onDisable} fullWidth />
        </View>
      ) : (
        <Button label="Set Up Two-Factor Authentication" variant="primary" onPress={onSetup} loading={setupLoading} fullWidth />
      )}
    </ScrollView>
  )
}

// ─── QR setup sub-screen ──────────────────────────────────────────────────────

function SetupQRScreen({
  setupData, otpCode, setOtpCode, verifyLoading, onCopySecret, onVerify, onBack,
}: {
  setupData: SetupInitResponse | null
  otpCode: string; setOtpCode: (v: string) => void
  verifyLoading: boolean
  onCopySecret: () => void; onVerify: () => void; onBack: () => void
}) {
  const theme = useTheme()
  const qrUrl = setupData?.qr_code_url
    ?? `https://chart.googleapis.com/chart?cht=qr&chs=280x280&chl=${encodeURIComponent(setupData?.provisioning_uri ?? '')}`

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 20, alignItems: 'center' }}>
      {/* Step 1 */}
      <StepIndicator current={1} />
      <Text style={{ fontSize: 17, fontWeight: '800', color: useTheme().colors.text }}>Scan QR Code</Text>
      <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: -12 }}>
        Open your authenticator app and scan the code below.
      </Text>

      {/* QR card */}
      <View style={{
        backgroundColor: '#fff', borderRadius: 20, padding: 16,
        borderWidth: 2, borderColor: theme.primary[200],
        shadowColor: theme.primary[400], shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
      }}>
        <Image source={{ uri: qrUrl }} style={{ width: 220, height: 220 }} resizeMode="contain" />
      </View>

      {/* Manual entry */}
      <View style={{ width: '100%', backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' }}>Can't scan? Enter manually</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: theme.colors.border }}>
          <Text style={{ flex: 1, fontFamily: 'monospace', fontSize: 15, color: theme.colors.text, letterSpacing: 2 }} selectable>
            {setupData?.secret ?? '—'}
          </Text>
          <TouchableOpacity onPress={onCopySecret} style={{ padding: 4 }}>
            <Ionicons name="copy-outline" size={18} color={theme.primary[600]} />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>Algorithm: TOTP · Digits: 6 · Period: 30s</Text>
      </View>

      {/* Divider */}
      <View style={{ width: '100%', height: 1, backgroundColor: theme.colors.border }} />

      {/* Step 2 */}
      <StepIndicator current={2} />
      <Text style={{ fontSize: 17, fontWeight: '800', color: theme.colors.text }}>Verify Setup</Text>
      <Text style={{ fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20, marginTop: -12 }}>
        Enter the 6-digit code from your authenticator app to confirm.
      </Text>

      <OtpInput length={6} value={otpCode} onChange={setOtpCode} onComplete={onVerify} autoFocus={false} />

      <View style={{ width: '100%', gap: 10, marginTop: 4 }}>
        <Button label="Verify & Enable 2FA" variant="primary" fullWidth loading={verifyLoading} disabled={otpCode.length < 6} onPress={onVerify} />
        <Button label="Back" variant="ghost" fullWidth onPress={onBack} />
      </View>
    </ScrollView>
  )
}

// ─── Backup codes sub-screen ──────────────────────────────────────────────────

function BackupCodesScreen({
  codes, onCopy, onDone,
}: { codes: string[]; onCopy: () => void; onDone: () => void }) {
  const theme = useTheme()
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View style={{ backgroundColor: '#fef3c7', borderRadius: 14, borderWidth: 1, borderColor: '#fbbf24', padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Ionicons name="warning" size={20} color="#d97706" style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400e' }}>Save your backup codes now</Text>
          <Text style={{ fontSize: 13, color: '#78350f', lineHeight: 20 }}>Each code can only be used once. If you lose your phone, these are your only way in.</Text>
        </View>
      </View>

      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 18 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {codes.map((code, i) => (
            <View key={i} style={{
              width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8,
              backgroundColor: theme.primary[50], borderRadius: 10,
              borderWidth: 1, borderColor: theme.primary[100],
              paddingHorizontal: 10, paddingVertical: 10,
            }}>
              <Text style={{ fontSize: 11, color: theme.primary[400], fontWeight: '700', width: 18 }}>{i + 1}.</Text>
              <Text style={{ fontFamily: 'monospace', fontSize: 14, color: theme.primary[800], letterSpacing: 1.5, fontWeight: '700' }}>{code}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Button label="Copy All Codes" variant="secondary" fullWidth onPress={onCopy} />
        <Button label="Done — I've saved my codes" variant="primary" fullWidth onPress={onDone} />
      </View>
    </ScrollView>
  )
}

// ─── Disable sub-screen ───────────────────────────────────────────────────────

function DisableScreen({
  disableOtp, setDisableOtp, disableLoading, onDisable, onBack,
}: {
  disableOtp: string; setDisableOtp: (v: string) => void
  disableLoading: boolean; onDisable: () => void; onBack: () => void
}) {
  const theme = useTheme()
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }}>
      <View style={{ backgroundColor: theme.colors.errorLight, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.error + '40', padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Ionicons name="shield-outline" size={20} color={theme.colors.error} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: theme.colors.error }}>You are disabling 2FA</Text>
          <Text style={{ fontSize: 13, color: theme.colors.textMuted, lineHeight: 20 }}>Anyone with your password will be able to sign in without a second factor.</Text>
        </View>
      </View>

      <View style={{ backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 20, gap: 16, alignItems: 'center' }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text }}>Confirm with your 6-digit code</Text>
        <OtpInput length={6} value={disableOtp} onChange={setDisableOtp} onComplete={onDisable} />
        <Text style={{ fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' }}>Or enter one of your backup codes instead.</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Button label="Disable Two-Factor Authentication" variant="destructive" fullWidth loading={disableLoading} disabled={disableOtp.length < 6} onPress={onDisable} />
        <Button label="Cancel" variant="ghost" fullWidth onPress={onBack} />
      </View>
    </ScrollView>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TwoFAScreen() {
  const theme = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const setUser = useAuthStore((s) => s.setUser)
  const user = useAuthStore((s) => s.user)

  const [screen, setScreen] = useState<Screen>('status')
  const [otpCode, setOtpCode] = useState('')
  const [disableOtp, setDisableOtp] = useState('')
  const [setupData, setSetupData] = useState<SetupInitResponse | null>(null)
  const [backupCodes, setBackupCodes] = useState<string[]>([])

  const { data: status, isLoading } = use2FAStatus()
  const setupMutation = useSetup2FA()
  const confirmMutation = useConfirm2FA()
  const regenMutation = useRegen2FABackup()
  const disableMutation = useDisable2FA()

  function goBack() {
    if (screen === 'status') router.canGoBack() ? router.back() : router.replace('/(app)/profile')
    else { setScreen('status'); setOtpCode(''); setDisableOtp('') }
  }

  const TITLES: Record<Screen, string> = {
    status: 'Two-Factor Authentication',
    setup_qr: 'Set Up 2FA',
    backup_codes: 'Backup Codes',
    confirm_disable: 'Disable 2FA',
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 14,
        backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border,
        flexDirection: 'row', alignItems: 'center',
      }}>
        <TouchableOpacity onPress={goBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 8 }}>
          <Ionicons name="chevron-back" size={20} color={theme.primary[600]} />
          <Text style={{ color: theme.primary[600], fontSize: 14, fontWeight: '600' }}>
            {screen === 'status' ? 'Profile' : 'Back'}
          </Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: theme.colors.text, textAlign: 'center' }}>
          {TITLES[screen]}
        </Text>
        {/* Balance spacer */}
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary[500]} />
        </View>
      ) : (
        <>
          {screen === 'status' && (
            <StatusScreen
              enabled={status?.is_2fa_enabled ?? false}
              backupRemaining={status?.backup_codes_remaining ?? 0}
              setupLoading={setupMutation.isPending}
              regenLoading={regenMutation.isPending}
              onSetup={() => setupMutation.mutate(undefined, {
                onSuccess: (data) => { setSetupData(data); setScreen('setup_qr') },
                onError: (err: unknown) => {
                  const msg = (err as { response?: { data?: { detail?: string; message?: string }; status?: number } })
                    ?.response?.data?.detail
                    ?? (err as { response?: { data?: { message?: string } } })?.response?.data?.message
                    ?? (err as { message?: string })?.message
                    ?? 'Unknown error'
                  Alert.alert('2FA Setup Error', `${msg}`)
                },
              })}
              onRegen={() => Alert.alert(
                'Regenerate Backup Codes',
                'Your existing backup codes will be permanently invalidated. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Regenerate', onPress: () => regenMutation.mutate(undefined, {
                    onSuccess: (data) => { setBackupCodes(data.backup_codes); setScreen('backup_codes') },
                    onError: () => Alert.alert('Error', 'Failed to regenerate codes.'),
                  }) },
                ],
              )}
              onDisable={() => setScreen('confirm_disable')}
            />
          )}

          {screen === 'setup_qr' && (
            <SetupQRScreen
              setupData={setupData}
              otpCode={otpCode}
              setOtpCode={setOtpCode}
              verifyLoading={confirmMutation.isPending}
              onCopySecret={() => {
                if (setupData?.secret) {
                  Clipboard.setStringAsync(setupData.secret)
                  Alert.alert('Copied', 'Secret key copied to clipboard.')
                }
              }}
              onVerify={() => confirmMutation.mutate(otpCode, {
                onSuccess: (data) => {
                  setBackupCodes(data.backup_codes)
                  setScreen('backup_codes')
                  if (user) setUser({ ...user, is_2fa_enabled: true })
                },
                onError: () => { Alert.alert('Invalid Code', 'The code is incorrect. Try again.'); setOtpCode('') },
              })}
              onBack={() => { setScreen('status'); setOtpCode('') }}
            />
          )}

          {screen === 'backup_codes' && (
            <BackupCodesScreen
              codes={backupCodes}
              onCopy={async () => {
                await Clipboard.setStringAsync(backupCodes.join('\n'))
                Alert.alert('Copied', 'All backup codes copied to clipboard.')
              }}
              onDone={() => setScreen('status')}
            />
          )}

          {screen === 'confirm_disable' && (
            <DisableScreen
              disableOtp={disableOtp}
              setDisableOtp={setDisableOtp}
              disableLoading={disableMutation.isPending}
              onDisable={() => disableMutation.mutate(disableOtp, {
                onSuccess: () => {
                  if (user) setUser({ ...user, is_2fa_enabled: false })
                  setDisableOtp('')
                  setScreen('status')
                  Alert.alert('2FA Disabled', 'Two-factor authentication has been turned off.')
                },
                onError: () => { Alert.alert('Invalid Code', 'The code is incorrect. Try again.'); setDisableOtp('') },
              })}
              onBack={() => { setScreen('status'); setDisableOtp('') }}
            />
          )}
        </>
      )}
    </View>
  )
}

