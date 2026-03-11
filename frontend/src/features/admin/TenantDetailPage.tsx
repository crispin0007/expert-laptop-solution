import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Building2, Edit2, PauseCircle, CheckCircle2,
  UserPlus, ToggleLeft, ToggleRight, X, Key, Copy,
  Puzzle, Check, Minus, Package, Ticket, Users, FolderKanban, Receipt,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TENANTS, MODULES } from '../../api/endpoints'
import { type Tenant } from './EditTenantModal'
import EditTenantModal from './EditTenantModal'
import Modal from '../../components/Modal'
import { useConfirm } from '../../components/ConfirmDialog'
import DateDisplay from '../../components/DateDisplay'

// ─── Module / override types ────────────────────────────────────────────────
interface ModuleItem {
  id: number
  key: string
  name: string
  description: string
  icon: string
  is_core: boolean
  order: number
}

interface ModuleOverride {
  id: number
  module: number
  module_key: string
  module_name: string
  is_enabled: boolean
  note: string
}

const MOD_ICONS: Record<string, React.ElementType> = {
  Ticket, Users, Building2, FolderKanban, Package, Receipt,
}
function ModIconBadge({ name }: { name: string }) {
  const Icon = MOD_ICONS[name] ?? Package
  return <Icon size={14} />
}

interface Member {
  id: number
  user_id: number
  email: string
  full_name: string
  staff_number: string
  role: string
  is_active: boolean
  join_date: string
  created_at: string
}

// ─── Small helpers ──────────────────────────────────────────────────────────
function StatusBadge({ active, deleted }: { active: boolean; deleted: boolean }) {
  if (deleted)  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Deleted</span>
  if (!active)  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Suspended</span>
  return              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
}

function RoleBadge({ role }: { role: string }) {
  const cls: Record<string, string> = {
    admin: 'bg-indigo-100 text-indigo-700',
    manager: 'bg-blue-100 text-blue-700',
    staff: 'bg-gray-100 text-gray-600',
    owner: 'bg-purple-100 text-purple-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls[role] ?? 'bg-gray-100 text-gray-600'}`}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3">
      <span className="text-xs text-gray-400 w-36 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

// ─── Add Member Modal ───────────────────────────────────────────────────────
interface AddMemberForm { email: string; full_name: string; role: string; password: string }
const DEFAULT_FORM: AddMemberForm = { email: '', full_name: '', role: 'staff', password: '' }

interface AddMemberModalProps {
  open: boolean
  onClose: () => void
  tenantId: number
}
function AddMemberModal({ open, onClose, tenantId }: AddMemberModalProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState<AddMemberForm>(DEFAULT_FORM)
  const [generated, setGenerated] = useState<{ email: string; password: string } | null>(null)

  function set<K extends keyof AddMemberForm>(k: K, v: AddMemberForm[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const addMutation = useMutation({
    mutationFn: (payload: AddMemberForm) =>
      apiClient.post(TENANTS.MEMBERS(tenantId), {
        email_input: payload.email,
        full_name_input: payload.full_name || undefined,
        role: payload.role,
        password_input: payload.password || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenant-members', String(tenantId)] })
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      const gp: string | undefined = res.data?.data?.generated_password
      if (gp) {
        setGenerated({ email: form.email, password: gp })
      } else {
        toast.success('Member added successfully.')
        handleClose()
      }
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.errors?.[0]?.detail ?? e?.response?.data?.detail ?? 'Failed to add member.'
      toast.error(msg)
    },
  })

  function handleClose() {
    setForm(DEFAULT_FORM)
    setGenerated(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Member">
      {generated ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            A new user account was created. Share these credentials securely.
          </p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2 font-mono text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 text-xs">Email</span>
              <span className="font-medium text-gray-900">{generated.email}</span>
              <button onClick={() => { navigator.clipboard.writeText(generated!.email); toast.success('Copied') }}>
                <Copy size={13} className="text-gray-400 hover:text-gray-700" />
              </button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-gray-500 text-xs">Password</span>
              <span className="font-medium text-green-700">{generated.password}</span>
              <button onClick={() => { navigator.clipboard.writeText(generated!.password); toast.success('Copied') }}>
                <Copy size={13} className="text-gray-400 hover:text-gray-700" />
              </button>
            </div>
          </div>
          <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            This password will not be shown again. Make sure to copy it now.
          </p>
          <div className="flex justify-end">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); addMutation.mutate(form) }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => set('role', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password <span className="text-gray-400">(leave blank to auto-generate)</span>
            </label>
            <div className="relative">
              <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className="w-full pl-8 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Auto-generated if blank"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={handleClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={addMutation.isPending}
              className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {addMutation.isPending ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const confirm = useConfirm()

  const [showEdit, setShowEdit] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)

  // Fetch tenant
  const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useQuery<Tenant>({
    queryKey: ['admin', 'tenant', id],
    queryFn: async () => {
      const res = await apiClient.get(TENANTS.DETAIL(Number(id!)))
      const d = res.data
      return d.data ?? d
    },
    enabled: !!id,
  })

  // Fetch members
  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ['admin', 'tenant-members', id],
    queryFn: async () => {
      const res = await apiClient.get(TENANTS.MEMBERS(Number(id!)))
      const d = res.data
      if (Array.isArray(d)) return d
      if (Array.isArray(d.results)) return d.results
      if (Array.isArray(d.data)) return d.data
      return []
    },
    enabled: !!id,
  })

  // Suspend / Activate
  const suspendMutation = useMutation({
    mutationFn: () => apiClient.post(TENANTS.SUSPEND(Number(id!))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'tenant', id] }); qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }); toast.success('Tenant suspended.') },
    onError: () => toast.error('Failed to suspend tenant.'),
  })
  const activateMutation = useMutation({
    mutationFn: () => apiClient.post(TENANTS.ACTIVATE(Number(id!))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'tenant', id] }); qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }); toast.success('Tenant activated.') },
    onError: () => toast.error('Failed to activate tenant.'),
  })

  // Toggle member active
  const toggleMember = useMutation({
    mutationFn: ({ mid, is_active }: { mid: number; is_active: boolean }) =>
      apiClient.patch(TENANTS.MEMBER(Number(id!), mid), { is_active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin', 'tenant-members', id] }); toast.success('Updated.') },
    onError: () => toast.error('Failed to update member.'),
  })

  // Remove member
  const removeMember = useMutation({
    mutationFn: (mid: number) => apiClient.delete(TENANTS.MEMBER(Number(id!), mid)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenant-members', id] })
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      toast.success('Member removed.')
    },
    onError: () => toast.error('Failed to remove member.'),
  })

  // Fetch all modules
  const { data: allModules } = useQuery<ModuleItem[]>({
    queryKey: ['modules'],
    queryFn: () => apiClient.get(MODULES.LIST).then((r) => {
      const d = r.data
      return Array.isArray(d) ? d : d.results ?? []
    }),
  })

  // Fetch tenant module overrides
  const { data: overrides } = useQuery<ModuleOverride[]>({
    queryKey: ['admin', 'tenant-overrides', id],
    queryFn: () =>
      apiClient.get(TENANTS.MODULE_OVERRIDES(Number(id!))).then((r) => {
        const d = r.data
        return Array.isArray(d) ? d : d.results ?? []
      }),
    enabled: !!id,
  })

  // Add override (grant or revoke)
  const addOverride = useMutation({
    mutationFn: ({ moduleId, isEnabled, note }: { moduleId: number; isEnabled: boolean; note: string }) =>
      apiClient.post(TENANTS.MODULE_OVERRIDES(Number(id!)), {
        module_id: moduleId, is_enabled: isEnabled, note,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenant-overrides', id] })
      toast.success('Override saved.')
    },
    onError: () => toast.error('Failed to save override.'),
  })

  // Delete override (revert to plan default)
  const deleteOverride = useMutation({
    mutationFn: (overrideId: number) =>
      apiClient.delete(TENANTS.MODULE_OVERRIDE_DELETE(Number(id!), overrideId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenant-overrides', id] })
      toast.success('Override removed.')
    },
    onError: () => toast.error('Failed to remove override.'),
  })

  function confirmRemove(m: Member) {
    confirm({
      title: 'Remove Member',
      message: `Remove ${m.full_name || m.email} from this tenant?`,
      variant: 'danger',
      confirmLabel: 'Remove',
    }).then(ok => { if (ok) removeMember.mutate(m.id) })
  }

  if (tenantLoading) {
    return (
      <div className="p-8 text-center text-gray-400 text-sm">Loading tenant…</div>
    )
  }
  if (tenantError || !tenant) {
    return (
      <div className="p-8 text-center text-red-500 text-sm">Failed to load tenant.</div>
    )
  }

  const isSuspended = !tenant.is_active && !tenant.is_deleted

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Back */}
      <Link to="/admin/tenants" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors">
        <ArrowLeft size={15} /> Back to Tenants
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-indigo-50">
              <Building2 size={22} className="text-indigo-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                {tenant.name}
                <StatusBadge active={tenant.is_active} deleted={tenant.is_deleted} />
              </h1>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{tenant.slug}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowEdit(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
            >
              <Edit2 size={14} /> Edit
            </button>
            {!tenant.is_deleted && (
              isSuspended ? (
                <button
                  onClick={() => activateMutation.mutate()}
                  disabled={activateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 text-green-700 disabled:opacity-50"
                >
                  <CheckCircle2 size={14} /> Activate
                </button>
              ) : (
                <button
                  onClick={() => suspendMutation.mutate()}
                  disabled={suspendMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm bg-yellow-50 border border-yellow-300 rounded-lg hover:bg-yellow-100 text-yellow-700 disabled:opacity-50"
                >
                  <PauseCircle size={14} /> Suspend
                </button>
              )
            )}
          </div>
        </div>

        {/* Info grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 rounded-lg p-4">
          <InfoRow label="Plan" value={
            tenant.plan
              ? (
                <span className="inline-flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{tenant.plan.name}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 font-mono">
                    {tenant.plan.slug}
                  </span>
                </span>
              )
              : <span className="text-gray-400">No plan assigned</span>
          } />
          <InfoRow label="Currency" value={tenant.currency} />
          <InfoRow label="VAT" value={tenant.vat_enabled ? `Enabled (${(parseFloat(tenant.vat_rate) * 100).toFixed(0)}%)` : 'Disabled'} />
          <InfoRow label="Coin Rate" value={`1 coin = ${tenant.coin_to_money_rate} ${tenant.currency}`} />
          <InfoRow label="Members" value={tenant.member_count} />
          <InfoRow label="Created" value={<DateDisplay adDate={tenant.created_at} compact />} />
          <InfoRow
            label="Custom Domain"
            value={tenant.custom_domain
              ? <a href={`https://${tenant.custom_domain}`} target="_blank" rel="noreferrer"
                  className="text-indigo-600 hover:underline font-mono text-xs">{tenant.custom_domain}</a>
              : <span className="text-gray-400 font-mono text-xs">{tenant.slug}.bms.techyatra.com.np</span>}
          />
        </div>
      </div>

      {/* Members section */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-medium text-gray-900 text-sm">Members</h2>
          <button
            onClick={() => setShowAddMember(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm"
          >
            <UserPlus size={14} /> Add Member
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Staff #</th>
              <th className="px-4 py-3">Name / Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {membersLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading members…</td>
              </tr>
            )}
            {!membersLoading && (!members || members.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">No members yet.</td>
              </tr>
            )}
            {members?.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{m.staff_number || '—'}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{m.full_name || '—'}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </td>
                <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {m.join_date ? <DateDisplay adDate={m.join_date} compact /> : '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleMember.mutate({ mid: m.id, is_active: !m.is_active })}
                    className={`transition-colors ${m.is_active ? 'text-green-500 hover:text-green-700' : 'text-gray-300 hover:text-gray-500'}`}
                    title={m.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {m.is_active
                      ? <ToggleRight size={22} />
                      : <ToggleLeft size={22} />}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => confirmRemove(m)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    title="Remove member"
                  >
                    <X size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Module Overrides */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
          <Puzzle size={16} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-gray-900">Module Access Overrides</h2>
          <span className="text-xs text-gray-400 ml-1">
            — grant or revoke modules beyond the tenant's plan
          </span>
        </div>
        <div className="p-5">
          {!allModules ? (
            <p className="text-sm text-gray-400">Loading modules…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...(allModules ?? [])].sort((a, b) => a.order - b.order).map((mod) => {
                const override = overrides?.find((o) => o.module === mod.id)
                const planKeys = tenant.plan?.module_keys ?? []
                const inPlan = mod.is_core || planKeys.includes(mod.key)
                const status = override
                  ? override.is_enabled
                    ? 'granted'
                    : 'revoked'
                  : inPlan
                  ? 'plan'
                  : 'excluded'

                return (
                  <div
                    key={mod.id}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border ${
                      status === 'revoked'
                        ? 'border-red-200 bg-red-50'
                        : status === 'granted'
                        ? 'border-green-200 bg-green-50'
                        : status === 'plan'
                        ? 'border-gray-200 bg-gray-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500"><ModIconBadge name={mod.icon} /></span>
                      <div>
                        <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                          {mod.name}
                          {mod.is_core && (
                            <span className="text-indigo-500 text-[10px] font-bold ml-0.5">(core)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400">
                          {status === 'granted' && <span className="text-green-600 font-medium">Granted (override)</span>}
                          {status === 'revoked' && <span className="text-red-500 font-medium">Revoked (override)</span>}
                          {status === 'plan' && <span className="text-gray-500">Included in plan</span>}
                          {status === 'excluded' && <span className="text-gray-400">Not in plan</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Remove override button */}
                      {override && !mod.is_core && (
                        <button
                          onClick={() => deleteOverride.mutate(override.id)}
                          title="Remove override (revert to plan)"
                          className="p-1 text-gray-400 hover:text-gray-700 transition"
                        >
                          <X size={14} />
                        </button>
                      )}
                      {/* Grant override */}
                      {!mod.is_core && status !== 'granted' && !inPlan && (
                        <button
                          onClick={() => addOverride.mutate({ moduleId: mod.id, isEnabled: true, note: 'Granted by super admin' })}
                          title="Grant this module"
                          className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700 hover:bg-green-200 transition flex items-center gap-1"
                        >
                          <Check size={11} /> Grant
                        </button>
                      )}
                      {/* Revoke override (in plan but can be revoked) */}
                      {!mod.is_core && status !== 'revoked' && inPlan && (
                        <button
                          onClick={() => addOverride.mutate({ moduleId: mod.id, isEnabled: false, note: 'Revoked by super admin' })}
                          title="Revoke this module"
                          className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-600 hover:bg-red-200 transition flex items-center gap-1"
                        >
                          <Minus size={11} /> Revoke
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <EditTenantModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        tenant={tenant}
      />
      <AddMemberModal
        open={showAddMember}
        onClose={() => setShowAddMember(false)}
        tenantId={tenant.id}
      />
    </div>
  )
}
