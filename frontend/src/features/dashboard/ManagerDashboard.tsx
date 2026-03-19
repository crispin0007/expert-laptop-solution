/**
 * ManagerDashboard — department-scoped view for Manager role.
 *
 * KPIs: dept open/SLA/unassigned tickets, team size
 * Tables: dept open tickets, unassigned ticket queue, team members
 * Quick actions: New Ticket, view dept tickets
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { DASHBOARD, TICKETS, PROJECTS } from '../../api/endpoints'
import { usePermissions } from '../../hooks/usePermissions'
import { useModules } from '../../hooks/useModules'
import { useAuthStore } from '../../store/authStore'
import DateDisplay from '../../components/DateDisplay'
import { useFyStore } from '../../store/fyStore'
import {
  Ticket as TicketIcon, FolderKanban, AlertTriangle,
  Clock, CircleDot, ArrowRight, Plus, Users, UserCheck,
  UserX,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface DashboardStats {
  dept_id: number | null
  dept_open_tickets: number
  dept_sla_breached: number
  dept_unassigned_tickets: number
  dept_team_size: number
  active_projects: number
  sla_warning: number
}

interface TicketRow {
  id: number
  ticket_number: string
  title: string
  status: string
  priority: string
  customer_name: string
  assigned_to_name: string | null
  sla_breached: boolean
}

interface ProjectRow {
  id: number
  project_number: string
  name: string
  status: string
  completion_percentage?: number
}

interface StaffRow {
  id: number
  full_name: string
  email: string
  is_available?: boolean
}

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
}

const STATUS_LABEL: Record<string, string> = {
  open:             'Open',
  in_progress:      'In Progress',
  pending_customer: 'Pending',
  resolved:         'Resolved',
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, iconBg, iconColor, alert,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  iconBg: string
  iconColor: string
  alert?: boolean
}) {
  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 flex items-center gap-4 ${
      alert ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
    }`}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

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

export default function ManagerDashboard() {
  const navigate = useNavigate()
  const perms = usePermissions()
  const modules = useModules()
  const user = useAuthStore(s => s.user)
  const { fyYear } = useFyStore()
  const fyParam = fyYear ? { fiscal_year: fyYear } : {}

  const deptId = user?.membership?.department

  // ── Stats ────────────────────────────────────────────────────────────────
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', fyYear],
    queryFn: () => apiClient.get(DASHBOARD.STATS, { params: fyParam }).then(r => r.data?.data ?? r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })

  const showTickets  = modules.has('tickets') && perms.can('can_view_tickets')
  const showProjects = modules.has('projects') && perms.can('can_view_projects')

  // ── Dept ticket lists ────────────────────────────────────────────────────
  const { data: deptTicketsData } = useQuery({
    queryKey: ['dash-mgr-dept-tickets', deptId, fyYear],
    queryFn: () => apiClient.get(TICKETS.LIST, {
      params: { department: deptId, status: 'open', page_size: 10, ...fyParam },
    }).then(r => r.data),
    enabled: showTickets && !!deptId,
  })

  const { data: unassignedData } = useQuery({
    queryKey: ['dash-mgr-unassigned', deptId, fyYear],
    queryFn: () => apiClient.get(TICKETS.LIST, {
      params: { department: deptId, status: 'open', assigned_to: 'none', page_size: 8 },
    }).then(r => r.data),
    enabled: showTickets && !!deptId,
  })

  const { data: projectsData } = useQuery({
    queryKey: ['dash-mgr-projects', fyYear],
    queryFn: () => apiClient.get(PROJECTS.LIST, { params: { status: 'active', page_size: 5, ...fyParam } }).then(r => r.data),
    enabled: showProjects,
  })

  const { data: staffData } = useQuery({
    queryKey: ['dash-mgr-staff', deptId],
    queryFn: () => apiClient.get('/staff/', { params: { department: deptId, page_size: 20 } }).then(r => r.data),
    enabled: !!deptId && perms.can('can_view_staff'),
  })

  const deptTickets    = useMemo(() => toArray<TicketRow>(deptTicketsData), [deptTicketsData])
  const unassignedTickets = useMemo(() => toArray<TicketRow>(unassignedData), [unassignedData])
  const activeProjects = useMemo(() => toArray<ProjectRow>(projectsData), [projectsData])
  const teamMembers    = useMemo(() => toArray<StaffRow>(staffData), [staffData])

  const deptName = user?.membership?.department_name ?? 'Your Department'
  const breachedCount = stats?.dept_sla_breached ?? 0

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            <span className="font-medium text-indigo-600">{deptName}</span>
            {' · '}<DateDisplay adDate={new Date().toISOString().slice(0, 10)} />
          </p>
        </div>
        {showTickets && perms.can('can_create_tickets') && (
          <button
            onClick={() => navigate('/tickets')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
          >
            <Plus size={13} /> New Ticket
          </button>
        )}
      </div>

      {/* ── SLA breach alert ─────────────────────────────────────────── */}
      {showTickets && breachedCount > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-300 rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
          <p className="text-sm font-semibold text-red-700">
            {breachedCount} ticket{breachedCount !== 1 ? 's' : ''} in <strong>{deptName}</strong> have breached SLA.
          </p>
          <Link to="/tickets" className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800 flex items-center gap-1 whitespace-nowrap">
            View tickets <ArrowRight size={13} />
          </Link>
        </div>
      )}

      {/* ── KPI cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Open in Department"
          value={stats?.dept_open_tickets ?? 0}
          icon={CircleDot}
          iconBg="bg-blue-50"
          iconColor="text-blue-500"
        />
        <StatCard
          label="SLA Breached (Dept)"
          value={breachedCount}
          icon={AlertTriangle}
          iconBg={breachedCount > 0 ? 'bg-red-50' : 'bg-gray-50'}
          iconColor={breachedCount > 0 ? 'text-red-500' : 'text-gray-400'}
          alert={breachedCount > 0}
        />
        <StatCard
          label="Unassigned Tickets"
          value={stats?.dept_unassigned_tickets ?? 0}
          icon={UserX}
          iconBg={(stats?.dept_unassigned_tickets ?? 0) > 0 ? 'bg-orange-50' : 'bg-gray-50'}
          iconColor={(stats?.dept_unassigned_tickets ?? 0) > 0 ? 'text-orange-500' : 'text-gray-400'}
          alert={(stats?.dept_unassigned_tickets ?? 0) > 0}
        />
        <StatCard
          label="Team Members"
          value={stats?.dept_team_size ?? 0}
          icon={Users}
          iconBg="bg-violet-50"
          iconColor="text-violet-500"
        />
      </div>

      {/* ── Main content grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Dept open tickets — 2/3 */}
        {showTickets && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <SectionHeader icon={TicketIcon} iconColor="text-indigo-500" title={`${deptName} — Open Tickets`} linkTo="/tickets" />
            {deptTickets.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-gray-400">No open tickets in this department 🎉</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-2.5">Ticket</th>
                      <th className="px-4 py-2.5">Customer</th>
                      <th className="px-4 py-2.5">Priority</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Assigned To</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {deptTickets.slice(0, 10).map(t => (
                      <tr
                        key={t.id}
                        onClick={() => navigate(`/tickets/${t.id}`)}
                        className={`cursor-pointer hover:bg-indigo-50 transition-colors ${t.sla_breached ? 'bg-red-50/40' : ''}`}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono text-xs text-indigo-600 font-semibold">{t.ticket_number}</span>
                          <p className="text-gray-700 text-xs mt-0.5 line-clamp-1 max-w-[150px]">{t.title}</p>
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
                          {t.assigned_to_name || <span className="text-orange-500 font-medium italic">Unassigned</span>}
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

          {/* Unassigned queue */}
          {showTickets && unassignedTickets.length > 0 && (
            <div className="bg-white rounded-xl border border-orange-200 shadow-sm overflow-hidden">
              <SectionHeader icon={UserX} iconColor="text-orange-500" title={`Unassigned (${unassignedTickets.length})`} linkTo="/tickets" linkLabel="Assign" />
              <ul className="divide-y divide-gray-50">
                {unassignedTickets.slice(0, 6).map(t => (
                  <li
                    key={t.id}
                    onClick={() => navigate(`/tickets/${t.id}`)}
                    className="px-4 py-3 cursor-pointer hover:bg-orange-50 transition-colors"
                  >
                    <p className="font-mono text-[10px] text-indigo-400">{t.ticket_number}</p>
                    <p className="text-sm text-gray-800 font-medium line-clamp-1">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.customer_name || '—'}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Team overview */}
          {perms.can('can_view_staff') && teamMembers.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader icon={UserCheck} iconColor="text-violet-500" title={`Team (${teamMembers.length})`} linkTo="/staff" />
              <ul className="divide-y divide-gray-50">
                {teamMembers.slice(0, 8).map(s => (
                  <li
                    key={s.id}
                    onClick={() => navigate(`/staff/${s.id}`)}
                    className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold shrink-0">
                      {(s.full_name || s.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{s.full_name || s.email}</p>
                      <p className="text-xs text-gray-400 truncate">{s.full_name ? s.email : ''}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Active projects */}
          {showProjects && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <SectionHeader icon={FolderKanban} iconColor="text-emerald-500" title={`Active Projects (${stats?.active_projects ?? 0})`} linkTo="/projects" />
              {activeProjects.length === 0 ? (
                <div className="px-5 py-6 text-center text-sm text-gray-400">No active projects</div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {activeProjects.slice(0, 4).map(p => (
                    <li
                      key={p.id}
                      onClick={() => navigate(`/projects/${p.id}`)}
                      className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-sm text-gray-800 font-medium truncate max-w-[160px]">{p.name}</p>
                      {p.completion_percentage != null && (
                        <span className="text-xs text-emerald-600 font-semibold shrink-0 ml-2">{p.completion_percentage}%</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* No dept warning */}
          {!deptId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800">
              <p className="font-semibold mb-1">No department assigned</p>
              <p className="text-xs text-amber-600">Department-scoped stats will appear once you are assigned to a department.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── SLA warning row ───────────────────────────────────────────── */}
      {showTickets && (stats?.sla_warning ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-5 py-3">
          <Clock size={16} className="text-orange-500 shrink-0" />
          <p className="text-sm text-orange-700">
            <strong>{stats!.sla_warning}</strong> ticket{stats!.sla_warning !== 1 ? 's' : ''} approaching SLA breach (within 2 hours).
          </p>
        </div>
      )}
    </div>
  )
}
