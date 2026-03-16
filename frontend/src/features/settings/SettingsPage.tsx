import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { SETTINGS, AUTH, NOTIFICATIONS } from '../../api/endpoints'
import toast from 'react-hot-toast'
import { QRCodeSVG } from 'qrcode.react'
import {
  Loader2, Save, Settings, Building2, Percent, Coins,
  Calendar, Monitor, Check, Globe, ShieldCheck, Info,
  UploadCloud, X, Image, Link2, Palette,
  Bell, Mail, Smartphone, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuthStore, isManager, type User } from '../../store/authStore'
import { usePreferenceStore, type DateMode } from '../../store/preferenceStore'
import { useTenantStore } from '../../store/tenantStore'
import { adStringToBsDisplay, currentFiscalYear, fiscalYearAdParams } from '../../utils/nepaliDate'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantSettings {
  name: string
  slug: string
  logo: string | null
  favicon: string | null
  currency: string
  vat_enabled: boolean
  vat_rate: string
  coin_to_money_rate: string
}

type SettingsTab = 'workspace' | 'tax' | 'security' | 'display' | 'notifications'

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'workspace',     label: 'Workspace',     icon: Building2   },
  { id: 'tax',          label: 'Tax & Finance',  icon: Percent     },
  { id: 'security',     label: 'Security',       icon: ShieldCheck },
  { id: 'display',      label: 'Display',        icon: Monitor     },
  { id: 'notifications',label: 'Notifications',  icon: Bell        },
]

// ── Human-readable notification type labels ───────────────────────────────────
const NOTIF_TYPES: { key: string; label: string; group: string }[] = [
  { key: 'ticket_assigned',  label: 'Ticket assigned to me',   group: 'Tickets' },
  { key: 'ticket_status',    label: 'Ticket status changed',   group: 'Tickets' },
  { key: 'ticket_comment',   label: 'New ticket comment',      group: 'Tickets' },
  { key: 'ticket_transfer',  label: 'Ticket transferred',      group: 'Tickets' },
  { key: 'sla_warning',      label: 'SLA warning',             group: 'Tickets' },
  { key: 'sla_breached',     label: 'SLA breached',            group: 'Tickets' },
  { key: 'project_assigned', label: 'Project assigned to me',  group: 'Projects' },
  { key: 'task_assigned',    label: 'Task assigned to me',     group: 'Projects' },
  { key: 'task_done',        label: 'Task completed',          group: 'Projects' },
  { key: 'coin_approved',    label: 'Coin reward approved',    group: 'Finance'  },
  { key: 'coin_rejected',    label: 'Coin reward rejected',    group: 'Finance'  },
  { key: 'low_stock',        label: 'Low stock alert',         group: 'Inventory'},
  { key: 'po_status',        label: 'Purchase order update',   group: 'Inventory'},
  { key: 'return_status',    label: 'Return order update',     group: 'Inventory'},
]

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
      <div className="px-6 py-5 border-b border-gray-50 flex items-center gap-3">
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

function FieldRow({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
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
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  size?: 'sm' | 'md'
}) {
  const track = size === 'sm' ? 'h-4 w-8' : 'h-6 w-11'
  const thumb = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const on    = size === 'sm' ? 'translate-x-4' : 'translate-x-6'
  const off   = size === 'sm' ? 'translate-x-1' : 'translate-x-1'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex ${track} items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      } disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed`}
    >
      <span
        className={`inline-block ${thumb} transform rounded-full bg-white shadow transition-transform ${
          checked ? on : off
        }`}
      />
    </button>
  )
}

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

// ── Image Upload Field ────────────────────────────────────────────────────────

function ImageUploadField({
  label,
  hint,
  value,
  uploadType,
  onChange,
  disabled,
  accept = 'image/png,image/jpeg,image/svg+xml,image/x-icon,image/webp',
  previewClass = 'h-14 max-w-[180px]',
}: {
  label: string
  hint: string
  value: string
  uploadType: 'logo' | 'favicon'
  onChange: (url: string) => void
  disabled?: boolean
  accept?: string
  previewClass?: string
}) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [urlMode, setUrlMode] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('type', uploadType)
      const res = await apiClient.post(SETTINGS.UPLOAD, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url: string = res.data?.url ?? res.data?.data?.url ?? ''
      if (url) {
        onChange(url)
        toast.success(`${label} uploaded`)
      }
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Upload failed — please try again')
    } finally {
      setUploading(false)
    }
  }, [uploadType, label, onChange])

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void upload(file)
    if (inputRef.current) inputRef.current.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (disabled || uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) void upload(file)
  }

  function applyUrl() {
    const trimmed = urlInput.trim()
    if (trimmed) {
      onChange(trimmed)
      setUrlMode(false)
      setUrlInput('')
    }
  }

  return (
    <div className="space-y-3">
      {value ? (
        /* ── Image preview card ── */
        <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex-1 min-w-0">
            <img
              src={value}
              alt={label}
              className={`${previewClass} object-contain rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm`}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
          {!disabled && (
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-60 transition"
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                {uploading ? 'Uploading…' : 'Replace'}
              </button>
              <button
                type="button"
                onClick={() => { setUrlMode(v => !v); setUrlInput(value) }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
              >
                <Link2 size={12} />
                Use URL
              </button>
              <button
                type="button"
                onClick={() => { onChange(''); setUrlMode(false) }}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition"
              >
                <X size={12} />
                Remove
              </button>
            </div>
          )}
        </div>
      ) : (
        /* ── Dropzone ── */
        <div
          onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 transition-all ${
            disabled
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
              : uploading
              ? 'border-indigo-300 bg-indigo-50 cursor-wait'
              : dragging
              ? 'border-indigo-500 bg-indigo-50 cursor-copy shadow-inner'
              : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 size={28} className="animate-spin text-indigo-400" />
              <p className="text-sm font-medium text-indigo-600">Uploading…</p>
            </>
          ) : (
            <>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragging ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                <UploadCloud size={22} className={dragging ? 'text-indigo-600' : 'text-gray-400'} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">
                  {dragging ? 'Drop to upload' : 'Click to browse or drag & drop'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* URL paste toggle (only when no image is set and not uploading) */}
      {!disabled && !value && !uploading && (
        <button
          type="button"
          onClick={() => setUrlMode(v => !v)}
          className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 font-medium transition"
        >
          <Link2 size={11} />
          {urlMode ? 'Hide URL field' : 'Or paste a URL instead'}
        </button>
      )}

      {/* URL input row */}
      {urlMode && !disabled && (
        <div className="flex gap-2">
          <input
            type="url"
            autoComplete="off"
            data-1p-ignore="true"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && applyUrl()}
            placeholder={`https://example.com/${uploadType === 'logo' ? 'logo.png' : 'favicon.ico'}`}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          <button
            type="button"
            onClick={applyUrl}
            disabled={!urlInput.trim()}
            className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => { setUrlMode(false); setUrlInput('') }}
            className="px-2 py-2 text-gray-400 hover:text-gray-600 transition"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={onFileChange}
        className="sr-only"
        tabIndex={-1}
        autoComplete="off"
      />
    </div>
  )
}

// ── Save bar ──────────────────────────────────────────────────────────────────

function SaveBar({ onSave, isPending }: { onSave: () => void; isPending: boolean }) {
  return (
    <div className="flex justify-end pt-2">
      <button
        onClick={onSave}
        disabled={isPending}
        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Save Changes
      </button>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const managerView = isManager(user)
  const queryClient = useQueryClient()
  const setTenant = useTenantStore((s) => s.setTenant)
  const tenantSubdomain = useTenantStore((s) => s.subdomain)
  const tenantVatRate = useTenantStore((s) => s.vatRate)
  const tenantActiveModules = useTenantStore((s) => s.activeModules)
  const tenantPlan = useTenantStore((s) => s.plan)

  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const t = searchParams.get('tab')
    if (t && ['workspace','tax','security','display','notifications'].includes(t))
      return t as SettingsTab
    return 'workspace'
  })

  // Server state
  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['tenant-settings'],
    queryFn: () => apiClient.get(SETTINGS.LIST).then(r => r.data.data ?? r.data),
  })

  // Workspace fields
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('')
  const [logo, setLogo] = useState('')
  const [favicon, setFavicon] = useState('')

  // Tax & Finance fields
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
      setLogo(settings.logo ?? '')
      setFavicon(settings.favicon ?? '')
    }
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(SETTINGS.LIST, {
        name,
        currency,
        vat_enabled: vatEnabled,
        vat_rate: vatRate,
        coin_to_money_rate: coinRate,
        logo: logo || '',
        favicon: favicon || '',
      }),
    onSuccess: () => {
      toast.success('Settings saved')
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] })
      if (tenantSubdomain) {
        setTenant({
          subdomain: tenantSubdomain,
          name,
          logo: logo || null,
          favicon: favicon || null,
          vat_enabled: vatEnabled,
          vat_rate: parseFloat(vatRate) || tenantVatRate,
          active_modules: tenantActiveModules,
          plan: tenantPlan,
        })
      }
    },
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

  // Refresh user from server whenever Security tab is opened so that
  // is_2fa_enabled reflects the real DB state, not stale localStorage.
  useEffect(() => {
    if (activeTab === 'security') {
      refresh2FAUser()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Notification preferences ──────────────────────────────────────────────
  interface NotifPrefs {
    id?: number
    email_enabled: boolean
    push_enabled: boolean
    type_overrides: Record<string, { email?: boolean; push?: boolean }>
  }
  const [notifExpanded, setNotifExpanded] = useState<string | null>(null)

  const { data: notifPrefs, isLoading: notifLoading } = useQuery<NotifPrefs>({
    queryKey: ['notif-prefs'],
    queryFn: () => apiClient.get(NOTIFICATIONS.PREFERENCES).then(r => r.data.data ?? r.data),
    enabled: activeTab === 'notifications',
  })

  const notifPrefsMutation = useMutation({
    mutationFn: (payload: Partial<NotifPrefs>) =>
      apiClient.put(NOTIFICATIONS.PREFERENCES, payload).then(r => r.data.data ?? r.data),
    // Optimistic update — toggle reflects instantly without waiting for the server
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['notif-prefs'] })
      const previous = qc.getQueryData<NotifPrefs>(['notif-prefs'])
      qc.setQueryData<NotifPrefs>(['notif-prefs'], old =>
        old ? { ...old, ...payload } : old
      )
      return { previous }
    },
    onSuccess: () => {
      toast.success('Notification preferences saved.')
    },
    onError: (_err, _payload, context) => {
      // Roll back to the value before the optimistic update
      qc.setQueryData(['notif-prefs'], context?.previous)
      toast.error('Could not save preferences.')
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notif-prefs'] })
    },
  })

  function toggleGlobal(channel: 'email_enabled' | 'push_enabled') {
    const current = qc.getQueryData<NotifPrefs>(['notif-prefs'])
    if (!current) return
    notifPrefsMutation.mutate({ [channel]: !current[channel] })
  }

  function toggleTypeOverride(key: string, channel: 'email' | 'push', current: boolean) {
    const prefs = qc.getQueryData<NotifPrefs>(['notif-prefs'])
    if (!prefs) return
    const overrides = { ...prefs.type_overrides }
    overrides[key] = { ...(overrides[key] ?? {}), [channel]: !current }
    notifPrefsMutation.mutate({ type_overrides: overrides })
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

  // ── Date preferences ──────────────────────────────────────────────────────
  const { dateMode, setDateMode, compactDates, setCompactDates } = usePreferenceStore()
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
      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <Settings size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-400 mt-0.5">Manage workspace configuration and your display preferences</p>
          </div>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6">
          <nav className="flex gap-1" role="tablist">
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Read-only banner */}
        {!managerView && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700 mb-6">
            <ShieldCheck size={16} className="shrink-0" />
            You have read-only access to workspace settings. Only admins and managers can make changes.
          </div>
        )}

        {/* ═══════════════ WORKSPACE TAB ═══════════════ */}
        {activeTab === 'workspace' && (
          <div className="space-y-6">

            {/* General */}
            <SectionCard icon={Building2} title="General" subtitle="Workspace identity and basic configuration">
              <FieldRow label="Workspace Name" hint="Displayed in the app header and emails">
                <input
                  type="text"
                  autoComplete="off"
                  data-1p-ignore="true"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  disabled={!managerView}
                  className={inputCls(!managerView)}
                />
              </FieldRow>

              <FieldRow label="Slug" hint="Used in the subdomain URL — cannot be changed">
                <input
                  type="text"
                  autoComplete="off"
                  value={settings.slug}
                  disabled
                  className={inputCls(true)}
                />
              </FieldRow>

              <FieldRow label="Currency" hint="e.g. NPR, USD — shown on invoices and payslips">
                <input
                  type="text"
                  autoComplete="off"
                  data-1p-ignore="true"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  disabled={!managerView}
                  placeholder="e.g. NPR"
                  maxLength={10}
                  className={inputCls(!managerView)}
                />
              </FieldRow>
            </SectionCard>

            {/* Branding */}
            <SectionCard icon={Palette} title="Branding" subtitle="Logo and favicon shown in the app sidebar and browser tab">
              <div className="space-y-6">
                {/* Logo */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Image size={14} className="text-gray-500" />
                    <p className="text-sm font-semibold text-gray-700">Company Logo</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">PNG, JPG, SVG or WebP · Recommended: 200×60 px, transparent background · Max 2 MB</p>
                  <ImageUploadField
                    label="Logo"
                    hint="PNG, JPG, SVG or WebP · max 2 MB"
                    value={logo}
                    uploadType="logo"
                    onChange={setLogo}
                    disabled={!managerView}
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    previewClass="h-14 max-w-[220px]"
                  />
                </div>

                <div className="border-t border-gray-100" />

                {/* Favicon */}
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Globe size={14} className="text-gray-500" />
                    <p className="text-sm font-semibold text-gray-700">Browser Favicon</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">ICO or PNG · 32×32 px recommended · Max 2 MB</p>
                  <ImageUploadField
                    label="Favicon"
                    hint="ICO or PNG · 32×32 px recommended · max 2 MB"
                    value={favicon}
                    uploadType="favicon"
                    onChange={setFavicon}
                    disabled={!managerView}
                    accept="image/x-icon,image/vnd.microsoft.icon,image/png,image/webp"
                    previewClass="h-10 w-10"
                  />
                </div>
              </div>
            </SectionCard>

            {managerView && <SaveBar onSave={() => saveMutation.mutate()} isPending={saveMutation.isPending} />}
          </div>
        )}

        {/* ═══════════════ TAX & FINANCE TAB ═══════════════ */}
        {activeTab === 'tax' && (
          <div className="space-y-6">

            {/* VAT */}
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
                  autoComplete="off"
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

            {/* Coins */}
            <SectionCard icon={Coins} title="Coin System" subtitle="Staff reward coins earned by closing tickets">
              <FieldRow
                label="Coin → Money Rate"
                hint="How much one coin is worth when paid out in a payslip"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 shrink-0">1 coin =</span>
                  <input
                    type="number"
                    autoComplete="off"
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

            {managerView && <SaveBar onSave={() => saveMutation.mutate()} isPending={saveMutation.isPending} />}
          </div>
        )}

        {/* ═══════════════ SECURITY TAB ═══════════════ */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <SectionCard
              icon={ShieldCheck}
              title="Two-Factor Authentication"
              subtitle="Protect your account with a time-based one-time password (TOTP) authenticator app"
            >
              {/* Backup codes revealed once after setup / regen */}
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

              {/* Not enabled, no setup */}
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

              {/* Setup flow */}
              {!user?.is_2fa_enabled && twoFASetup && !backupCodes && (
                <>
                  <FieldRow label="Status" hint="Complete setup by scanning the QR code below">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Setup in progress
                    </span>
                  </FieldRow>

                  <div className="flex gap-6 items-start">
                    <div className="shrink-0 rounded-xl border border-gray-200 overflow-hidden bg-white p-2">
                      <QRCodeSVG
                        value={twoFASetup.provisioning_uri}
                        size={168}
                        level="M"
                        includeMargin={false}
                      />
                    </div>
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
                          autoComplete="one-time-code"
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

              {/* Enabled — management controls */}
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

                  {showRegen && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-indigo-800">Regenerate backup codes</p>
                      <p className="text-xs text-indigo-700">Enter your current authenticator code to generate 8 new backup codes. Your old codes will be invalidated immediately.</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
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

                  {showDisable && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-red-800">Disable two-factor authentication</p>
                      <p className="text-xs text-red-700">This will remove 2FA from your account. You'll need both your current authenticator code and your password.</p>
                      <div className="space-y-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={disableCode}
                          onChange={e => setDisableCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="6-digit authenticator code"
                          className="w-full border border-red-300 bg-white rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-red-400"
                        />
                        <input
                          type="password"
                          autoComplete="current-password"
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
          </div>
        )}

        {/* ═══════════════ NOTIFICATIONS TAB ═══════════════ */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <SectionCard
              icon={Bell}
              title="Notification Channels"
              subtitle="Choose how you receive notifications across the platform"
            >
              {notifLoading ? (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <>
                  {/* Global channel toggles */}
                  <div className="space-y-4">
                    <FieldRow
                      label={<span className="flex items-center gap-2"><Mail size={14} className="text-gray-400" /> Email notifications</span>}
                      hint="Receive notifications via email for key events"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${notifPrefs?.email_enabled ? 'text-indigo-700 font-medium' : 'text-gray-400'}`}>
                          {notifPrefs?.email_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Toggle
                          checked={notifPrefs?.email_enabled ?? true}
                          onChange={() => toggleGlobal('email_enabled')}
                        />
                      </div>
                    </FieldRow>

                    <FieldRow
                      label={<span className="flex items-center gap-2"><Smartphone size={14} className="text-gray-400" /> Push notifications</span>}
                      hint="Receive push notifications on mobile and web when logged in"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${notifPrefs?.push_enabled ? 'text-indigo-700 font-medium' : 'text-gray-400'}`}>
                          {notifPrefs?.push_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        <Toggle
                          checked={notifPrefs?.push_enabled ?? true}
                          onChange={() => toggleGlobal('push_enabled')}
                        />
                      </div>
                    </FieldRow>
                  </div>

                  {/* Per-type overrides */}
                  <div className="mt-6">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Per-event overrides</p>
                    <p className="text-xs text-gray-400 mb-4">Customise email and push settings per notification type. Overrides apply on top of global settings above.</p>

                    {Array.from(new Set(NOTIF_TYPES.map(t => t.group))).map(group => (
                      <div key={group} className="mb-2 border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => setNotifExpanded(v => v === group ? null : group)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700 transition"
                        >
                          {group}
                          {notifExpanded === group ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {notifExpanded === group && (
                          <div className="divide-y divide-gray-100">
                            <div className="grid grid-cols-3 px-4 py-2 text-xs font-medium text-gray-400 bg-white">
                              <span>Event</span><span className="text-center">Email</span><span className="text-center">Push</span>
                            </div>
                            {NOTIF_TYPES.filter(t => t.group === group).map(t => {
                              const override = notifPrefs?.type_overrides?.[t.key] ?? {}
                              const emailOn = override.email ?? notifPrefs?.email_enabled ?? true
                              const pushOn  = override.push  ?? notifPrefs?.push_enabled  ?? true
                              return (
                                <div key={t.key} className="grid grid-cols-3 items-center px-4 py-2.5 bg-white hover:bg-gray-50">
                                  <span className="text-sm text-gray-700">{t.label}</span>
                                  <div className="flex justify-center">
                                    <Toggle
                                      checked={emailOn}
                                      onChange={() => toggleTypeOverride(t.key, 'email', emailOn)}
                                      size="sm"
                                    />
                                  </div>
                                  <div className="flex justify-center">
                                    <Toggle
                                      checked={pushOn}
                                      onChange={() => toggleTypeOverride(t.key, 'push', pushOn)}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                    <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                      In-app notifications (the bell icon) are always delivered and cannot be disabled.
                      Email and push apply per your preferences above.
                    </p>
                  </div>
                </>
              )}
            </SectionCard>
          </div>
        )}

        {/* ═══════════════ DISPLAY TAB ═══════════════ */}
        {activeTab === 'display' && (
          <div className="space-y-6">
            <SectionCard
              icon={Calendar}
              title="Date & Calendar"
              subtitle="Your personal date display preference — saved on this device only"
            >
              <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
                <Info size={14} className="text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  These preferences control how dates appear <strong>for you</strong> across the entire system.
                  They are stored on this device and are not shared with other users.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-gray-700 mb-3">Primary Calendar</p>
                <div className="flex gap-3">
                  <DateModeCard
                    mode="bs"
                    selected={dateMode === 'bs'}
                    onSelect={setDateMode}
                    title="Bikram Sambat (BS)"
                    subtitle="Nepali calendar — primary display"
                    example={{ primary: bsStr, secondary: `AD: ${adStr}` }}
                  />
                  <DateModeCard
                    mode="ad"
                    selected={dateMode === 'ad'}
                    onSelect={setDateMode}
                    title="Anno Domini (AD)"
                    subtitle="Gregorian / English calendar — primary display"
                    example={{ primary: adStr, secondary: `BS: ${bsStr}` }}
                  />
                </div>
              </div>

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

              {/* Live preview */}
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
        )}

      </div>
    </div>
  )
}
