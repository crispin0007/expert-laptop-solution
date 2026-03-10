import { useQuery } from '@tanstack/react-query'
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Building2, CheckCircle2, PauseCircle, XCircle,
  Search, Plus, RefreshCw, ShieldCheck,
} from 'lucide-react'
import apiClient from '../../api/client'
import { TENANTS } from '../../api/endpoints'
import CreateTenantModal from './CreateTenantModal'
import { type Tenant } from './EditTenantModal'
import DateDisplay from '../../components/DateDisplay'

function StatusBadge({ tenant }: { tenant: Tenant }) {
  if (tenant.is_deleted)
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Deleted</span>
  if (!tenant.is_active)
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Suspended</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
}

function PlanBadge({ plan }: { plan: string | { id: number; name: string; slug: string } | null }) {
  // plan is now an object {id, name, slug} from the updated API; handle both shapes + null
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

export default function PlatformDashboard() {
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery<Tenant[]>({
    queryKey: ['admin', 'tenants'],
    queryFn: async () => {
      const res = await apiClient.get(TENANTS.LIST)
      return res.data.results ?? res.data
    },
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

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Platform Dashboard</h1>
            <p className="text-xs text-gray-400 mt-0.5">Super Admin · All Tenants</p>
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
          Failed to load tenants.
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

      {/* Tenants table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Name / Slug</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading…</td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  {search ? 'No tenants match your search.' : 'No tenants yet. Create the first one.'}
                </td>
              </tr>
            )}
            {filtered.map((t) => (
              <tr key={t.id} className={`hover:bg-indigo-50/40 transition-colors cursor-pointer ${t.is_deleted ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <Link to={`/admin/tenants/${t.id}`} className="block">
                    <p className="font-medium text-indigo-700 hover:underline">{t.name}</p>
                    <p className="text-xs text-gray-400 font-mono">{t.slug}</p>
                  </Link>
                </td>
                <td className="px-4 py-3"><PlanBadge plan={t.plan} /></td>
                <td className="px-4 py-3 text-xs">
                  {t.custom_domain
                    ? <a href={`https://${t.custom_domain}`} target="_blank" rel="noreferrer"
                        className="text-indigo-600 hover:underline font-mono">{t.custom_domain}</a>
                    : <span className="text-gray-400 font-mono">{t.slug}.bms.techyatra.com.np</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{t.member_count}</td>
                <td className="px-4 py-3"><StatusBadge tenant={t} /></td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  <DateDisplay adDate={t.created_at} compact />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateTenantModal open={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  )
}
