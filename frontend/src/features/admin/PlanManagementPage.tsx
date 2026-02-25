/**
 * PlanManagementPage — Super Admin view to manage subscription plans and their modules.
 *
 * Fetches:  GET /api/v1/plans/   — list of plans (modules returned as full objects)
 *           GET /api/v1/modules/ — list of all modules
 * Mutates:  POST /api/v1/plans/{id}/toggle_module/ { module_id }
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import { PLANS, MODULES } from '../../api/endpoints'
import {
  ClipboardList,
  Check,
  Minus,
  Package,
  Ticket,
  Users,
  Building2,
  FolderKanban,
  Receipt,
  ChevronDown,
  ChevronUp,
  Layers,
  Plus,
  X,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModuleItem {
  id: number
  key: string
  name: string
  description: string
  icon: string
  is_core: boolean
  order: number
}

// Backend PlanSerializer returns modules as full objects (ModuleSerializer),
// NOT just IDs — extract IDs before building the Set.
interface PlanItem {
  id: number
  name: string
  slug: string
  description: string
  is_active: boolean
  modules: ModuleItem[]      // full module objects returned by API
  created_at: string
  updated_at: string
}

// ─── Create Plan Modal ───────────────────────────────────────────────────────

interface CreatePlanModalProps {
  modules: ModuleItem[]
  onClose: () => void
  onCreated: () => void
}

function CreatePlanModal({ modules, onClose, onCreated }: CreatePlanModalProps) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(modules.filter((m) => m.is_core).map((m) => m.id))
  )

  const sortedModules = [...modules].sort((a, b) => a.order - b.order)

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    setName(val)
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  }

  const toggleId = (id: number, isCore: boolean) => {
    if (isCore) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const create = useMutation({
    mutationFn: () =>
      apiClient.post(PLANS.LIST, {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        is_active: isActive,
        module_ids: Array.from(selectedIds),
      }),
    onSuccess: () => {
      toast.success('Plan created')
      onCreated()
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to create plan')
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Create New Plan</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Plan Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Enterprise"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Slug */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Slug *</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="e.g. enterprise"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">Lowercase letters, numbers, underscores only.</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Short description of this plan"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsActive((v) => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                isActive ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-4' : 'translate-x-1'
                }`}
              />
            </button>
            <span className="text-sm text-gray-700">Active</span>
          </div>

          {/* Module selection */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Modules</label>
            <div className="grid grid-cols-1 gap-1.5">
              {sortedModules.map((mod) => {
                const selected = selectedIds.has(mod.id)
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => toggleId(mod.id, mod.is_core)}
                    disabled={mod.is_core}
                    title={mod.is_core ? 'Core module — always included' : undefined}
                    className={[
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all',
                      mod.is_core
                        ? 'border-indigo-200 bg-indigo-50 cursor-default'
                        : selected
                        ? 'border-green-300 bg-green-50 hover:bg-green-100'
                        : 'border-gray-200 bg-white hover:bg-gray-50',
                    ].join(' ')}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
                        mod.is_core ? 'bg-indigo-400' : selected ? 'bg-green-500' : 'bg-gray-200'
                      }`}
                    >
                      {(mod.is_core || selected) && <Check size={10} className="text-white" strokeWidth={3} />}
                    </div>
                    <span className={`text-sm font-medium ${
                      mod.is_core ? 'text-indigo-700' : selected ? 'text-green-800' : 'text-gray-700'
                    }`}>
                      {mod.name}
                      {mod.is_core && <span className="ml-1 text-[10px] text-indigo-400 font-bold">(core)</span>}
                    </span>
                    <span className="text-xs text-gray-400 ml-auto truncate max-w-[140px]">{mod.description}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || !slug.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {create.isPending && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Create Plan
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Ticket,
  Users,
  Building2,
  FolderKanban,
  Package,
  Receipt,
}

function ModIcon({ name, size = 14 }: { name: string; size?: number }) {
  const Icon = ICON_MAP[name] ?? Package
  return <Icon size={size} />
}

// ─── Plan slug colour ─────────────────────────────────────────────────────────

const PLAN_COLOURS: Record<string, { badge: string; accent: string }> = {
  free:  { badge: 'bg-gray-100 text-gray-600',    accent: 'border-l-gray-300' },
  basic: { badge: 'bg-blue-100 text-blue-700',    accent: 'border-l-blue-400' },
  pro:   { badge: 'bg-indigo-100 text-indigo-700', accent: 'border-l-indigo-500' },
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PlanManagementPage() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const { data: plansData, isLoading: plansLoading } =
    useQuery<PlanItem[]>({
      queryKey: ['plans'],
      queryFn: () => apiClient.get(PLANS.LIST).then((r) => {
        const d = r.data
        return Array.isArray(d) ? d : d.results ?? []
      }),
    })

  const { data: modulesData, isLoading: modulesLoading } =
    useQuery<ModuleItem[]>({
      queryKey: ['modules'],
      queryFn: () => apiClient.get(MODULES.LIST).then((r) => {
        const d = r.data
        return Array.isArray(d) ? d : d.results ?? []
      }),
    })

  const toggleModule = useMutation({
    mutationFn: ({ planId, moduleKey, enabled }: { planId: number; moduleKey: string; enabled: boolean }) =>
      apiClient.post(PLANS.TOGGLE_MODULE(planId), { module_key: moduleKey, enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plans'] })
      toast.success('Plan updated')
    },
    onError: () => toast.error('Failed to update plan'),
  })

  const plans = plansData ?? []
  const allModules = [...(modulesData ?? [])].sort((a, b) => a.order - b.order)

  if (plansLoading || modulesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <ClipboardList size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Plan Management</h1>
            <p className="text-sm text-gray-500">
              Toggle which modules are available in each subscription plan.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
        >
          <Plus size={16} />
          New Plan
        </button>
      </div>

      {/* ── Create Plan Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <CreatePlanModal
          modules={allModules}
          onClose={() => setShowCreate(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['plans'] })}
        />
      )}

      {/* ── Module legend ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Layers size={13} /> All modules
        </p>
        <div className="flex flex-wrap gap-2">
          {allModules.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-200 text-gray-600 px-2.5 py-1 rounded-full text-xs font-medium"
            >
              <ModIcon name={m.icon} size={13} />
              {m.name}
              {m.is_core && (
                <span className="text-indigo-500 text-[10px] font-bold">(core)</span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* ── Plans ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {plans.map((plan) => {
          const isOpen = expanded === plan.id

          // plan.modules is an array of full ModuleItem objects — extract IDs
          const includedIds = new Set(plan.modules.map((m) => m.id))

          const colours = PLAN_COLOURS[plan.slug] ?? PLAN_COLOURS.free

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-l-4 ${colours.accent}`}
            >
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : plan.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900">{plan.name}</h2>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${colours.badge}`}>
                        {plan.slug}
                      </span>
                      {!plan.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{plan.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                    {plan.modules.length} / {allModules.length} modules
                  </span>
                  {isOpen
                    ? <ChevronUp size={17} className="text-gray-400" />
                    : <ChevronDown size={17} className="text-gray-400" />}
                </div>
              </button>

              {/* Module grid */}
              {isOpen && (
                <div className="border-t border-gray-100 p-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allModules.map((mod) => {
                    const active = includedIds.has(mod.id)
                    const isMutating =
                      toggleModule.isPending &&
                      toggleModule.variables?.planId === plan.id &&
                      toggleModule.variables?.moduleKey === mod.key

                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => {
                          if (!mod.is_core) {
                            toggleModule.mutate({ planId: plan.id, moduleKey: mod.key, enabled: !active })
                          }
                        }}
                        disabled={isMutating}
                        title={mod.is_core ? 'Core module — always active' : active ? 'Click to remove' : 'Click to add'}
                        className={[
                          'flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-all',
                          mod.is_core
                            ? 'border-indigo-200 bg-indigo-50 cursor-default'
                            : active
                            ? 'border-green-300 bg-green-50 hover:bg-green-100 cursor-pointer'
                            : 'border-gray-200 bg-white hover:bg-gray-50 cursor-pointer',
                          isMutating ? 'opacity-60' : '',
                        ].join(' ')}
                      >
                        {/* Checkbox indicator */}
                        <div
                          className={[
                            'w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors',
                            mod.is_core ? 'bg-indigo-400' : active ? 'bg-green-500' : 'bg-gray-200',
                          ].join(' ')}
                        >
                          {isMutating ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : mod.is_core || active ? (
                            <Check size={11} className="text-white" strokeWidth={3} />
                          ) : (
                            <Minus size={11} className="text-gray-400" />
                          )}
                        </div>

                        {/* Module info */}
                        <div className="min-w-0">
                          <p className={[
                            'text-sm font-medium flex items-center gap-1.5',
                            mod.is_core ? 'text-indigo-700' : active ? 'text-green-800' : 'text-gray-700',
                          ].join(' ')}>
                            <ModIcon name={mod.icon} size={14} />
                            {mod.name}
                            {mod.is_core && (
                              <span className="text-indigo-400 text-[10px] font-bold">(core)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 leading-tight truncate">
                            {mod.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {plans.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center text-gray-400 text-sm">
            No plans found. Run migrations to seed the default plans.
          </div>
        )}
      </div>
    </div>
  )
}
