/**
 * AttendanceTab — clock-in/out widget + attendance history.
 *
 * Layout:
 *  - Top row: today's status card (with live hours counter) + clock-in / clock-out button
 *  - Weekly summary chips (for the logged-in user)
 *  - Filter bar (admin/manager): date range, status, staff, department
 *  - Table: attendance records — columns include overtime + early exit
 *  - Admin/Manager: "Policy Settings" button → AttendancePolicyModal
 *  - Admin/Manager: row click → AdminOverrideModal (override clock times, status, remarks)
 */
import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ClockArrowUp, ClockArrowDown, MapPin, Loader2,
  CalendarX2, Settings2, SlidersHorizontal, Timer,
  TrendingUp, AlarmClockMinus, FilterX,
} from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM, DEPARTMENTS } from '../../../api/endpoints'
import { usePermissions } from '../../../hooks/usePermissions'
import { adStringToBsDisplay } from '../../../utils/nepaliDate'
import AttendancePolicyModal from '../modals/AttendancePolicyModal'
import ManualMarkModal from '../modals/ManualMarkModal'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AttendanceStatus =
  | 'present' | 'absent' | 'late' | 'half_day'
  | 'on_leave' | 'holiday' | 'wfh'

export interface AttendanceRecord {
  id: number
  staff: number
  staff_name: string
  date: string
  clock_in: string | null
  clock_out: string | null
  clock_in_source: 'manual' | 'web' | 'mobile'
  status: AttendanceStatus
  late_minutes: number
  early_exit_minutes: number
  overtime_minutes: number
  work_hours: string
  shift_name: string | null
  note: string
}

export interface TodayRecord {
  id: number | null
  date: string
  clock_in: string | null
  clock_out: string | null
  status: AttendanceStatus | null
  late_minutes: number
  work_hours: string
  shift_name?: string | null
}

interface AttendanceSummary {
  present: number
  absent: number
  late: number
  half_day: number
  on_leave: number
  holiday: number
  wfh: number
  not_recorded?: number
}

interface Department { id: number; name: string }
interface StaffProfile { id: number; staff: number; staff_name: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_META: Record<AttendanceStatus, { label: string; color: string }> = {
  present:  { label: 'Present',   color: 'bg-green-100 text-green-800' },
  absent:   { label: 'Absent',    color: 'bg-red-100 text-red-800' },
  late:     { label: 'Late',      color: 'bg-yellow-100 text-yellow-800' },
  half_day: { label: 'Half Day',  color: 'bg-orange-100 text-orange-800' },
  on_leave: { label: 'On Leave',  color: 'bg-blue-100 text-blue-800' },
  holiday:  { label: 'Holiday',   color: 'bg-purple-100 text-purple-800' },
  wfh:      { label: 'WFH',       color: 'bg-teal-100 text-teal-800' },
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const meta = STATUS_META[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d: string): string {
  const bs = adStringToBsDisplay(d)
  const ad = new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
  return bs ? `${bs.bs_en} (${ad})` : ad
}

/** Running elapsed time from a clock-in ISO string to now. Returns "Xh Ym" */
function calcLiveHours(clockInIso: string): string {
  const diff = Math.floor((Date.now() - new Date(clockInIso).getTime()) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  return `${h}h ${m}m`
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

function weekRange(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = (day === 0 ? -6 : 1 - day)
  const mon = new Date(now); mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(mon), end: fmt(sun) }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AttendanceTab() {
  const qc = useQueryClient()
  const { isAdmin, isManager } = usePermissions()
  const canManage = isAdmin || isManager

  const [showPolicy, setShowPolicy]   = useState(false)
  const [editRecord, setEditRecord]   = useState<AttendanceRecord | null>(null)
  const [manualTarget, setManualTarget] = useState<{ staffId: number; staffName: string; date: string } | null>(null)
  const [showManualPicker, setShowManualPicker] = useState(false)
  const [pickerStaffId,    setPickerStaffId]    = useState('')
  const [pickerDate,       setPickerDate]       = useState(new Date().toISOString().slice(0, 10))

  // ── Filters (manager / admin) ─────────────────────────────────────────────
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [filterStatus,   setFilterStatus]   = useState('')
  const [filterStaffId,  setFilterStaffId]  = useState('')
  const [filterDeptId,   setFilterDeptId]   = useState('')
  const [page, setPage] = useState(1)

  // Reset page on filter change
  const resetPage = useCallback(() => setPage(1), [])

  // ── Live hours counter ────────────────────────────────────────────────────
  const [liveHours, setLiveHours] = useState('')

  const { data: today, isLoading: todayLoading } = useQuery<TodayRecord>({
    queryKey: ['attendance', 'today'],
    queryFn: () => apiClient.get(HRM.ATTENDANCE_TODAY).then(r => r.data.data),
    refetchInterval: 60_000,
  })

  const isClockedIn  = !!today?.clock_in && !today?.clock_out
  const isClockedOut = !!today?.clock_in && !!today?.clock_out

  useEffect(() => {
    if (!isClockedIn || !today?.clock_in) { setLiveHours(''); return }
    setLiveHours(calcLiveHours(today.clock_in))
    const id = setInterval(() => setLiveHours(calcLiveHours(today!.clock_in!)), 30_000)
    return () => clearInterval(id)
  }, [isClockedIn, today?.clock_in])

  // ── Weekly summary (own) ─────────────────────────────────────────────────
  const { start: weekStart, end: weekEnd } = weekRange()
  const { data: summary } = useQuery<AttendanceSummary>({
    queryKey: ['attendance', 'summary', weekStart, weekEnd],
    queryFn: () =>
      apiClient.get(HRM.ATTENDANCE_SUMMARY, {
        params: { start_date: weekStart, end_date: weekEnd },
      }).then(r => r.data.data),
  })

  // ── Departments (for filter dropdown) ────────────────────────────────────
  const { data: depts = [] } = useQuery<Department[]>({
    queryKey: ['departments', 'list'],
    queryFn: () => apiClient.get(DEPARTMENTS.LIST, { params: { page_size: 100 } }).then(r => r.data.data ?? []),
    enabled: canManage,
  })

  // ── Staff profiles (for filter dropdown) ─────────────────────────────────
  const { data: profiles = [] } = useQuery<StaffProfile[]>({
    queryKey: ['hrm', 'profiles', 'minimal'],
    queryFn: () => apiClient.get(HRM.PROFILES, { params: { page_size: 200 } }).then(r => r.data.data ?? []),
    enabled: canManage,
  })

  // ── History list ─────────────────────────────────────────────────────────
  const listParams = {
    page,
    ...(dateFrom      && { date_from: dateFrom }),
    ...(dateTo        && { date_to: dateTo }),
    ...(filterStatus  && { status: filterStatus }),
    ...(filterStaffId && { staff_id: filterStaffId }),
    ...(filterDeptId  && { dept_id: filterDeptId }),
  }

  const { data: historyPage, isLoading: histLoading } = useQuery<{
    results: AttendanceRecord[]
    count: number
    next: string | null
    previous: string | null
  }>({
    queryKey: ['attendance', 'list', listParams],
    queryFn: () => apiClient.get(HRM.ATTENDANCE, { params: listParams }).then(r => {
      const { data: items, meta } = r.data
      return {
        results:  items ?? [],
        count:    meta?.pagination?.total ?? 0,
        next:     meta?.pagination?.next ?? null,
        previous: meta?.pagination?.previous ?? null,
      }
    }),
  })

  // ── Clock mutations ──────────────────────────────────────────────────────
  const clockIn = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      return apiClient.post(HRM.ATTENDANCE_CLOCK_IN, {
        source: 'web',
        ...(pos && { lat: pos.lat, lng: pos.lng }),
      })
    },
    onSuccess: () => {
      toast.success('Clocked in successfully')
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Clock-in failed')
    },
  })

  const clockOut = useMutation({
    mutationFn: async () => {
      const pos = await getPosition()
      return apiClient.post(HRM.ATTENDANCE_CLOCK_OUT, {
        source: 'web',
        ...(pos && { lat: pos.lat, lng: pos.lng }),
      })
    },
    onSuccess: () => {
      toast.success('Clocked out successfully')
      qc.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Clock-out failed')
    },
  })

  const buttonBusy = clockIn.isPending || clockOut.isPending

  const handleClockToggle = useCallback(() => {
    if (isClockedIn) clockOut.mutate()
    else             clockIn.mutate()
  }, [isClockedIn, clockIn, clockOut])

  const hasFilters = !!(dateFrom || dateTo || filterStatus || filterStaffId || filterDeptId)

  function clearFilters() {
    setDateFrom(''); setDateTo(''); setFilterStatus('')
    setFilterStaffId(''); setFilterDeptId(''); resetPage()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Top row: today card + action ── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">

        {/* Today card */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Today</p>
            {today?.status && <StatusBadge status={today.status} />}
          </div>

          {todayLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : today ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400">Clock In</p>
                <p className="text-sm font-semibold text-gray-800">{fmtTime(today.clock_in)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Clock Out</p>
                <p className="text-sm font-semibold text-gray-800">{fmtTime(today.clock_out)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">
                  {isClockedIn ? 'Working' : 'Hours'}
                </p>
                <p className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                  {isClockedIn ? (
                    <>
                      <Timer size={13} className="text-indigo-500" />
                      {liveHours || '—'}
                    </>
                  ) : (
                    today.work_hours !== '0.00' ? `${today.work_hours}h` : '—'
                  )}
                </p>
              </div>
              {today.late_minutes > 0 && (
                <div className="col-span-3">
                  <p className="text-xs text-yellow-600">Late by {today.late_minutes} min</p>
                </div>
              )}
              {today.shift_name && (
                <div className="col-span-3">
                  <p className="text-xs text-gray-400">
                    Shift: <span className="font-medium text-gray-600">{today.shift_name}</span>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No record yet for today.</p>
          )}
        </div>

        {/* Action area */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          <button
            onClick={handleClockToggle}
            disabled={buttonBusy || isClockedOut}
            className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50 ${
              isClockedIn
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : isClockedOut
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {buttonBusy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isClockedIn ? (
              <ClockArrowDown size={16} />
            ) : (
              <ClockArrowUp size={16} />
            )}
            {isClockedOut ? 'Done for today' : isClockedIn ? 'Clock Out' : 'Clock In'}
          </button>

          <p className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin size={11} />
            GPS captured automatically
          </p>

          {canManage && (
            <>
              <button
                onClick={() => setShowPolicy(true)}
                className="flex items-center gap-1.5 mt-1 text-xs text-gray-500 hover:text-indigo-600 transition"
              >
                <Settings2 size={13} />
                Attendance Policy
              </button>
              <button
                onClick={() => { setShowManualPicker(v => !v); setPickerStaffId(''); setPickerDate(new Date().toISOString().slice(0, 10)) }}
                className={`flex items-center gap-1.5 text-xs transition ${showManualPicker ? 'text-indigo-600 font-medium' : 'text-gray-500 hover:text-indigo-600'}`}
              >
                <SlidersHorizontal size={13} />
                Manual Mark
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Manual mark picker ── */}
      {showManualPicker && canManage && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-indigo-700 mb-3 uppercase tracking-wide">
            Manual Mark — Select Staff &amp; Date
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Staff</label>
              <select
                value={pickerStaffId}
                onChange={e => setPickerStaffId(e.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500 min-w-[180px]"
              >
                <option value="">Select staff…</option>
                {profiles.map(p => (
                  <option key={p.staff} value={p.staff}>{p.staff_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date</label>
              <input
                type="date"
                value={pickerDate}
                onChange={e => setPickerDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                disabled={!pickerStaffId}
                onClick={() => {
                  const p = profiles.find(x => String(x.staff) === pickerStaffId)
                  setManualTarget({ staffId: Number(pickerStaffId), staffName: p?.staff_name ?? '', date: pickerDate })
                  setShowManualPicker(false)
                }}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-40"
              >
                Continue
              </button>
              <button
                onClick={() => setShowManualPicker(false)}
                className="px-4 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-600 hover:text-gray-800 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Weekly summary chips ── */}
      {summary && (
        <div className="flex flex-wrap gap-2">
          {(Object.entries(summary) as [AttendanceStatus, number][])
            .filter(([k, v]) => v > 0 && k in STATUS_META)
            .map(([k, v]) => {
              const meta = STATUS_META[k]
              return (
                <span
                  key={k}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${meta.color}`}
                >
                  {meta.label}
                  <span className="font-bold">{v}</span>
                </span>
              )
            })}
          {(summary.not_recorded ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              Not Recorded
              <span className="font-bold">{summary.not_recorded}</span>
            </span>
          )}
          <span className="text-xs text-gray-400 self-center ml-1">this week</span>
        </div>
      )}

      {/* ── Filter bar (manager / admin only) ── */}
      {canManage && (
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
              <SlidersHorizontal size={13} />
              Filters
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition"
              >
                <FilterX size={13} />
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); resetPage() }}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); resetPage() }}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); resetPage() }}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">All</option>
                {Object.entries(STATUS_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Staff</label>
              <select
                value={filterStaffId}
                onChange={e => { setFilterStaffId(e.target.value); resetPage() }}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">All Staff</option>
                {profiles.map(p => (
                  <option key={p.staff} value={p.staff}>{p.staff_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Department</label>
              <select
                value={filterDeptId}
                onChange={e => { setFilterDeptId(e.target.value); resetPage() }}
                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">All Depts</option>
                {depts.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ── History table ── */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <SlidersHorizontal size={15} className="text-gray-400" />
            Attendance History
          </h2>
          <p className="text-xs text-gray-400">
            {historyPage?.count ?? 0} record{historyPage?.count !== 1 ? 's' : ''}
          </p>
        </div>

        {histLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : !(historyPage?.results ?? []).length ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
            <CalendarX2 size={32} className="text-gray-200" />
            <p className="text-sm">No attendance records found.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    {canManage && <th className="px-4 py-2.5 text-left font-medium">Staff</th>}
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">In</th>
                    <th className="px-4 py-2.5 text-left font-medium">Out</th>
                    <th className="px-4 py-2.5 text-left font-medium">Hours</th>
                    <th className="px-4 py-2.5 text-left font-medium">Late</th>
                    <th className="px-4 py-2.5 text-left font-medium">
                      <span className="flex items-center gap-1"><TrendingUp size={12} />OT</span>
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium">
                      <span className="flex items-center gap-1"><AlarmClockMinus size={12} />Early</span>
                    </th>
                    {canManage && <th className="px-4 py-2.5 text-right font-medium">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(historyPage?.results ?? []).map(rec => (
                    <tr key={rec.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(rec.date)}</td>
                      {canManage && (
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <p className="text-gray-700 font-medium">{rec.staff_name}</p>
                            {rec.shift_name && (
                              <p className="text-xs text-gray-400">{rec.shift_name}</p>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3"><StatusBadge status={rec.status} /></td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtTime(rec.clock_in)}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtTime(rec.clock_out)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {rec.work_hours !== '0.00' ? `${rec.work_hours}h` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {rec.late_minutes > 0 ? (
                          <span className="text-yellow-600 font-medium">{rec.late_minutes}m</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {rec.overtime_minutes > 0 ? (
                          <span className="text-emerald-600 font-medium">{rec.overtime_minutes}m</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {rec.early_exit_minutes > 0 ? (
                          <span className="text-orange-500 font-medium">{rec.early_exit_minutes}m</span>
                        ) : '—'}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setEditRecord(rec)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition"
                          >
                            Override
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {(historyPage?.previous || historyPage?.next) && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={!historyPage?.previous}
                  className="text-xs text-gray-600 hover:text-indigo-600 disabled:opacity-40 transition"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-400">Page {page}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={!historyPage?.next}
                  className="text-xs text-gray-600 hover:text-indigo-600 disabled:opacity-40 transition"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showPolicy && <AttendancePolicyModal onClose={() => setShowPolicy(false)} />}

      {/* Admin override of existing record */}
      {editRecord && (
        <ManualMarkModal
          recordId={editRecord.id}
          staffId={editRecord.staff}
          staffName={editRecord.staff_name}
          date={editRecord.date}
          initialStatus={editRecord.status}
          initialClockIn={editRecord.clock_in ?? undefined}
          initialClockOut={editRecord.clock_out ?? undefined}
          onClose={() => setEditRecord(null)}
        />
      )}

      {/* Create new manual record */}
      {manualTarget && manualTarget.staffId > 0 && (
        <ManualMarkModal
          staffId={manualTarget.staffId}
          staffName={manualTarget.staffName}
          date={manualTarget.date}
          onClose={() => setManualTarget(null)}
        />
      )}
    </div>
  )
}
