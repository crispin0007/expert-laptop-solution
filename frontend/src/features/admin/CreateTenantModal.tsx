import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'
import { Eye, EyeOff } from 'lucide-react'
import { PLANS } from '../../api/endpoints'

interface Props {
  open: boolean
  onClose: () => void
}

interface FormData {
  name: string
  slug: string
  plan: string   // plan slug used for display; plan_id sent on submit
  currency: string
  vat_enabled: boolean
  vat_rate: string
  coin_to_money_rate: string
  custom_domain: string
  admin_email: string
  admin_full_name: string
  admin_password: string
}

const defaultForm: FormData = {
  name: '',
  slug: '',
  plan: 'free',
  currency: 'NPR',
  vat_enabled: true,
  vat_rate: '0.13',
  coin_to_money_rate: '1.0',
  custom_domain: '',
  admin_email: '',
  admin_full_name: '',
  admin_password: '',
}

/** Auto-generate a URL-safe slug from the tenant name */
function toSlug(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function CreateTenantModal({ open, onClose }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormData>(defaultForm)
  const [showPassword, setShowPassword] = useState(false)
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null)

  // Fetch plans to build slug → id map
  const { data: plansData } = useQuery<{ id: number; name: string; slug: string }[]>({
    queryKey: ['plans'],
    queryFn: () => apiClient.get(PLANS.LIST).then((r) => {
      const d = r.data
      return Array.isArray(d) ? d : d.results ?? []
    }),
  })
  const planSlugToId = Object.fromEntries((plansData ?? []).map((p) => [p.slug, p.id]))

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const mutation = useMutation({
    mutationFn: (payload: object) => apiClient.post('/tenants/', payload),
    onSuccess: (res) => {
      toast.success('Tenant created successfully')
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      if (res.data.admin_password) {
        setCreatedCreds({ email: res.data.admin_email, password: res.data.admin_password })
      } else {
        setForm(defaultForm)
        onClose()
      }
    },
    onError: (err: any) => {
      const detail = err?.response?.data
      const msg = typeof detail === 'object'
        ? Object.values(detail).flat().join(' ')
        : 'Failed to create tenant'
      toast.error(msg)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const planId = planSlugToId[form.plan]
    mutation.mutate({
      name: form.name,
      slug: form.slug || toSlug(form.name),
      ...(planId ? { plan_id: planId } : {}),
      currency: form.currency,
      vat_enabled: form.vat_enabled,
      vat_rate: parseFloat(form.vat_rate),
      coin_to_money_rate: parseFloat(form.coin_to_money_rate),
      custom_domain: form.custom_domain.trim() || null,
      admin_email: form.admin_email || undefined,
      admin_full_name: form.admin_full_name || undefined,
      admin_password: form.admin_password || undefined,
    })
  }

  function handleDone() {
    setCreatedCreds(null)
    setForm(defaultForm)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Create New Tenant" width="max-w-xl">
      {/* Credentials reveal screen */}
      {createdCreds ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="font-semibold text-green-800 mb-3">Tenant created! Share these credentials with the owner:</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-white border border-green-200 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-600">Email</span>
                <span className="text-sm font-mono font-semibold text-gray-900">{createdCreds.email}</span>
              </div>
              <div className="flex items-center justify-between bg-white border border-green-200 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-600">Password</span>
                <span className="text-sm font-mono font-semibold text-gray-900">{createdCreds.password}</span>
              </div>
            </div>
            <p className="text-xs text-green-700 mt-3">⚠ This password will not be shown again. Copy it now.</p>
          </div>
          <div className="flex justify-end">
            <button onClick={handleDone} className="px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company / Tenant Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => {
              set('name', e.target.value)
              set('slug', toSlug(e.target.value))
            }}
            placeholder="Acme Corp"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Subdomain Slug <span className="text-red-500">*</span>
          </label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
            <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 select-none">
              acme.
            </span>
            <input
              type="text"
              required
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="acme-corp"
              className="flex-1 px-3 py-2 text-sm outline-none bg-white"
            />
            <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-l border-gray-300 select-none">
              .techyatra.com
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, and hyphens only.</p>
        </div>

        {/* Custom Domain */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Custom Domain <span className="text-gray-400 font-normal">(optional)</span></label>
          <input
            type="text"
            value={form.custom_domain}
            onChange={(e) => set('custom_domain', e.target.value.toLowerCase().trim())}
            placeholder="bms.els.com"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Tenant must point their DNS A record to this server. Leave blank to use the default subdomain.
          </p>
        </div>

        {/* Plan + Currency */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => set('plan', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {(plansData ?? [{ id: 0, name: 'Free', slug: 'free' }, { id: 0, name: 'Basic', slug: 'basic' }, { id: 0, name: 'Pro', slug: 'pro' }]).map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
            <input
              type="text"
              maxLength={8}
              value={form.currency}
              onChange={(e) => set('currency', e.target.value.toUpperCase())}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* VAT */}
        <div className="rounded-xl border border-gray-200 p-4 space-y-3 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">VAT</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-500">{form.vat_enabled ? 'Enabled' : 'Disabled'}</span>
              <div
                onClick={() => set('vat_enabled', !form.vat_enabled)}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                  form.vat_enabled ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    form.vat_enabled ? 'translate-x-5' : ''
                  }`}
                />
              </div>
            </label>
          </div>
          {form.vat_enabled && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                VAT Rate (e.g. 0.13 = 13%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.vat_rate}
                onChange={(e) => set('vat_rate', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
            </div>
          )}
        </div>

        {/* Coin rate */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Coin → Money Rate
          </label>
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
            <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r border-gray-300 select-none">1 coin =</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.coin_to_money_rate}
              onChange={(e) => set('coin_to_money_rate', e.target.value)}
              className="flex-1 px-3 py-2 text-sm outline-none"
            />
            <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-l border-gray-300 select-none">
              {form.currency}
            </span>
          </div>
        </div>

        {/* Admin / Owner */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 space-y-3">
          <p className="text-sm font-semibold text-indigo-800">Owner / Admin Account <span className="font-normal text-indigo-500">(optional)</span></p>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Full Name</label>
            <input
              type="text"
              value={form.admin_full_name}
              onChange={(e) => set('admin_full_name', e.target.value)}
              placeholder="John Doe"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Email</label>
            <input
              type="email"
              value={form.admin_email}
              onChange={(e) => set('admin_email', e.target.value)}
              placeholder="owner@company.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">
              Password <span className="text-gray-400">(leave blank to auto-generate)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.admin_password}
                onChange={(e) => set('admin_password', e.target.value)}
                placeholder="Min 8 characters"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create Tenant'}
          </button>
        </div>
      </form>
      )}
    </Modal>
  )
}
