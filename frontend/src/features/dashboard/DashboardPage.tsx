import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { DASHBOARD, TICKETS, PROJECTS, ACCOUNTING } from '../../api/endpoints'
import { usePermissions } from '../../hooks/usePermissions'
import { useModules } from '../../hooks/useModules'
import {
  Ticket as TicketIcon, FolderKanban, Coins, AlertTriangle,
  Clock, CheckCircle2, CircleDot, ArrowRight, Plus,
  TrendingUp, ShieldAlert,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TicketRow {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  customer_name: string
  assigned_to_name: string
  sla_breached: boolean
}

interface ProjectRow {
  id: number
  name: string
  status: string
}

interface CoinRow {
  id: number
  staff_name: string
  coins: number
  status: string
}

interface DashboardStats {
  open_tickets: number
  in_progress_tickets: number
  sla_breached: number
  sla_warning: number
  active_projects: number
  pending_coins: number
  revenue_this_month: string
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

const PRIORITY_CHIP: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-500',
}

const STATUS_CHIP: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-indigo-100 text-indigo-700',
  pending_customer: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-600',
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', pending_customer: 'Pending',
  resolved: 'Resolved', closed: 'Closed', cancelled: 'Cancelled',
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, iconBg, iconColor, alert,
}: {
  label: string
  value: number | string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  alert?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 flex items-center gap-4 ${
      alert ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
    }`}>
      <div className={`w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const perms = usePermissions()
  const modules = useModules()

  // ── Aggregated KPI stats (single request) ────────────────────────────────
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient.get(DASHBOARD.STATS).then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  // ── Full list data (needed for table/list rendering) ─────────────────────
  const { data: openData } = useQuery({
    queryKey: ['tickets', 'open'],
    queryFn: () => apiClient.get(TICKETS.LIST, { params: { status: 'open' } }).then(r => r.data),
    enabled: modules.has('tickets') && perms.can('can_view_tickets'),
  })

  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'active'],
    queryFn: () => apiClient.get(PROJECTS.LIST, { params: { status: 'active' } }).then(r => r.data),
    enabled: modules.has('projects') && perms.can('can_view_projects'),
  })

  const { data: coinsData } = useQuery({
    queryKey: ['coins', 'pending'],
    queryFn: () => apiClient.get(ACCOUNTING.COINS, { params: { status: 'pending' } }).then(r => r.data),
    enabled: modules.has('accounting') && perms.can('can_approve_coins'),
  })

  // ── Derived ──────────────────────────────────────────────────────────────
  const openTickets    = useMemo(() => toArray<TicketRow>(openData), [openData])
  const activeProjects = useMemo(() => toArray<ProjectRow>(projectsData), [projectsData])
  const pendingCoins   = useMemo(() => toArray<CoinRow>(coinsData), [coinsData])

  // Counts from stats endpoint (fast, single request) or fall back to list length
  const openCount       = stats?.open_tickets     ?? openTickets.length
  const inProgressCount = stats?.in_progress_tickets ?? 0
  const breachedCount   = stats?.sla_breached     ?? 0
  const warningCount    = stats?.sla_warning       ?? 0
  const projectCount    = stats?.active_projects   ?? activeProjects.length
  const pendingCount    = stats?.pending_coins     ?? pendingCoins.length

  const revenueRaw      = parseFloat(stats?.revenue_this_month ?? '0')
  const revenueDisplay  = revenueRaw.toLocaleString('en-NP', { maximumFractionDigits: 0 })

  const showTickets  = modules.has('tickets') && perms.can('can_view_tickets')
  const showProjects = modules.has('projects') && perms.can('can_view_projects')
  const showCoins    = modules.has('accounting') && perms.can('can_approve_coins')
  const showAccounting = modules.has('accounting') && perms.can('can_view_accounting')

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {showTickets && perms.can('can_create_tickets') && (
          <button
            onClick={() => navigate('/tickets')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus size={15} /> New Ticket
          </button>
        )}
      </div>

      {/* ── SLA breach alert banner ─────────────────────────────────────── */}
      {showTickets && (breachedCount > 0 || warningCount > 0) && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm font-semibold text-red-700">
            {breachedCount > 0 && (
              <>{breachedCount} ticket{breachedCount !== 1 ? 's' : ''} breached SLA. </>
            )}
            {warningCount > 0 && (
              <span className="text-orange-600">{warningCount} approaching breach.</span>
            )}
          </p>
          <Link
            to="/tickets"
            className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 whitespace-nowrap"
          >
            View tickets <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {showTickets && (
          <>
            <StatCard
              label="Open Tickets"
              value={openCount}
              icon={CircleDot}
              iconBg="bg-blue-50"
              iconColor="text-blue-500"
            />
            <StatCard
              label="In Progress"
              value={inProgressCount}
              icon={Clock}
              iconBg="bg-indigo-50"
              iconColor="text-indigo-500"
            />
            <StatCard
              label="SLA Breached"
              value={breachedCount}
              icon={AlertTriangle}
              iconBg={breachedCount > 0 ? 'bg-red-50' : 'bg-gray-50'}
              iconColor={breachedCount > 0 ? 'text-red-500' : 'text-gray-400'}
              alert={breachedCount > 0}
            />
            <StatCard
              label="SLA Warning"
              value={warningCount}
              icon={ShieldAlert}
              iconBg={warningCount > 0 ? 'bg-orange-50' : 'bg-gray-50'}
              iconColor={warningCount > 0 ? 'text-orange-500' : 'text-gray-400'}
              alert={warningCount > 0}
            />
          </>
        )}
        {showProjects && (
          <StatCard
            label="Active Projects"
            value={projectCount}
            icon={FolderKanban}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-500"
          />
        )}
        {showAccounting && (
          <StatCard
            label="Revenue This Month"
            value={`Rs. ${revenueDisplay}`}
            icon={TrendingUp}
            iconBg="bg-teal-50"
            iconColor="text-teal-500"
          />
        )}
        {!showTickets && !showProjects && !showAccounting && (
          <StatCard
            label="Today"
            value={new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            icon={CheckCircle2}
            iconBg="bg-gray-50"
            iconColor="text-gray-400"
          />
        )}
      </div>

      {/* ── Content grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent open tickets — 2/3 width */}
        {showTickets && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <TicketIcon size={16} className="text-indigo-500" />
                <h2 className="text-sm font-semibold text-gray-900">Open Tickets</h2>
              </div>
              <Link to="/tickets" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                View all <ArrowRight size={12} />
              </Link>
            </div>
            {openTickets.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">
                No open tickets — all caught up! 🎉
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                    <th className="px-4 py-2.5">Ticket</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Priority</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {openTickets.slice(0, 8).map(t => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className={`cursor-pointer hover:bg-indigo-50 transition-colors ${t.sla_breached ? 'bg-red-50/40' : ''}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs text-indigo-600 font-semibold">{t.ticket_number}</span>
                        <p className="text-gray-700 text-xs mt-0.5 line-clamp-1 max-w-[160px]">{t.title}</p>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{t.customer_name || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${PRIORITY_CHIP[t.priority] ?? 'bg-gray-100 text-gray-500'}`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {t.sla_breached ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                            <AlertTriangle size={11} /> Breached
                          </span>
                        ) : (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CHIP[t.status] ?? ''}`}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">
                        {t.assigned_to_name || <span className="text-gray-300">Unassigned</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Right column — projects + coins */}
        <div className="space-y-4">

          {/* Active Projects */}
          {showProjects && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <FolderKanban size={16} className="text-emerald-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Active Projects</h2>
                </div>
                <Link to="/projects" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </Link>
              </div>
              {activeProjects.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No active projects</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {activeProjects.slice(0, 5).map(p => (
                    <li
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm text-gray-800 font-medium truncate max-w-[150px]">{p.name}</span>
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium capitalize shrink-0">
                        {p.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Pending Coin Approvals (admin+) */}
          {showCoins && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-amber-500" />
                  <h2 className="text-sm font-semibold text-gray-900">Pending Coin Approvals</h2>
                  {pendingCount > 0 && (
                    <span className="ml-1 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                      {pendingCount}
                    </span>
                  )}
                </div>
                <Link to="/coins" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                  Manage <ArrowRight size={12} />
                </Link>
              </div>
              {pendingCoins.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No pending approvals</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {pendingCoins.slice(0, 5).map(c => (
                    <li key={c.id} className="px-5 py-3 flex items-center justify-between">
                      <span className="text-sm text-gray-800 font-medium truncate max-w-[150px]">{c.staff_name}</span>
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">
                        {c.coins} coins
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Quick links */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Links</p>
            {showTickets && perms.can('can_create_tickets') && (
              <Link to="/tickets" className="flex items-center gap-2 text-sm text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                <TicketIcon size={14} /> Create a ticket
              </Link>
            )}
            {showProjects && perms.can('can_create_projects') && (
              <Link to="/projects" className="flex items-center gap-2 text-sm text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                <FolderKanban size={14} /> New project
              </Link>
            )}
            {perms.can('can_view_staff') && (
              <Link to="/staff" className="flex items-center gap-2 text-sm text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors">
                <CheckCircle2 size={14} /> Manage staff
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
