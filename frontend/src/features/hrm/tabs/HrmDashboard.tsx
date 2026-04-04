/**
 * HrmDashboard — landing page for the HRM section.
 *
 * Manager/Admin view:
 *   - Stats row: Total Staff · Present · On Leave · Pending Approvals
 *   - Two-column: Today's attendance breakdown | Pending leave requests
 *   - Recent leave requests table
 *
 * Staff view:
 *   - Today's clock-in card + quick clock-in/out button
 *   - Leave balance chips
 *   - Recent own requests
 */
import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Users, UserCheck, CalendarOff, ClipboardList,
  ClockArrowUp, ClockArrowDown, Loader2,
  CheckCircle2, X, AlertCircle, MapPin,
} from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM } from '../../../api/endpoints'
import { adStringToBsDisplay } from '../../../utils/nepaliDate'

// ── Types ─────────────────────────────────────────────────────────────────────

interface TodayAttendance {
  present: number
  absent: number
  late: number
  half_day: number
  on_leave: number
  wfh: number
  holiday: number
  not_recorded: number
}

interface LeaveRequest {
  id: number
  staff_name: string
  leave_type_name: string
  start_date: string
  end_date: string
  days: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason?: string
  created_at: string
}

interface LeaveBalance {
  id: number
  leave_type_name: string
  leave_type_code: string
  allocated: string
  used: string
  available: string
}

interface AttendanceRecord {
  status: string | null
  clock_in: string | null
  clock_out: string | null
  work_hours: string
  late_minutes: number
}

interface DashboardData {
  is_manager: boolean
  // Manager fields
  total_staff?: number
  today_attendance?: TodayAttendance
  pending_leave_requests?: number
  on_leave_today?: number
  recent_requests?: LeaveRequest[]
  // Personal fields
  my_today: AttendanceRecord | null
  my_balances: LeaveBalance[]
  my_recent_requests: LeaveRequest[]
  my_pending_count: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDateRange(start: string, end: string): string {
  const s = adStringToBsDisplay(start)
  const e = adStringToBsDisplay(end)
  if (s && e && start !== end) return `${s.bs_en} → ${e.bs_en}`
  if (s) return s.bs_en
  return start === end ? start : `${start} → ${end}`
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { errors?: string[]; message?: string } } }
  return e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Something went wrong'
}

function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()  => resolve(null),
      { timeout: 8000 },
    )
  })
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon, color, sub,
}: Readonly<{
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  sub?: string
}>) {
  return (
    <div className={`relative bg-white rounded-2xl border border-gray-100 p-5 shadow-sm overflow-hidden`}>
      <div className={`absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 -translate-y-6 translate-x-6 ${color}`} />
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${color} bg-opacity-10`}>
        <span className={color.replace('bg-', 'text-')}>{icon}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-1">{label}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Attendance breakdown bar ───────────────────────────────────────────────────

const ATT_COLORS: Record<string, { bar: string; text: string; label: string }> = {
  present:      { bar: 'bg-green-500',  text: 'text-green-700',  label: 'Present'      },
  late:         { bar: 'bg-yellow-400', text: 'text-yellow-700', label: 'Late'         },
  half_day:     { bar: 'bg-orange-400', text: 'text-orange-700', label: 'Half Day'     },
  on_leave:     { bar: 'bg-blue-400',   text: 'text-blue-700',   label: 'On Leave'     },
  wfh:          { bar: 'bg-teal-400',   text: 'text-teal-700',   label: 'WFH'          },
  holiday:      { bar: 'bg-purple-400', text: 'text-purple-700', label: 'Holiday'      },
  absent:       { bar: 'bg-red-400',    text: 'text-red-700',    label: 'Absent'       },
  not_recorded: { bar: 'bg-gray-200',   text: 'text-gray-500',   label: 'Not Recorded' },
}

function AttendanceBreakdown({ data, total }: Readonly<{ data: TodayAttendance; total: number }>) {
  const rows = Object.entries(data) as [keyof TodayAttendance, number][]
  const effective = total || 1

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm h-full">
      <h3 className="text-sm font-semibold text-gray-800 mb-4">Today's Attendance</h3>

      {/* Stacked bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-5 gap-0.5">
        {rows.filter(([, v]) => v > 0).map(([k, v]) => (
          <div
            key={k}
            title={`${ATT_COLORS[k]?.label ?? k}: ${v}`}
            className={`h-full transition-all ${ATT_COLORS[k]?.bar ?? 'bg-gray-300'}`}
            style={{ width: `${(v / effective) * 100}%` }}
          />
        ))}
      </div>

      {/* Legend rows */}
      <div className="space-y-2">
        {rows.filter(([, v]) => v > 0).map(([k, v]) => {
          const meta = ATT_COLORS[k] ?? { bar: 'bg-gray-300', text: 'text-gray-600', label: k }
          const pct  = Math.round((v / effective) * 100)
          return (
            <div key={k} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.bar}`} />
              <span className="text-xs text-gray-600 flex-1">{meta.label}</span>
              <span className={`text-xs font-semibold ${meta.text}`}>{v}</span>
              <span className="text-[10px] text-gray-400 w-8 text-right">{pct}%</span>
            </div>
          )
        })}
        {total === 0 && (
          <p className="text-xs text-gray-400 py-2">No attendance data for today yet.</p>
        )}
      </div>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700 border-yellow-200',
  approved:  'bg-green-100 text-green-700 border-green-200',
  rejected:  'bg-red-100 text-red-600 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
}

function StatusBadge({ status }: Readonly<{ status: string }>) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
      {status}
    </span>
  )
}

// ── Pending requests panel (manager) ─────────────────────────────────────────

function PendingRequestsPanel({
  requests,
  onAction,
}: Readonly<{
  requests: LeaveRequest[]
  onAction: () => void
}>) {
  const pending = requests.filter(r => r.status === 'pending')

  const approveMut = useMutation({
    mutationFn: (id: number) => apiClient.post(HRM.LEAVE_REQUEST_APPROVE(id), {}),
    onSuccess: () => { toast.success('Approved'); onAction() },
    onError: (e) => toast.error(apiError(e)),
  })
  const rejectMut = useMutation({
    mutationFn: (id: number) => apiClient.post(HRM.LEAVE_REQUEST_REJECT(id), { reason: '' }),
    onSuccess: () => { toast.success('Rejected'); onAction() },
    onError: (e) => toast.error(apiError(e)),
  })

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">Pending Approvals</h3>
        {pending.length > 0 && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400 text-white text-[10px] font-bold">
            {pending.length}
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400 gap-2">
          <CheckCircle2 size={28} className="text-green-300" />
          <p className="text-xs">All caught up — no pending requests.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pending.map(req => (
            <div key={req.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{req.staff_name}</p>
                <p className="text-[11px] text-gray-500 truncate">{req.leave_type_name} · {req.days}d</p>
                <p className="text-[11px] text-indigo-500 mt-0.5">{fmtDateRange(req.start_date, req.end_date)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => approveMut.mutate(req.id)}
                  disabled={approveMut.isPending || rejectMut.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
                >
                  <CheckCircle2 size={10} />
                  OK
                </button>
                <button
                  onClick={() => rejectMut.mutate(req.id)}
                  disabled={approveMut.isPending || rejectMut.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition"
                >
                  <X size={10} />
                  No
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Recent requests table ─────────────────────────────────────────────────────

function RecentRequestsTable({ requests }: Readonly<{ requests: LeaveRequest[] }>) {
  if (!requests.length) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Recent Leave Requests</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-[11px] text-gray-500 uppercase tracking-wide">
              <th className="px-5 py-2.5 text-left font-medium">Staff</th>
              <th className="px-5 py-2.5 text-left font-medium">Type</th>
              <th className="px-5 py-2.5 text-left font-medium">Period</th>
              <th className="px-5 py-2.5 text-left font-medium">Days</th>
              <th className="px-5 py-2.5 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {requests.map(req => (
              <tr key={req.id} className="hover:bg-gray-50 transition">
                <td className="px-5 py-3">
                  <p className="text-xs font-medium text-gray-800">{req.staff_name}</p>
                </td>
                <td className="px-5 py-3 text-xs text-gray-600">{req.leave_type_name}</td>
                <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">
                  {fmtDateRange(req.start_date, req.end_date)}
                </td>
                <td className="px-5 py-3 text-xs font-medium text-gray-700">{req.days}d</td>
                <td className="px-5 py-3"><StatusBadge status={req.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Staff personal dashboard ──────────────────────────────────────────────────

function clockButtonClass(clo: boolean, ci: boolean): string {
  if (clo) return 'bg-gray-100 text-gray-400 cursor-not-allowed'
  if (ci)  return 'bg-red-600 hover:bg-red-700 text-white'
  return 'bg-indigo-600 hover:bg-indigo-700 text-white'
}

function clockButtonLabel(clo: boolean, ci: boolean): string {
  if (clo) return 'Done for today'
  if (ci)  return 'Clock Out'
  return 'Clock In'
}

function clockButtonIcon(busy: boolean, ci: boolean): React.ReactNode {
  if (busy) return <Loader2 size={16} className="animate-spin" />
  if (ci)   return <ClockArrowDown size={16} />
  return <ClockArrowUp size={16} />
}

function balanceBarColor(pct: number): string {
  if (pct >= 80) return 'bg-red-400'
  if (pct >= 50) return 'bg-yellow-400'
  return 'bg-green-400'
}

function StaffPersonalDashboard({
  data,
  onRefresh,
}: Readonly<{
  data: DashboardData
  onRefresh: () => void
}>) {
  const clockIn = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      const body: Record<string, unknown> = { source: 'web' }
      if (pos) { body['lat'] = pos.lat; body['lng'] = pos.lng }
      return apiClient.post(HRM.ATTENDANCE_CLOCK_IN, body)
    },
    onSuccess: () => { toast.success('Clocked in!'); onRefresh() },
    onError: (e) => toast.error(apiError(e)),
  })
  const clockOut = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      const body: Record<string, unknown> = { source: 'web' }
      if (pos) { body['lat'] = pos.lat; body['lng'] = pos.lng }
      return apiClient.post(HRM.ATTENDANCE_CLOCK_OUT, body)
    },
    onSuccess: () => { toast.success('Clocked out!'); onRefresh() },
    onError: (e) => toast.error(apiError(e)),
  })

  const today      = data.my_today
  const isClockedIn  = !!today?.clock_in && !today?.clock_out
  const isClockedOut = !!today?.clock_in && !!today?.clock_out
  const buttonBusy = clockIn.isPending || clockOut.isPending

  const handleClock = useCallback(() => {
    if (isClockedIn) clockOut.mutate()
    else clockIn.mutate()
  }, [isClockedIn, clockIn, clockOut])

  const STATUS_LABEL: Record<string, string> = {
    present: 'Present', absent: 'Absent', late: 'Late', half_day: 'Half Day',
    on_leave: 'On Leave', holiday: 'Holiday', wfh: 'WFH',
  }
  const STATUS_COLOR: Record<string, string> = {
    present: 'text-green-700 bg-green-50 border-green-200',
    absent:  'text-red-700 bg-red-50 border-red-200',
    late:    'text-yellow-700 bg-yellow-50 border-yellow-200',
    half_day:'text-orange-700 bg-orange-50 border-orange-200',
    on_leave:'text-blue-700 bg-blue-50 border-blue-200',
    holiday: 'text-purple-700 bg-purple-50 border-purple-200',
    wfh:     'text-teal-700 bg-teal-50 border-teal-200',
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Today card */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Today</p>
            {today?.status && (
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLOR[today.status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                {STATUS_LABEL[today.status] ?? today.status}
              </span>
            )}
          </div>

          {today ? (
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-1">In</p>
                <p className="text-sm font-bold text-gray-800">{fmtTime(today.clock_in)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-1">Out</p>
                <p className="text-sm font-bold text-gray-800">{fmtTime(today.clock_out)}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-gray-400 mb-1">Hours</p>
                <p className="text-sm font-bold text-gray-800">
                  {today.work_hours === '0.00' ? '—' : `${today.work_hours}h`}
                </p>
              </div>
              {today.late_minutes > 0 && (
                <div className="col-span-3 bg-yellow-50 rounded-lg px-3 py-1.5 text-center">
                  <p className="text-xs text-yellow-700 font-medium">Late by {today.late_minutes} min</p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-4">No attendance recorded yet today.</p>
          )}

          <button
            onClick={handleClock}
            disabled={buttonBusy || isClockedOut}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${clockButtonClass(isClockedOut, isClockedIn)}`}
          >
            {clockButtonIcon(buttonBusy, isClockedIn)}
            {clockButtonLabel(isClockedOut, isClockedIn)}
          </button>
          <p className="flex items-center justify-center gap-1 text-[10px] text-gray-400 mt-2">
            <MapPin size={9} /> GPS captured automatically
          </p>
        </div>

        {/* Balance cards */}
        {(data.my_balances ?? []).map(b => {
          const pct = Number.parseFloat(b.allocated) > 0
            ? Math.min(100, (Number.parseFloat(b.used) / Number.parseFloat(b.allocated)) * 100)
            : 0
          return (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{b.leave_type_code}</p>
                <p className="text-xs font-medium text-gray-600 mb-3">{b.leave_type_name}</p>
              </div>
              <div>
                <div className="flex items-end justify-between mb-2">
                  <span className="text-2xl font-bold text-indigo-600">{b.available}</span>
                  <span className="text-xs text-gray-400">/ {b.allocated} days</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${balanceBarColor(pct)}`}
                    style={{ width: `${100 - pct}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Used: {b.used}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Own recent requests */}
      {(data.my_recent_requests ?? []).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">My Recent Requests</h3>
            {data.my_pending_count > 0 && (
              <span className="text-xs text-yellow-600 font-medium">{data.my_pending_count} pending</span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {data.my_recent_requests.map(req => (
              <div key={req.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800">{req.leave_type_name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{fmtDateRange(req.start_date, req.end_date)} · {req.days}d</p>
                </div>
                <StatusBadge status={req.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function HrmDashboard() {
  const qc = useQueryClient()

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ['hrm-dashboard'],
    queryFn: () => apiClient.get(HRM.DASHBOARD).then(r => r.data.data),
    staleTime: 30_000,
    refetchInterval: 120_000,
  })

  const handleAction = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['hrm-dashboard'] })
  }, [qc])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
        <AlertCircle size={28} className="text-red-300" />
        <p className="text-sm">Failed to load HRM dashboard.</p>
        <button onClick={() => refetch()} className="text-xs text-indigo-600 hover:underline">
          Retry
        </button>
      </div>
    )
  }

  // ── Staff view ──────────────────────────────────────────────────────────────
  if (!data.is_manager) {
    return (
      <StaffPersonalDashboard
        data={data}
        onRefresh={() => qc.invalidateQueries({ queryKey: ['hrm-dashboard'] })}
      />
    )
  }

  // ── Manager / Admin view ────────────────────────────────────────────────────
  const att = data.today_attendance ?? {
    present: 0, absent: 0, late: 0, half_day: 0,
    on_leave: 0, wfh: 0, holiday: 0, not_recorded: 0,
  }
  const total = data.total_staff ?? 0

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Staff"
          value={total}
          icon={<Users size={20} />}
          color="bg-indigo-500"
        />
        <StatCard
          label="Present Today"
          value={att.present + att.late + att.half_day}
          icon={<UserCheck size={20} />}
          color="bg-green-500"
          sub={[
            att.late > 0 ? `${att.late} late` : '',
            att.half_day > 0 ? `${att.half_day} half-day` : '',
          ].filter(Boolean).join(' · ') || undefined}
        />
        <StatCard
          label="On Leave Today"
          value={att.on_leave + att.wfh}
          icon={<CalendarOff size={20} />}
          color="bg-blue-500"
          sub={att.wfh > 0 ? `${att.wfh} WFH` : undefined}
        />
        <StatCard
          label="Pending Approvals"
          value={data.pending_leave_requests ?? 0}
          icon={<ClipboardList size={20} />}
          color="bg-yellow-500"
        />
      </div>

      {/* Middle row: attendance breakdown + pending requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AttendanceBreakdown data={att} total={total} />
        <PendingRequestsPanel
          requests={data.recent_requests ?? []}
          onAction={handleAction}
        />
      </div>

      {/* Recent requests table */}
      <RecentRequestsTable requests={data.recent_requests ?? []} />

      {/* Own section for managers too */}
      <div className="pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">My Status</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Own today card */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm col-span-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase mb-2">Today's Attendance</p>
            {data.my_today ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">In</span>
                  <span className="text-xs font-semibold text-gray-800">{fmtTime(data.my_today.clock_in)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Out</span>
                  <span className="text-xs font-semibold text-gray-800">{fmtTime(data.my_today.clock_out)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Hours</span>
                  <span className="text-xs font-semibold text-gray-800">
                    {data.my_today.work_hours === '0.00' ? '—' : `${data.my_today.work_hours}h`}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-400">Not clocked in yet.</p>
            )}
          </div>

          {/* Own balances */}
          {(data.my_balances ?? []).map(b => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <p className="text-[10px] font-semibold text-gray-400 uppercase mb-1">{b.leave_type_code}</p>
              <p className="text-xl font-bold text-indigo-600">{b.available}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">/ {b.allocated} days available</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
