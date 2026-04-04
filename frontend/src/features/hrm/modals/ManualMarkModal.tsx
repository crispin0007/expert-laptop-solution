/**
 * ManualMarkModal — admin/manager creates or overrides an attendance record.
 *
 * Two modes:
 *  - Create (no recordId): POST /attendance/manual_mark/ — choose staff + date + status
 *  - Override (recordId provided): PATCH /attendance/{id}/ — edit clock times, status,
 *    break minutes, and leave an admin remark. Uses AttendanceAdminUpdateSerializer.
 */
import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM } from '../../../api/endpoints'
import Modal from '../../../components/Modal'
import type { AttendanceStatus } from '../tabs/AttendanceTab'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'present',  label: 'Present' },
  { value: 'absent',   label: 'Absent' },
  { value: 'late',     label: 'Late' },
  { value: 'half_day', label: 'Half Day' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'holiday',  label: 'Holiday' },
  { value: 'wfh',      label: 'Work From Home' },
]

/** Convert an ISO datetime string to a datetime-local input value (YYYY-MM-DDTHH:MM). */
function toLocalInput(iso: string | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return '' }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  staffId:         number
  staffName:       string
  date:            string         // ISO date "YYYY-MM-DD"
  onClose:         () => void

  // Override mode (editing an existing record)
  recordId?:       number
  initialStatus?:  AttendanceStatus
  initialClockIn?: string         // ISO datetime
  initialClockOut?:string         // ISO datetime
}

export default function ManualMarkModal({
  staffId, staffName, date, onClose,
  recordId, initialStatus, initialClockIn, initialClockOut,
}: Props) {
  const qc = useQueryClient()
  const isOverride = !!recordId

  const [status,       setStatus]       = useState<AttendanceStatus>(initialStatus ?? 'present')
  const [clockIn,      setClockIn]      = useState(toLocalInput(initialClockIn))
  const [clockOut,     setClockOut]     = useState(toLocalInput(initialClockOut))
  const [breakMins,    setBreakMins]    = useState('')
  const [note,         setNote]         = useState('')
  const [adminRemarks, setAdminRemarks] = useState('')

  const mark = useMutation({
    mutationFn: () => {
      if (isOverride) {
        // PATCH — admin override; only send changed fields
        const payload: Record<string, unknown> = { status, note }
        if (clockIn)   payload.clock_in       = new Date(clockIn).toISOString()
        if (clockOut)  payload.clock_out      = new Date(clockOut).toISOString()
        if (breakMins) payload.break_minutes  = Number(breakMins)
        if (adminRemarks) payload.admin_remarks = adminRemarks
        return apiClient.patch(HRM.ATTENDANCE_DETAIL(recordId!), payload)
      }
      // POST — create / manual mark
      return apiClient.post(HRM.ATTENDANCE_MANUAL_MARK, {
        staff_id: staffId,
        date,
        status,
        note,
      })
    },
    onSuccess: () => {
      toast.success(isOverride ? 'Record updated' : `Marked ${staffName} as ${status} on ${date}`)
      qc.invalidateQueries({ queryKey: ['attendance'] })
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.errors?.[0] ?? e?.response?.data?.message ?? 'Failed to update')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    mark.mutate()
  }

  return (
    <Modal
      open
      title={isOverride ? 'Override Attendance Record' : 'Manual Attendance Mark'}
      onClose={onClose}
      width="max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-4">

        {/* Info row */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 text-sm grid grid-cols-2 gap-2">
          <div>
            <p className="text-gray-400 text-xs">Staff</p>
            <p className="font-medium text-gray-800">{staffName || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Date</p>
            <p className="font-medium text-gray-800">{date}</p>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Status</label>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatus(opt.value)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${
                  status === opt.value
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Clock override (admin override mode only) */}
        {isOverride && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock In</label>
                <input
                  type="datetime-local"
                  value={clockIn}
                  onChange={e => setClockIn(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Clock Out</label>
                <input
                  type="datetime-local"
                  value={clockOut}
                  onChange={e => setClockOut(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Break (minutes)</label>
              <input
                type="number"
                min={0}
                max={480}
                value={breakMins}
                onChange={e => setBreakMins(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
          </>
        )}

        {/* Note */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            {isOverride ? 'Staff Note (optional)' : 'Note (optional)'}
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Reason for manual override…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
          />
        </div>

        {/* Admin remarks (override mode only) */}
        {isOverride && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Admin Remarks</label>
            <textarea
              value={adminRemarks}
              onChange={e => setAdminRemarks(e.target.value)}
              rows={2}
              placeholder="Internal note about this override…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mark.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {mark.isPending && <Loader2 size={14} className="animate-spin" />}
            {isOverride ? 'Override' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
