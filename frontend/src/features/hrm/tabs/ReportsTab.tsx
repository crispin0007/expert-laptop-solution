/**
 * ReportsTab — attendance reports.
 *
 * Two report types:
 *  1. Daily Report  — attendance summary for a single date (org-wide or by dept)
 *  2. Monthly Report — per-staff attendance summary for a year/month
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, BarChart3, CalendarDays } from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM, DEPARTMENTS } from '../../../api/endpoints'
import type { AttendanceStatus } from './AttendanceTab'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyRecord {
  staff: number
  staff_name: string
  status: AttendanceStatus | null
  clock_in: string | null
  clock_out: string | null
  late_minutes: number
  overtime_minutes: number
  work_hours: string
  shift_name?: string | null
}

interface DailyReport {
  date: string
  total_staff: number
  present: number
  absent: number
  late: number
  half_day: number
  on_leave: number
  wfh: number
  not_recorded: number
  records: DailyRecord[]
}

interface MonthlyRecord {
  date: string
  status: AttendanceStatus
  clock_in: string | null
  clock_out: string | null
  late_minutes: number
  overtime_minutes: number
  work_hours: string
  shift_name?: string | null
}

interface MonthlyReport {
  staff_id?: number
  staff_name?: string
  year: number
  month: number
  total_days: number
  working_days?: number
  present: number
  absent: number
  late: number
  half_day: number
  on_leave: number
  wfh: number
  total_work_hours: string
  total_late_minutes: number
  total_overtime_minutes: number
  records?: MonthlyRecord[]
}

interface Department { id: number; name: string }
interface StaffProfile { id: number; staff: number; staff_name: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  present:  'text-green-700 bg-green-50',
  absent:   'text-red-700 bg-red-50',
  late:     'text-yellow-700 bg-yellow-50',
  half_day: 'text-orange-700 bg-orange-50',
  on_leave: 'text-blue-700 bg-blue-50',
  wfh:      'text-teal-700 bg-teal-50',
  holiday:  'text-purple-700 bg-purple-50',
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 border ${color}`}>
      <p className="text-xs opacity-70 mb-0.5">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function currentYearMonth(): { year: number; month: number } {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

// ── Daily Report ──────────────────────────────────────────────────────────────

function DailyReportPane() {
  const [date,   setDate]   = useState(today())
  const [deptId, setDeptId] = useState('')

  const { data: depts = [] } = useQuery<Department[]>({
    queryKey: ['departments', 'list'],
    queryFn: () => apiClient.get(DEPARTMENTS.LIST, { params: { page_size: 100 } }).then(r => r.data.data ?? []),
  })

  const params = { date, ...(deptId && { dept_id: deptId }) }
  const { data: report, isLoading, error } = useQuery<DailyReport>({
    queryKey: ['hrm', 'daily-report', params],
    queryFn: () => apiClient.get(HRM.ATTENDANCE_DAILY_REPORT, { params }).then(r => r.data.data),
    enabled: !!date,
  })

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Department</label>
          <select
            value={deptId}
            onChange={e => setDeptId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Departments</option>
            {depts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-gray-300" />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 py-4">Failed to load report.</p>
      )}

      {report && (
        <>
          {/* Stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Present"     value={report.present}      color="border-green-200 text-green-800" />
            <StatCard label="Absent"      value={report.absent}       color="border-red-200 text-red-800" />
            <StatCard label="Late"        value={report.late}         color="border-yellow-200 text-yellow-800" />
            <StatCard label="On Leave"    value={report.on_leave}     color="border-blue-200 text-blue-800" />
            <StatCard label="Half Day"    value={report.half_day}     color="border-orange-200 text-orange-800" />
            <StatCard label="WFH"         value={report.wfh}          color="border-teal-200 text-teal-800" />
            <StatCard label="Not Recorded" value={report.not_recorded} color="border-gray-200 text-gray-600" />
            <StatCard label="Total Staff" value={report.total_staff}  color="border-indigo-200 text-indigo-800" />
          </div>

          {/* Records table */}
          {report.records.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Individual Records — {report.date}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-5 py-2.5 text-left font-medium">Staff</th>
                      <th className="px-5 py-2.5 text-left font-medium">Status</th>
                      <th className="px-5 py-2.5 text-left font-medium">In</th>
                      <th className="px-5 py-2.5 text-left font-medium">Out</th>
                      <th className="px-5 py-2.5 text-left font-medium">Hours</th>
                      <th className="px-5 py-2.5 text-left font-medium">Late</th>
                      <th className="px-5 py-2.5 text-left font-medium">OT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {report.records.map(r => (
                      <tr key={r.staff} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-800">{r.staff_name}</p>
                          {r.shift_name && <p className="text-xs text-gray-400">{r.shift_name}</p>}
                        </td>
                        <td className="px-5 py-3">
                          {r.status ? (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {r.status.replace('_', ' ')}
                            </span>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{fmtTime(r.clock_in)}</td>
                        <td className="px-5 py-3 text-gray-600">{fmtTime(r.clock_out)}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {r.work_hours !== '0.00' ? `${r.work_hours}h` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {r.late_minutes > 0 ? (
                            <span className="text-yellow-600 font-medium">{r.late_minutes}m</span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {r.overtime_minutes > 0 ? (
                            <span className="text-emerald-600 font-medium">{r.overtime_minutes}m</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Monthly Report ────────────────────────────────────────────────────────────

function MonthlyReportPane() {
  const now = currentYearMonth()
  const [staffId, setStaffId] = useState('')
  const [year,    setYear]    = useState(String(now.year))
  const [month,   setMonth]   = useState(String(now.month))

  const { data: profiles = [] } = useQuery<StaffProfile[]>({
    queryKey: ['hrm', 'profiles', 'minimal'],
    queryFn: () => apiClient.get(HRM.PROFILES, { params: { page_size: 200 } }).then(r => r.data.data ?? []),
  })

  const params = { year, month, ...(staffId && { staff_id: staffId }) }
  const { data: report, isLoading, error } = useQuery<MonthlyReport | MonthlyReport[]>({
    queryKey: ['hrm', 'monthly-report', params],
    queryFn: () => apiClient.get(HRM.ATTENDANCE_MONTHLY_REPORT, { params }).then(r => r.data.data),
    enabled: !!(year && month),
  })

  // Single staff detailed view (staffId selected) or aggregate (all staff)
  const singleReport    = staffId  && report && !Array.isArray(report) ? report : null
  const aggregateReport = !staffId && report && !Array.isArray(report) ? report : null

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={e => setYear(e.target.value)}
            className="w-24 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>
                {new Date(2024, m - 1).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Staff (optional)</label>
          <select
            value={staffId}
            onChange={e => setStaffId(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">All Staff</option>
            {profiles.map(p => (
              <option key={p.staff} value={p.staff}>{p.staff_name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-gray-300" />
        </div>
      )}

      {error && (
        <p className="text-sm text-red-500 py-4">Failed to load report.</p>
      )}

      {/* Single staff detailed view */}
      {singleReport && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 shadow-sm">
            <p className="font-semibold text-gray-800 mb-0.5">{singleReport.staff_name}</p>
            <p className="text-xs text-gray-400">
              {new Date(singleReport.year, singleReport.month - 1).toLocaleString('default', { month: 'long' })} {singleReport.year}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Present"      value={singleReport.present}               color="border-green-200 text-green-800" />
            <StatCard label="Absent"       value={singleReport.absent}                color="border-red-200 text-red-800" />
            <StatCard label="Late Days"    value={singleReport.late}                  color="border-yellow-200 text-yellow-800" />
            <StatCard label="Total Hours"  value={`${singleReport.total_work_hours}h`} color="border-indigo-200 text-indigo-800" />
            <StatCard label="Total Late"   value={`${singleReport.total_late_minutes}m`} color="border-orange-200 text-orange-800" />
            <StatCard label="Overtime"     value={`${singleReport.total_overtime_minutes}m`} color="border-emerald-200 text-emerald-800" />
            <StatCard label="On Leave"     value={singleReport.on_leave}              color="border-blue-200 text-blue-800" />
            <StatCard label="Working Days" value={singleReport.working_days ?? singleReport.total_days} color="border-gray-200 text-gray-600" />
          </div>

          {(singleReport.records ?? []).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-5 py-2.5 text-left font-medium">Date</th>
                      <th className="px-5 py-2.5 text-left font-medium">Status</th>
                      <th className="px-5 py-2.5 text-left font-medium">In</th>
                      <th className="px-5 py-2.5 text-left font-medium">Out</th>
                      <th className="px-5 py-2.5 text-left font-medium">Hours</th>
                      <th className="px-5 py-2.5 text-left font-medium">Late</th>
                      <th className="px-5 py-2.5 text-left font-medium">OT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(singleReport.records ?? []).map(r => (
                      <tr key={r.date} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3 text-gray-700">{r.date}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.status.replace('_', ' ')}
                          </span>
                          {r.shift_name && <p className="text-xs text-gray-400 mt-0.5">{r.shift_name}</p>}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{fmtTime(r.clock_in)}</td>
                        <td className="px-5 py-3 text-gray-600">{fmtTime(r.clock_out)}</td>
                        <td className="px-5 py-3 text-gray-600">
                          {r.work_hours !== '0.00' ? `${r.work_hours}h` : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {r.late_minutes > 0 ? (
                            <span className="text-yellow-600 font-medium">{r.late_minutes}m</span>
                          ) : '—'}
                        </td>
                        <td className="px-5 py-3">
                          {r.overtime_minutes > 0 ? (
                            <span className="text-emerald-600 font-medium">{r.overtime_minutes}m</span>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Aggregate stats — all staff, no individual selected */}
      {aggregateReport && (
        <div className="space-y-3">
          <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 shadow-sm">
            <p className="font-semibold text-gray-800">
              {new Date(Number(year), Number(month) - 1).toLocaleString('default', { month: 'long' })} {year} — All Staff
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Present"    value={aggregateReport.present}                       color="border-green-200 text-green-800" />
            <StatCard label="Absent"     value={aggregateReport.absent}                        color="border-red-200 text-red-800" />
            <StatCard label="Late Days"  value={aggregateReport.late}                          color="border-yellow-200 text-yellow-800" />
            <StatCard label="On Leave"   value={aggregateReport.on_leave}                      color="border-blue-200 text-blue-800" />
            <StatCard label="WFH"        value={aggregateReport.wfh}                           color="border-teal-200 text-teal-800" />
            <StatCard label="Half Day"   value={aggregateReport.half_day}                      color="border-orange-200 text-orange-800" />
            <StatCard label="Total OT"   value={`${aggregateReport.total_overtime_minutes}m`}  color="border-emerald-200 text-emerald-800" />
            <StatCard label="Total Late" value={`${aggregateReport.total_late_minutes}m`}      color="border-orange-200 text-orange-800" />
          </div>
          <p className="text-xs text-gray-400 text-center">Select a staff member above to view their individual breakdown.</p>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type ReportMode = 'daily' | 'monthly'

export default function ReportsTab() {
  const [mode, setMode] = useState<ReportMode>('daily')

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {(['daily', 'monthly'] as ReportMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
              mode === m
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
            }`}
          >
            {m === 'daily' ? <CalendarDays size={15} /> : <BarChart3 size={15} />}
            {m === 'daily' ? 'Daily Report' : 'Monthly Report'}
          </button>
        ))}
      </div>

      {mode === 'daily'   && <DailyReportPane />}
      {mode === 'monthly' && <MonthlyReportPane />}
    </div>
  )
}
