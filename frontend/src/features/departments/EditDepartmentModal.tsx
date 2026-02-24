import { useEffect, useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import Modal from '../../components/Modal'
import apiClient from '../../api/client'

export interface Department {
  id: number
  name: string
  description: string
  head: number | null
  head_name: string
  member_count: number
  created_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  department: Department | null
}

interface StaffMember { id: number; full_name: string; email: string }

export default function EditDepartmentModal({ open, onClose, department }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', description: '', head: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: staff = [] } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await apiClient.get('/staff/')
      return res.data.results ?? res.data
    },
    enabled: open,
  })

  useEffect(() => {
    if (department) {
      setForm({
        name: department.name,
        description: department.description,
        head: department.head != null ? String(department.head) : '',
      })
      setErrors({})
    }
  }, [department])

  const mutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiClient.patch(`/departments/${department!.id}/`, payload),
    onSuccess: () => {
      toast.success('Department updated')
      qc.invalidateQueries({ queryKey: ['departments'] })
      onClose()
    },
    onError: (err: any) => {
      const data = err.response?.data
      if (data && typeof data === 'object') {
        const fieldErrors: Record<string, string> = {}
        for (const [k, v] of Object.entries(data)) {
          fieldErrors[k] = Array.isArray(v) ? (v as string[]).join(' ') : String(v)
        }
        setErrors(fieldErrors)
      } else {
        toast.error('Failed to update department')
      }
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setErrors({ name: 'Name is required' }); return }
    setErrors({})
    mutation.mutate({
      name: form.name.trim(),
      description: form.description.trim(),
      head: form.head ? Number(form.head) : null,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Department" width="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={3} value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department Head</label>
          <select value={form.head} onChange={e => setForm(f => ({ ...f, head: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
            <option value="">— None —</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={mutation.isPending}
            className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
