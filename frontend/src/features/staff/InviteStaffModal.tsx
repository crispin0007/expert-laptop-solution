import { useState, useEffect, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'
import NepaliDatePicker from '../../components/NepaliDatePicker'

interface Props {
  open: boolean
  onClose: () => void
  departments: { id: number; name: string }[]
}

interface FormData {
  email: string
  full_name: string
  phone: string
  office_phone: string
  password: string
  role: string
  department: string
  employee_id: string
  join_date: string
  is_admin: boolean
  pan_number: string
}

const empty: FormData = {
  email: '', full_name: '', phone: '', office_phone: '', password: '',
  role: 'staff', department: '', employee_id: '', join_date: '', is_admin: false,
  pan_number: '',
}

export default function InviteStaffModal({ open, onClose, departments }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState<FormData>(empty)
  const [idLoading, setIdLoading] = useState(false)

  // Auto-fetch a unique employee ID every time the modal opens
  useEffect(() => {
    if (!open) return
    setForm(empty)
    setIdLoading(true)
    apiClient.get('/staff/generate_employee_id/')
      .then(res => setForm(f => ({ ...f, employee_id: res.data.employee_id ?? '' })))
      .catch(() => {/* leave blank if endpoint fails */})
      .finally(() => setIdLoading(false))
  }, [open])

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const mutation = useMutation({
    mutationFn: (payload: object) => apiClient.post('/staff/', payload),
    onSuccess: () => {
      toast.success('Staff member invited successfully')
      qc.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    },
    onError: (err: any) => {
      const detail = err?.response?.data
      const msg = typeof detail === 'object' ? Object.values(detail).flat().join(' ') : 'Failed to invite staff'
      toast.error(msg)
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      email: form.email,
      full_name: form.full_name,
      phone: form.phone,
      office_phone: form.office_phone,
      role: form.role,
      employee_id: form.employee_id,
      is_admin: form.is_admin,
    }
    if (form.password) payload.password = form.password
    if (form.department) payload.department = parseInt(form.department)
    if (form.join_date) payload.join_date = form.join_date
    if (form.pan_number.trim()) payload.pan_number = form.pan_number.trim()
    mutation.mutate(payload)
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite Staff Member" width="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input data-lpignore="true" type="email" required value={form.email} onChange={e => set('email', e.target.value)}
              placeholder="staff@example.com"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input data-lpignore="true" type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="Jane Doe"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Personal Phone</label>
            <input data-lpignore="true" type="text" value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="+977 98..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Office Phone</label>
            <input data-lpignore="true" type="text" value={form.office_phone} onChange={e => set('office_phone', e.target.value)}
              placeholder="+977 1-..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Temporary Password
              <span className="text-gray-400 text-xs ml-1">(auto if blank)</span>
            </label>
            <input data-lpignore="true" type="password" value={form.password} onChange={e => set('password', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select value={form.department} onChange={e => set('department', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">— None —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Employee ID
              {idLoading && <span className="ml-2 text-xs text-gray-400">generating…</span>}
            </label>
            <input data-lpignore="true" type="text" value={form.employee_id} onChange={e => set('employee_id', e.target.value)}
              placeholder={idLoading ? 'Generating…' : 'EMP-1234'}
              disabled={idLoading}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Join Date</label>
            <NepaliDatePicker value={form.join_date} onChange={v => set('join_date', v)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PAN Number
              <span className="ml-1 text-xs font-normal text-gray-400">— for TDS reporting</span>
            </label>
            <input data-lpignore="true" type="text" value={form.pan_number} onChange={e => set('pan_number', e.target.value)}
              autoComplete="off"
              placeholder="9-digit PAN"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input data-lpignore="true" type="checkbox" checked={form.is_admin} onChange={e => set('is_admin', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          <span className="text-sm text-gray-700">Grant admin privileges for this tenant</span>
        </label>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending || idLoading}
            className="px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Inviting…' : 'Invite Staff'}
          </button>
        </div>
      </form>
    </Modal>
  )
}