import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'
import { PLANS } from '../../api/endpoints'

export interface Tenant {
  id: number
  name: string
  slug: string
  plan: { id: number; name: string; slug: string; module_keys: string[] } | null
  currency: string
  vat_enabled: boolean
  vat_rate: string
  coin_to_money_rate: string
  custom_domain: string | null
  is_active: boolean
  is_deleted: boolean
  member_count: number
  created_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  tenant: Tenant | null
}

export default function EditTenantModal({ open, onClose, tenant }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    slug: '',
    planSlug: 'free' as string,
    currency: 'NPR',
    vat_enabled: true,
    vat_rate: '0.13',
    coin_to_money_rate: '1.0',
    custom_domain: '',
  })

  // Fetch all plans to build a slug → id map for the submit payload
  const { data: plansData } = useQuery<{ id: number; name: string; slug: string }[]>({
    queryKey: ['plans'],
    queryFn: () => apiClient.get(PLANS.LIST).then((r) => {
      const d = r.data
      return Array.isArray(d) ? d : d.results ?? []
    }),
  })
  const planSlugToId = Object.fromEntries((plansData ?? []).map((p) => [p.slug, p.id]))

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name,
        slug: tenant.slug,
        planSlug: tenant.plan?.slug ?? 'free',
        currency: tenant.currency,
        vat_enabled: tenant.vat_enabled,
        vat_rate: String(tenant.vat_rate),
        coin_to_money_rate: String(tenant.coin_to_money_rate),
        custom_domain: tenant.custom_domain ?? '',
      })
    }
  }, [tenant])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  const mutation = useMutation({
    mutationFn: (payload: object) => apiClient.patch(`/tenants/${tenant!.id}/`, payload),
    onSuccess: () => {
      toast.success('Tenant updated')
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      qc.invalidateQueries({ queryKey: ['admin', 'tenant'] })
      onClose()
    },
    onError: (err: any) => {
      const detail = err?.response?.data
      const msg = typeof detail === 'object'
        ? Object.values(detail).flat().join(' ')
        : 'Failed to update tenant'
      toast.error(msg)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      name: form.name,
      slug: form.slug,
      currency: form.currency,
      vat_enabled: form.vat_enabled,
      vat_rate: parseFloat(form.vat_rate),
      coin_to_money_rate: parseFloat(form.coin_to_money_rate),
      custom_domain: form.custom_domain.trim() || null,
    }
    // Backend write field is plan_id (PrimaryKeyRelatedField)
    const planId = planSlugToId[form.planSlug]
    if (planId) payload.plan_id = planId
    mutation.mutate(payload)
  }

  if (!tenant) return null

  return (
    <Modal open={open} onClose={onClose} title={`Edit — ${tenant.name}`} width="max-w-xl">
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
            onChange={(e) => set('name', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Slug — editable with warning */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subdomain Slug</label>
          <div className="flex items-center border border-amber-400 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-amber-400">
            <span className="px-3 py-2 bg-amber-50 text-amber-500 text-sm border-r border-amber-300 select-none">
              acme.
            </span>
            <input
              type="text"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1 px-3 py-2 text-sm outline-none bg-white"
            />
            <span className="px-3 py-2 bg-amber-50 text-amber-500 text-sm border-l border-amber-300 select-none">
              .techyatra.com
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-600">
            ⚠ Changing the slug changes the tenant's subdomain. Inform the tenant before saving.
          </p>
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
            Tenant must point their DNS A record to this server. Leave blank to use the default subdomain.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
            <select
              value={form.planSlug}
              onChange={(e) => set('planSlug', e.target.value)}
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
              <label className="block text-xs text-gray-500 mb-1">VAT Rate (e.g. 0.13 = 13%)</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Coin → Money Rate</label>
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
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
