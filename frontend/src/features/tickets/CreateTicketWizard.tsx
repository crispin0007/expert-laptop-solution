/**
 * CreateTicketWizard — 5-step guided ticket creation flow.
 *
 * Step 1 — Ticket Kind (select ticket type)
 * Step 2 — Category & Subcategory
 * Step 3 — Customer (search + inline quick-create)
 * Step 4 — Details (title, description, priority, dept, assignee)
 * Step 5 — Review & Submit
 */
import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  X, ChevronLeft, ChevronRight, Check, Loader2, Search, Plus,
  Headphones, Wrench, FolderKanban, Tag, UserPlus, AlertTriangle,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS, CUSTOMERS, DEPARTMENTS, STAFF } from '../../api/endpoints'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketType {
  id: number
  name: string
  slug: string
  color: string
  icon: string
  default_sla_hours: number
  requires_product: boolean
}

interface SubCategory {
  id: number
  name: string
}

interface TicketCategory {
  id: number
  name: string
  color: string
  icon: string
  subcategories: SubCategory[]
}

interface Customer {
  id: number
  name: string
  email: string
  phone: string
  type: string
}

interface Department {
  id: number
  name: string
}

interface StaffUser {
  id: number
  full_name: string
  email: string
}

interface WizardState {
  ticket_type: number | null
  category: number | null
  subcategory: number | null
  customer: number | null
  department: number | null
  assigned_to: number | null
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  contact_phone: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const STEPS = ['Ticket Kind', 'Category', 'Customer', 'Details', 'Review'] as const

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 select-none">
      {STEPS.map((label, idx) => {
        const done = idx < current
        const active = idx === current
        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  done
                    ? 'bg-indigo-600 text-white'
                    : active
                    ? 'bg-indigo-100 text-indigo-700 ring-2 ring-indigo-500'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {done ? <Check size={14} /> : idx + 1}
              </div>
              <span
                className={`text-xs mt-1 whitespace-nowrap ${
                  active ? 'text-indigo-700 font-medium' : done ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`h-px w-12 mb-4 mx-1 transition-colors ${done ? 'bg-indigo-400' : 'bg-slate-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1 — Ticket Kind ──────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, React.ReactNode> = {
  headphones: <Headphones size={28} />,
  wrench: <Wrench size={28} />,
  maintenance: <Wrench size={28} />,
  support: <Headphones size={28} />,
  project: <FolderKanban size={28} />,
  folderkabnan: <FolderKanban size={28} />,
}

function getTypeIcon(t: TicketType) {
  const key = (t.icon || t.slug || t.name).toLowerCase()
  for (const [k, icon] of Object.entries(TYPE_ICONS)) {
    if (key.includes(k)) return icon
  }
  return <Tag size={28} />
}

function Step1TicketKind({
  types,
  selected,
  onSelect,
}: {
  types: TicketType[]
  selected: number | null
  onSelect: (id: number) => void
}) {
  if (types.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        <AlertTriangle size={36} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">No ticket types configured.</p>
        <p className="text-xs mt-1">Go to <strong>Ticket Settings</strong> to add types first.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">What kind of ticket is this?</h2>
      <p className="text-sm text-slate-500 mb-6">Select the nature of the request to guide the next steps.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {types.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all text-center hover:shadow-md ${
              selected === t.id
                ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                : 'border-slate-200 bg-white hover:border-indigo-300'
            }`}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: (t.color || '#6366f1') + '22', color: t.color || '#6366f1' }}
            >
              {getTypeIcon(t)}
            </div>
            <div>
              <div className={`font-semibold text-sm ${selected === t.id ? 'text-indigo-700' : 'text-slate-800'}`}>
                {t.name}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">SLA {t.default_sla_hours}h</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Step 2 — Category ─────────────────────────────────────────────────────────

function Step2Category({
  categories,
  selectedCat,
  selectedSub,
  onCat,
  onSub,
}: {
  categories: TicketCategory[]
  selectedCat: number | null
  selectedSub: number | null
  onCat: (id: number | null) => void
  onSub: (id: number | null) => void
}) {
  const activeCat = categories.find(c => c.id === selectedCat)

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Select a category</h2>
      <p className="text-sm text-slate-500 mb-6">Helps classify and route the ticket correctly.</p>

      {categories.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No categories configured yet. You can skip this step or add categories in Ticket Settings.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => { onCat(cat.id); onSub(null) }}
                className={`flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                  selectedCat === cat.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color || '#94a3b8' }}
                />
                <span className={`text-sm font-medium truncate ${selectedCat === cat.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                  {cat.name}
                </span>
              </button>
            ))}
          </div>

          {/* Subcategories */}
          {activeCat && activeCat.subcategories.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Subcategory</p>
              <div className="flex flex-wrap gap-2">
                {activeCat.subcategories.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => onSub(selectedSub === sub.id ? null : sub.id)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      selectedSub === sub.id
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => { onCat(null); onSub(null) }}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600 underline"
          >
            Skip — no category
          </button>
        </>
      )}
    </div>
  )
}

// ── Quick Customer Create form ────────────────────────────────────────────────

function QuickCreateCustomer({
  prefillName,
  onCreated,
  onCancel,
}: {
  prefillName: string
  onCreated: (customer: Customer) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({ name: prefillName, email: '', phone: '', type: 'company' })

  const mutation = useMutation({
    mutationFn: () => apiClient.post(CUSTOMERS.LIST, form),
    onSuccess: res => {
      const c: Customer = res.data?.data ?? res.data
      toast.success(`Customer "${c.name}" created`)
      onCreated(c)
    },
    onError: () => toast.error('Failed to create customer'),
  })

  return (
    <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus size={16} className="text-indigo-600" />
        <span className="text-sm font-semibold text-indigo-800">Quick-create customer</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-600 block mb-1">Name *</label>
          <input
            autoFocus
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1">Phone</label>
          <input
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-600 block mb-1">Type</label>
          <select
            value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="company">Company</option>
            <option value="individual">Individual</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => mutation.mutate()}
          disabled={!form.name || mutation.isPending}
          className="bg-indigo-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1.5"
        >
          {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Create & Select
        </button>
        <button onClick={onCancel} className="text-sm text-slate-500 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Step 3 — Customer ─────────────────────────────────────────────────────────

function Step3Customer({
  customers,
  selected,
  onSelect,
}: {
  customers: Customer[]
  selected: number | null
  onSelect: (id: number, customer: Customer) => void
}) {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const qc = useQueryClient()

  const filtered = useMemo(
    () =>
      customers.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      ),
    [customers, search]
  )

  const selectedCustomer = customers.find(c => c.id === selected)

  const handleCreated = (c: Customer) => {
    qc.invalidateQueries({ queryKey: ['customers-all'] })
    onSelect(c.id, c)
    setShowCreate(false)
    setSearch('')
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Who is this ticket for?</h2>
      <p className="text-sm text-slate-500 mb-4">Search for an existing customer or create a new one.</p>

      {/* Selected badge */}
      {selectedCustomer && (
        <div className="flex items-center gap-2 mb-3 p-2.5 bg-green-50 border border-green-200 rounded-xl">
          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold text-sm">
            {selectedCustomer.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-green-800 truncate">{selectedCustomer.name}</div>
            <div className="text-xs text-green-600 truncate">{selectedCustomer.email}</div>
          </div>
          <button
            onClick={() => onSelect(0, selectedCustomer)}
            className="text-xs text-green-600 hover:text-green-800 underline"
          >
            Change
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setShowCreate(false) }}
          placeholder="Search by name or email…"
          className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Results */}
      <div className="space-y-1 max-h-52 overflow-y-auto">
        {filtered.length === 0 && search ? (
          <div className="text-center py-4 text-slate-400 text-sm">
            <p>No customer found matching "{search}"</p>
            {!showCreate && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-2 flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-sm mx-auto"
              >
                <Plus size={14} /> Create "{search}" as new customer
              </button>
            )}
          </div>
        ) : (
          filtered.slice(0, 20).map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id, c)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                selected === c.id
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 font-semibold text-sm flex-shrink-0">
                {c.name[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{c.name}</div>
                <div className="text-xs text-slate-400 truncate">{c.email || c.phone || c.type}</div>
              </div>
              {selected === c.id && <Check size={16} className="text-indigo-600 flex-shrink-0" />}
            </button>
          ))
        )}
      </div>

      {/* Quick create form */}
      {showCreate && (
        <QuickCreateCustomer
          prefillName={search}
          onCreated={handleCreated}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Always-visible create button when not searching */}
      {!search && !showCreate && (
        <button
          onClick={() => setShowCreate(true)}
          className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800"
        >
          <Plus size={14} /> Create new customer
        </button>
      )}
    </div>
  )
}

// ── Step 4 — Details ──────────────────────────────────────────────────────────

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-300' },
  { value: 'medium', label: 'Medium', color: 'text-blue-600', bg: 'bg-blue-50 border-blue-300' },
  { value: 'high', label: 'High', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-300' },
  { value: 'critical', label: 'Critical', color: 'text-red-600', bg: 'bg-red-50 border-red-300' },
]

function Step4Details({
  state,
  departments,
  staff,
  onChange,
}: {
  state: WizardState
  departments: Department[]
  staff: StaffUser[]
  onChange: (partial: Partial<WizardState>) => void
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Ticket details</h2>
      <p className="text-sm text-slate-500 mb-5">Fill in the title, priority, and assignment.</p>

      <div className="space-y-4">
        {/* Title */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Title *</label>
          <input
            autoFocus
            value={state.title}
            onChange={e => onChange({ title: e.target.value })}
            placeholder="Brief description of the issue…"
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Description</label>
          <textarea
            rows={4}
            value={state.description}
            onChange={e => onChange({ description: e.target.value })}
            placeholder="Steps to reproduce, expected behavior, error messages…"
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-2">Priority</label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => onChange({ priority: p.value as WizardState['priority'] })}
                className={`flex-1 py-2 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  state.priority === p.value
                    ? `${p.bg} ${p.color} border-current`
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Department + Assignee */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Department</label>
            <select
              value={state.department ?? ''}
              onChange={e => onChange({ department: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— None —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 block mb-1">Assign to</label>
            <select
              value={state.assigned_to ?? ''}
              onChange={e => onChange({ assigned_to: e.target.value ? parseInt(e.target.value) : null })}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Unassigned —</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
            </select>
          </div>
        </div>

        {/* Contact Phone */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Contact Phone</label>
          <input
            type="tel"
            value={state.contact_phone}
            onChange={e => onChange({ contact_phone: e.target.value })}
            placeholder="Phone number to reach for this ticket"
            className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 5 — Review ───────────────────────────────────────────────────────────

function Step5Review({
  state,
  types,
  categories,
  customers,
  departments,
  staff,
}: {
  state: WizardState
  types: TicketType[]
  categories: TicketCategory[]
  customers: Customer[]
  departments: Department[]
  staff: StaffUser[]
}) {
  const type = types.find(t => t.id === state.ticket_type)
  const cat = categories.find(c => c.id === state.category)
  const sub = cat?.subcategories.find(s => s.id === state.subcategory)
  const customer = customers.find(c => c.id === state.customer)
  const dept = departments.find(d => d.id === state.department)
  const assignee = staff.find(s => s.id === state.assigned_to)

  const rows: [string, string][] = [
    ['Ticket Type', type?.name ?? '—'],
    ['Category', cat ? (sub ? `${cat.name} → ${sub.name}` : cat.name) : '—'],
    ['Customer', customer?.name ?? '—'],
    ['Priority', state.priority.charAt(0).toUpperCase() + state.priority.slice(1)],
    ['Department', dept?.name ?? '—'],
    ['Assigned to', assignee?.full_name ?? assignee?.email ?? '—'],
  ]

  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Review & Submit</h2>
      <p className="text-sm text-slate-500 mb-5">Confirm the details below before creating the ticket.</p>

      <div className="bg-slate-50 rounded-2xl border border-slate-200 divide-y divide-slate-200 mb-5">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Title</p>
          <p className="text-sm font-semibold text-slate-800">{state.title || <span className="text-red-500">Required</span>}</p>
        </div>
        {state.description && (
          <div className="p-4">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-slate-700 whitespace-pre-line">{state.description}</p>
          </div>
        )}
        <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-medium text-slate-400">{label}</p>
              <p className="text-sm text-slate-700 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Wizard Shell ──────────────────────────────────────────────────────────────

const INIT: WizardState = {
  ticket_type: null,
  category: null,
  subcategory: null,
  customer: null,
  department: null,
  assigned_to: null,
  title: '',
  description: '',
  priority: 'medium',
  contact_phone: '',
}

export default function CreateTicketWizard({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>(INIT)
  const [customerCache, setCustomerCache] = useState<Customer[]>([])
  const qc = useQueryClient()

  const update = (partial: Partial<WizardState>) => setState(prev => ({ ...prev, ...partial }))

  // ── Data queries ───────────────────────────────────────────────────────────

  const { data: types = [] } = useQuery<TicketType[]>({
    queryKey: ['ticket-types'],
    queryFn: () =>
      apiClient.get(TICKETS.TYPES).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: open,
  })

  const { data: categories = [] } = useQuery<TicketCategory[]>({
    queryKey: ['ticket-categories'],
    queryFn: () =>
      apiClient.get(TICKETS.CATEGORIES + '?active=1').then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: open,
  })

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-all'],
    queryFn: () =>
      apiClient.get(CUSTOMERS.LIST + '?page_size=500').then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: open && step === 2,
  })

  // Merge fetched customers with any quick-created ones
  const customers = useMemo(() => {
    const ids = new Set(allCustomers.map(c => c.id))
    return [...allCustomers, ...customerCache.filter(c => !ids.has(c.id))]
  }, [allCustomers, customerCache])

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () =>
      apiClient.get(DEPARTMENTS.LIST).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: open && step === 3,
  })

  const { data: staff = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff-list'],
    queryFn: () =>
      apiClient.get(STAFF.LIST).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: open && step === 3,
  })

  // ── Submit ─────────────────────────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        title: state.title,
        description: state.description,
        priority: state.priority,
      }
      if (state.ticket_type) payload.ticket_type = state.ticket_type
      if (state.category) payload.category = state.category
      if (state.subcategory) payload.subcategory = state.subcategory
      if (state.customer) payload.customer = state.customer
      if (state.department) payload.department = state.department
      if (state.assigned_to) payload.assigned_to = state.assigned_to
      if (state.contact_phone) payload.contact_phone = state.contact_phone
      return apiClient.post(TICKETS.LIST, payload)
    },
    onSuccess: () => {
      toast.success('Ticket created!')
      qc.invalidateQueries({ queryKey: ['tickets'] })
      setState(INIT)
      setStep(0)
      onCreated()
      onClose()
    },
    onError: () => toast.error('Failed to create ticket'),
  })

  // ── Navigation ─────────────────────────────────────────────────────────────

  const canNext = (): boolean => {
    if (step === 0) return state.ticket_type !== null
    if (step === 2) return state.customer !== null
    if (step === 3) return state.title.trim().length > 0
    return true
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else submitMutation.mutate()
  }

  const handleClose = () => {
    setState(INIT)
    setStep(0)
    onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-7 pb-4 border-b border-slate-100">
          <div>
            <h1 className="text-xl font-bold text-slate-900">New Ticket</h1>
            <p className="text-xs text-slate-400 mt-0.5">Step {step + 1} of {STEPS.length}</p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step bar */}
        <div className="px-8 pt-6">
          <StepBar current={step} />
        </div>

        {/* Step content */}
        <div className="flex-1 overflow-y-auto px-8 pb-4">
          {step === 0 && (
            <Step1TicketKind
              types={types}
              selected={state.ticket_type}
              onSelect={id => update({ ticket_type: id })}
            />
          )}
          {step === 1 && (
            <Step2Category
              categories={categories}
              selectedCat={state.category}
              selectedSub={state.subcategory}
              onCat={id => update({ category: id, subcategory: null })}
              onSub={id => update({ subcategory: id })}
            />
          )}
          {step === 2 && (
            <Step3Customer
              customers={customers}
              selected={state.customer}
              onSelect={(id, c) => {
                update({ customer: id || null })
                if (c && !allCustomers.find(x => x.id === c.id)) {
                  setCustomerCache(prev => [...prev.filter(x => x.id !== c.id), c])
                }
              }}
            />
          )}
          {step === 3 && (
            <Step4Details
              state={state}
              departments={departments}
              staff={staff}
              onChange={update}
            />
          )}
          {step === 4 && (
            <Step5Review
              state={state}
              types={types}
              categories={categories}
              customers={customers}
              departments={departments}
              staff={staff}
            />
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1.5 text-sm text-slate-600 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} /> Back
          </button>

          <div className="flex items-center gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 rounded-full transition-all ${
                  idx === step ? 'w-6 bg-indigo-600' : idx < step ? 'w-3 bg-indigo-300' : 'w-3 bg-slate-200'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            disabled={!canNext() || submitMutation.isPending}
            className="flex items-center gap-1.5 text-sm bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {submitMutation.isPending ? (
              <><Loader2 size={15} className="animate-spin" /> Creating…</>
            ) : step === STEPS.length - 1 ? (
              <><Check size={15} /> Create Ticket</>
            ) : (
              <>Next <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
