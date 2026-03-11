import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import { ROLES, STAFF } from '../../api/endpoints'
import Modal from '../../components/Modal'
import NepaliDatePicker from '../../components/NepaliDatePicker'

interface StaffMembership {
  id: number
  role: string
  custom_role_id: number | null
  custom_role_name: string | null
  department: number | null
  employee_id: string
  join_date: string | null
  is_admin: boolean
  is_active: boolean
}

interface StaffMember {
  id: number
  email: string
  full_name: string
  phone: string
  membership: StaffMembership | null
}

interface CustomRole {
  id: number
  name: string
  description: string
}

interface Props {
  open: boolean
  onClose: () => void
  staff: StaffMember | null
  departments: { id: number; name: string }[]
}

export default function EditStaffModal({ open, onClose, staff, departments }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    roleType: 'staff',   // 'owner'|'admin'|'manager'|'staff'|'viewer'|'custom'
    customRoleId: '',
    department: '',
    employee_id: '',
    join_date: '',
    is_admin: false,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Load available custom roles for this tenant
  const { data: customRoles = [] } = useQuery<CustomRole[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiClient.get(ROLES.LIST)
      const d = res.data
      if (Array.isArray(d)) return d
      if (Array.isArray(d.results)) return d.results
      if (Array.isArray(d.data)) return d.data
      return []
    },
    enabled: open,
  })

  // Sync form when a different staff member is opened
  useEffect(() => {
    if (staff) {
      const m = staff.membership
      const hasCustomRole = !!(m?.custom_role_id)
      setForm({
        full_name: staff.full_name ?? '',
        phone: staff.phone ?? '',
        roleType: hasCustomRole ? 'custom' : (m?.role ?? 'staff'),
        customRoleId: m?.custom_role_id ? String(m.custom_role_id) : '',
        department: m?.department ? String(m.department) : '',
        employee_id: m?.employee_id ?? '',
        join_date: m?.join_date ?? '',
        is_admin: m?.is_admin ?? false,
      })
      setErrors({})
    }
  }, [staff])

  // Step 1: patch base profile fields
  const patchMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(STAFF.DETAIL(staff!.id), payload),
  })

  // Step 2: assign role via separate endpoint
  const assignRoleMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.post(STAFF.ASSIGN_ROLE(staff!.id), payload),
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErrors({})

    // Build base patch payload (profile + membership fields, excluding role)
    const patchPayload: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      employee_id: form.employee_id.trim(),
      is_admin: form.is_admin,
      department: form.department ? parseInt(form.department) : null,
    }
    if (form.join_date) patchPayload.join_date = form.join_date

    // Build role assignment payload
    const rolePayload: Record<string, unknown> =
      form.roleType === 'custom'
        ? { role: 'custom', custom_role_id: parseInt(form.customRoleId) }
        : { role: form.roleType }

    try {
      await patchMutation.mutateAsync(patchPayload)
      await assignRoleMutation.mutateAsync(rolePayload)
      toast.success('Staff member updated')
      qc.invalidateQueries({ queryKey: ['staff'] })
      onClose()
    } catch (err: any) {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        const errs: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          errs[k] = Array.isArray(v) ? (v as string[]).join(' ') : String(v)
        }
        setErrors(errs)
        toast.error('Please fix the errors below')
      } else {
        toast.error('Failed to update staff member')
      }
    }
  }

  const isPending = patchMutation.isPending || assignRoleMutation.isPending

  const inp = (err?: string) =>
    `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
      err ? 'border-red-400' : 'border-gray-300'
    }`

  return (
    <Modal open={open} onClose={onClose} title={`Edit — ${staff?.full_name || staff?.email || ''}`} width="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Full name */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input type="text" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className={inp(errors.full_name)} />
            {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input type="text" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              className={inp()} />
          </div>

          {/* Employee ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
            <input type="text" value={form.employee_id}
              onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
              placeholder="EMP-001" className={inp()} />
          </div>

          {/* Role type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">System Role</label>
            <select value={form.roleType}
              onChange={e => setForm(f => ({ ...f, roleType: e.target.value, customRoleId: '' }))}
              className={inp(errors.role)}>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="viewer">Viewer</option>
              {customRoles.length > 0 && (
                <option value="custom">— Custom Role —</option>
              )}
            </select>
            {errors.role && <p className="text-xs text-red-500 mt-1">{errors.role}</p>}
          </div>

          {/* Custom role picker — only shown when roleType === 'custom' */}
          {form.roleType === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custom Role</label>
              <select value={form.customRoleId}
                onChange={e => setForm(f => ({ ...f, customRoleId: e.target.value }))}
                required={form.roleType === 'custom'}
                className={inp(errors.custom_role_id)}>
                <option value="">— Pick a role —</option>
                {customRoles.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
              {errors.custom_role_id && <p className="text-xs text-red-500 mt-1">{errors.custom_role_id}</p>}
            </div>
          )}

          {/* Department */}
          <div className={form.roleType === 'custom' ? 'col-span-2' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              className={inp()}>
              <option value="">— None —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Join date */}
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Join Date</label>
            <NepaliDatePicker value={form.join_date ?? ''} onChange={v => setForm(f => ({ ...f, join_date: v }))} />
          </div>
        </div>

        {/* Admin toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_admin}
            onChange={e => setForm(f => ({ ...f, is_admin: e.target.checked }))}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
          <span className="text-sm text-gray-700">Grant admin privileges for this tenant</span>
        </label>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={isPending}
            className="px-5 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}


interface StaffMembership {
  id: number
  role: string
  department: number | null
  employee_id: string
  join_date: string | null
  is_admin: boolean
  is_active: boolean
}

interface StaffMember {
  id: number
  email: string
  full_name: string
  phone: string
  membership: StaffMembership | null
}

interface Props {
  open: boolean
  onClose: () => void
  staff: StaffMember | null
  departments: { id: number; name: string }[]
}


