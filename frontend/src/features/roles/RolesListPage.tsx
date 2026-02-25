import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ShieldCheck, Plus, Pencil, Trash2, RefreshCw, Sprout } from 'lucide-react'
import apiClient from '../../api/client'
import { ROLES } from '../../api/endpoints'
import RoleEditorModal from './RoleEditorModal'
import Modal from '../../components/Modal'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Role {
  id: number
  name: string
  description: string
  permissions: Record<string, boolean>
  is_system_role: boolean
  created_at: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function permissionCount(perms: Record<string, boolean>) {
  return Object.values(perms).filter(Boolean).length
}

function totalPermissions(perms: Record<string, boolean>) {
  return Object.keys(perms).length
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RolesListPage() {
  const qc = useQueryClient()
  const [editorTarget, setEditorTarget] = useState<Role | null | 'new'>('new')
  const [editorOpen, setEditorOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)

  // Fetch roles list
  const { data: roles = [], isLoading, refetch } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => {
      const res = await apiClient.get(ROLES.LIST)
      return res.data.results ?? res.data
    },
  })

  // Seed preload roles
  const seedMutation = useMutation({
    mutationFn: () => apiClient.post(ROLES.SEED_PRELOADS),
    onSuccess: (res) => {
      const { seeded, skipped } = res.data
      toast.success(`Seeded ${seeded.length} preload role(s). ${skipped.length} already existed.`)
      qc.invalidateQueries({ queryKey: ['roles'] })
    },
    onError: () => toast.error('Failed to seed preload roles'),
  })

  // Delete role
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(ROLES.DETAIL(id)),
    onSuccess: () => {
      toast.success('Role deleted')
      qc.invalidateQueries({ queryKey: ['roles'] })
      setDeleteTarget(null)
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? 'Failed to delete role'
      toast.error(msg)
      setDeleteTarget(null)
    },
  })

  function openCreate() {
    setEditorTarget(null)
    setEditorOpen(true)
  }

  function openEdit(role: Role) {
    setEditorTarget(role)
    setEditorOpen(true)
  }

  const customRoles = roles.filter(r => !r.is_system_role)
  const systemRoles = roles.filter(r => r.is_system_role)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={22} className="text-indigo-600" />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Roles & Permissions</h1>
            <p className="text-sm text-gray-500">Manage custom roles and their permission sets</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => seedMutation.mutate()}
            disabled={seedMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50"
            title="Seed the 6 built-in preload roles (Finance, Technician, HR, etc.)"
          >
            <Sprout size={15} />
            Seed Preloads
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            <Plus size={16} />
            New Role
          </button>
        </div>
      </div>

      {/* Custom roles */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Custom Roles ({customRoles.length})
        </h2>

        {isLoading ? (
          <div className="text-sm text-gray-400 py-8 text-center">Loading…</div>
        ) : customRoles.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-12 text-center">
            <ShieldCheck size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No custom roles yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Create a role or use{' '}
              <button onClick={() => seedMutation.mutate()} className="text-teal-600 underline">
                Seed Preloads
              </button>{' '}
              to add Finance, Technician, HR and more.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Permissions</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customRoles.map(role => {
                  const on = permissionCount(role.permissions)
                  const total = totalPermissions(role.permissions)
                  return (
                    <tr key={role.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 text-sm">{role.name}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {role.description || <span className="text-gray-300 italic">No description</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-24 overflow-hidden">
                            <div
                              className="bg-indigo-500 h-full rounded-full"
                              style={{ width: total ? `${(on / total) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">{on}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(role)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                            title="Edit role"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(role)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                            title="Delete role"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* System roles — read-only reference */}
      {systemRoles.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            System Roles (read-only)
          </h2>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Permissions</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {systemRoles.map(role => {
                  const on = permissionCount(role.permissions)
                  const total = totalPermissions(role.permissions)
                  return (
                    <tr key={role.id} className="opacity-70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-700 text-sm">{role.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded">system</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        {role.description || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-1.5 w-24 overflow-hidden">
                            <div
                              className="bg-gray-400 h-full rounded-full"
                              style={{ width: total ? `${(on / total) * 100}%` : '0%' }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 whitespace-nowrap">{on}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => openEdit(role)}
                          className="p-1.5 text-gray-300 hover:text-gray-500 rounded hover:bg-gray-100"
                          title="View permissions (read-only)"
                        >
                          <Pencil size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Role editor modal */}
      <RoleEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        role={editorTarget === 'new' ? null : editorTarget}
      />

      {/* Delete confirmation */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Role"
        width="max-w-sm"
      >
        <p className="text-sm text-gray-600 mb-5">
          Are you sure you want to delete{' '}
          <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>? Staff
          assigned to this role will fall back to their system role.
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
