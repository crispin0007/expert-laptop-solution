import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import {
  Ticket as TicketIcon, Plus, Search, Filter, AlertCircle,
  Clock, CheckCircle2, CircleDot, Settings2,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS } from '../../api/endpoints'
import CreateTicketWizard from './CreateTicketWizard'
import { usePermissions } from '../../hooks/usePermissions'
import DateDisplay from '../../components/DateDisplay'
import { useFyStore } from '../../store/fyStore'

const PAGE_SIZE = 25

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ticket {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  ticket_type_name: string
  customer_name: string
  department_name: string
  assigned_to?: number | null
  assigned_to_name: string
  sla_breached: boolean
  sla_deadline: string | null
  created_at: string
}

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



function SLABadge({ breached, deadline }: { breached: boolean; deadline: string | null }) {
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

  const { can } = usePermissions()
  const currentUser = useAuthStore((s) => s.user)
  const { fyYear } = useFyStore()
  const [urlParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    (urlParams.get('status') as StatusFilter) ?? 'all'
  )
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const assignedToMe = urlParams.get('assigned') === 'me'
  const [showCreate, setShowCreate] = useState(false)
  const [page, setPage] = useState(1)

  // Reset to page 1 whenever filters change
  const resetPage = () => setPage(1)

  const queryParams = useMemo(() => {
    const p: Record<string, string | number> = {
      page,
      page_size: PAGE_SIZE,
      ordering: '-created_at',
    }
    if (fyYear)                           p.fiscal_year  = fyYear
    if (statusFilter !== 'all')           p.status       = statusFilter
    if (priorityFilter !== 'all')         p.priority     = priorityFilter
    if (search.trim())                    p.search       = search.trim()
    if (assignedToMe && currentUser?.id)  p.assigned_to  = currentUser.id
    return p
  }, [page, fyYear, statusFilter, priorityFilter, search, assignedToMe, currentUser])

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
                  {search || statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'No tickets match your filters.'
                    : 'No tickets yet. Create one to get started.'}
                </td>
              </tr>
            )}
            {tickets.map(ticket => (
              <tr
                key={ticket.id}
                onClick={() => navigate(`/tickets/${ticket.id}`)}
                className="hover:bg-indigo-50 transition-colors cursor-pointer"
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
