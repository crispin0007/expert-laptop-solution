/**
 * ShiftTab — manage work shifts and per-staff shift assignments.
 *
 * Sections:
 *  1. Shift list (cards) — create / edit / deactivate
 *  2. Staff assignment — assign a shift to a staff member for a date range
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Clock, Plus, Pencil, Loader2, CheckCircle2,
  UserCheck, CalendarRange, Trash2,
} from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM } from '../../../api/endpoints'
import Modal from '../../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Shift {
  id: number
  name: string
  start_time: string        // "HH:MM:SS"
  end_time: string          // "HH:MM:SS"
  grace_period_minutes: number
  min_work_hours: string    // decimal string
  overtime_after_hours: string
  work_days: number[]       // weekday() integers: Mon=0 … Sun=6
  is_default: boolean
  is_active: boolean
}

interface ShiftAssignment {
  id: number
  staff: number
  staff_name: string
  staff_email: string
  shift: number
  shift_name: string
  effective_from: string
  effective_to: string | null
}

interface StaffProfile {
  id: number
  staff: number
  staff_name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(t: string): string {
  // "09:00:00" → "9:00 AM"
  try {
    const [h, m] = t.split(':').map(Number)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 || 12
    return `${hh}:${String(m).padStart(2, '0')} ${ampm}`
  } catch { return t }
}

// ── Shift Form Modal ──────────────────────────────────────────────────────────

interface ShiftFormProps {
  shift?: Shift
  onClose: () => void
}

function ShiftFormModal({ shift, onClose }: ShiftFormProps) {
  const qc = useQueryClient()
  const isEdit = !!shift

  const [name,       setName]       = useState(shift?.name ?? '')
  const [startTime,  setStartTime]  = useState(shift?.start_time?.slice(0, 5) ?? '09:00')
  const [endTime,    setEndTime]    = useState(shift?.end_time?.slice(0, 5) ?? '17:00')
  const [grace,      setGrace]      = useState(String(shift?.grace_period_minutes ?? 10))
  const [minHours,   setMinHours]   = useState(shift?.min_work_hours ?? '8.0')
  const [otHours,    setOtHours]    = useState(shift?.overtime_after_hours ?? '8.0')
  const [isDefault,  setIsDefault]  = useState(shift?.is_default ?? false)
  const [isActive,   setIsActive]   = useState(shift?.is_active ?? true)
  const [workDays,   setWorkDays]   = useState<number[]>(shift?.work_days ?? [0, 1, 2, 3, 4, 6])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        start_time: startTime,
        end_time: endTime,
        grace_period_minutes: Number(grace),
        min_work_hours: minHours,
        overtime_after_hours: otHours,
        work_days: workDays,
        is_default: isDefault,
        is_active: isActive,
      }
      return isEdit
        ? apiClient.patch(HRM.SHIFT_DETAIL(shift!.id), payload)
        : apiClient.post(HRM.SHIFTS, payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Shift updated' : 'Shift created')
      qc.invalidateQueries({ queryKey: ['hrm', 'shifts'] })
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Failed to save shift')
    },
  })

  return (
    <Modal open title={isEdit ? 'Edit Shift' : 'New Shift'} onClose={onClose} width="max-w-md">
      <form
        onSubmit={(e: React.FormEvent) => { e.preventDefault(); save.mutate() }}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Shift Name</label>
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Morning, Night, Split"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Start Time</label>
            <input
              required
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">End Time</label>
            <input
              required
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Grace (min)</label>
            <input
              required
              type="number"
              min={0}
              max={120}
              value={grace}
              onChange={e => setGrace(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Min Hours</label>
            <input
              required
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={minHours}
              onChange={e => setMinHours(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">OT After (h)</label>
            <input
              required
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={otHours}
              onChange={e => setOtHours(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-2">Working Days</label>
          <div className="flex flex-wrap gap-3">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
              <label key={i} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={workDays.includes(i)}
                  onChange={e =>
                    setWorkDays(prev =>
                      e.target.checked
                        ? [...prev, i].sort((a, b) => a - b)
                        : prev.filter(d => d !== i),
                    )
                  }
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-700">{day}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={e => setIsDefault(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Default shift</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={e => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {save.isPending && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Assignment Modal ──────────────────────────────────────────────────────────

interface AssignModalProps {
  shifts: Shift[]
  profiles: StaffProfile[]
  onClose: () => void
}

function AssignModal({ shifts, profiles, onClose }: AssignModalProps) {
  const qc = useQueryClient()
  const [staffId,       setStaffId]       = useState('')
  const [shiftId,       setShiftId]       = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [effectiveTo,   setEffectiveTo]   = useState('')

  const assign = useMutation({
    mutationFn: () =>
      apiClient.post(HRM.SHIFT_ASSIGNMENTS, {
        staff_id:      Number(staffId),
        shift_id:      Number(shiftId),
        effective_from: effectiveFrom,
        ...(effectiveTo && { effective_to: effectiveTo }),
      }),
    onSuccess: () => {
      toast.success('Shift assigned')
      qc.invalidateQueries({ queryKey: ['hrm', 'shift-assignments'] })
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Failed to assign')
    },
  })

  return (
    <Modal open title="Assign Shift to Staff" onClose={onClose} width="max-w-sm">
      <form
        onSubmit={(e: React.FormEvent) => { e.preventDefault(); assign.mutate() }}
        className="p-6 space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Staff</label>
          <select
            required
            value={staffId}
            onChange={e => setStaffId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select staff…</option>
            {profiles.map(p => (
<option key={p.staff} value={p.staff}>{p.staff_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Shift</label>
          <select
            required
            value={shiftId}
            onChange={e => setShiftId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">Select shift…</option>
            {shifts.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({fmtTime(s.start_time)} – {fmtTime(s.end_time)})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Effective From</label>
            <input
              required
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Until (optional)</label>
            <input
              type="date"
              value={effectiveTo}
              onChange={e => setEffectiveTo(e.target.value)}
              min={effectiveFrom}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
            Cancel
          </button>
          <button
            type="submit"
            disabled={assign.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {assign.isPending && <Loader2 size={14} className="animate-spin" />}
            Assign
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ShiftTab() {
  const qc = useQueryClient()

  const [showCreate,    setShowCreate]    = useState(false)
  const [editShift,     setEditShift]     = useState<Shift | null>(null)
  const [showAssign,    setShowAssign]    = useState(false)
  const [filterStaffId, setFilterStaffId] = useState('')

  // Shifts
  const { data: shiftsData = [], isLoading: shiftsLoading } = useQuery<Shift[]>({
    queryKey: ['hrm', 'shifts'],
    queryFn: () => apiClient.get(HRM.SHIFTS, { params: { page_size: 50 } }).then(r => r.data.data ?? []),
  })
  const shifts = shiftsData

  // Staff profiles (for assignment dropdown)
  const { data: profilesData = [] } = useQuery<StaffProfile[]>({
    queryKey: ['hrm', 'profiles', 'minimal'],
    queryFn: () => apiClient.get(HRM.PROFILES, { params: { page_size: 200 } }).then(r => r.data.data ?? []),
  })
  const profiles = profilesData

  // Assignments
  const assignParams = filterStaffId ? { staff_id: filterStaffId, page_size: 50 } : { page_size: 50 }
  const { data: assignData = [], isLoading: assignLoading } = useQuery<ShiftAssignment[]>({
    queryKey: ['hrm', 'shift-assignments', filterStaffId],
    queryFn: () =>
      apiClient.get(HRM.SHIFT_ASSIGNMENTS, { params: assignParams }).then(r => r.data.data ?? []),
  })
  const assignments = assignData

  // Delete assignment
  const deleteAssign = useMutation({
    mutationFn: (id: number) => apiClient.delete(HRM.SHIFT_ASSIGNMENT_DETAIL(id)),
    onSuccess: () => {
      toast.success('Assignment removed')
      qc.invalidateQueries({ queryKey: ['hrm', 'shift-assignments'] })
    },
    onError: () => toast.error('Failed to remove assignment'),
  })

  return (
    <div className="space-y-8">

      {/* ── Shifts List ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            Work Shifts
          </h2>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition"
          >
            <Plus size={14} />
            New Shift
          </button>
        </div>

        {shiftsLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 size={22} className="animate-spin text-gray-300" />
          </div>
        ) : !shifts.length ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
            <Clock size={28} className="mx-auto mb-2 text-gray-200" />
            <p className="text-sm">No shifts configured. Create your first shift.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map(s => (
              <div
                key={s.id}
                className={`bg-white border rounded-xl p-5 shadow-sm relative ${
                  s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                }`}
              >
                {s.is_default && (
                  <span className="absolute top-3 right-3 flex items-center gap-1 text-xs text-indigo-600 font-medium">
                    <CheckCircle2 size={12} />
                    Default
                  </span>
                )}
                <p className="font-semibold text-gray-800 mb-1">{s.name}</p>
                <p className="text-sm text-gray-500 mb-3">
                  {fmtTime(s.start_time)} – {fmtTime(s.end_time)}
                </p>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                  <div>
                    <p className="text-gray-400">Grace</p>
                    <p className="font-medium text-gray-700">{s.grace_period_minutes}m</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Min Hrs</p>
                    <p className="font-medium text-gray-700">{s.min_work_hours}h</p>
                  </div>
                  <div>
                    <p className="text-gray-400">OT After</p>
                    <p className="font-medium text-gray-700">{s.overtime_after_hours}h</p>
                  </div>
                </div>
                {s.work_days && s.work_days.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.work_days.map(d => (
                      <span key={d} className="text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d]}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                  <span className={`text-xs font-medium ${s.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                  <button
                    onClick={() => setEditShift(s)}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Assignments ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <UserCheck size={16} className="text-gray-400" />
            Staff Assignments
          </h2>
          <div className="flex items-center gap-3">
            <select
              value={filterStaffId}
              onChange={e => setFilterStaffId(e.target.value)}
              className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All Staff</option>
              {profiles.map(p => (
                <option key={p.staff} value={p.staff}>{p.staff_name}</option>
              ))}
            </select>
            <button
              onClick={() => setShowAssign(true)}
              disabled={!shifts.length}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition disabled:opacity-50"
            >
              <CalendarRange size={13} />
              Assign
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          {assignLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={20} className="animate-spin text-gray-300" />
            </div>
          ) : !assignments.length ? (
            <div className="py-10 text-center text-gray-400">
              <UserCheck size={26} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm">No shift assignments found.</p>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-2.5 text-left font-medium">Staff</th>
                  <th className="px-5 py-2.5 text-left font-medium">Shift</th>
                  <th className="px-5 py-2.5 text-left font-medium">From</th>
                  <th className="px-5 py-2.5 text-left font-medium">Until</th>
                  <th className="px-5 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {assignments.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{a.staff_name}</p>
                      <p className="text-xs text-gray-400">{a.staff_email}</p>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{a.shift_name}</td>
                    <td className="px-5 py-3 text-gray-600">{a.effective_from}</td>
                    <td className="px-5 py-3 text-gray-500">{a.effective_to ?? 'Ongoing'}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => {
                          if (confirm('Remove this shift assignment?')) deleteAssign.mutate(a.id)
                        }}
                        className="text-red-400 hover:text-red-600 transition"
                        title="Remove assignment"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ── Modals ── */}
      {showCreate && <ShiftFormModal onClose={() => setShowCreate(false)} />}
      {editShift  && <ShiftFormModal shift={editShift} onClose={() => setEditShift(null)} />}
      {showAssign && (
        <AssignModal
          shifts={shifts.filter(s => s.is_active)}
          profiles={profiles}
          onClose={() => setShowAssign(false)}
        />
      )}
    </div>
  )
}
