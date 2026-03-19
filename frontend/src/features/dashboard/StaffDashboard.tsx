/**
 * StaffDashboard — personal workspace view for staff / viewer / custom roles.
 * KPIs: my open tickets, my in-progress, my overdue tasks, coins this period
 * Lists: my assigned tickets (sorted by SLA), dept unassigned queue, coin history
 */

import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { DASHBOARD, TICKETS, ACCOUNTING } from '../../api/endpoints'
import { useAuthStore } from '../../store/authStore'
import { usePermissions } from '../../hooks/usePermissions'
import { useModules } from '../../hooks/useModules'
import DateDisplay from '../../components/DateDisplay'
import {
  Ticket as TicketIcon, Coins, AlertTriangle,
  Clock, CheckCircle2, CircleDot, ArrowRight,
  CalendarClock, InboxIcon,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketRow {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  customer_name: string
  sla_breached: boolean
  sla_deadline: string | null
}

interface CoinEntry {
  id: number
  coins: number
  status: string
  created_at: string
  ticket_number?: string
}

interface DashboardStats {
  my_open_tickets: number
  my_in_progress_tickets: number
  my_overdue_tasks: number
  my_coins_pending: number
  my_coins_approved: number
  sla_breached: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toArray<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    if ('results' in data) return (data as { results: T[] }).results
    if ('data' in data) return (data as { data: T[] }).data
  }
  return []
}

function fmtNum(n: number | undefined): string {
  if (n === undefined || n === null) return '–'
  return n.toLocaleString()
}

const PRIORITY_CHIP: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-500',
}

const COIN_STATUS_CHIP: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiProps {
  label: string
  value: string | number
  icon: React.ReactNode
  accent: string
  sub?: string
}

function KpiCard({ label, value, icon, accent, sub }: KpiProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 shadow-sm`}>
      <div className={`p-2 rounded-lg ${accent}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function StaffDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const perms = usePermissions()
  const modules = useModules()

  const userId   = user?.id ?? 0
  const deptId   = user?.membership?.department ?? null
  const deptName = user?.membership?.department_name ?? null

  const canViewTickets     = modules.has('tickets') && perms.can('can_view_tickets')
  const canViewAccounting  = modules.has('accounting') && perms.can('can_view_accounting')

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: statsRaw } = useQuery({
    queryKey: ['dash-staff-stats'],
    queryFn: () => apiClient.get(DASHBOARD.STATS).then(r => r.data),
    refetchInterval: 60_000,
  })

  const stats: DashboardStats | null = useMemo(() => {
    if (!statsRaw) return null
    const d = statsRaw?.data ?? statsRaw
    return d
  }, [statsRaw])

  // My assigned open/in-progress tickets
  const { data: myTicketsData } = useQuery({
    queryKey: ['dash-staff-my-tickets', userId],
    queryFn: () =>
      apiClient
        .get(TICKETS.LIST, { params: { assigned_to: userId, status: 'open,in_progress', page_size: 15, ordering: 'sla_deadline' } })
        .then(r => r.data),
    enabled: canViewTickets && !!userId,
  })

  // Dept unassigned queue — only if user belongs to a department
  const { data: unassignedData } = useQuery({
    queryKey: ['dash-staff-unassigned', deptId],
    queryFn: () =>
      apiClient
        .get(TICKETS.LIST, { params: { department: deptId, status: 'open', page_size: 20 } })
        .then(r => r.data),
    enabled: canViewTickets && !!deptId,
  })

  // Coin history for this user
  const { data: coinsData } = useQuery({
    queryKey: ['dash-staff-coins', userId],
    queryFn: () =>
      apiClient.get(ACCOUNTING.COINS_STAFF_HISTORY(userId)).then(r => r.data),
    enabled: canViewAccounting && !!userId,
  })

  // ── Derived data ─────────────────────────────────────────────────────────────

  const myTickets = useMemo(() => toArray<TicketRow>(myTicketsData), [myTicketsData])
  const allDeptTickets = useMemo(() => toArray<TicketRow>(unassignedData), [unassignedData])
  // Filter unassigned from dept tickets on the frontend (no backend null-filter param)
  const unassigned = useMemo(
    () => allDeptTickets.filter((t: any) => !t.assigned_to && !t.assigned_to_id),
    [allDeptTickets],
  )
  const coinHistory = useMemo(() => toArray<CoinEntry>(coinsData).slice(0, 8), [coinsData])

  const hasSlaBreached = (stats?.sla_breached ?? 0) > 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* SLA breach alert */}
      {hasSlaBreached && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            You have <strong>{fmtNum(stats?.sla_breached)}</strong> SLA-breached ticket
            {(stats?.sla_breached ?? 0) !== 1 ? 's' : ''} that need immediate attention.
          </span>
          <button
            onClick={() => navigate('/tickets?sla_breached=true&assigned_to=me')}
            className="ml-auto text-red-600 font-medium hover:underline whitespace-nowrap"
          >
            View all →
          </button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="My Open Tickets"
          value={fmtNum(stats?.my_open_tickets)}
          icon={<TicketIcon className="w-4 h-4 text-blue-600" />}
          accent="bg-blue-50"
        />
        <KpiCard
          label="In Progress"
          value={fmtNum(stats?.my_in_progress_tickets)}
          icon={<CircleDot className="w-4 h-4 text-indigo-600" />}
          accent="bg-indigo-50"
        />
        <KpiCard
          label="Overdue Tasks"
          value={fmtNum(stats?.my_overdue_tasks)}
          icon={<CalendarClock className="w-4 h-4 text-orange-600" />}
          accent="bg-orange-50"
        />
        {canViewAccounting ? (
          <KpiCard
            label="Coins (Pending)"
            value={fmtNum(stats?.my_coins_pending)}
            icon={<Coins className="w-4 h-4 text-yellow-600" />}
            accent="bg-yellow-50"
            sub={`${fmtNum(stats?.my_coins_approved)} approved`}
          />
        ) : (
          <KpiCard
            label="My SLA Breached"
            value={fmtNum(stats?.sla_breached)}
            icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
            accent="bg-red-50"
          />
        )}
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* My tickets — 2/3 */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <TicketIcon className="w-4 h-4 text-blue-500" />
              My Active Tickets
            </h3>
            <Link
              to="/tickets?assigned_to=me"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {myTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-sm gap-2">
              <CheckCircle2 className="w-8 h-8 text-green-300" />
              <span>No active tickets assigned to you.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-2 text-left">Ticket</th>
                    <th className="px-4 py-2 text-left">Customer</th>
                    <th className="px-4 py-2 text-left">Priority</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {myTickets.map(t => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className={`hover:bg-gray-50 cursor-pointer transition-colors ${t.sla_breached ? 'bg-red-50/40' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {t.sla_breached && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                          <span className="font-medium text-gray-900">{t.ticket_number}</span>
                        </div>
                        <p className="text-xs text-gray-500 truncate max-w-[180px]">{t.title}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 text-xs">{t.customer_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_CHIP[t.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs capitalize">{t.status.replace('_', ' ')}</td>
                      <td className="px-4 py-2.5">
                        {t.sla_deadline ? (
                          <span className={`text-xs ${t.sla_breached ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            <DateDisplay dateString={t.sla_deadline} showTime />
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">–</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right panel — 1/3 */}
        <div className="space-y-4">

          {/* Dept unassigned queue */}
          {canViewTickets && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <InboxIcon className="w-4 h-4 text-gray-400" />
                  Dept. Unassigned
                  {deptName && <span className="text-xs text-gray-400 font-normal">({deptName})</span>}
                </h4>
                {unassigned.length > 0 && (
                  <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    {unassigned.length}
                  </span>
                )}
              </div>

              {!deptId ? (
                <p className="px-4 py-4 text-xs text-gray-400 italic">
                  You are not assigned to a department.
                </p>
              ) : unassigned.length === 0 ? (
                <p className="px-4 py-4 text-xs text-gray-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                  No unassigned tickets in your department.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {unassigned.slice(0, 6).map(t => (
                    <li key={t.id}>
                      <Link
                        to={`/tickets/${t.id}`}
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${t.sla_breached ? 'bg-red-500' : 'bg-orange-400'}`} />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{t.ticket_number} — {t.title}</p>
                          <p className="text-xs text-gray-400">{t.customer_name}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Coin history */}
          {canViewAccounting && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  My Coins
                </h4>
                <div className="flex gap-2 text-xs">
                  <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full">
                    {fmtNum(stats?.my_coins_pending)} pending
                  </span>
                  <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full">
                    {fmtNum(stats?.my_coins_approved)} approved
                  </span>
                </div>
              </div>

              {coinHistory.length === 0 ? (
                <p className="px-4 py-4 text-xs text-gray-400 italic">No coin transactions yet.</p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {coinHistory.map(c => (
                    <li key={c.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                          <span className="text-xs text-gray-500">
                            <DateDisplay dateString={c.created_at} />
                          </span>
                        </div>
                        {c.ticket_number && (
                          <p className="text-xs text-gray-400 pl-5">{c.ticket_number}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-gray-800">+{c.coins}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${COIN_STATUS_CHIP[c.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {c.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
