/**
 * TicketTypeManagementPage — Admin UI for managing Ticket Types and Categories.
 *
 * Tab 1: Ticket Types — create / edit / deactivate types (name, SLA hours, color, icon, requires_product).
 * Tab 2: Categories — create / edit / delete categories with inline subcategory management.
 * Tab 3: Vehicles — register tenant vehicles with billing rate per km.
 */
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Tag, FolderOpen, Plus, Pencil, Trash2, Check, X, ChevronDown, ChevronRight,
  Clock, Package, ToggleLeft, ToggleRight, Palette, Smile,
  Car, Fuel, Gauge, Route,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS } from '../../api/endpoints'

/** Extract the most useful error message from an Axios error response. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data
  if (!data) return fallback
  // DRF may return { detail }, { non_field_errors }, or field-level { name: ['...'] }
  if (typeof data.detail === 'string') return data.detail
  if (Array.isArray(data.non_field_errors)) return (data.non_field_errors as string[]).join(' ')
  const firstField = Object.values(data)[0]
  if (Array.isArray(firstField) && typeof firstField[0] === 'string') return firstField[0]
  return fallback
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketType {
  id: number
  name: string
  slug: string
  default_sla_hours: number
  color: string
  icon: string
  requires_product: boolean
  is_active: boolean
}

interface SubCategory {
  id: number
  name: string
  slug: string
  is_active: boolean
}

interface TicketCategory {
  id: number
  name: string
  slug: string
  description: string
  color: string
  icon: string
  is_active: boolean
  subcategories: SubCategory[]
}

// ── Vehicle types ─────────────────────────────────────────────────────────────

interface Vehicle {
  id: number
  name: string
  plate_number: string
  type: string
  fuel_type: string
  rate_per_km: string
  notes: string
  is_active: boolean
}

const VEHICLE_TYPES = [
  { value: 'car',       label: 'Car' },
  { value: 'motorbike', label: 'Motorbike' },
  { value: 'van',       label: 'Van' },
  { value: 'truck',     label: 'Truck' },
  { value: 'other',     label: 'Other' },
]

const FUEL_TYPES = [
  { value: 'petrol',   label: 'Petrol' },
  { value: 'diesel',   label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid',   label: 'Hybrid' },
]

const VEHICLE_TYPE_ICONS: Record<string, React.ReactNode> = {
  car:       <Car size={14} />,
  motorbike: <Route size={14} />,
  van:       <Car size={14} />,
  truck:     <Car size={14} />,
  other:     <Car size={14} />,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className="w-6 h-6 rounded-full border-2 transition-all"
          style={{ backgroundColor: c, borderColor: value === c ? '#1e293b' : c }}
          title={c}
        />
      ))}
      <input
        type="text"
        placeholder="#hex"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-20 text-xs border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  )
}

// ── Ticket Types Tab ─────────────────────────────────────────────────────────────

function TicketTypesTab() {
  const qc = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<TicketType | null>(null)
  const [form, setForm] = useState({ name: '', default_sla_hours: 24, color: '#6366f1', icon: '', requires_product: false })

  const { data: types = [], isLoading } = useQuery<TicketType[]>({
    queryKey: ['ticket-types-all'],
    queryFn: () =>
      apiClient.get(TICKETS.TYPES).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
  })

  const resetForm = () => {
    setForm({ name: '', default_sla_hours: 24, color: '#6366f1', icon: '', requires_product: false })
    setEditTarget(null)
    setShowForm(false)
  }

  const startEdit = (t: TicketType) => {
    setEditTarget(t)
    setForm({ name: t.name, default_sla_hours: t.default_sla_hours, color: t.color, icon: t.icon, requires_product: t.requires_product })
    setShowForm(true)
  }

  const saveMutation = useMutation({
    mutationFn: (payload: typeof form) =>
      editTarget
        ? apiClient.patch(TICKETS.TYPES + `${editTarget.id}/`, payload)
        : apiClient.post(TICKETS.TYPES, payload),
    onSuccess: () => {
      toast.success(editTarget ? 'Type updated' : 'Type created')
      qc.invalidateQueries({ queryKey: ['ticket-types-all'] })
      qc.invalidateQueries({ queryKey: ['ticket-types'] })
      resetForm()
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Failed to save')),
  })

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(TICKETS.TYPE_DEACTIVATE(id)),
    onSuccess: () => {
      toast.success('Type deactivated')
      qc.invalidateQueries({ queryKey: ['ticket-types-all'] })
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Failed to deactivate')),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(TICKETS.TYPE_REACTIVATE(id)),
    onSuccess: () => {
      toast.success('Type reactivated')
      qc.invalidateQueries({ queryKey: ['ticket-types-all'] })
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Failed to reactivate type')),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">Define the kinds of tickets your team handles. Used in the creation wizard.</p>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true) }}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <Plus size={14} /> Add Type
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
          <h3 className="font-semibold text-slate-800 mb-4">{editTarget ? 'Edit' : 'New'} Ticket Type</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Support, Maintenance"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Default SLA (hours) *</label>
              <input
                type="number"
                min={1}
                value={form.default_sla_hours}
                onChange={e => setForm(p => ({ ...p, default_sla_hours: parseInt(e.target.value) || 24 }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                <Smile size={12} className="inline mr-1" />Icon (lucide name)
              </label>
              <input
                value={form.icon}
                onChange={e => setForm(p => ({ ...p, icon: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Headphones, Wrench, FolderKanban"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                <Palette size={12} className="inline mr-1" />Color
              </label>
              <ColorPicker value={form.color} onChange={c => setForm(p => ({ ...p, color: c }))} />
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, requires_product: !p.requires_product }))}
                className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  form.requires_product
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-300 text-slate-600'
                }`}
              >
                <Package size={14} />
                {form.requires_product ? 'Requires product (on)' : 'Requires product (off)'}
              </button>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => saveMutation.mutate(form)}
              disabled={!form.name || saveMutation.isPending}
              className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={resetForm} className="text-sm text-slate-600 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Types list */}
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : types.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Tag size={40} className="mx-auto mb-2 opacity-30" />
          <p>No ticket types yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {types.map(t => (
            <div
              key={t.id}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                t.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
              }`}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: t.color || '#94a3b8' }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800 text-sm">{t.name}</span>
                  {!t.is_active && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Inactive</span>
                  )}
                  {t.requires_product && (
                    <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <Package size={10} /> Requires product
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
                  <Clock size={10} />
                  <span>SLA: {t.default_sla_hours}h</span>
                  {t.icon && <span className="ml-2">Icon: {t.icon}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => startEdit(t)}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                {t.is_active ? (
                  <button
                    onClick={() => deactivateMutation.mutate(t.id)}
                    className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded"
                    title="Deactivate"
                  >
                    <ToggleRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => reactivateMutation.mutate(t.id)}
                    className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded"
                    title="Reactivate"
                  >
                    <ToggleLeft size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Subcategory inline row ─────────────────────────────────────────────────────

interface SubRowProps {
  categoryId: number
  sub?: SubCategory
  onDone: () => void
  onCancel: () => void
}

function SubCategoryRow({ categoryId, sub, onDone, onCancel }: SubRowProps) {
  const qc = useQueryClient()
  const [name, setName] = useState(sub?.name ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: () =>
      sub
        ? apiClient.patch(TICKETS.SUBCATEGORY_DETAIL(sub.id), { name })
        : apiClient.post(TICKETS.SUBCATEGORIES, { name, category: categoryId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
      onDone()
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Failed to save subcategory')),
  })

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') mutation.mutate()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="flex items-center gap-2 ml-6 mt-1">
      <div className="w-px h-4 bg-slate-300" />
      <input
        ref={inputRef}
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Subcategory name…"
        className="flex-1 text-sm border border-indigo-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        onClick={() => mutation.mutate()}
        disabled={!name.trim() || mutation.isPending}
        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-40"
      >
        <Check size={14} />
      </button>
      <button onClick={onCancel} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded">
        <X size={14} />
      </button>
    </div>
  )
}

// ── Categories Tab ────────────────────────────────────────────────────────────

function CategoriesTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showCatForm, setShowCatForm] = useState(false)
  const [editCat, setEditCat] = useState<TicketCategory | null>(null)
  const [catForm, setCatForm] = useState({ name: '', description: '', color: '#6366f1', icon: '' })
  const [addingSubFor, setAddingSubFor] = useState<number | null>(null)
  const [editingSub, setEditingSub] = useState<{ catId: number; sub: SubCategory } | null>(null)

  const { data: categories = [], isLoading } = useQuery<TicketCategory[]>({
    queryKey: ['ticket-categories'],
    queryFn: () =>
      apiClient.get(TICKETS.CATEGORIES).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
  })

  const resetCatForm = () => {
    setCatForm({ name: '', description: '', color: '#6366f1', icon: '' })
    setEditCat(null)
    setShowCatForm(false)
  }

  const startEditCat = (cat: TicketCategory) => {
    setEditCat(cat)
    setCatForm({ name: cat.name, description: cat.description, color: cat.color, icon: cat.icon })
    setShowCatForm(true)
  }

  const saveCatMutation = useMutation({
    mutationFn: () =>
      editCat
        ? apiClient.patch(TICKETS.CATEGORY_DETAIL(editCat.id), catForm)
        : apiClient.post(TICKETS.CATEGORIES, catForm),
    onSuccess: () => {
      toast.success(editCat ? 'Category updated' : 'Category created')
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
      resetCatForm()
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Failed to save category')),
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(TICKETS.CATEGORY_DETAIL(id)),
    onSuccess: () => {
      toast.success('Category deleted')
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Delete failed — check for linked tickets')),
  })

  const deleteSubMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(TICKETS.SUBCATEGORY_DETAIL(id)),
    onSuccess: () => {
      toast.success('Subcategory deleted')
      qc.invalidateQueries({ queryKey: ['ticket-categories'] })
    },
  })

  const toggleExpand = (id: number) =>
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          Categories and sub-categories help classify tickets. Shown in step 2 of the creation wizard.
        </p>
        <button
          onClick={() => { setEditCat(null); setShowCatForm(true) }}
          className="flex items-center gap-1.5 bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-700"
        >
          <Plus size={14} /> Add Category
        </button>
      </div>

      {/* Category form */}
      {showCatForm && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 mb-5">
          <h3 className="font-semibold text-slate-800 mb-4">{editCat ? 'Edit' : 'New'} Category</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Name *</label>
              <input
                autoFocus
                value={catForm.name}
                onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Hardware, Software"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                <Smile size={12} className="inline mr-1" />Icon
              </label>
              <input
                value={catForm.icon}
                onChange={e => setCatForm(p => ({ ...p, icon: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Cpu, Globe, Monitor"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
              <input
                value={catForm.description}
                onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">
                <Palette size={12} className="inline mr-1" />Color
              </label>
              <ColorPicker value={catForm.color} onChange={c => setCatForm(p => ({ ...p, color: c }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => saveCatMutation.mutate()}
              disabled={!catForm.name || saveCatMutation.isPending}
              className="bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saveCatMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button onClick={resetCatForm} className="text-sm text-slate-600 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Categories list */}
      {isLoading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : categories.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FolderOpen size={40} className="mx-auto mb-2 opacity-30" />
          <p>No categories yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => {
            const isExp = expanded.has(cat.id)
            return (
              <div key={cat.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors">
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    {isExp ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cat.color || '#94a3b8' }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-800 text-sm">{cat.name}</span>
                    {cat.description && (
                      <span className="text-xs text-slate-400 ml-2">{cat.description}</span>
                    )}
                    <span className="text-xs text-slate-400 ml-2">
                      ({cat.subcategories.length} sub-{cat.subcategories.length === 1 ? 'category' : 'categories'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEditCat(cat)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete "${cat.name}"? This will also delete all its subcategories.`)) {
                          deleteCatMutation.mutate(cat.id)
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded subcategories */}
                {isExp && (
                  <div className="border-t border-slate-100 px-3 pb-3 pt-2 bg-slate-50">
                    {cat.subcategories.map(sub => (
                      <div key={sub.id}>
                        {editingSub?.sub.id === sub.id && editingSub.catId === cat.id ? (
                          <SubCategoryRow
                            categoryId={cat.id}
                            sub={sub}
                            onDone={() => setEditingSub(null)}
                            onCancel={() => setEditingSub(null)}
                          />
                        ) : (
                          <div className="flex items-center gap-2 ml-6 py-1 group">
                            <div className="w-px h-4 bg-slate-300" />
                            <span className="text-sm text-slate-700 flex-1">{sub.name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => setEditingSub({ catId: cat.id, sub })}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                              >
                                <Pencil size={12} />
                              </button>
                              <button
                                onClick={() => deleteSubMutation.mutate(sub.id)}
                                className="p-1 text-slate-400 hover:text-red-600 rounded"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {addingSubFor === cat.id ? (
                      <SubCategoryRow
                        categoryId={cat.id}
                        onDone={() => setAddingSubFor(null)}
                        onCancel={() => setAddingSubFor(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setAddingSubFor(cat.id)}
                        className="flex items-center gap-1.5 ml-6 mt-1 text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        <Plus size={12} /> Add subcategory
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Vehicles Tab ─────────────────────────────────────────────────────────────

const VEHICLE_INIT = { name: '', plate_number: '', type: 'car', fuel_type: 'petrol', rate_per_km: '', notes: '' }

function VehiclesTab() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...VEHICLE_INIT })
  const [expandedNotes, setExpandedNotes] = useState<number | null>(null)

  const { data: vehicles = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['vehicles'],
    queryFn: () => apiClient.get(TICKETS.VEHICLES).then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
  })

  const upsertMutation = useMutation({
    mutationFn: () =>
      editId
        ? apiClient.patch(TICKETS.VEHICLE_DETAIL(editId), form)
        : apiClient.post(TICKETS.VEHICLES, form),
    onSuccess: () => {
      toast.success(editId ? 'Vehicle updated' : 'Vehicle added')
      qc.invalidateQueries({ queryKey: ['vehicles'] })
      setShowForm(false)
      setEditId(null)
      setForm({ ...VEHICLE_INIT })
    },
    onError: (err: unknown) => toast.error(apiErrorMessage(err, 'Failed to save vehicle')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(TICKETS.VEHICLE_DETAIL(id)),
    onSuccess: () => { toast.success('Vehicle removed'); qc.invalidateQueries({ queryKey: ['vehicles'] }) },
    onError: () => toast.error('Failed to delete vehicle'),
  })

  const toggleActive = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiClient.patch(TICKETS.VEHICLE_DETAIL(id), { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
    onError: () => toast.error('Failed to update vehicle'),
  })

  const startEdit = (v: Vehicle) => {
    setEditId(v.id)
    setForm({ name: v.name, plate_number: v.plate_number, type: v.type, fuel_type: v.fuel_type, rate_per_km: v.rate_per_km, notes: v.notes })
    setShowForm(true)
  }

  const handleCancel = () => { setShowForm(false); setEditId(null); setForm({ ...VEHICLE_INIT }) }

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-sm font-medium text-slate-700">Fleet Registry</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered.
            Rate per km is used to auto-calculate billing on trip logs.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditId(null); setForm({ ...VEHICLE_INIT }) }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm"
          >
            <Plus size={15} /> Add Vehicle
          </button>
        )}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="mb-6 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
          <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Car size={15} className="text-indigo-500" />
            {editId ? 'Edit vehicle' : 'Add new vehicle'}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {/* Name */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Vehicle Name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Company Hilux"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Plate */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Plate Number</label>
              <input
                value={form.plate_number}
                onChange={e => setForm(p => ({ ...p, plate_number: e.target.value }))}
                placeholder="e.g. BA 1 KHA 2345"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {/* Type */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Vehicle Type</label>
              <select
                value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {/* Fuel */}
            <div>
              <label className="text-xs font-medium text-slate-600 block mb-1">Fuel Type</label>
              <select
                value={form.fuel_type}
                onChange={e => setForm(p => ({ ...p, fuel_type: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {FUEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {/* Rate per km */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Billing Rate / km</label>
              <div className="relative">
                <Gauge size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.rate_per_km}
                  onChange={e => setForm(p => ({ ...p, rate_per_km: e.target.value }))}
                  placeholder="0.00"
                  className="w-full pl-8 border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Amount charged per km (in tenant currency)</p>
            </div>
            {/* Notes */}
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-slate-600 block mb-1">Notes</label>
              <input
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => upsertMutation.mutate()}
              disabled={!form.name.trim() || upsertMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
            >
              {upsertMutation.isPending ? 'Saving…' : <><Check size={13} /> {editId ? 'Update' : 'Add Vehicle'}</>}
            </button>
            <button onClick={handleCancel} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-xl hover:bg-white">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Vehicle list */}
      {isLoading && <p className="text-sm text-slate-400 py-6 text-center">Loading vehicles…</p>}
      {!isLoading && vehicles.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Car size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No vehicles registered yet.</p>
          <p className="text-xs mt-1">Add your first vehicle to start recording trip consumption.</p>
        </div>
      )}

      <div className="space-y-2">
        {vehicles.map(v => (
          <div
            key={v.id}
            className={`border rounded-xl p-4 transition-all ${
              v.is_active ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center flex-shrink-0">
                {VEHICLE_TYPE_ICONS[v.type] ?? <Car size={14} />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-slate-900">{v.name}</span>
                  {v.plate_number && (
                    <span className="text-xs font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{v.plate_number}</span>
                  )}
                  {!v.is_active && (
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Car size={10} /> {VEHICLE_TYPES.find(t => t.value === v.type)?.label ?? v.type}
                  </span>
                  <span className="flex items-center gap-1">
                    <Fuel size={10} /> {FUEL_TYPES.find(t => t.value === v.fuel_type)?.label ?? v.fuel_type}
                  </span>
                  <span className="flex items-center gap-1 font-medium text-indigo-600">
                    <Gauge size={10} /> Rs {parseFloat(v.rate_per_km || '0').toFixed(2)} / km
                  </span>
                </div>
                {v.notes && (
                  <p className="text-xs text-slate-400 mt-1 truncate">{v.notes}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => toggleActive.mutate({ id: v.id, is_active: !v.is_active })}
                  title={v.is_active ? 'Deactivate' : 'Activate'}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  {v.is_active ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} />}
                </button>
                <button
                  onClick={() => startEdit(v)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${v.name}"?`)) deleteMutation.mutate(v.id) }}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = 'types' | 'categories' | 'vehicles'

export default function TicketTypeManagementPage() {
  const [tab, setTab] = useState<Tab>('types')

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Ticket Settings</h1>
        <p className="text-slate-500 mt-1">Manage ticket types, categories, subcategories, and registered vehicles.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
        {([  
          { key: 'types',      label: 'Ticket Types', icon: Tag },
          { key: 'categories', label: 'Categories',   icon: FolderOpen },
          { key: 'vehicles',   label: 'Vehicles',     icon: Car },
        ] as { key: Tab; label: string; icon: React.FC<{ size?: number }> }[]).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {tab === 'types'      && <TicketTypesTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'vehicles'   && <VehiclesTab />}
      </div>
    </div>
  )
}
