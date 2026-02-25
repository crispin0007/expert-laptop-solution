import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Users, Plus, RefreshCw, Search, PowerOff, Pencil, KeyRound, RotateCcw } from 'lucide-react'
import apiClient from '../../api/client'
import AvailabilityBadge from '../../components/AvailabilityBadge'
import InviteStaffModal from './InviteStaffModal'
import EditStaffModal from './EditStaffModal'
import ResetPasswordModal from './ResetPasswordModal'
import Modal from '../../components/Modal'
import { usePermissions } from '../../hooks/usePermissions'

interface StaffMembership {
  id: number
  role: string
  role_display: string
  custom_role_id: number | null
  custom_role_name: string | null
  department: number | null
  department_name: string
  employee_id: string
  staff_number: string
  join_date: string | null
  is_admin: boolean
  is_active: boolean
}

interface StaffMember {
  id: number
  email: string
  full_name: string
  phone: string
  avatar: string
  is_active: boolean
  date_joined: string
  membership: StaffMembership | null
}

interface Department { id: number; name: string }

function RoleBadge({ role, customRoleName }: { role: string; customRoleName?: string | null }) {
  if (customRoleName) {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700">
        {customRoleName}
      </span>
    )
  }
  const cls: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-indigo-100 text-indigo-700',
    manager: 'bg-blue-100 text-blue-700',
    staff: 'bg-gray-100 text-gray-600',
    viewer: 'bg-gray-50 text-gray-500',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

export default function StaffListPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [search, setSearch] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [editTarget, setEditTarget] = useState<StaffMember | null>(null)
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null)
  const [reactivateTarget, setReactivateTarget] = useState<StaffMember | null>(null)

  const { data: staff = [], isLoading, refetch } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await apiClient.get('/staff/')
      return res.data.results ?? res.data
    },
  })

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await apiClient.get('/departments/')
      return res.data.results ?? res.data
    },
  })

  const { data: availability = [] } = useQuery<{ id: number; is_available: boolean; open_tickets: number; active_tasks: number }[]>({
    queryKey: ['staff', 'availability'],
    queryFn: async () => {
      const res = await apiClient.get('/staff/availability/')
      return res.data
    },
    refetchInterval: 60_000,
  })

  const availMap = Object.fromEntries(availability.map(a => [a.id, a]))

  const deactivateMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/staff/${id}/deactivate/`),
    onSuccess: () => {
      toast.success('Staff member deactivated')
      setDeactivateTarget(null)
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: () => toast.error('Failed to deactivate staff member'),
  })

  const reactivateMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/staff/${id}/reactivate/`),
    onSuccess: () => {
      toast.success('Staff member reactivated — email sent')
      setReactivateTarget(null)
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: () => toast.error('Failed to reactivate staff member'),
  })

  const filtered = search.trim()
    ? staff.filter(s =>
        s.full_name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase()),
      )
    : staff

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Staff</h1>
            <p className="text-xs text-gray-400">{staff.length} members in this workspace</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            <RefreshCw size={14} /> Refresh
          </button>
          {can('can_manage_staff') && (
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm">
              <Plus size={15} /> Invite Staff
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="Search name or email…" value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Staff Member</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Availability</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">Loading staff…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                {search ? 'No staff match your search.' : 'No staff yet. Invite the first member.'}
              </td></tr>
            )}
            {filtered.map(s => {
              const avail = availMap[s.id]
              const isInactive = s.membership?.is_active === false
              return (
                <tr key={s.id} className={`transition-colors ${isInactive ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {s.membership?.staff_number || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {s.avatar
                        ? <img src={s.avatar} className="w-8 h-8 rounded-full object-cover" alt="" />
                        : <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isInactive ? 'bg-gray-200 text-gray-400' : 'bg-indigo-100 text-indigo-600'}`}>
                            {(s.full_name || s.email).charAt(0).toUpperCase()}
                          </div>
                      }
                      <div>
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${isInactive ? 'text-gray-400' : 'text-gray-900'}`}>{s.full_name || '—'}</p>
                          {isInactive && (
                            <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-500 rounded-full font-medium">Inactive</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {s.membership ? (
                      <RoleBadge role={s.membership.role} customRoleName={s.membership.custom_role_name} />
                    ) : '—'}
                    {s.membership?.is_admin && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">Admin</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{s.membership?.department_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.membership?.employee_id || '—'}</td>
                  <td className="px-4 py-3">
                    {avail
                      ? <AvailabilityBadge isAvailable={avail.is_available} openTickets={avail.open_tickets} activeTasks={avail.active_tasks} />
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {s.membership?.join_date
                      ? new Date(s.membership.join_date).toLocaleDateString()
                      : new Date(s.date_joined).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {can('can_manage_staff') && (
                        <>
                          <button title="Edit staff member" onClick={() => setEditTarget(s)}
                            className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400">
                            <Pencil size={14} />
                          </button>
                          <button title="Reset password" onClick={() => setResetTarget(s)}
                            className="p-1.5 rounded hover:bg-amber-50 text-amber-400">
                            <KeyRound size={14} />
                          </button>
                          {s.membership?.is_active !== false ? (
                            <button title="Deactivate — blocks login" onClick={() => setDeactivateTarget(s)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-400">
                              <PowerOff size={14} />
                            </button>
                          ) : (
                            <button title="Reactivate — restore login" onClick={() => setReactivateTarget(s)}
                              className="p-1.5 rounded hover:bg-green-50 text-green-500">
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Invite modal */}
      <InviteStaffModal open={showInvite} onClose={() => setShowInvite(false)} departments={departments} />

      {/* Edit modal */}
      <EditStaffModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        staff={editTarget}
        departments={departments}
      />

      {/* Reset password modal */}
      <ResetPasswordModal
        open={resetTarget !== null}
        onClose={() => setResetTarget(null)}
        staff={resetTarget}
      />

      {/* Deactivate confirm */}
      <Modal open={deactivateTarget !== null} onClose={() => setDeactivateTarget(null)} title="Deactivate staff member?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-1">
          Deactivate <span className="font-semibold text-gray-900">{deactivateTarget?.full_name || deactivateTarget?.email}</span>?
        </p>
        <p className="text-sm text-gray-500 mb-6">
          They will no longer be able to log in. No email is sent. You can reactivate them at any time.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeactivateTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => deactivateMutation.mutate(deactivateTarget!.id)} disabled={deactivateMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {deactivateMutation.isPending ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </Modal>

      {/* Reactivate confirm */}
      <Modal open={reactivateTarget !== null} onClose={() => setReactivateTarget(null)} title="Reactivate staff member?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-1">
          Reactivate <span className="font-semibold text-gray-900">{reactivateTarget?.full_name || reactivateTarget?.email}</span>?
        </p>
        <p className="text-sm text-gray-500 mb-6">
          They will be able to log in again and will receive a reactivation email.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setReactivateTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => reactivateMutation.mutate(reactivateTarget!.id)} disabled={reactivateMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
            {reactivateMutation.isPending ? 'Reactivating…' : 'Reactivate'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
