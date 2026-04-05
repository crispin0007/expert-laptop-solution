import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import apiClient from '../../api/client'
import { SETTINGS, AUTH, NOTIFICATIONS, ACCOUNTING } from '../../api/endpoints'
import toast from 'react-hot-toast'
import { QRCodeSVG } from 'qrcode.react'
import {
  Loader2, Save, Settings, Building2, Percent, Coins,
  Calendar, Monitor, Check, Globe, ShieldCheck, Info,
  UploadCloud, X, Image, Link2, Palette, Server,
  Bell, Mail, Smartphone, ChevronDown, ChevronUp, FlaskConical,
} from 'lucide-react'
import { useAuthStore, type User } from '../../store/authStore'
import { usePermissions } from '../../hooks/usePermissions'
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

type SettingsTab = 'workspace' | 'tax' | 'security' | 'display' | 'notifications' | 'email'

const TABS: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'workspace',     label: 'Workspace',     icon: Building2   },
  { id: 'tax',          label: 'Tax & Finance',  icon: Percent     },
  { id: 'security',     label: 'Security',       icon: ShieldCheck },
  { id: 'display',      label: 'Display',        icon: Monitor     },
  { id: 'notifications',label: 'Notifications',  icon: Bell        },
  { id: 'email',        label: 'Email',          icon: Mail        },
]

interface SmtpConfig {
  id?: number
  host: string
  port: number
  username: string
  use_tls: boolean
  use_ssl: boolean
  from_email: string
  from_name: string
  is_active: boolean
  has_password: boolean
  created_at?: string
  updated_at?: string
}

interface FiscalYearStatus {
  fiscal_years: Array<{
    fy_year: number
    label: string
    is_closed: boolean
  }>
}

interface FiscalYearClosePreview {
  fy_year: number
  label: string
  date_from: string
  date_to: string
  gross_revenue: string | number
  total_direct_cost: string | number
  total_indirect_exp: string | number
  total_indirect_inc: string | number
  net_profit: string | number
  income_accounts: number
  expense_accounts: number
}

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
  const { can } = usePermissions()
  const managerView = can('can_manage_settings')
  const queryClient = useQueryClient()
  const setTenant = useTenantStore((s) => s.setTenant)
  const tenantSubdomain = useTenantStore((s) => s.subdomain)
  const tenantVatRate = useTenantStore((s) => s.vatRate)
  const tenantActiveModules = useTenantStore((s) => s.activeModules)
  const tenantPlan = useTenantStore((s) => s.plan)

  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const t = searchParams.get('tab')
    if (t && ['workspace','tax','security','display','notifications','email'].includes(t))
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
  const [selectedFyYear, setSelectedFyYear] = useState<number | null>(null)
  const [fyCloseNotes, setFyCloseNotes] = useState('')
  const [showFyCloseModal, setShowFyCloseModal] = useState(false)

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

  const { data: fiscalYearStatus, isLoading: fiscalYearLoading } = useQuery<FiscalYearStatus>({
    queryKey: ['accounting-fiscal-year-status'],
    queryFn: () => apiClient.get(ACCOUNTING.REPORT_FISCAL_YEAR_STATUS).then(r => r.data.data ?? r.data),
    enabled: activeTab === 'tax',
  })

  const closeFiscalYearMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFyYear) throw new Error('Please select a fiscal year to close.')
      return apiClient.post(ACCOUNTING.REPORT_CLOSE_FISCAL_YEAR, {
        fy_year: selectedFyYear,
        notes: fyCloseNotes.trim(),
      }).then(r => r.data.data ?? r.data)
    },
    onSuccess: () => {
      toast.success('Fiscal year closed successfully.')
      setFyCloseNotes('')
      setShowFyCloseModal(false)
      queryClient.invalidateQueries({ queryKey: ['accounting-fiscal-year-status'] })
      queryClient.invalidateQueries({ queryKey: ['report-data'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { errors?: string[]; detail?: string; message?: string } } })?.response?.data
      const message = detail?.errors?.[0] ?? detail?.detail ?? detail?.message ?? 'Failed to close fiscal year.'
      toast.error(message)
    },
  })

  useEffect(() => {
    if (!fiscalYearStatus?.fiscal_years?.length) return
    const firstOpen = fiscalYearStatus.fiscal_years.find(y => !y.is_closed)
    setSelectedFyYear(prev => prev ?? firstOpen?.fy_year ?? null)
  }, [fiscalYearStatus])

  const { data: fyClosePreview, isLoading: fyClosePreviewLoading } = useQuery<FiscalYearClosePreview>({
    queryKey: ['fy-close-preview', selectedFyYear],
    queryFn: async () => {
      if (!selectedFyYear) throw new Error('Fiscal year is required')
      const fy = {
        bsYear: selectedFyYear,
        label: `${selectedFyYear}/${String(selectedFyYear + 1).slice(-3)}`,
        labelFull: `${selectedFyYear}/${selectedFyYear + 1}`,
      }
      const params = fiscalYearAdParams(fy)
      const plRes = await apiClient.get(ACCOUNTING.REPORT_PL, { params })
      const pl = plRes.data?.data ?? plRes.data
      return {
        fy_year: selectedFyYear,
        label: fy.label,
        date_from: params.date_from,
        date_to: params.date_to,
        gross_revenue: pl?.gross_revenue ?? 0,
        total_direct_cost: pl?.total_direct_cost ?? 0,
        total_indirect_exp: pl?.total_indirect_exp ?? 0,
        total_indirect_inc: pl?.total_indirect_inc ?? 0,
        net_profit: pl?.net_profit ?? 0,
        income_accounts:
          (Array.isArray(pl?.sales) ? pl.sales.length : 0) +
          (Array.isArray(pl?.direct_income) ? pl.direct_income.length : 0) +
          (Array.isArray(pl?.indirect_income) ? pl.indirect_income.length : 0),
        expense_accounts:
          (Array.isArray(pl?.purchases) ? pl.purchases.length : 0) +
          (Array.isArray(pl?.direct_expenses) ? pl.direct_expenses.length : 0) +
          (Array.isArray(pl?.indirect_expenses) ? pl.indirect_expenses.length : 0),
      }
    },
    enabled: showFyCloseModal && !!selectedFyYear,
  })

  const fyNetProfitValue = Number(fyClosePreview?.net_profit ?? 0)
  const canConfirmClose = !fyClosePreviewLoading && !closeFiscalYearMutation.isPending && !!selectedFyYear && fyNetProfitValue !== 0

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
      await queryClient.cancelQueries({ queryKey: ['notif-prefs'] })
      const previous = queryClient.getQueryData<NotifPrefs>(['notif-prefs'])
      queryClient.setQueryData<NotifPrefs>(['notif-prefs'], old =>
        old ? { ...old, ...payload } : old
      )
      return { previous }
    },
    onSuccess: () => {
      toast.success('Notification preferences saved.')
    },
    onError: (_err, _payload, context) => {
      // Roll back to the value before the optimistic update
      queryClient.setQueryData(['notif-prefs'], context?.previous)
      toast.error('Could not save preferences.')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['notif-prefs'] })
    },
  })

  function toggleGlobal(channel: 'email_enabled' | 'push_enabled') {
    const current = queryClient.getQueryData<NotifPrefs>(['notif-prefs'])
    if (!current) return
    notifPrefsMutation.mutate({ [channel]: !current[channel] })
  }

  function toggleTypeOverride(key: string, channel: 'email' | 'push', current: boolean) {
    const prefs = queryClient.getQueryData<NotifPrefs>(['notif-prefs'])
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

  // ── SMTP settings ─────────────────────────────────────────────────────────
  const [smtpForm, setSmtpForm] = useState<Omit<SmtpConfig, 'id' | 'has_password' | 'created_at' | 'updated_at'>>({
    host: '', port: 587, username: '', use_tls: true, use_ssl: false,
    from_email: '', from_name: '', is_active: true,
  })
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpTestRecipient, setSmtpTestRecipient] = useState('')
  const [smtpTestResult, setSmtpTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const { data: smtpData, isLoading: smtpLoading } = useQuery<{ configured: boolean; data: SmtpConfig | null }>({
    queryKey: ['smtp-config'],
    queryFn: () => apiClient.get(SETTINGS.SMTP).then(r => r.data),
    enabled: activeTab === 'email',
  })

  useEffect(() => {
    if (smtpData?.data) {
      const d = smtpData.data
      setSmtpForm({
        host: d.host, port: d.port, username: d.username,
        use_tls: d.use_tls, use_ssl: d.use_ssl,
        from_email: d.from_email, from_name: d.from_name, is_active: d.is_active,
      })
    }
  }, [smtpData])

  const smtpSaveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = { ...smtpForm }
      if (smtpPassword) payload['password'] = smtpPassword
      return apiClient.put(SETTINGS.SMTP, payload).then(r => r.data)
    },
    onSuccess: () => {
      toast.success('SMTP settings saved')
      setSmtpPassword('')
      queryClient.invalidateQueries({ queryKey: ['smtp-config'] })
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(detail ?? 'Failed to save SMTP settings')
    },
  })

  const smtpDeleteMutation = useMutation({
    mutationFn: () => apiClient.delete(SETTINGS.SMTP),
    onSuccess: () => {
      toast.success('SMTP config removed — using global settings')
      setSmtpForm({ host: '', port: 587, username: '', use_tls: true, use_ssl: false, from_email: '', from_name: '', is_active: true })
      setSmtpPassword('')
      queryClient.invalidateQueries({ queryKey: ['smtp-config'] })
    },
    onError: () => toast.error('Failed to remove SMTP config'),
  })

  const smtpTestMutation = useMutation({
    mutationFn: () => apiClient.post(SETTINGS.SMTP_TEST, { recipient: smtpTestRecipient || undefined }).then(r => r.data),
    onSuccess: (data: { success: boolean; sent_to?: string; error?: string }) => {
      if (data.success) {
        setSmtpTestResult({ success: true, message: `Test email sent to ${data.sent_to}` })
        toast.success(`Test email sent to ${data.sent_to}`)
      } else {
        setSmtpTestResult({ success: false, message: data.error ?? 'Test failed' })
        toast.error(data.error ?? 'Test email failed')
      }
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data
      const msg = detail?.error ?? detail?.detail ?? 'Could not send test email'
      setSmtpTestResult({ success: false, message: msg })
      toast.error(msg)
    },
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

            <SectionCard icon={Calendar} title="Fiscal Year Closing" subtitle="Close fiscal periods by transferring net P&L to retained earnings and locking posting">
              {fiscalYearLoading ? (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <>
                  <FieldRow label="Fiscal Year" hint="Only open fiscal years can be closed">
                    <select
                      value={selectedFyYear ?? ''}
                      onChange={e => setSelectedFyYear(e.target.value ? Number(e.target.value) : null)}
                      disabled={!managerView || closeFiscalYearMutation.isPending}
                      className={inputCls(!managerView || closeFiscalYearMutation.isPending)}
                    >
                      <option value="">— Select fiscal year —</option>
                      {(fiscalYearStatus?.fiscal_years ?? []).map((fy) => (
                        <option key={fy.fy_year} value={fy.fy_year} disabled={fy.is_closed}>
                          {fy.label} {fy.is_closed ? '(Closed)' : '(Open)'}
                        </option>
                      ))}
                    </select>
                  </FieldRow>

                  <FieldRow label="Close Notes" hint="Optional close memo for audit trail">
                    <textarea
                      value={fyCloseNotes}
                      onChange={e => setFyCloseNotes(e.target.value)}
                      disabled={!managerView || closeFiscalYearMutation.isPending}
                      rows={3}
                      className={inputCls(!managerView || closeFiscalYearMutation.isPending)}
                      placeholder="Year-end closure notes (optional)"
                    />
                  </FieldRow>

                  <FieldRow label="Action" hint="This will lock journal posting inside the selected fiscal year">
                    <button
                      type="button"
                      onClick={() => {
                        if (!selectedFyYear) {
                          toast.error('Select a fiscal year first.')
                          return
                        }
                        const target = (fiscalYearStatus?.fiscal_years ?? []).find(f => f.fy_year === selectedFyYear)
                        if (target?.is_closed) {
                          toast.error('Selected fiscal year is already closed.')
                          return
                        }
                        setShowFyCloseModal(true)
                      }}
                      disabled={!managerView || !selectedFyYear || closeFiscalYearMutation.isPending}
                      className="px-4 py-2 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-60 transition"
                    >
                      {closeFiscalYearMutation.isPending ? 'Closing…' : 'Close Fiscal Year'}
                    </button>
                  </FieldRow>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Fiscal Year Status</p>
                    <div className="space-y-2">
                      {(fiscalYearStatus?.fiscal_years ?? []).map((fy) => (
                        <div key={fy.fy_year} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700">{fy.label}</span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${fy.is_closed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {fy.is_closed ? 'Closed' : 'Open'}
                          </span>
                        </div>
                      ))}
                      {!(fiscalYearStatus?.fiscal_years ?? []).length && (
                        <p className="text-xs text-gray-400">No fiscal year records available.</p>
                      )}
                    </div>
                  </div>
                </>
              )}
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

        {/* ═══════════════ EMAIL TAB ═══════════════ */}
        {activeTab === 'email' && (
          <div className="space-y-6">

            {/* Info banner */}
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
              <Info size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-0.5">Custom outbound email (per-tenant SMTP)</p>
                <p className="text-xs text-blue-600 leading-relaxed">
                  Configure your own SMTP server so all system emails — ticket notifications, invoices,
                  staff invites — are delivered from your domain. Leave unconfigured to use the platform default.
                </p>
              </div>
            </div>

            {smtpLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : (
              <>
                {/* SMTP Server */}
                <SectionCard icon={Server} title="SMTP Server" subtitle="Outbound mail server credentials">
                  <FieldRow label="Active" hint="Disable to fall back to platform defaults without deleting config">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${smtpForm.is_active ? 'text-indigo-700' : 'text-gray-400'}`}>
                        {smtpForm.is_active ? 'Custom SMTP active' : 'Using platform defaults'}
                      </span>
                      <Toggle
                        checked={smtpForm.is_active}
                        onChange={v => setSmtpForm(f => ({ ...f, is_active: v }))}
                        disabled={!managerView}
                      />
                    </div>
                  </FieldRow>

                  <FieldRow label="Hostname" hint="e.g. smtp.gmail.com, smtp.mailgun.org">
                    <input
                      type="text"
                      autoComplete="off"
                     
                      value={smtpForm.host}
                      onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))}
                      disabled={!managerView}
                      placeholder="smtp.example.com"
                      className={inputCls(!managerView)}
                    />
                  </FieldRow>

                  <FieldRow label="Port" hint="587 (TLS), 465 (SSL), or 25 (plain)">
                    <input
                      type="number"
                      autoComplete="off"
                      min={1}
                      max={65535}
                      value={smtpForm.port}
                      onChange={e => setSmtpForm(f => ({ ...f, port: Number(e.target.value) }))}
                      disabled={!managerView}
                      className={`w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
                        !managerView ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed' : 'border-gray-300 bg-white text-gray-800'
                      }`}
                    />
                  </FieldRow>

                  <FieldRow label="Encryption">
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpForm.use_tls}
                          onChange={e => setSmtpForm(f => ({ ...f, use_tls: e.target.checked, use_ssl: e.target.checked ? false : f.use_ssl }))}
                          disabled={!managerView}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">STARTTLS (port 587)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smtpForm.use_ssl}
                          onChange={e => setSmtpForm(f => ({ ...f, use_ssl: e.target.checked, use_tls: e.target.checked ? false : f.use_tls }))}
                          disabled={!managerView}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">SSL/TLS (port 465)</span>
                      </label>
                    </div>
                  </FieldRow>

                  <FieldRow label="Username" hint="Usually your email address">
                    <input
                      type="text"
                      autoComplete="off"
                     
                      value={smtpForm.username}
                      onChange={e => setSmtpForm(f => ({ ...f, username: e.target.value }))}
                      disabled={!managerView}
                      placeholder="you@example.com"
                      className={inputCls(!managerView)}
                    />
                  </FieldRow>

                  <FieldRow
                    label="Password"
                    hint={smtpData?.data?.has_password ? 'A password is saved — leave blank to keep it' : 'Enter SMTP password'}
                  >
                    <div className="relative">
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={smtpPassword}
                        onChange={e => setSmtpPassword(e.target.value)}
                        disabled={!managerView}
                        placeholder={smtpData?.data?.has_password ? '••••••••' : 'Enter password'}
                        className={inputCls(!managerView)}
                      />
                      {smtpData?.data?.has_password && !smtpPassword && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-green-600 font-medium">Saved</span>
                      )}
                    </div>
                  </FieldRow>
                </SectionCard>

                {/* Sender Identity */}
                <SectionCard icon={Mail} title="Sender Identity" subtitle="From address shown on all outgoing emails">
                  <FieldRow label="From Email" hint="e.g. support@yourcompany.com">
                    <input
                      type="email"
                      autoComplete="off"
                     
                      value={smtpForm.from_email}
                      onChange={e => setSmtpForm(f => ({ ...f, from_email: e.target.value }))}
                      disabled={!managerView}
                      placeholder="support@yourcompany.com"
                      className={inputCls(!managerView)}
                    />
                  </FieldRow>

                  <FieldRow label="From Name" hint="e.g. ACME Support — shown as the sender name">
                    <input
                      type="text"
                      autoComplete="off"
                     
                      value={smtpForm.from_name}
                      onChange={e => setSmtpForm(f => ({ ...f, from_name: e.target.value }))}
                      disabled={!managerView}
                      placeholder="Your Company Name"
                      className={inputCls(!managerView)}
                    />
                  </FieldRow>

                  {smtpForm.from_email && (
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-xs text-gray-400 mb-0.5">Preview</p>
                      <p className="text-sm font-mono text-gray-700">
                        {smtpForm.from_name ? `${smtpForm.from_name} <${smtpForm.from_email}>` : smtpForm.from_email}
                      </p>
                    </div>
                  )}
                </SectionCard>

                {/* Test Connection */}
                {smtpData?.configured && (
                  <SectionCard icon={FlaskConical} title="Test Connection" subtitle="Send a test email to verify your SMTP configuration">
                    <FieldRow label="Test recipient" hint="Defaults to your account email if left blank">
                      <input
                        type="email"
                        autoComplete="off"
                        value={smtpTestRecipient}
                        onChange={e => setSmtpTestRecipient(e.target.value)}
                        placeholder="test@example.com (optional)"
                        className={inputCls(false)}
                      />
                    </FieldRow>

                    {smtpTestResult && (
                      <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm ${
                        smtpTestResult.success
                          ? 'bg-green-50 border-green-200 text-green-700'
                          : 'bg-red-50 border-red-200 text-red-700'
                      }`}>
                        {smtpTestResult.success
                          ? <Check size={14} className="mt-0.5 shrink-0" />
                          : <X size={14} className="mt-0.5 shrink-0" />
                        }
                        {smtpTestResult.message}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        onClick={() => { setSmtpTestResult(null); smtpTestMutation.mutate() }}
                        disabled={smtpTestMutation.isPending}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gray-800 text-white rounded-xl text-sm font-semibold hover:bg-gray-900 disabled:opacity-60 transition"
                      >
                        {smtpTestMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                        {smtpTestMutation.isPending ? 'Sending…' : 'Send test email'}
                      </button>
                    </div>
                  </SectionCard>
                )}

                {managerView && (
                  <div className="flex items-center justify-between pt-2">
                    {smtpData?.configured && (
                      <button
                        onClick={() => { if (confirm('Remove SMTP config and revert to platform defaults?')) smtpDeleteMutation.mutate() }}
                        disabled={smtpDeleteMutation.isPending}
                        className="text-sm text-red-500 hover:text-red-700 font-medium disabled:opacity-60 transition"
                      >
                        {smtpDeleteMutation.isPending ? 'Removing…' : 'Remove SMTP config'}
                      </button>
                    )}
                    <div className="ml-auto">
                      <button
                        onClick={() => smtpSaveMutation.mutate()}
                        disabled={smtpSaveMutation.isPending || !smtpForm.host}
                        className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 transition shadow-sm"
                      >
                        {smtpSaveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save SMTP Settings
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {showFyCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">Verify Fiscal Year Close</h3>
                <p className="text-xs text-gray-500 mt-0.5">Review this summary before locking the fiscal period.</p>
              </div>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
                onClick={() => setShowFyCloseModal(false)}
                disabled={closeFiscalYearMutation.isPending}
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4">
              {fyClosePreviewLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500 mb-1">Fiscal Year</p>
                      <p className="font-semibold text-gray-900">{fyClosePreview?.label ?? '—'}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs text-gray-500 mb-1">AD Date Range</p>
                      <p className="font-semibold text-gray-900">{fyClosePreview?.date_from ?? '—'} to {fyClosePreview?.date_to ?? '—'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="text-xs text-gray-500 mb-1">Gross Revenue</p>
                      <p className="font-semibold text-gray-900">{Number(fyClosePreview?.gross_revenue ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="text-xs text-gray-500 mb-1">Direct Cost</p>
                      <p className="font-semibold text-gray-900">{Number(fyClosePreview?.total_direct_cost ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 p-3">
                      <p className="text-xs text-gray-500 mb-1">Net Profit / Loss</p>
                      <p className={`font-semibold ${Number(fyClosePreview?.net_profit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {Number(fyClosePreview?.net_profit ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    <p className="font-semibold mb-1">Close Impact</p>
                    <p>
                      This action posts a fiscal-year closing journal (P&L to retained earnings) and locks posting inside this FY.
                      Income accounts considered: {fyClosePreview?.income_accounts ?? 0}, expense accounts considered: {fyClosePreview?.expense_accounts ?? 0}.
                    </p>
                  </div>

                  {fyNetProfitValue === 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      This fiscal year currently has zero net P&L, so close is blocked by backend rules.
                      Choose a fiscal year with activity (for your seeded demo, use 2081/082) or post entries first.
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                onClick={() => setShowFyCloseModal(false)}
                disabled={closeFiscalYearMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60"
                onClick={() => closeFiscalYearMutation.mutate()}
                disabled={!canConfirmClose}
              >
                {closeFiscalYearMutation.isPending ? 'Closing…' : 'Confirm Close Fiscal Year'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
