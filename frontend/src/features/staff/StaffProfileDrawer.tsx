import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  X, AlertCircle, Clock, ChevronLeft, ChevronRight,
  Ticket as TicketIcon, Coins, ArrowRightLeft,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TICKETS, ACCOUNTING } from '../../api/endpoints'
import AvailabilityBadge from '../../components/AvailabilityBadge'
import DateDisplay from '../../components/DateDisplay'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StaffMembership {
  role: string
  custom_role_name: string | null
  department_name: string
  employee_id: string
  staff_number: string
  join_date: string | null
  is_admin: boolean
  is_active: boolean
}

export interface StaffForProfile {
  id: number
  email: string
  full_name: string
  avatar: string
  date_joined: string
  membership: StaffMembership | null
}

interface Avail {
  is_available: boolean
  open_tickets: number
  active_tasks: number
}

interface TicketRow {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  customer_name: string
  sla_breached: boolean
  sla_deadline: string | null
  created_at: string
}

interface CoinTx {
  id: number
  amount: string
  status: string
  source_type: string
  note: string
  created_at: string
  ticket_number?: string | null
}

interface CoinsPayload {
  total_approved_coins: string
  total_approved_value: string
  total_pending_coins: string
  coin_rate: string
  transactions: CoinTx[]
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

const COIN_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

const SOURCE_LABELS: Record<string, string> = {
  ticket_close: 'Ticket Closed',
  manual: 'Manual Award',
  task_complete: 'Task Completed',
  project_complete: 'Project Completed',
}

// ── Role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role, customRoleName }: Readonly<{ role: string; customRoleName?: string | null }>) {
  if (customRoleName) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">{customRoleName}</span>
  }
  const cls: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-indigo-100 text-indigo-700',
    manager: 'bg-blue-100 text-blue-700',
    staff: 'bg-gray-100 text-gray-600',
    viewer: 'bg-gray-50 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'indigo' }: Readonly<{
  label: string
  value: string | number
  sub?: string
  color?: 'indigo' | 'green' | 'amber' | 'blue'
}>) {
  const ring: Record<string, string> = {
    indigo: 'bg-indigo-50 border-indigo-100',
    green: 'bg-green-50 border-green-100',
    amber: 'bg-amber-50 border-amber-100',
    blue: 'bg-blue-50 border-blue-100',
  }
  const text: Record<string, string> = {
    indigo: 'text-indigo-700',
    green: 'text-green-700',
    amber: 'text-amber-700',
    blue: 'text-blue-700',
  }
  return (
    <div className={`flex-1 rounded-xl border p-3 ${ring[color]}`}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold ${text[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Tickets Tab ───────────────────────────────────────────────────────────────

function TicketsTab({ staffId }: Readonly<{ staffId: number }>) {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const PAGE_SIZE = 20

  const params = useMemo(() => {
    const p: Record<string, string | number> = {
      assigned_to: staffId,
      page,
      page_size: PAGE_SIZE,
      ordering: '-created_at',
    }
    if (statusFilter !== 'all') p.status = statusFilter
    return p
  }, [staffId, page, statusFilter])

  const { data: response, isLoading } = useQuery({
    queryKey: ['staff-profile-tickets', staffId, page, statusFilter],
    queryFn: () => apiClient.get(TICKETS.LIST, { params }).then(r => r.data),
  })

  const tickets: TicketRow[] = useMemo(() => {
    if (!response) return []
    if (Array.isArray(response)) return response
    return (response.data && Array.isArray(response.data) ? response.data : null)
      ?? response.results ?? []
  }, [response])

  const total: number = response?.meta?.pagination?.total ?? response?.count ?? tickets.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statuses = ['all', 'open', 'in_progress', 'resolved', 'closed', 'cancelled'] as const

  return (
    <div className="flex flex-col h-full">
      {/* Status chips */}
      <div className="flex gap-1 px-5 py-3 border-b border-gray-100 flex-wrap flex-shrink-0">
        {statuses.map(s => (
          <button key={s} type="button"
            onClick={() => { setStatusFilter(s); setPage(1) }}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              statusFilter === s ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {s === 'all' ? 'All' : STATUS_LABELS[s] ?? s}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <Clock size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && tickets.length === 0 && (
          <div className="py-12 text-center">
            <TicketIcon size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              No {statusFilter === 'all' ? '' : (STATUS_LABELS[statusFilter] ?? statusFilter).toLowerCase()} tickets
            </p>
          </div>
        )}
        {tickets.map(t => (
          <a key={t.id} href={`/tickets/${t.id}`} target="_blank" rel="noreferrer"
            className="flex items-start gap-3 px-5 py-3.5 hover:bg-gray-50 transition group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs text-indigo-500 font-medium">{t.ticket_number}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${PRIORITY_COLORS[t.priority] ?? ''}`}>
                  {t.priority}
                </span>
                {t.sla_breached && (
                  <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium">
                    <AlertCircle size={11} /> SLA
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-800 mt-1 font-medium line-clamp-2">{t.title}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {t.customer_name || '—'} · <DateDisplay adDate={t.created_at} compact />
              </p>
            </div>
            <ChevronLeft size={14} className="text-gray-300 group-hover:text-indigo-400 rotate-180 flex-shrink-0 mt-1 transition" />
          </a>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <span className="text-xs text-gray-400">Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-40">
              <ChevronLeft size={13} />
            </button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-40">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Coins Tab ─────────────────────────────────────────────────────────────────

function CoinsTab({ staffId }: Readonly<{ staffId: number }>) {
  const [coinFilter, setCoinFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')

  const { data, isLoading } = useQuery<CoinsPayload>({
    queryKey: ['staff-profile-coins', staffId],
    queryFn: () => apiClient.get(ACCOUNTING.COINS_STAFF_HISTORY(staffId)).then(r => {
      const d = r.data
      return d.data ?? d
    }),
    staleTime: 30_000,
  })

  const transactions = useMemo(() => {
    if (!data?.transactions) return []
    if (coinFilter === 'all') return data.transactions
    return data.transactions.filter(t => t.status === coinFilter)
  }, [data, coinFilter])

  const approvedCoins = Number.parseFloat(data?.total_approved_coins ?? '0')
  const pendingCoins  = Number.parseFloat(data?.total_pending_coins ?? '0')
  const approvedNpr   = Number.parseFloat(data?.total_approved_value ?? '0')
  const coinRate      = Number.parseFloat(data?.coin_rate ?? '0')

  const filters = ['all', 'pending', 'approved', 'rejected'] as const

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
        <Clock size={14} className="animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Totals */}
      <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Approved</p>
            <p className="text-lg font-bold text-green-700">{approvedCoins.toLocaleString()}</p>
            <p className="text-xs text-green-600 font-medium">NPR {approvedNpr.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Pending</p>
            <p className="text-lg font-bold text-yellow-700">{pendingCoins.toLocaleString()}</p>
            <p className="text-xs text-yellow-600 font-medium">awaiting approval</p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
            <p className="text-xs text-gray-500 mb-0.5">Rate</p>
            <p className="text-lg font-bold text-indigo-700">1</p>
            <p className="text-xs text-indigo-600 font-medium">= NPR {coinRate}</p>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1 px-5 py-3 border-b border-gray-100 flex-shrink-0">
        {filters.map(f => (
          <button key={f} type="button"
            onClick={() => setCoinFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition capitalize ${
              coinFilter === f ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}>
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {transactions.length === 0 && (
          <div className="py-12 text-center">
            <Coins size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No {coinFilter === 'all' ? '' : coinFilter} coin transactions</p>
          </div>
        )}
        {transactions.map(tx => (
          <div key={tx.id} className="flex items-center gap-3 px-5 py-3.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${COIN_STATUS_COLORS[tx.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                </span>
                <span className="text-xs text-gray-500 capitalize">
                  {SOURCE_LABELS[tx.source_type] ?? tx.source_type}
                </span>
                {tx.ticket_number && (
                  <span className="font-mono text-xs text-indigo-500">{tx.ticket_number}</span>
                )}
              </div>
              {tx.note && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{tx.note}</p>}
              <p className="text-xs text-gray-400 mt-0.5">
                <DateDisplay adDate={tx.created_at} compact />
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              {(() => {
                let cls = 'text-gray-400'
                if (tx.status === 'approved') cls = 'text-green-700'
                else if (tx.status === 'pending') cls = 'text-yellow-700'
                return (
                  <p className={`text-sm font-bold ${cls}`}>
                    +{Number.parseFloat(tx.amount).toLocaleString()}
                  </p>
                )
              })()}
              <p className="text-xs text-gray-400">coins</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Transfers Tab ─────────────────────────────────────────────────────────────

function TransfersTab({ staffId }: Readonly<{ staffId: number }>) {
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const { data: response, isLoading } = useQuery({
    queryKey: ['staff-profile-transfers', staffId, page],
    queryFn: () =>
      apiClient.get(TICKETS.TRANSFERS, { params: { transferred_by: staffId, page, page_size: PAGE_SIZE, ordering: '-created_at' } })
        .then(r => r.data),
  })

  interface TransferRow {
    id: number
    ticket_number: string
    ticket_title?: string
    from_department_name: string
    to_department_name: string
    reason?: string
    transferred_at: string
  }

  const transfers: TransferRow[] = useMemo(() => {
    if (!response) return []
    if (Array.isArray(response)) return response
    return (response.data && Array.isArray(response.data) ? response.data : null)
      ?? response.results ?? []
  }, [response])

  const total: number = response?.meta?.pagination?.total ?? response?.count ?? transfers.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm gap-2">
            <Clock size={14} className="animate-spin" /> Loading…
          </div>
        )}
        {!isLoading && transfers.length === 0 && (
          <div className="py-12 text-center">
            <ArrowRightLeft size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No transfers by this staff member</p>
          </div>
        )}
        {transfers.map(t => (
          <div key={t.id} className="px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-indigo-500 font-medium">{t.ticket_number}</span>
              <span className="text-xs text-gray-400">
                {t.from_department_name} <ArrowRightLeft size={10} className="inline mx-0.5" /> {t.to_department_name}
              </span>
            </div>
            {t.ticket_title && <p className="text-sm text-gray-800 mt-1 line-clamp-1">{t.ticket_title}</p>}
            {t.reason && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{t.reason}</p>}
            <p className="text-xs text-gray-400 mt-1">
              <DateDisplay adDate={t.transferred_at} compact />
            </p>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50 flex-shrink-0">
          <span className="text-xs text-gray-400">Page {page} of {totalPages} · {total} total</span>
          <div className="flex gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-40">
              <ChevronLeft size={13} />
            </button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded border border-gray-200 text-gray-500 hover:bg-white disabled:opacity-40">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

type ActiveTab = 'tickets' | 'coins' | 'transfers'

export default function StaffProfileDrawer({ staff, avail, onClose }: Readonly<{
  staff: StaffForProfile
  avail?: Avail
  onClose: () => void
}>) {
  const [tab, setTab] = useState<ActiveTab>('tickets')

  const initials = (staff.full_name || staff.email)
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  const isInactive = staff.membership?.is_active === false

  // Quick ticket stats from availability data
  const openCount    = avail?.open_tickets ?? 0
  const activeCount  = avail?.active_tasks ?? 0

  // Fetch coins totals for the stat row
  const { data: coinsPayload } = useQuery<CoinsPayload>({
    queryKey: ['staff-profile-coins', staff.id],
    queryFn: () => apiClient.get(ACCOUNTING.COINS_STAFF_HISTORY(staff.id)).then(r => {
      const d = r.data
      return d.data ?? d
    }),
    staleTime: 30_000,
  })

  const approvedNpr = Number.parseFloat(coinsPayload?.total_approved_value ?? '0')
  const approvedCoins = Number.parseFloat(coinsPayload?.total_approved_coins ?? '0')

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'tickets',   label: 'Tickets',   icon: <TicketIcon size={13} /> },
    { id: 'coins',     label: 'Coins',     icon: <Coins size={13} /> },
    { id: 'transfers', label: 'Transfers', icon: <ArrowRightLeft size={13} /> },
  ]

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        className="fixed inset-0 bg-black/25 z-40 cursor-default"
        onClick={onClose}
        aria-label="Close staff profile"
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {staff.avatar
              ? <img src={staff.avatar} className="w-12 h-12 rounded-full object-cover flex-shrink-0" alt="" />
              : (
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  isInactive ? 'bg-gray-200 text-gray-400' : 'bg-indigo-100 text-indigo-600'
                }`}>
                  {initials}
                </div>
              )
            }
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900 text-base leading-tight">{staff.full_name || '—'}</p>
                {isInactive && (
                  <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-500 rounded-full font-medium">Inactive</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{staff.email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {staff.membership && (
                  <RoleBadge role={staff.membership.role} customRoleName={staff.membership.custom_role_name} />
                )}
                {staff.membership?.is_admin && (
                  <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full font-medium">Admin</span>
                )}
                {staff.membership?.department_name && (
                  <span className="text-xs text-gray-500">{staff.membership.department_name}</span>
                )}
                {avail && (
                  <AvailabilityBadge
                    isAvailable={avail.is_available}
                    openTickets={avail.open_tickets}
                    activeTasks={avail.active_tasks}
                  />
                )}
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition p-1.5 rounded-lg flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* ── Staff meta row ── */}
        <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex-shrink-0 text-xs text-gray-500 flex-wrap">
          {staff.membership?.staff_number && (
            <span className="font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              {staff.membership.staff_number}
            </span>
          )}
          {staff.membership?.employee_id && (
            <span>ID: <span className="font-medium text-gray-700">{staff.membership.employee_id}</span></span>
          )}
          {(staff.membership?.join_date ?? staff.date_joined) && (
            <span>Joined: <DateDisplay adDate={staff.membership?.join_date ?? staff.date_joined} compact /></span>
          )}
        </div>

        {/* ── Quick stats ── */}
        <div className="flex gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <StatCard
            label="Open Tickets"
            value={openCount}
            color="blue"
          />
          <StatCard
            label="Active Tasks"
            value={activeCount}
            color="indigo"
          />
          <StatCard
            label="Coins Earned"
            value={approvedCoins.toLocaleString()}
            sub={approvedCoins > 0 ? `NPR ${approvedNpr.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : undefined}
            color="green"
          />
          <StatCard
            label="Approved ✓"
            value={`NPR ${approvedNpr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
            color="amber"
          />
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-0.5 px-5 py-2 border-b border-gray-100 flex-shrink-0 bg-white">
          {tabs.map(t => (
            <button key={t.id} type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab content ── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'tickets'   && <TicketsTab staffId={staff.id} />}
          {tab === 'coins'     && <CoinsTab staffId={staff.id} />}
          {tab === 'transfers' && <TransfersTab staffId={staff.id} />}
        </div>
      </div>
    </>
  )
}
