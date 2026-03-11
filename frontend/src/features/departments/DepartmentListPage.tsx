import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Building2, Plus, Pencil, Trash2, Users } from 'lucide-react'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'
import CreateDepartmentModal from './CreateDepartmentModal'
import EditDepartmentModal from './EditDepartmentModal'
import type { Department } from './EditDepartmentModal'
import { usePermissions } from '../../hooks/usePermissions'

export default function DepartmentListPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Department | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)

  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await apiClient.get('/departments/')
      // Handles paginated: { results: [...] }
      // Handles envelope:  { success: true, data: [...] }
      // Handles raw array: [...]
      const d = res.data
      if (Array.isArray(d)) return d
      if (Array.isArray(d.results)) return d.results
      if (Array.isArray(d.data)) return d.data
      return []
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/departments/${id}/`),
    onSuccess: () => {
      toast.success('Department deleted')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: () => toast.error('Failed to delete department'),
  })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Departments</h1>
            <p className="text-xs text-gray-400">{departments.length} departments</p>
          </div>
        </div>
        {can('can_manage_departments') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm">
            <Plus size={15} /> New Department
          </button>
        )}
      </div>

      {/* Grid */}
      {isLoading && (
        <p className="text-center text-gray-400 py-10">Loading departments…</p>
      )}
      {!isLoading && departments.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No departments yet.</p>
          <p className="text-sm mt-1">Create the first department to organise your team.</p>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {departments.map(d => (
          <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Building2 size={18} className="text-indigo-500" />
              </div>
              <div className="flex gap-1">
                {can('can_manage_departments') && (
                  <>
                    <button onClick={() => setEditTarget(d)} title="Edit"
                      className="p-1.5 rounded hover:bg-gray-100 text-gray-400">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteTarget(d)} title="Delete"
                      className="p-1.5 rounded hover:bg-red-50 text-red-400">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
            <h3 className="font-semibold text-gray-900 text-sm">{d.name}</h3>
            {d.description && (
              <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{d.description}</p>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Users size={12} /> {d.member_count ?? 0} members
              </span>
              {d.head_name && (
                <span className="text-indigo-500 font-medium truncate max-w-[120px]" title={d.head_name}>
                  {d.head_name}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <CreateDepartmentModal open={showCreate} onClose={() => setShowCreate(false)} />
      <EditDepartmentModal open={editTarget !== null} onClose={() => setEditTarget(null)} department={editTarget} />

      {/* Delete confirm */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete department?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-6">
          Delete <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>? Staff in this department will
          have their department cleared.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => deleteMutation.mutate(deleteTarget!.id)} disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
