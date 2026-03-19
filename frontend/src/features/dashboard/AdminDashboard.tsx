/**
 * AdminDashboard — full business view for Owner / Admin roles.
 *
 * KPIs: revenue, unpaid invoices, new customers, open/SLA tickets, projects, coins
 * Tables: open tickets, active projects, pending coin approvals, unpaid invoices
 * Quick actions: New Ticket, New Customer, New Invoice, New Project
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { DASHBOARD, TICKETS, PROJECTS, ACCOUNTING } from '../../api/endpoints'
import { usePermissions } from '../../hooks/usePermissions'
import { useModules } from '../../hooks/useModules'
import DateDisplay from '../../components/DateDisplay'
import { useFyStore } from '../../store/fyStore'
import {
  Ticket as TicketIcon, FolderKanban, Coins, AlertTriangle,
  Clock, CircleDot, ArrowRight, Plus, TrendingUp, ShieldAlert,
  Users, FileText, UserPlus, TrendingDown, ListChecks, CheckCircle2, CalendarX2,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardStats {
  open_tickets: number
  in_progress_tickets: number
  sla_breached: number
  sla_warning: number
  active_projects: number
  pending_tasks: number
  overdue_tasks: number
  completed_projects_month: number
  pending_coins: number
  revenue_this_month: string
  unpaid_invoices_count: number
  unpaid_invoices_total: string
  new_customers_this_month: number
}

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
  project_number: string
  name: string
  status: string
  completion_percentage?: number
}

interface CoinRow {
  id: number
  staff_name: string
  coins?: number
  amount?: number
  status: string
}

interface InvoiceRow {
  id: number
  invoice_number: string
  customer_name: string
  total: string
  due_date: string
  status: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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
  high:     'bg-orange-100 text-orange-700',
  medium:   'bg-yellow-100 text-yellow-700',
  low:      'bg-gray-100 text-gray-500',
}

const STATUS_CHIP: Record<string, string> = {
  open:             'bg-blue-100 text-blue-700',
  in_progress:      'bg-indigo-100 text-indigo-700',
  pending_customer: 'bg-yellow-100 text-yellow-700',
  resolved:         'bg-green-100 text-green-700',
  closed:           'bg-gray-100 text-gray-500',
  cancelled:        'bg-red-100 text-red-600',
}

const STATUS_LABEL: Record<string, string> = {
  open:             'Open',
  in_progress:      'In Progress',
  pending_customer: 'Pending',
  resolved:         'Resolved',
  closed:           'Closed',
  cancelled:        'Cancelled',
}

function fmtNum(n: string | number) {
  return Number(n).toLocaleString('en-NP', { maximumFractionDigits: 0 })
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, iconBg, iconColor, alert, onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  alert?: boolean
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 ${
        alert ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
      } ${onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-200 transition-all' : ''}`}
    >
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold text-gray-900 truncate">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

// ── Section Header ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, iconColor, title, linkTo, linkLabel }: {
  icon: React.ElementType
  iconColor: string
  title: string
  linkTo?: string
  linkLabel?: string
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
      <div className="flex items-center gap-2">
        <Icon size={16} className={iconColor} />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      {linkTo && (
        <Link to={linkTo} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
          {linkLabel ?? 'View all'} <ArrowRight size={12} />
        </Link>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const navigate = useNavigate()
  const perms = usePermissions()
  const modules = useModules()
  const { fyYear } = useFyStore()
  const fyParam = fyYear ? { fiscal_year: fyYear } : {}

  // ── Stats (single request — all KPIs) ───────────────────────────────────
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', fyYear],
    queryFn: () => apiClient.get(DASHBOARD.STATS, { params: fyParam }).then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  // ── List data ────────────────────────────────────────────────────────────
  const showTickets  = modules.has('tickets') && perms.can('can_view_tickets')
  const showProjects = modules.has('projects')
  const showCoins    = modules.has('accounting') && perms.can('can_approve_coins')
  const showAccounting = modules.has('accounting') && perms.can('can_view_accounting')

  const { data: openData } = useQuery({
    queryKey: ['dash-admin-open-tickets', fyYear],
    queryFn: () => apiClient.get(TICKETS.LIST, { params: { status: 'open', page_size: 10, ...fyParam } }).then(r => r.data),
    enabled: showTickets,
  })

  const { data: projectsData } = useQuery({
    queryKey: ['dash-admin-projects', fyYear],
    queryFn: () => apiClient.get(PROJECTS.LIST, { params: { status: 'active', page_size: 6, ...fyParam } }).then(r => r.data),
    enabled: showProjects,
  })

  const { data: coinsData } = useQuery({
    queryKey: ['dash-admin-coins'],
    queryFn: () => apiClient.get(ACCOUNTING.COINS, { params: { status: 'pending', page_size: 5 } }).then(r => r.data),
    enabled: showCoins,
  })

  const { data: invoicesData } = useQuery({
    queryKey: ['dash-admin-unpaid-invoices'],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES, { params: { status: 'issued', page_size: 5 } }).then(r => r.data),
    enabled: showAccounting,
  })

  const openTickets    = useMemo(() => toArray<TicketRow>(openData), [openData])
  const activeProjects = useMemo(() => toArray<ProjectRow>(projectsData), [projectsData])
  const pendingCoins   = useMemo(() => toArray<CoinRow>(coinsData), [coinsData])
  const unpaidInvoices = useMemo(() => toArray<InvoiceRow>(invoicesData), [invoicesData])

  const breachedCount  = stats?.sla_breached ?? 0
  const warningCount   = stats?.sla_warning ?? 0
  const revenue        = fmtNum(stats?.revenue_this_month ?? 0)
  const unpaidTotal    = fmtNum(stats?.unpaid_invoices_total ?? 0)

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <DateDisplay adDate={new Date().toISOString().slice(0, 10)} />
          </p>
        </div>
        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          {showTickets && perms.can('can_create_tickets') && (
            <button
              onClick={() => navigate('/tickets')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
            >
              <Plus size={13} /> New Ticket
            </button>
          )}
          {perms.can('can_create_customers') && (
            <button
              onClick={() => navigate('/customers')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition"
            >
              <UserPlus size={13} /> New Customer
            </button>
          )}
          {showAccounting && perms.can('can_manage_accounting') && (
            <button
              onClick={() => navigate('/invoices')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 transition"
            >
              <FileText size={13} /> New Invoice
            </button>
          )}
          {showProjects && perms.can('can_create_projects') && (
            <button
              onClick={() => navigate('/projects')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition"
            >
              <FolderKanban size={13} /> New Project
            </button>
          )}
        </div>
      </div>

      {/* ── SLA breach alert ─────────────────────────────────────────── */}
      {showTickets && (breachedCount > 0 || warningCount > 0) && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm font-semibold text-red-700">
            {breachedCount > 0 && <>{breachedCount} ticket{breachedCount !== 1 ? 's' : ''} breached SLA. </>}
            {warningCount > 0 && <span className="text-orange-600">{warningCount} approaching breach.</span>}
          </p>
          <Link to="/tickets" className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 whitespace-nowrap">
            View tickets <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ── KPI Row 1 — Finance ───────────────────────────────────────── */}
      {showAccounting && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Revenue This Month"
            value={`Rs. ${revenue}`}
            icon={TrendingUp}
            iconBg="bg-teal-50"
            iconColor="text-teal-600"
            onClick={() => navigate('/accounting')}
          />
          <StatCard
            label="Unpaid Invoices"
            value={stats?.unpaid_invoices_count ?? 0}
            sub={`Rs. ${unpaidTotal} outstanding`}
            icon={TrendingDown}
            iconBg={stats?.unpaid_invoices_count ? 'bg-orange-50' : 'bg-gray-50'}
            iconColor={stats?.unpaid_invoices_count ? 'text-orange-500' : 'text-gray-400'}
            alert={!!stats?.unpaid_invoices_count}
            onClick={() => navigate('/invoices')}
          />
          <StatCard
            label="New Customers"
            value={stats?.new_customers_this_month ?? 0}
            sub="this month"
            icon={Users}
            iconBg="bg-violet-50"
            iconColor="text-violet-500"
            onClick={() => navigate('/customers')}
          />
          <StatCard
            label="Pending Coin Approvals"
            value={stats?.pending_coins ?? 0}
            icon={Coins}
            iconBg={stats?.pending_coins ? 'bg-amber-50' : 'bg-gray-50'}
            iconColor={stats?.pending_coins ? 'text-amber-500' : 'text-gray-400'}
            alert={!!stats?.pending_coins}
            onClick={() => navigate('/coins')}
          />
        </div>
      )}

      {/* ── KPI Row 2 — Operations ────────────────────────────────────── */}
      {showTickets && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Open Tickets"
            value={stats?.open_tickets ?? 0}
            icon={CircleDot}
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
            onClick={() => navigate('/tickets?status=open')}
          />
          <StatCard
            label="In Progress"
            value={stats?.in_progress_tickets ?? 0}
            icon={Clock}
            iconBg="bg-indigo-50"
            iconColor="text-indigo-500"
            onClick={() => navigate('/tickets?status=in_progress')}
          />
          <StatCard
            label="SLA Breached"
            value={breachedCount}
            icon={AlertTriangle}
            iconBg={breachedCount > 0 ? 'bg-red-50' : 'bg-gray-50'}
            iconColor={breachedCount > 0 ? 'text-red-500' : 'text-gray-400'}
            alert={breachedCount > 0}
            onClick={() => navigate('/tickets?sla_breached=true')}
          />
          <StatCard
            label="SLA Warning"
            value={warningCount}
            icon={ShieldAlert}
            iconBg={warningCount > 0 ? 'bg-orange-50' : 'bg-gray-50'}
            iconColor={warningCount > 0 ? 'text-orange-500' : 'text-gray-400'}
            onClick={() => navigate('/tickets?sla_breached=true')}
          />
        </div>
      )}

      {/* ── Projects KPI row ────────────────────────────────────────── */}
      {showProjects && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Active Projects"
            value={stats?.active_projects ?? 0}
            icon={FolderKanban}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-500"
            onClick={() => navigate('/projects')}
          />
          <StatCard
            label="Pending Tasks"
            value={stats?.pending_tasks ?? 0}
            icon={ListChecks}
            iconBg="bg-sky-50"
            iconColor="text-sky-500"
            onClick={() => navigate('/projects')}
          />
          <StatCard
            label="Overdue Tasks"
            value={stats?.overdue_tasks ?? 0}
            icon={CalendarX2}
            iconBg={stats?.overdue_tasks ? 'bg-red-50' : 'bg-gray-50'}
            iconColor={stats?.overdue_tasks ? 'text-red-500' : 'text-gray-400'}
            alert={!!(stats?.overdue_tasks && stats.overdue_tasks > 0)}
            onClick={() => navigate('/projects')}
          />
          <StatCard
            label="Completed This Month"
            value={stats?.completed_projects_month ?? 0}
            icon={CheckCircle2}
            iconBg="bg-teal-50"
            iconColor="text-teal-500"
            onClick={() => navigate('/projects?status=completed')}
          />
        </div>
      )}

      {/* ── Main content grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Open Tickets — 2/3 width */}
        {showTickets && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <SectionHeader icon={TicketIcon} iconColor="text-indigo-500" title="Open Tickets" linkTo="/tickets" />
            {openTickets.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No open tickets — all caught up! 🎉</div>
            ) : (
              <div className="overflow-x-auto">
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
                    {openTickets.slice(0, 10).map(t => (
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
                          {t.assigned_to_name || <span className="text-gray-300 italic">Unassigned</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Right column */}
        <div className="space-y-4">

          {/* Active Projects */}
          {showProjects && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader icon={FolderKanban} iconColor="text-emerald-500" title={`Active Projects (${stats?.active_projects ?? 0})`} linkTo="/projects" />
              {activeProjects.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No active projects</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {activeProjects.slice(0, 5).map(p => (
                    <li
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-indigo-400">{p.project_number}</p>
                        <p className="text-sm text-gray-800 font-medium truncate max-w-[180px]">{p.name}</p>
                      </div>
                      {p.completion_percentage != null && (
                        <span className="text-xs text-emerald-600 font-semibold shrink-0 ml-2">
                          {p.completion_percentage}%
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Pending Coin Approvals */}
          {showCoins && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader icon={Coins} iconColor="text-amber-500" title="Pending Coin Approvals" linkTo="/coins" linkLabel="Manage" />
              {pendingCoins.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No pending approvals</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {pendingCoins.slice(0, 5).map(c => (
                    <li
                      key={c.id}
                      onClick={() => navigate('/coins')}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-amber-50 transition-colors"
                    >
                      <span className="text-sm text-gray-800 font-medium truncate max-w-[150px]">{c.staff_name}</span>
                      <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        {c.coins ?? c.amount ?? 0} coins
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Unpaid Invoices */}
          {showAccounting && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader icon={FileText} iconColor="text-teal-500" title="Unpaid Invoices" linkTo="/invoices" />
              {unpaidInvoices.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No outstanding invoices</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {unpaidInvoices.slice(0, 5).map(inv => (
                    <li
                      key={inv.id}
                      onClick={() => navigate(`/invoices/${inv.id}`)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-indigo-400">{inv.invoice_number}</p>
                        <p className="text-sm text-gray-700 truncate max-w-[150px]">{inv.customer_name}</p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-sm font-semibold text-gray-800">Rs. {fmtNum(inv.total)}</p>
                        <p className="text-[10px] text-gray-400">Due {inv.due_date ?? '—'}</p>
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
