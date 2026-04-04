/**
 * LeaveSettingsPane — admin/manager panel for Leave Types and Balance seeding.
 *
 * Sections:
 *   1. Leave Types — CRUD table + modal, "Seed Nepal Defaults" button
 *   2. Leave Balances — "Seed Year Balances" for all staff in a selected BS year
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Plus, Pencil, Trash2, Loader2, RefreshCw,
} from 'lucide-react'
import apiClient from '../../../api/client'
import { HRM } from '../../../api/endpoints'
import Modal from '../../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeaveType {
  id: number
  name: string
  code: string
  days_allowed: number
  carry_forward_days: number
  is_paid: boolean
  requires_approval: boolean
  is_active: boolean
}

interface LeaveTypeForm {
  name: string
  code: string
  days_allowed: number
  carry_forward_days: number
  is_paid: boolean
  requires_approval: boolean
  is_active: boolean
}

const EMPTY_FORM: LeaveTypeForm = {
  name: '',
  code: '',
  days_allowed: 12,
  carry_forward_days: 0,
  is_paid: true,
  requires_approval: true,
  is_active: true,
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

// ── Leave Type Modal ──────────────────────────────────────────────────────────

function LeaveTypeModal({
  existing,
  onClose,
  onSuccess,
}: {
  existing?: LeaveType
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!existing
  const [form, setForm] = useState<LeaveTypeForm>(
    existing
      ? {
          name: existing.name,
          code: existing.code,
          days_allowed: existing.days_allowed,
          carry_forward_days: existing.carry_forward_days,
          is_paid: existing.is_paid,
          requires_approval: existing.requires_approval,
          is_active: existing.is_active,
        }
      : EMPTY_FORM,
  )

  const mutation = useMutation({
    mutationFn: (data: LeaveTypeForm) =>
      isEdit
        ? apiClient.put(HRM.LEAVE_TYPE_DETAIL(existing!.id), data)
        : apiClient.post(HRM.LEAVE_TYPES, data),
    onSuccess: () => {
      toast.success(isEdit ? 'Leave type updated' : 'Leave type created')
      onSuccess()
    },
    onError: (err) => toast.error(apiError(err)),
  })

  function handle(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Name and code are required')
      return
    }
    mutation.mutate(form)
  }

  function setField<K extends keyof LeaveTypeForm>(k: K, v: LeaveTypeForm[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  return (
    <Modal
      open
      title={isEdit ? 'Edit Leave Type' : 'New Leave Type'}
      onClose={onClose}
      width="max-w-md"
    >
      <form className="space-y-4" onSubmit={handle}>
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.name}
            onChange={e => setField('name', e.target.value)}
            placeholder="e.g. Annual Leave"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            required
          />
        </div>

        {/* Code */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.code}
            onChange={e => setField('code', e.target.value.toUpperCase())}
            placeholder="e.g. AL"
            maxLength={10}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
            required
          />
        </div>

        {/* Days + Carry forward */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Days Allowed / year</label>
            <input
              type="number"
              min={0}
              value={form.days_allowed}
              onChange={e => setField('days_allowed', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Carry Forward (days)</label>
            <input
              type="number"
              min={0}
              value={form.carry_forward_days}
              onChange={e => setField('carry_forward_days', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-2.5">
          {(
            [
              { key: 'is_paid',            label: 'Paid leave' },
              { key: 'requires_approval',  label: 'Requires approval' },
              { key: 'is_active',          label: 'Active' },
            ] as { key: keyof LeaveTypeForm; label: string }[]
          ).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setField(key, !form[key])}
                className={`relative w-9 h-5 rounded-full transition ${form[key] ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form[key] ? 'translate-x-4' : ''}`}
                />
              </div>
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
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
            {isEdit ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LeaveSettingsPane() {
  const qc = useQueryClient()
  const [modalTarget, setModalTarget] = useState<LeaveType | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<LeaveType | null>(null)
  const [seedYear, setSeedYear] = useState<number>(currentBsYear())

  // ── Data ────────────────────────────────────────────────────────────────

  const { data: leaveTypes = [], isLoading } = useQuery<LeaveType[]>({
    queryKey: ['hrm-leave-types-admin'],
    queryFn: () =>
      apiClient.get(HRM.LEAVE_TYPES).then(r => r.data.data ?? r.data.results ?? r.data ?? []),
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const seedDefaultsMutation = useMutation({
    mutationFn: () => apiClient.post(HRM.LEAVE_TYPE_SEED, {}),
    onSuccess: (res) => {
      const seeded = res.data?.data?.length ?? 0
      toast.success(`${seeded} Nepal default leave types seeded`)
      qc.invalidateQueries({ queryKey: ['hrm-leave-types-admin'] })
      qc.invalidateQueries({ queryKey: ['hrm-leave-types'] })
    },
    onError: (err) => toast.error(apiError(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(HRM.LEAVE_TYPE_DETAIL(id)),
    onSuccess: () => {
      toast.success('Leave type deleted')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['hrm-leave-types-admin'] })
      qc.invalidateQueries({ queryKey: ['hrm-leave-types'] })
    },
    onError: (err) => toast.error(apiError(err)),
  })

  const seedBalancesMutation = useMutation({
    mutationFn: (year: number) => apiClient.post(HRM.LEAVE_BALANCE_SEED, { year }),
    onSuccess: (res) => {
      const count = res.data?.data?.created ?? res.data?.message ?? 'Done'
      toast.success(`Balances seeded for BS ${seedYear}: ${count}`)
      qc.invalidateQueries({ queryKey: ['hrm-my-balances'] })
    },
    onError: (err) => toast.error(apiError(err)),
  })

  function onTypeSuccess() {
    setModalTarget(null)
    qc.invalidateQueries({ queryKey: ['hrm-leave-types-admin'] })
    qc.invalidateQueries({ queryKey: ['hrm-leave-types'] })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Section 1: Leave Types ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Leave Types</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Define leave categories available to all staff.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => seedDefaultsMutation.mutate()}
              disabled={seedDefaultsMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-60 transition"
            >
              {seedDefaultsMutation.isPending
                ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
              Seed Nepal Defaults
            </button>
            <button
              onClick={() => setModalTarget('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              <Plus size={12} />
              New Type
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-8">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : leaveTypes.length === 0 ? (
          <div className="py-10 text-center border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-400 mb-3">No leave types yet.</p>
            <button
              onClick={() => seedDefaultsMutation.mutate()}
              disabled={seedDefaultsMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <RefreshCw size={12} />
              Seed Nepal Defaults
            </button>
          </div>
        ) : (
          <div className="overflow-hidden border border-gray-200 rounded-xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Code</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Days/yr</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Carry Fwd</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Paid</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Approval</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500">Active</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaveTypes.map(lt => (
                  <tr key={lt.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-medium text-gray-800">{lt.name}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {lt.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{lt.days_allowed}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{lt.carry_forward_days}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${lt.is_paid ? 'bg-green-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${lt.requires_approval ? 'bg-yellow-500' : 'bg-gray-300'}`} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block w-2 h-2 rounded-full ${lt.is_active ? 'bg-green-500' : 'bg-red-400'}`} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setModalTarget(lt)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(lt)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: Leave Balance Seeding ── */}
      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Leave Balance Allocation</h3>
        <p className="text-xs text-gray-500 mb-4">
          Seed leave balances for all active staff for a given BS year.
          This creates balance records for every staff × leave type combination.
          Existing balances are not overwritten.
        </p>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">BS Year</label>
            <input
              type="number"
              value={seedYear}
              min={2080}
              max={2090}
              onChange={e => setSeedYear(Number(e.target.value))}
              className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          <button
            onClick={() => seedBalancesMutation.mutate(seedYear)}
            disabled={seedBalancesMutation.isPending}
            className="flex items-center gap-1.5 mt-5 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {seedBalancesMutation.isPending
              ? <Loader2 size={14} className="animate-spin" />
              : <RefreshCw size={14} />}
            Seed Balances for BS {seedYear}
          </button>
        </div>
      </div>

      {/* ── Leave Type create/edit modal ── */}
      {modalTarget !== null && (
        <LeaveTypeModal
          existing={modalTarget === 'new' ? undefined : modalTarget}
          onClose={() => setModalTarget(null)}
          onSuccess={onTypeSuccess}
        />
      )}

      {/* ── Delete confirm modal ── */}
      {deleteTarget && (
        <Modal
          open
          title="Delete Leave Type"
          onClose={() => setDeleteTarget(null)}
          width="max-w-sm"
        >
          <p className="text-sm text-gray-600 mb-4">
            Delete <strong>{deleteTarget.name}</strong>? This cannot be undone and will
            affect any staff with existing balances for this type.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60"
            >
              {deleteMutation.isPending && <Loader2 size={13} className="animate-spin" />}
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
