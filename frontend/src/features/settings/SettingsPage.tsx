import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { SETTINGS, AUTH } from '../../api/endpoints'
import toast from 'react-hot-toast'
import {
  Loader2, Save, Settings, Building2, Percent, Coins,
  Calendar, Monitor, Check, Globe, ShieldCheck, Info,
} from 'lucide-react'
import { useAuthStore, isManager, type User } from '../../store/authStore'
import { usePreferenceStore, type DateMode } from '../../store/preferenceStore'
import { adStringToBsDisplay, currentFiscalYear, fiscalYearAdParams } from '../../utils/nepaliDate'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantSettings {
  name: string
  slug: string
  logo: string | null
  currency: string
  vat_enabled: boolean
  vat_rate: string
  coin_to_money_rate: string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-indigo-600" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-gray-800">{title}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  )
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="min-w-0 shrink-0 w-48">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      } disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// Date mode selection card
function DateModeCard({
  mode,
  selected,
  onSelect,
  title,
  subtitle,
  example,
}: {
  mode: DateMode
  selected: boolean
  onSelect: (m: DateMode) => void
  title: string
  subtitle: string
  example: { primary: string; secondary: string }
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={`relative flex-1 text-left rounded-xl border-2 px-4 py-4 transition-all cursor-pointer ${
        selected
          ? 'border-indigo-600 bg-indigo-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
      }`}
    >
      {selected && (
        <span className="absolute top-3 right-3 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center">
          <Check size={11} className="text-white" strokeWidth={3} />
        </span>
      )}
      <p className={`text-sm font-bold mb-0.5 ${selected ? 'text-indigo-700' : 'text-gray-700'}`}>
        {title}
      </p>
      <p className="text-xs text-gray-400 mb-3">{subtitle}</p>
      <div className={`rounded-lg px-3 py-2 ${selected ? 'bg-white border border-indigo-200' : 'bg-gray-50 border border-gray-100'}`}>
        <p className={`text-sm font-semibold ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{example.primary}</p>
        <p className="text-xs text-gray-400 mt-0.5">{example.secondary}</p>
      </div>
    </button>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const managerView = isManager(user)

  // Global tenant settings (server)
  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['tenant-settings'],
    queryFn: () => apiClient.get(SETTINGS).then(r => r.data.data ?? r.data),
  })

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('')
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState('')
  const [coinRate, setCoinRate] = useState('')

  useEffect(() => {
    if (settings) {
      setName(settings.name)
      setCurrency(settings.currency)
      setVatEnabled(settings.vat_enabled)
      setVatRate(settings.vat_rate)
      setCoinRate(settings.coin_to_money_rate)
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(SETTINGS, {
        name,
        currency,
        vat_enabled: vatEnabled,
        vat_rate: vatRate,
        coin_to_money_rate: coinRate,
      }),
    onSuccess: () => toast.success('Settings saved'),
    onError: () => toast.error('Failed to save settings'),
  })

  // ── 2FA state ─────────────────────────────────────────────────────────────
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; provisioning_uri: string } | null>(null)
  const [setupCode, setSetupCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null)
  const [showDisable, setShowDisable] = useState(false)
  const [disableCode, setDisableCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [showRegen, setShowRegen] = useState(false)
  const [regenCode, setRegenCode] = useState('')

  const { data: backupCodeData, refetch: refetchBackupCodes } = useQuery<{ remaining_backup_codes: number }>({
    queryKey: ['2fa-backup-codes'],
    queryFn: () => apiClient.get(AUTH.TWO_FA_BACKUP_CODES).then(r => r.data.data ?? r.data),
    enabled: !!user?.is_2fa_enabled,
  })

  async function refresh2FAUser() {
    const me = await apiClient.get(AUTH.ME)
    const meData: User = me.data.data ?? me.data
    setUser(meData)
  }

  const setupMutation = useMutation({
    mutationFn: () => apiClient.get(AUTH.TWO_FA_SETUP).then(r => r.data.data ?? r.data),
    onSuccess: (data) => setTwoFASetup(data),
    onError: () => toast.error('Could not load 2FA setup. Try again.'),
  })

  const confirmMutation = useMutation({
    mutationFn: () => apiClient.post(AUTH.TWO_FA_CONFIRM, { code: setupCode }).then(r => r.data.data ?? r.data),
    onSuccess: async (data) => {
      setBackupCodes(data.backup_codes)
      setTwoFASetup(null)
      setSetupCode('')
      toast.success('Two-factor authentication enabled!')
      await refresh2FAUser()
    },
    onError: () => toast.error('Invalid code — please check your authenticator and try again.'),
  })

  const disableMutation = useMutation({
    mutationFn: () => apiClient.post(AUTH.TWO_FA_DISABLE, { code: disableCode, password: disablePassword }).then(r => r.data),
    onSuccess: async () => {
      setShowDisable(false)
      setDisableCode('')
      setDisablePassword('')
      toast.success('Two-factor authentication disabled.')
      await refresh2FAUser()
    },
    onError: () => toast.error('Invalid code or password.'),
  })

  const regenMutation = useMutation({
    mutationFn: () => apiClient.post(AUTH.TWO_FA_REGEN_BACKUP, { code: regenCode }).then(r => r.data.data ?? r.data),
    onSuccess: async (data) => {
      setBackupCodes(data.backup_codes)
      setShowRegen(false)
      setRegenCode('')
      toast.success('Backup codes regenerated — save them now!')
      await refetchBackupCodes()
    },
    onError: () => toast.error('Invalid authenticator code.'),
  })

  // ── Local user date preferences ──────────────────────────────────────────
  const { dateMode, setDateMode, compactDates, setCompactDates } = usePreferenceStore()

  // Live preview: today's date in both calendars
  const today = new Date().toISOString().slice(0, 10)
  const todayBs = adStringToBsDisplay(today)
  const bsStr = todayBs?.bs ?? '—'
  const adStr = today
  const fyLabel = (() => {
    try { return fiscalYearAdParams(currentFiscalYear()) } catch { return null }
  })()

  const inputCls = (disabled: boolean) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
      disabled
        ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
        : 'border-gray-300 bg-white text-gray-800'
    }`

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (!settings) {
    return <p className="p-6 text-red-500 text-sm">Could not load settings.</p>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Settings size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage workspace configuration and your display preferences</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        {/* Read-only banner */}
        {!managerView && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <ShieldCheck size={16} className="shrink-0" />
            You have read-only access to workspace settings. Only admins and managers can make changes.
          </div>
        )}

        {/* ── General ──────────────────────────────────────────────────── */}
        <SectionCard icon={Building2} title="General" subtitle="Workspace name and basic identity">
          <FieldRow label="Workspace Name" hint="Displayed in the app header and emails">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!managerView}
              className={inputCls(!managerView)}
            />
          </FieldRow>

          <FieldRow label="Slug" hint="Used in the subdomain URL — cannot be changed">
            <input
              type="text"
              value={settings.slug}
              disabled
              className={inputCls(true)}
            />
          </FieldRow>

          <FieldRow label="Currency" hint="e.g. NPR, USD — shown on invoices and payslips">
            <input
              type="text"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              disabled={!managerView}
              placeholder="e.g. NPR"
              maxLength={10}
              className={inputCls(!managerView)}
            />
          </FieldRow>
        </SectionCard>

        {/* ── VAT / Tax ─────────────────────────────────────────────────── */}
        <SectionCard icon={Percent} title="VAT / Tax" subtitle="Value-added tax applied to all invoices">
          <FieldRow label="VAT Enabled" hint="Toggle VAT on or off for all new invoices">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium ${vatEnabled ? 'text-indigo-700' : 'text-gray-400'}`}>
                {vatEnabled ? 'VAT is active on invoices' : 'VAT is disabled'}
              </span>
              <Toggle checked={vatEnabled} onChange={setVatEnabled} disabled={!managerView} />
            </div>
          </FieldRow>

          <FieldRow
            label="VAT Rate (%)"
            hint={!vatEnabled ? 'Enable VAT above to edit the rate' : 'Nepal standard VAT is 13%'}
          >
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={vatRate}
              onChange={e => setVatRate(e.target.value)}
              disabled={!managerView || !vatEnabled}
              className={inputCls(!managerView || !vatEnabled)}
            />
          </FieldRow>
        </SectionCard>

        {/* ── Coin System ───────────────────────────────────────────────── */}
        <SectionCard icon={Coins} title="Coin System" subtitle="Staff reward coins earned by closing tickets">
          <FieldRow
            label="Coin → Money Rate"
            hint="How much one coin is worth when paid out in a payslip"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 shrink-0">1 coin =</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={coinRate}
                onChange={e => setCoinRate(e.target.value)}
                disabled={!managerView}
                placeholder="e.g. 10.00"
                className={`w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                  !managerView
                    ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                    : 'border-gray-300 bg-white text-gray-800'
                }`}
              />
              <span className="text-sm text-gray-500 shrink-0">{currency || 'currency units'}</span>
            </div>
          </FieldRow>
        </SectionCard>

        {/* ── Save tenant settings ─────────────────────────────────────── */}
        {managerView && (
          <div className="flex justify-end">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm"
            >
              {saveMutation.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <Save size={14} />
              }
              Save Workspace Settings
            </button>
          </div>
        )}

        {/* ── Two-Factor Authentication ─────────────────────────────────── */}
        <SectionCard
          icon={ShieldCheck}
          title="Two-Factor Authentication"
          subtitle="Protect your account with a time-based one-time password (TOTP) authenticator app"
        >
          {/* ── Backup codes revealed once after setup / regen ── */}
          {backupCodes && (
            <div className="rounded-xl border-2 border-green-200 bg-green-50 p-5">
              <p className="text-sm font-bold text-green-800 mb-1">Save your backup codes</p>
              <p className="text-xs text-green-700 mb-4">
                These are shown only once. Store them somewhere safe — each code can be used once
                if you lose access to your authenticator.
              </p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm mb-4">
                {backupCodes.map((c) => (
                  <span key={c} className="bg-white border border-green-200 rounded-lg px-3 py-2 text-center tracking-widest">{c}</span>
                ))}
              </div>
              <button
                onClick={() => setBackupCodes(null)}
                className="text-xs font-semibold text-green-700 hover:underline"
              >
                I've saved these — dismiss
              </button>
            </div>
          )}

          {/* ── State: Not enabled, no setup initiated ── */}
          {!user?.is_2fa_enabled && !twoFASetup && !backupCodes && (
            <FieldRow label="Status" hint="2FA is currently off for your account">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400" /> Disabled
                </span>
                <button
                  onClick={() => setupMutation.mutate()}
                  disabled={setupMutation.isPending}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
                >
                  {setupMutation.isPending ? 'Loading…' : 'Set up 2FA →'}
                </button>
              </div>
            </FieldRow>
          )}

          {/* ── State: Setup flow — show QR + secret + code entry ── */}
          {!user?.is_2fa_enabled && twoFASetup && !backupCodes && (
            <>
              <FieldRow label="Status" hint="Complete setup by scanning the QR code below">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Setup in progress
                </span>
              </FieldRow>

              <div className="flex gap-6 items-start">
                {/* QR code via Google Charts */}
                <img
                  src={`https://chart.googleapis.com/chart?cht=qr&chs=180x180&chl=${encodeURIComponent(twoFASetup.provisioning_uri)}`}
                  alt="Scan this QR code with your authenticator app"
                  className="w-44 h-44 rounded-xl border border-gray-200 shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-3">
                  <p className="text-sm text-gray-600">
                    Scan the QR code with <strong>Google Authenticator</strong>, <strong>Authy</strong>, or
                    any TOTP app. Can't scan? Enter this secret manually:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 font-mono tracking-widest break-all">
                      {twoFASetup.secret}
                    </code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(twoFASetup.secret); toast.success('Secret copied!') }}
                      className="shrink-0 text-xs text-indigo-500 hover:text-indigo-700 font-medium"
                    >
                      Copy
                    </button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-700">Enter the 6-digit code to activate</p>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={setupCode}
                      onChange={e => setSetupCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="123456"
                      className="w-36 border border-gray-300 rounded-lg px-3 py-2 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => confirmMutation.mutate()}
                      disabled={setupCode.length < 6 || confirmMutation.isPending}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
                    >
                      {confirmMutation.isPending ? 'Verifying…' : 'Activate 2FA'}
                    </button>
                    <button
                      onClick={() => { setTwoFASetup(null); setSetupCode('') }}
                      className="text-sm text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── State: Enabled — management controls ── */}
          {user?.is_2fa_enabled && !backupCodes && (
            <>
              <FieldRow label="Status" hint="Your account is protected with TOTP 2FA">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Enabled
                </span>
              </FieldRow>

              <FieldRow label="Backup Codes" hint="Single-use codes for emergency access">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {backupCodeData != null
                      ? <>{backupCodeData.remaining_backup_codes} <span className="text-gray-400">remaining</span></>
                      : <span className="text-gray-400">Loading…</span>}
                  </span>
                  <button
                    onClick={() => setShowRegen(true)}
                    className="text-xs font-semibold text-indigo-500 hover:text-indigo-700"
                  >
                    Regenerate codes
                  </button>
                </div>
              </FieldRow>

              {/* Regen modal */}
              {showRegen && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-indigo-800">Regenerate backup codes</p>
                  <p className="text-xs text-indigo-700">Enter your current authenticator code to generate 8 new backup codes. Your old codes will be invalidated immediately.</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={regenCode}
                      onChange={e => setRegenCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit code"
                      className="w-36 border border-indigo-300 bg-white rounded-lg px-3 py-2 text-center text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      onClick={() => regenMutation.mutate()}
                      disabled={regenCode.length < 6 || regenMutation.isPending}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
                    >
                      {regenMutation.isPending ? 'Generating…' : 'Regenerate'}
                    </button>
                    <button onClick={() => { setShowRegen(false); setRegenCode('') }} className="text-sm text-gray-400 hover:text-gray-600">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <FieldRow label="Disable 2FA" hint="Requires your current code and password">
                <button
                  onClick={() => setShowDisable(true)}
                  className="text-sm font-semibold text-red-500 hover:text-red-700"
                >
                  Disable 2FA
                </button>
              </FieldRow>

              {/* Disable modal */}
              {showDisable && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="text-sm font-semibold text-red-800">Disable two-factor authentication</p>
                  <p className="text-xs text-red-700">This will remove 2FA from your account. You'll need both your current authenticator code and your password.</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={disableCode}
                      onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="6-digit authenticator code"
                      className="w-full border border-red-300 bg-white rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <input
                      type="password"
                      value={disablePassword}
                      onChange={e => setDisablePassword(e.target.value)}
                      placeholder="Your account password"
                      className="w-full border border-red-300 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => disableMutation.mutate()}
                      disabled={disableCode.length < 6 || !disablePassword || disableMutation.isPending}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-60 transition"
                    >
                      {disableMutation.isPending ? 'Disabling…' : 'Yes, disable 2FA'}
                    </button>
                    <button
                      onClick={() => { setShowDisable(false); setDisableCode(''); setDisablePassword('') }}
                      className="text-sm text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </SectionCard>

        {/* ── Date & Calendar ───────────────────────────────────────────── */}
        <SectionCard
          icon={Calendar}
          title="Date & Calendar"
          subtitle="Your personal date display preference — saved on this device only"
        >
          {/* Device-only notice */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
            <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              These preferences control how dates appear <strong>for you</strong> across the entire system.
              They are stored on this device and are not shared with other users.
            </p>
          </div>

          {/* Primary calendar mode */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Primary Calendar</p>
            <div className="flex gap-3">
              <DateModeCard
                mode="bs"
                selected={dateMode === 'bs'}
                onSelect={setDateMode}
                title="Bikram Sambat (BS)"
                subtitle="Nepali calendar — primary display"
                example={{
                  primary: bsStr,
                  secondary: `AD: ${adStr}`,
                }}
              />
              <DateModeCard
                mode="ad"
                selected={dateMode === 'ad'}
                onSelect={setDateMode}
                title="Anno Domini (AD)"
                subtitle="Gregorian / English calendar — primary display"
                example={{
                  primary: adStr,
                  secondary: `BS: ${bsStr}`,
                }}
              />
            </div>
          </div>

          {/* Date picker mode note */}
          <FieldRow
            label="Date Input Style"
            hint={
              dateMode === 'bs'
                ? 'BS dropdowns: year / month / day selectors with AD hint'
                : 'AD native input: standard browser date picker with BS hint below'
            }
          >
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
              dateMode === 'bs'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
            }`}>
              <Monitor size={14} className="shrink-0" />
              {dateMode === 'bs' ? 'BS year / month / day dropdowns' : 'Native browser date picker (AD)'}
            </div>
          </FieldRow>

          {/* Compact dates */}
          <FieldRow
            label="Compact Dates"
            hint="Hide the secondary calendar line in tables and lists (saves space)"
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm ${compactDates ? 'text-indigo-700 font-medium' : 'text-gray-400'}`}>
                {compactDates ? 'Only primary date shown in lists' : 'Both calendars shown (primary + hint)'}
              </span>
              <Toggle checked={compactDates} onChange={setCompactDates} />
            </div>
          </FieldRow>

          {/* Live date preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Live Preview — Today</p>
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-gray-400 mb-1">Full display</p>
                <div className="inline-flex flex-col leading-tight">
                  <span className="text-sm font-semibold text-gray-900">
                    {dateMode === 'bs' ? bsStr : adStr}
                  </span>
                  {!compactDates && (
                    <span className="text-xs text-gray-400 mt-0.5">
                      {dateMode === 'bs' ? `AD: ${adStr}` : `BS: ${bsStr}`}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-1">Compact (tables)</p>
                <span className="text-sm font-medium text-gray-800">
                  {dateMode === 'bs' ? bsStr : adStr}
                </span>
              </div>
              {fyLabel && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">Current Fiscal Year</p>
                  <span className="text-sm font-semibold text-indigo-700">
                    FY {currentFiscalYear().label}
                  </span>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {dateMode === 'bs'
                      ? `${adStringToBsDisplay(fyLabel.date_from)?.bs ?? fyLabel.date_from} → ${adStringToBsDisplay(fyLabel.date_to)?.bs ?? fyLabel.date_to}`
                      : `${fyLabel.date_from} → ${fyLabel.date_to}`
                    }
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Globe size={12} />
            The system API always uses AD dates internally — this preference only affects what you see.
          </div>
        </SectionCard>

      </div>
    </div>
  )
}

