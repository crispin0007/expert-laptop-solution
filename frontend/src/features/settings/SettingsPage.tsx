import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { SETTINGS } from '../../api/endpoints'
import toast from 'react-hot-toast'
import { Loader2, Save, Settings } from 'lucide-react'
import { useAuthStore, isManager } from '../../store/authStore'

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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const managerView = isManager(user)

  const { data: settings, isLoading } = useQuery<TenantSettings>({
    queryKey: ['tenant-settings'],
    queryFn: () => apiClient.get(SETTINGS).then(r => r.data.data ?? r.data),
  })

  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('')
  const [vatEnabled, setVatEnabled] = useState(false)
  const [vatRate, setVatRate] = useState('')
  const [coinRate, setCoinRate] = useState('')

  // Populate form once data arrives
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
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Settings size={22} className="text-indigo-500" />
        <h1 className="text-2xl font-bold text-gray-800">Tenant Settings</h1>
      </div>

      {!managerView && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          You have read-only access. Only managers can edit settings.
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        {/* General */}
        <div className="px-6 py-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">General</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Workspace Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={!managerView}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Slug (read-only)</label>
            <input
              type="text"
              value={settings.slug}
              disabled
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
            <input
              type="text"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              disabled={!managerView}
              placeholder="e.g. NPR"
              maxLength={10}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        {/* VAT */}
        <div className="px-6 py-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">VAT / Tax</h2>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">VAT Enabled</p>
              <p className="text-xs text-gray-400">Apply VAT to all invoices</p>
            </div>
            <button
              type="button"
              onClick={() => managerView && setVatEnabled(v => !v)}
              disabled={!managerView}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                vatEnabled ? 'bg-indigo-600' : 'bg-gray-300'
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  vatEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              VAT Rate (%) {!vatEnabled && <span className="text-gray-400">(disabled)</span>}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={vatRate}
              onChange={e => setVatRate(e.target.value)}
              disabled={!managerView || !vatEnabled}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        {/* Coin System */}
        <div className="px-6 py-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Coin System</h2>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Coin → Money Rate
            </label>
            <p className="text-xs text-gray-400 mb-2">
              How much currency one coin is worth when included in a payslip.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">1 coin =</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={coinRate}
                onChange={e => setCoinRate(e.target.value)}
                disabled={!managerView}
                placeholder="e.g. 10.00"
                className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
              <span className="text-sm text-gray-400">{currency || 'currency units'}</span>
            </div>
          </div>
        </div>
      </div>

      {managerView && (
        <div className="mt-5 flex justify-end">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {saveMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <Save size={14} />
            }
            Save Settings
          </button>
        </div>
      )}
    </div>
  )
}
