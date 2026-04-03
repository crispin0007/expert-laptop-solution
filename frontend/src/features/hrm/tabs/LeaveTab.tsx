/**
 * LeaveTab — leave requests management for all staff.
 *
 * Sub-tabs:
 *   My Leaves   — own requests + "Apply" button → modal
 *   Team Leaves — (managers only) pending requests + approve / reject
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Plus, Loader2, AlertCircle, CheckCircle2, X, Clock,
  CalendarDays, Users,
} from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM } from '../../../api/endpoints'
import { usePermissions } from '../../../hooks/usePermissions'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaveType {
  id: number
  name: string
  code: string
  days_allowed: number
  is_paid: boolean
}

interface LeaveBalance {
  id: number
  leave_type: number
  leave_type_name: string
  year: number
  allocated: string
  used: string
  available: string
}

interface LeaveRequest {
  id: number
  staff: number
  staff_name: string
  leave_type: number
  leave_type_name: string
  start_date: string
  end_date: string
  days: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason?: string
  rejection_reason?: string
  approved_by_name?: string | null
  approved_at?: string | null
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:   'bg-yellow-100 text-yellow-700',
  approved:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:   <Clock size={11} className="inline mr-1" />,
  approved:  <CheckCircle2 size={11} className="inline mr-1" />,
  rejected:  <X size={11} className="inline mr-1" />,
  cancelled: <X size={11} className="inline mr-1" />,
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { errors?: string[]; detail?: string; message?: string } } }
  return (
    e?.response?.data?.errors?.[0] ??
    e?.response?.data?.detail ??
    e?.response?.data?.message ??
    'Something went wrong'
  )
}

function currentBsYear(): number {
  const now = new Date()
  return now.getFullYear() + (now.getMonth() < 3 ? 56 : 57)
}

// ── Apply Leave Modal ─────────────────────────────────────────────────────────

interface ApplyForm {
  leave_type_id: number | ''
  start_date: string
  end_date: string
  reason: string
}

const EMPTY_FORM: ApplyForm = {
  leave_type_id: '',
  start_date: '',
  end_date: '',
  reason: '',
}

function ApplyLeaveModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void
  onSuccess: () => void
}) {
  const [form, setForm] = useState<ApplyForm>(EMPTY_FORM)

  const { data: leaveTypes } = useQuery({
    queryKey: ['hrm-leave-types'],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_TYPES).then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 60_000,
  })

  const bsYear = currentBsYear()
  const { data: balances } = useQuery({
    queryKey: ['hrm-my-balances', bsYear],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_BALANCES, { params: { year: bsYear } })
        .then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 30_000,
  })

  const balanceMap: Record<number, LeaveBalance> = {}
  ;(balances as LeaveBalance[] ?? []).forEach(b => { balanceMap[b.leave_type] = b })

  const mutation = useMutation({
    mutationFn: (data: ApplyForm) => apiClient.post(HRM.LEAVE_REQUESTS, data),
    onSuccess: () => {
      toast.success('Leave request submitted')
      onSuccess()
    },
    onError: (err) => toast.error(apiError(err)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.leave_type_id || !form.start_date || !form.end_date) {
      toast.error('Please fill in all required fields')
      return
    }
    mutation.mutate(form)
  }

  const selectedBalance = form.leave_type_id ? balanceMap[form.leave_type_id as number] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">Apply for Leave</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
          >
            <X size={16} />
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Leave type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Leave Type <span className="text-red-500">*</span>
            </label>
            <select
              value={form.leave_type_id}
              onChange={e => setForm(f => ({ ...f, leave_type_id: e.target.value ? Number(e.target.value) : '' }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              required
            >
              <option value="">Select leave type…</option>
              {(leaveTypes as LeaveType[] ?? []).filter(lt => lt.days_allowed > 0).map(lt => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
            {selectedBalance && (
              <p className="text-[11px] text-indigo-600 mt-1">
                Available: <strong>{selectedBalance.available}</strong> / {selectedBalance.allocated} days in BS {bsYear}
              </p>
            )}
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                From <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.start_date}
                max={form.end_date || undefined}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                To <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.end_date}
                min={form.start_date || undefined}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                required
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
            <textarea
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Optional reason or notes…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Reject modal ──────────────────────────────────────────────────────────────

function RejectModal({
  requestId,
  staffName,
  onClose,
  onSuccess,
}: {
  requestId: number
  staffName: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  const mutation = useMutation({
    mutationFn: () => apiClient.post(HRM.LEAVE_REQUEST_REJECT(requestId), { reason }),
    onSuccess: () => { toast.success('Leave request rejected'); onSuccess() },
    onError: (err) => toast.error(apiError(err)),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">Reject Leave Request</h3>
        <p className="text-xs text-gray-500 mb-4">Rejecting request from <strong>{staffName}</strong></p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder="Reason for rejection (optional)…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 size={12} className="animate-spin" />}
            Reject
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Leave request row ─────────────────────────────────────────────────────────

function LeaveRow({
  req,
  showStaff,
  onApprove,
  onReject,
  onCancel,
  canApprove,
  isOwnRequest,
}: {
  req: LeaveRequest
  showStaff: boolean
  onApprove?: (id: number) => void
  onReject?: (req: LeaveRequest) => void
  onCancel?: (id: number) => void
  canApprove: boolean
  isOwnRequest: boolean
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {showStaff && (
            <p className="text-xs font-semibold text-indigo-600 mb-0.5">{req.staff_name}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{req.leave_type_name}</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${STATUS_STYLES[req.status]}`}>
              {STATUS_ICONS[req.status]}
              {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
            <CalendarDays size={11} />
            <span>{req.start_date} → {req.end_date}</span>
            <span className="text-gray-400">·</span>
            <span className="font-medium text-gray-700">{req.days} {Number(req.days) === 1 ? 'day' : 'days'}</span>
          </div>
          {req.reason && (
            <p className="text-xs text-gray-400 mt-1 truncate">"{req.reason}"</p>
          )}
          {req.status === 'rejected' && req.rejection_reason && (
            <p className="text-xs text-red-500 mt-1">Rejected: {req.rejection_reason}</p>
          )}
          {req.status === 'approved' && req.approved_by_name && (
            <p className="text-xs text-green-600 mt-1">Approved by {req.approved_by_name}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {canApprove && req.status === 'pending' && (
            <>
              <button
                onClick={() => onApprove?.(req.id)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <CheckCircle2 size={11} />
                Approve
              </button>
              <button
                onClick={() => onReject?.(req)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition"
              >
                <X size={11} />
                Reject
              </button>
            </>
          )}
          {isOwnRequest && req.status === 'pending' && !canApprove && (
            <button
              onClick={() => onCancel?.(req.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <X size={11} />
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── My Leaves ─────────────────────────────────────────────────────────────────

function MyLeavesPane({ onApply }: { onApply: () => void }) {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const { data: requests, isLoading, isError } = useQuery({
    queryKey: ['hrm-my-requests', statusFilter],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_REQUESTS, {
        params: statusFilter !== 'all' ? { status: statusFilter } : {},
      }).then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 15_000,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(HRM.LEAVE_REQUEST_CANCEL(id), {}),
    onSuccess: () => {
      toast.success('Leave request cancelled')
      qc.invalidateQueries({ queryKey: ['hrm-my-requests'] })
    },
    onError: (err) => toast.error(apiError(err)),
  })

  const bsYear = currentBsYear()
  const { data: balances } = useQuery({
    queryKey: ['hrm-my-balances', bsYear],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_BALANCES, { params: { year: bsYear } })
        .then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 60_000,
  })

  return (
    <div>
      {/* Balance overview cards */}
      {(balances as LeaveBalance[] ?? []).length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            My Balances — BS {bsYear}
          </p>
          <div className="flex flex-wrap gap-2">
            {(balances as LeaveBalance[]).map(b => (
              <div key={b.id} className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-center min-w-[90px]">
                <p className="text-lg font-bold text-indigo-600 leading-tight">{b.available}</p>
                <p className="text-[10px] text-gray-500 mt-0.5 truncate max-w-[80px]">{b.leave_type_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {['all', 'pending', 'approved', 'rejected', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                statusFilter === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={onApply}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus size={13} />
          Apply for Leave
        </button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-sm text-red-500 py-6">
          <AlertCircle size={14} /> Failed to load leave requests.
        </div>
      ) : !(requests as LeaveRequest[])?.length ? (
        <div className="py-8 text-center text-sm text-gray-400">
          No leave requests{statusFilter !== 'all' ? ` with status "${statusFilter}"` : ''}.
        </div>
      ) : (
        <div className="space-y-2">
          {(requests as LeaveRequest[]).map(req => (
            <LeaveRow
              key={req.id}
              req={req}
              showStaff={false}
              canApprove={false}
              isOwnRequest={true}
              onCancel={id => cancelMutation.mutate(id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Team Leaves (manager view) ────────────────────────────────────────────────

function TeamLeavesPane() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null)

  const { data: requests, isLoading, isError } = useQuery({
    queryKey: ['hrm-team-requests', statusFilter],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_REQUESTS, {
        params: statusFilter !== 'all' ? { status: statusFilter } : {},
      }).then(r => r.data.data ?? r.data.results ?? r.data ?? []),
    staleTime: 15_000,
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(HRM.LEAVE_REQUEST_APPROVE(id), {}),
    onSuccess: () => {
      toast.success('Leave request approved')
      qc.invalidateQueries({ queryKey: ['hrm-team-requests'] })
    },
    onError: (err) => toast.error(apiError(err)),
  })

  function handleRejectDone() {
    setRejectTarget(null)
    qc.invalidateQueries({ queryKey: ['hrm-team-requests'] })
  }

  return (
    <div>
      {/* Filter row */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['pending', 'all', 'approved', 'rejected', 'cancelled'].map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              statusFilter === s
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s === 'pending' ? 'Pending Review' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : isError ? (
        <div className="flex items-center gap-2 text-sm text-red-500 py-6">
          <AlertCircle size={14} /> Failed to load leave requests.
        </div>
      ) : !(requests as LeaveRequest[])?.length ? (
        <div className="py-8 text-center text-sm text-gray-400">
          No {statusFilter === 'pending' ? 'pending' : statusFilter !== 'all' ? statusFilter : ''} leave requests from the team.
        </div>
      ) : (
        <div className="space-y-2">
          {(requests as LeaveRequest[]).map(req => (
            <LeaveRow
              key={req.id}
              req={req}
              showStaff={true}
              canApprove={true}
              isOwnRequest={false}
              onApprove={id => approveMutation.mutate(id)}
              onReject={r => setRejectTarget(r)}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          requestId={rejectTarget.id}
          staffName={rejectTarget.staff_name}
          onClose={() => setRejectTarget(null)}
          onSuccess={handleRejectDone}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeaveTab() {
  const perms = usePermissions()
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState<'mine' | 'team'>('mine')
  const [applyOpen, setApplyOpen] = useState(false)

  function handleApplySuccess() {
    setApplyOpen(false)
    qc.invalidateQueries({ queryKey: ['hrm-my-requests'] })
    qc.invalidateQueries({ queryKey: ['hrm-my-balances'] })
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-gray-200">
        <button
          onClick={() => setSubTab('mine')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
            subTab === 'mine'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CalendarDays size={15} />
          My Leaves
        </button>
        {perms.isManager && (
          <button
            onClick={() => setSubTab('team')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px ${
              subTab === 'team'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={15} />
            Team Leaves
          </button>
        )}
      </div>

      {subTab === 'mine' && (
        <MyLeavesPane onApply={() => setApplyOpen(true)} />
      )}
      {subTab === 'team' && perms.isManager && (
        <TeamLeavesPane />
      )}

      {applyOpen && (
        <ApplyLeaveModal
          onClose={() => setApplyOpen(false)}
          onSuccess={handleApplySuccess}
        />
      )}
    </div>
  )
}
