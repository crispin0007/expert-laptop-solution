import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  Ticket as TicketIcon, Plus, Search, Filter, AlertCircle,
  Clock, CheckCircle2, CircleDot, Settings2,
  ChevronLeft, ChevronRight, X, History, User, CalendarDays,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS, STAFF } from '../../api/endpoints'
import CreateTicketWizard from './CreateTicketWizard'
import { usePermissions } from '../../hooks/usePermissions'
import DateDisplay from '../../components/DateDisplay'
import { useFyStore } from '../../store/fyStore'
import AvailabilityBadge from '../../components/AvailabilityBadge'

const PAGE_SIZE = 25

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ticket {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  ticket_type: number | null
  ticket_type_name: string
  category: number | null
  category_name: string
  customer_name: string
  department_name: string
  assigned_to?: number | null
  assigned_to_name: string
  created_by: number | null
  created_by_name: string
  sla_breached: boolean
  sla_deadline: string | null
  created_at: string
}

interface TicketType { id: number; name: string }
interface TicketCat  { id: number; name: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_customer: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  pending_customer: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-red-100 text-red-600',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-500',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const STATUS_FILTERS = ['all', 'open', 'in_progress', 'pending_customer', 'resolved', 'closed', 'cancelled'] as const
const PRIORITY_FILTERS = ['all', 'critical', 'high', 'medium', 'low'] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]
type PriorityFilter = (typeof PRIORITY_FILTERS)[number]

interface StaffAvail {
  id: number
  full_name: string
  email: string
  is_available: boolean
  open_tickets: number
  active_tasks: number
}

// ── Staff Filter Panel ────────────────────────────────────────────────────────

function StaffFilterPanel({
  availability, staffFilter, onSelect, onHistory,
}: Readonly<{
  availability: StaffAvail[]
  staffFilter: number | null
  onSelect: (id: number | null) => void
  onHistory: (s: StaffAvail) => void
}>) {
  const [staffSearch, setStaffSearch] = useState('')
  const [open, setOpen] = useState(false)

  const selected = staffFilter ? availability.find(s => s.id === staffFilter) : null

  let clearBtn: React.ReactNode = null
  if (selected) {
    clearBtn = (
      <button type="button" onClick={() => { onSelect(null); setStaffSearch(''); setOpen(false) }}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400 hover:text-indigo-600">
        <X size={13} />
      </button>
    )
  } else if (staffSearch) {
    clearBtn = (
      <button type="button" onClick={() => { setStaffSearch(''); setOpen(false) }}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        <X size={13} />
      </button>
    )
  }

  const filtered = availability.filter(s =>
    s.full_name.toLowerCase().includes(staffSearch.toLowerCase()) ||
    s.email.toLowerCase().includes(staffSearch.toLowerCase())
  )

  return (
    <div className="relative">
      {/* Trigger button */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by staff…"
            value={selected ? selected.full_name : staffSearch}
            readOnly={!!selected}
            onChange={e => { setStaffSearch(e.target.value); setOpen(true) }}
            onFocus={() => { if (!selected) setOpen(true) }}
            onClick={() => { if (selected) { onSelect(null); setStaffSearch('') } else setOpen(true) }}
            className={`pl-8 pr-8 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52 cursor-pointer ${
              selected ? 'border-indigo-400 bg-indigo-50 text-indigo-700 font-medium' : 'border-gray-300 bg-white'
            }`}
          />
          {clearBtn}
        </div>

        {/* Selected staff busy badge inline */}
        {selected && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700">
            <AvailabilityBadge isAvailable={selected.is_available} openTickets={selected.open_tickets} activeTasks={selected.active_tasks} />
            <span className="text-gray-500">{selected.open_tickets} open tickets</span>
            <button onClick={() => onHistory(selected)} title="View all ticket history"
              className="text-indigo-400 hover:text-indigo-600 transition ml-1">
              <History size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && !selected && (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} aria-label="Close staff filter" />
          <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search staff…"
                  value={staffSearch}
                  onChange={e => setStaffSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <p className="px-4 py-3 text-sm text-gray-400 text-center">No staff found</p>
              ) : (
                filtered.map(s => (
                  <button type="button" key={s.id}
                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-indigo-50 cursor-pointer transition group text-left"
                    onClick={() => { onSelect(s.id); setOpen(false); setStaffSearch('') }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {s.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{s.full_name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <AvailabilityBadge isAvailable={s.is_available} openTickets={s.open_tickets} activeTasks={s.active_tasks} />
                          <span className="text-xs text-gray-400">{s.open_tickets} open</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); onHistory(s); setOpen(false) }}
                      title="View ticket history"
                      className="text-gray-300 group-hover:text-indigo-400 hover:text-indigo-600 transition flex-shrink-0 ml-2"
                    >
                      <History size={14} />
                    </button>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Staff Ticket History Drawer ───────────────────────────────────────────────

function StaffTicketHistoryDrawer({ staff, onClose }: Readonly<{ staff: StaffAvail; onClose: () => void }>) {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const params: Record<string, string | number> = { assigned_to: staff.id, page, page_size: 20, ordering: '-created_at' }
  if (statusFilter !== 'all') params.status = statusFilter

  const { data: response, isLoading } = useQuery({
    queryKey: ['staff-ticket-history', staff.id, page, statusFilter],
    queryFn: () => apiClient.get(TICKETS.LIST, { params }).then(r => r.data),
  })

  const tickets: Ticket[] = useMemo(() => {
    if (!response) return []
    if (Array.isArray(response)) return response
    return (Array.isArray(response.data) ? response.data : null) ?? response.results ?? []
  }, [response])

  const totalCount: number = response?.meta?.pagination?.total ?? response?.count ?? tickets.length
  const totalPages = Math.max(1, Math.ceil(totalCount / 20))

  const initials = staff.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      <button type="button" className="fixed inset-0 bg-black/20 z-40 cursor-default" onClick={onClose} aria-label="Close drawer" />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-semibold">
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">{staff.full_name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <AvailabilityBadge isAvailable={staff.is_available} openTickets={staff.open_tickets} activeTasks={staff.active_tasks} />
                <span className="text-xs text-gray-400">{totalCount} ticket{totalCount === 1 ? '' : 's'} total</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition p-1 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 px-5 py-3 border-b border-gray-100 flex-wrap">
          {(['all', 'open', 'in_progress', 'resolved', 'closed'] as const).map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                statusFilter === s ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {s === 'all' ? 'All' : STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto">
          {(() => {
            if (isLoading) return (
              <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
                <Clock size={14} className="animate-spin" /> Loading…
              </div>
            )
            if (tickets.length === 0) return (
              <div className="py-12 text-center">
                <TicketIcon size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No {statusFilter === 'all' ? '' : statusFilter} tickets assigned</p>
              </div>
            )
            return (
            <div className="divide-y divide-gray-100">
              {tickets.map(ticket => (
                <a key={ticket.id} href={`/tickets/${ticket.id}`} target="_blank" rel="noreferrer"
                  className={`flex items-start gap-3 px-5 py-3.5 transition group ${ticket.status === 'closed' ? 'bg-rose-50 hover:bg-rose-100' : ticket.status === 'resolved' ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-indigo-500 font-medium">{ticket.ticket_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[ticket.priority] ?? ''}`}>
                        {ticket.priority}
                      </span>
                      {ticket.sla_breached && (
                        <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium">
                          <AlertCircle size={11} /> SLA
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1 font-medium line-clamp-1">{ticket.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {ticket.customer_name || '—'} · <DateDisplay adDate={ticket.created_at} compact />
                    </p>
                  </div>
                  <ChevronLeft size={14} className="text-gray-300 group-hover:text-indigo-400 rotate-180 flex-shrink-0 mt-1 transition" />
                </a>
              ))}
            </div>
          )})()
          }
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-400">Page {page} of {totalPages}</span>
            <div className="flex gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-40">
                <ChevronLeft size={13} />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-40">
                <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}



function SLABadge({ breached, deadline }: Readonly<{ breached: boolean; deadline: string | null }>) {
  if (!deadline) return null
  if (breached) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-red-600">
        <AlertCircle size={12} /> SLA Breached
      </span>
    )
  }
  const diff = new Date(deadline).getTime() - Date.now()
  const hours = Math.floor(diff / 3_600_000)
  if (hours <= 6) {
    return (
      <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
        <Clock size={12} /> {hours}h left
      </span>
    )
  }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TicketListPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { can, isManager } = usePermissions()
  const currentUser = useAuthStore((s) => s.user)
  const { fyYear } = useFyStore()
  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (urlParams.get('status') as StatusFilter) ?? 'all'
  )
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [staffFilter, setStaffFilter] = useState<number | null>(null)
  const [historyStaff, setHistoryStaff] = useState<StaffAvail | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [createdByFilter, setCreatedByFilter] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [partyName, setPartyName] = useState<string>('')
  const assignedToMe  = urlParams.get('assigned') === 'me'
  const slaBreached   = urlParams.get('sla_breached') === 'true'
  const deptFilter    = urlParams.get('department') ?? null
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever filters change
  const resetPage = () => setPage(1)

  // Staff availability — manager/admin only
  const { data: availability = [] } = useQuery<StaffAvail[]>({
    queryKey: ['staff', 'availability'],
    queryFn: () => apiClient.get(STAFF.AVAILABILITY).then(r => {
      const d = r.data
      return Array.isArray(d) ? d : d.data ?? d.results ?? []
    }),
    enabled: isManager,
    staleTime: 60_000,
  })

  const { data: ticketTypes = [] } = useQuery<TicketType[]>({
    queryKey: ['ticket-types-list'],
    queryFn: () => apiClient.get(TICKETS.TYPES).then(r => {
      const d = r.data; return Array.isArray(d) ? d : d.data ?? d.results ?? []
    }),
    staleTime: 300_000,
  })

  const { data: ticketCategories = [] } = useQuery<TicketCat[]>({
    queryKey: ['ticket-categories-list'],
    queryFn: () => apiClient.get(TICKETS.CATEGORIES).then(r => {
      const d = r.data; return Array.isArray(d) ? d : d.data ?? d.results ?? []
    }),
    staleTime: 300_000,
  })

  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = {
      page,
      page_size: PAGE_SIZE,
      ordering: '-created_at',
    }
    if (fyYear)                           p.fiscal_year   = fyYear
    if (statusFilter !== 'all')           p.status        = statusFilter
    if (priorityFilter !== 'all')         p.priority      = priorityFilter
    if (search.trim())                    p.search        = search.trim()
    if (assignedToMe && currentUser?.id)  p.assigned_to   = currentUser.id
    if (staffFilter)                      p.assigned_to   = staffFilter
    if (slaBreached)                      p.sla_breached  = 'true'
    if (deptFilter)                       p.department    = deptFilter
    if (typeFilter)                       p.ticket_type   = typeFilter
    if (categoryFilter)                   p.category      = categoryFilter
    if (createdByFilter)                  p.created_by    = createdByFilter
    if (dateFrom)                         p.date_from     = dateFrom
    if (dateTo)                           p.date_to       = dateTo
    if (partyName.trim())                 p.party_name    = partyName.trim()
    return p
  }, [page, fyYear, statusFilter, priorityFilter, search, assignedToMe, currentUser, slaBreached, deptFilter,
      typeFilter, categoryFilter, createdByFilter, dateFrom, dateTo, partyName])

  const { data: response, isLoading } = useQuery({
    queryKey: ['tickets', queryParams],
    queryFn: () =>
      apiClient.get(TICKETS.LIST, { params: queryParams }).then(r => r.data),
    placeholderData: (prev) => prev,
  })

  const tickets: Ticket[] = useMemo(() => {
    if (!response) return []
    if (Array.isArray(response)) return response
    // Backend wraps in { success, data: [...], meta: { pagination: { total, ... } } }
    return (Array.isArray(response.data) ? response.data : null) ?? response.results ?? []
  }, [response])

  const totalCount: number =
    response?.meta?.pagination?.total ?? response?.count ?? tickets.length
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // ── Stats ──────────────────────────────────────────────────────────────────
  // Stats come from the current page only — show counts based on what we know
  const stats = useMemo(() => ({
    total: totalCount,
    open: tickets.filter(t => t.status === 'open').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    breached: tickets.filter(t => t.sla_breached).length,
  }), [tickets, totalCount])

  // Staff / viewer see only their own tickets — redirect if no ?assigned=me
  // Must be after all hooks to respect React's rules of hooks.
  if (!isManager && !assignedToMe) {
    return <Navigate to="/tickets?assigned=me" replace />
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TicketIcon className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {assignedToMe ? 'My Tickets' : 'Tickets'}
            </h1>
            <p className="text-xs text-gray-400">
              {assignedToMe ? `${stats.total} assigned to me` : `${stats.total} total`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {can('can_manage_ticket_types') && (
            <Link
              to="/tickets/settings"
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 border border-slate-300 bg-white rounded-lg hover:bg-slate-50 transition"
            >
              <Settings2 size={14} /> Settings
            </Link>
          )}
          {can('can_create_tickets') && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus size={15} /> New Ticket
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, icon: TicketIcon, color: 'text-indigo-500', bg: 'bg-indigo-50' },
          { label: 'Open', value: stats.open, icon: CircleDot, color: 'text-blue-500', bg: 'bg-blue-50' },
          { label: 'In Progress', value: stats.inProgress, icon: Clock, color: 'text-indigo-400', bg: 'bg-indigo-50' },
          { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
          { label: 'SLA Breached', value: stats.breached, icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center flex-shrink-0`}>
              <s.icon size={17} className={s.color} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Staff filter panel — manager/admin only */}
      {isManager && availability.length > 0 && (
        <StaffFilterPanel
          availability={availability}
          staffFilter={staffFilter}
          onSelect={id => { setStaffFilter(id); resetPage() }}
          onHistory={s => setHistoryStaff(s)}
        />
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tickets…"
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
            className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
          />
        </div>

        {/* Status chips */}
        <div className="flex items-center gap-1">
          <Filter size={13} className="text-gray-400" />
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            {(['all', 'open', 'in_progress', 'pending_customer', 'resolved', 'closed'] as StatusFilter[]).map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); resetPage() }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Priority chips */}
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {PRIORITY_FILTERS.map(p => (
            <button
              key={p}
              onClick={() => { setPriorityFilter(p); resetPage() }}
              className={`px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                priorityFilter === p
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced filters row */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Ticket Type */}
        <select
          value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); resetPage() }}
          className={`py-2 pl-3 pr-8 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${
            typeFilter ? 'border-indigo-400 text-indigo-700 font-medium' : 'border-gray-300 text-gray-600'
          }`}
        >
          <option value="">All Types</option>
          {ticketTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        {/* Category */}
        <select
          value={categoryFilter}
          onChange={e => { setCategoryFilter(e.target.value); resetPage() }}
          className={`py-2 pl-3 pr-8 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${
            categoryFilter ? 'border-indigo-400 text-indigo-700 font-medium' : 'border-gray-300 text-gray-600'
          }`}
        >
          <option value="">All Categories</option>
          {ticketCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {/* Party Name */}
        <div className="relative">
          <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Party name…"
            value={partyName}
            onChange={e => { setPartyName(e.target.value); resetPage() }}
            className={`pl-8 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-44 ${
              partyName ? 'border-indigo-400' : 'border-gray-300'
            }`}
          />
        </div>

        {/* Created By */}
        {isManager && availability.length > 0 && (
          <select
            value={createdByFilter}
            onChange={e => { setCreatedByFilter(e.target.value); resetPage() }}
            className={`py-2 pl-3 pr-8 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${
              createdByFilter ? 'border-indigo-400 text-indigo-700 font-medium' : 'border-gray-300 text-gray-600'
            }`}
          >
            <option value="">Created By</option>
            {availability.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        )}

        {/* From Date */}
        <div className="relative">
          <CalendarDays size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); resetPage() }}
            placeholder="From date"
            className={`pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40 ${
              dateFrom ? 'border-indigo-400' : 'border-gray-300'
            }`}
          />
        </div>

        {/* To Date */}
        <div className="relative">
          <CalendarDays size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); resetPage() }}
            placeholder="To date"
            className={`pl-8 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-40 ${
              dateTo ? 'border-indigo-400' : 'border-gray-300'
            }`}
          />
        </div>

        {/* Clear advanced filters */}
        {(typeFilter || categoryFilter || partyName || createdByFilter || dateFrom || dateTo) && (
          <button
            onClick={() => { setTypeFilter(''); setCategoryFilter(''); setPartyName(''); setCreatedByFilter(''); setDateFrom(''); setDateTo(''); resetPage() }}
            className="flex items-center gap-1 px-3 py-2 text-xs text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 w-32">Ticket #</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">SLA</th>
              <th className="px-4 py-3">Created</th>

            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  Loading tickets…
                </td>
              </tr>
            )}
            {!isLoading && tickets.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  {search || statusFilter !== 'all' || priorityFilter !== 'all' || typeFilter || categoryFilter || partyName || createdByFilter || dateFrom || dateTo
                    ? 'No tickets match your filters.'
                    : 'No tickets yet. Create one to get started.'}
                </td>
              </tr>
            )}
            {tickets.map(ticket => (
              <tr
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className={`transition-colors cursor-pointer ${ticket.status === 'closed' ? 'bg-rose-50 hover:bg-rose-100' : ticket.status === 'resolved' ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-indigo-50'}`}
              >
                <td className="px-4 py-3.5 font-mono text-indigo-600 font-medium text-xs">
                  {ticket.ticket_number}
                </td>
                <td className="px-4 py-3.5 max-w-xs">
                  <span className="font-medium text-gray-900 line-clamp-1">{ticket.title}</span>
                </td>
                <td className="px-4 py-3.5 text-gray-600">
                  {ticket.customer_name || '—'}
                </td>
                <td className="px-4 py-3.5 text-gray-500">
                  {ticket.ticket_type_name || '—'}
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_COLORS[ticket.priority] ?? ''}`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status] ?? ''}`}>
                    {STATUS_LABELS[ticket.status] ?? ticket.status}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-gray-500 text-xs">
                  {ticket.assigned_to_name || <span className="text-gray-300">Unassigned</span>}
                </td>
                <td className="px-4 py-3.5">
                  <SLABadge breached={ticket.sla_breached} deadline={ticket.sla_deadline} />
                </td>
                <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                  <DateDisplay adDate={ticket.created_at} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-3 py-1 text-xs font-medium text-gray-700">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-300 text-gray-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Staff ticket history drawer */}
      {historyStaff && (
        <StaffTicketHistoryDrawer staff={historyStaff} onClose={() => setHistoryStaff(null)} />
      )}

      {/* Create wizard */}
      <CreateTicketWizard
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ['tickets'] })
          setShowCreate(false)
        }}
      />
    </div>
  )
}
