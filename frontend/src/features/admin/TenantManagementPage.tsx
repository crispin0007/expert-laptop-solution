import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import apiClient from '../../api/client'
import Modal from '../../components/Modal'
import CreateTenantModal from './CreateTenantModal'
import EditTenantModal, { type Tenant } from './EditTenantModal'
import {
  ShieldCheck, Power, PowerOff, Trash2, Plus, RefreshCw,
  Pencil, Search, Building2, CheckCircle2, PauseCircle, XCircle,
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ tenant }: { tenant: Tenant }) {
  if (tenant.is_deleted)
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Deleted</span>
  if (!tenant.is_active)
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Suspended</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
}

function PlanBadge({ plan }: { plan: string | { id: number; name: string; slug: string } | null }) {
  const slug = !plan ? 'free' : typeof plan === 'string' ? plan : plan.slug
  const label = !plan ? 'Free' : typeof plan === 'string'
    ? plan.charAt(0).toUpperCase() + plan.slice(1)
    : plan.name
  const cls: Record<string, string> = {
    free: 'bg-gray-100 text-gray-600',
    basic: 'bg-blue-100 text-blue-700',
    pro: 'bg-indigo-100 text-indigo-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls[slug] ?? 'bg-gray-100 text-gray-600'}`}>
      {label}
    </span>
  )
}

interface StatCardProps { label: string; value: number; icon: React.ReactNode; colour: string }
function StatCard({ label, value, icon, colour }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm">
      <div className={`p-2.5 rounded-lg ${colour}`}>{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function TenantManagementPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editTarget, setEditTarget] = useState<Tenant | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null)

  const { data, isLoading, isError, refetch } = useQuery<Tenant[]>({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => {
      const res = await apiClient.get('/tenants/')
      return res.data.results ?? res.data
    },
  })

  const suspendMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/tenants/${id}/suspend/`),
    onSuccess: () => { toast.success('Tenant suspended'); qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }) },
    onError: () => toast.error('Failed to suspend tenant'),
  })

  const activateMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(`/tenants/${id}/activate/`),
    onSuccess: () => { toast.success('Tenant activated'); qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }) },
    onError: () => toast.error('Failed to activate tenant'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/tenants/${id}/`),
    onSuccess: () => {
      toast.success('Tenant deleted')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
    },
    onError: () => toast.error('Failed to delete tenant'),
  })

  const tenants = data ?? []

  const stats = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter((t) => t.is_active && !t.is_deleted).length,
    suspended: tenants.filter((t) => !t.is_active && !t.is_deleted).length,
    deleted: tenants.filter((t) => t.is_deleted).length,
  }), [tenants])

  const filtered = useMemo(() => {
    if (!search.trim()) return tenants
    const q = search.toLowerCase()
    return tenants.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q),
    )
  }, [tenants, search])

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tenant Management</h1>
            <p className="text-xs text-gray-400 mt-0.5">Super Admin · Platform-wide</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm"
          >
            <Plus size={15} /> New Tenant
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Tenants"  value={stats.total}     icon={<Building2    size={18} className="text-gray-500"   />} colour="bg-gray-100"  />
        <StatCard label="Active"         value={stats.active}    icon={<CheckCircle2 size={18} className="text-green-600"  />} colour="bg-green-50"  />
        <StatCard label="Suspended"      value={stats.suspended} icon={<PauseCircle  size={18} className="text-yellow-600" />} colour="bg-yellow-50" />
        <StatCard label="Deleted"        value={stats.deleted}   icon={<XCircle      size={18} className="text-red-500"    />} colour="bg-red-50"    />
      </div>

      {/* Error */}
      {isError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          Failed to load tenants. Ensure you are authenticated as super admin.
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or slug…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-4 py-2 w-full text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name / Slug</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">VAT</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">

            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">Loading tenants…</td>
              </tr>
            )}

            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                  {search ? 'No tenants match your search.' : 'No tenants yet. Create the first one.'}
                </td>
              </tr>
            )}

            {filtered.map((t) => (
              <tr key={t.id} className={`hover:bg-gray-50 transition-colors ${t.is_deleted ? 'opacity-50' : ''}`}>

                <td className="px-4 py-3">
                  <Link to={`/admin/tenants/${t.id}`} className="hover:underline">
                    <p className="font-medium text-indigo-700">{t.name}</p>
                  </Link>
                  <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                </td>

                <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>

                <td className="px-4 py-3 text-gray-600">{t.currency}</td>

                <td className="px-4 py-3">
                  {t.vat_enabled
                    ? <span className="text-gray-700">{(parseFloat(t.vat_rate) * 100).toFixed(0)}%</span>
                    : <span className="text-gray-400">Off</span>}
                </td>

                <td className="px-4 py-3 text-xs">
                  {t.custom_domain
                    ? <a href={`https://${t.custom_domain}`} target="_blank" rel="noreferrer"
                        className="text-indigo-600 hover:underline font-mono">{t.custom_domain}</a>
                    : <span className="text-gray-400 font-mono">{t.slug}.bms.techyatra.com.np</span>}
                </td>

                <td className="px-4 py-3 text-gray-600">{t.member_count}</td>

                <td className="px-4 py-3"><StatusBadge tenant={t} /></td>

                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>

                <td className="px-4 py-3">
                  <div className="flex justify-end items-center gap-1">
                    {!t.is_deleted && (
                      <button title="Edit" onClick={() => setEditTarget(t)}
                        className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500">
                        <Pencil size={14} />
                      </button>
                    )}
                    {!t.is_deleted && t.is_active && (
                      <button title="Suspend" onClick={() => suspendMutation.mutate(t.id)}
                        disabled={suspendMutation.isPending}
                        className="p-1.5 rounded hover:bg-yellow-50 text-yellow-600 disabled:opacity-40">
                        <PowerOff size={14} />
                      </button>
                    )}
                    {!t.is_deleted && !t.is_active && (
                      <button title="Activate" onClick={() => activateMutation.mutate(t.id)}
                        disabled={activateMutation.isPending}
                        className="p-1.5 rounded hover:bg-green-50 text-green-600 disabled:opacity-40">
                        <Power size={14} />
                      </button>
                    )}
                    {!t.is_deleted && (
                      <button title="Delete" onClick={() => setDeleteTarget(t)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create modal ─────────────────────────────── */}
      <CreateTenantModal open={showCreate} onClose={() => setShowCreate(false)} />

      {/* ── Edit modal ───────────────────────────────── */}
      <EditTenantModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        tenant={editTarget}
      />

      {/* ── Delete confirm modal ─────────────────────── */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete tenant?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-1">
          You are about to soft-delete{' '}
          <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Staff will lose access immediately. The record is not permanently erased.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => deleteMutation.mutate(deleteTarget!.id)}
            disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {deleteMutation.isPending ? 'Deleting…' : 'Delete Tenant'}
          </button>
        </div>
      </Modal>

    </div>
  )
}
