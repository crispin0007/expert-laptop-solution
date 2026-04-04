/**
 * AttendancePolicyModal — admin/manager can view and update the tenant's
 * attendance policy (work hours, late threshold, deduction rules).
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM } from '../../../api/endpoints'
import Modal from '../../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AttendancePolicy {
  expected_start_time: string   // "HH:MM:SS"
  expected_end_time: string
  late_threshold_minutes: number
  grace_period_minutes: number
  half_day_threshold_hours: string  // Decimal from API
  work_days: number[]               // [0,1,2,3,4,6] = Sun–Fri Nepal
  deduct_absent: boolean
  deduct_late: boolean
  late_deduction_grace_minutes: number
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
// Python weekday(): Mon=0 … Sat=5, Sun=6

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export default function AttendancePolicyModal({ onClose }: Props) {
  const qc = useQueryClient()

  const { data: policy, isLoading } = useQuery<AttendancePolicy>({
    queryKey: ['attendance-policy'],
    queryFn: () => apiClient.get(HRM.ATTENDANCE_POLICY).then(r => r.data.data ?? r.data),
  })

  const [form, setForm] = useState<AttendancePolicy>({
    expected_start_time: '09:00:00',
    expected_end_time: '18:00:00',
    late_threshold_minutes: 15,
    grace_period_minutes: 0,
    half_day_threshold_hours: '4.0',
    work_days: [0, 1, 2, 3, 4, 6],
    deduct_absent: true,
    deduct_late: true,
    late_deduction_grace_minutes: 60,
  })

  useEffect(() => {
    if (policy) setForm(policy)
  }, [policy])

  const update = useMutation({
    mutationFn: (data: AttendancePolicy) =>
      apiClient.put(HRM.ATTENDANCE_POLICY, data),
    onSuccess: () => {
      toast.success('Policy updated')
      qc.invalidateQueries({ queryKey: ['attendance-policy'] })
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message ?? 'Failed to update policy')
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    update.mutate(form)
  }

  function toggleWorkDay(day: number) {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(day)
        ? f.work_days.filter(d => d !== day)
        : [...f.work_days, day].sort((a, b) => a - b),
    }))
  }

  // Convert "HH:MM:SS" → "HH:MM" for the time input
  function toTimeInput(t: string) { return t.slice(0, 5) }
  // Convert "HH:MM" → "HH:MM:00" for the API
  function fromTimeInput(t: string) { return t + ':00' }

  return (
    <Modal open title="Attendance Policy" onClose={onClose} width="max-w-xl">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={22} className="animate-spin text-gray-300" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="p-6 space-y-5">

          {/* Work hours */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Work Hours</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="text-gray-600 text-xs">Start Time</span>
                <input
                  type="time"
                  value={toTimeInput(form.expected_start_time)}
                  onChange={e => setForm(f => ({ ...f, expected_start_time: fromTimeInput(e.target.value) }))}
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600 text-xs">End Time</span>
                <input
                  type="time"
                  value={toTimeInput(form.expected_end_time)}
                  onChange={e => setForm(f => ({ ...f, expected_end_time: fromTimeInput(e.target.value) }))}
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600 text-xs">Late Threshold (min)</span>
                <input
                  type="number" min={0} max={120}
                  value={form.late_threshold_minutes}
                  onChange={e => setForm(f => ({ ...f, late_threshold_minutes: +e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600 text-xs">Grace Period (min)</span>
                <input
                  type="number" min={0} max={60}
                  value={form.grace_period_minutes}
                  onChange={e => setForm(f => ({ ...f, grace_period_minutes: +e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
              <label className="col-span-2 block text-sm">
                <span className="text-gray-600 text-xs">Half-day Threshold (hours)</span>
                <input
                  type="number" min={1} max={8} step={0.5}
                  value={form.half_day_threshold_hours}
                  onChange={e => setForm(f => ({ ...f, half_day_threshold_hours: e.target.value }))}
                  className="mt-1 block w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </label>
            </div>
          </div>

          {/* Work days */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Work Days</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_LABELS.map((label, idx) => {
                // Map display index (Mon=0…Sun=6) to Python weekday (Mon=0…Sun=6)
                const day = idx
                const active = form.work_days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWorkDay(day)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      active
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Deduction rules */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Deductions</p>
            <div className="space-y-2.5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.deduct_absent}
                  onChange={e => setForm(f => ({ ...f, deduct_absent: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Deduct salary for absent days</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.deduct_late}
                  onChange={e => setForm(f => ({ ...f, deduct_late: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Deduct salary for excessive late arrivals</span>
              </label>
              {form.deduct_late && (
                <label className="block text-sm pl-7">
                  <span className="text-gray-600 text-xs">Grace period before late deduction kicks in (min)</span>
                  <input
                    type="number" min={0} max={480}
                    value={form.late_deduction_grace_minutes}
                    onChange={e => setForm(f => ({ ...f, late_deduction_grace_minutes: +e.target.value }))}
                    className="mt-1 block w-40 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </label>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={update.isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              {update.isPending && <Loader2 size={14} className="animate-spin" />}
              Save Policy
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
