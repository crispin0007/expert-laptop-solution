import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Users, Plus, Search, Building2, User, Trash2, ChevronRight,
  ChevronDown, ChevronUp, MapPin, Globe, Loader2, X, AlertTriangle, TrendingUp,
} from 'lucide-react'
import apiClient from '../../api/client'
import { CUSTOMERS } from '../../api/endpoints'
import type { Customer } from './types'
import CreateCustomerModal from './CreateCustomerModal'
import { usePermissions } from '../../hooks/usePermissions'
import Modal from '../../components/Modal'
import DateDisplay from '../../components/DateDisplay'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaginatedCustomers {
  count: number
  next: string | null
  previous: string | null
  results: Customer[]
}

interface WardEntry { ward: string; count: number }
interface MunicipalityEntry { municipality: string; count: number; wards: WardEntry[] }
interface DistrictEntry { district: string; count: number; municipalities: MunicipalityEntry[] }
interface ProvinceEntry { province: string; province_label: string; count: number; districts: DistrictEntry[] }
interface GeoOverview { total: number; unlocated: number; provinces: ProvinceEntry[] }

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25
const TYPE_FILTER = ['all', 'individual', 'organization'] as const
type TypeFilter = (typeof TYPE_FILTER)[number]

const PROVINCE_COLORS: Record<string, string> = {
  bagmati:       'bg-indigo-100 text-indigo-700 border-indigo-200',
  koshi:         'bg-emerald-100 text-emerald-700 border-emerald-200',
  madhesh:       'bg-amber-100 text-amber-700 border-amber-200',
  gandaki:       'bg-purple-100 text-purple-700 border-purple-200',
  lumbini:       'bg-orange-100 text-orange-700 border-orange-200',
  karnali:       'bg-teal-100 text-teal-700 border-teal-200',
  sudurpashchim: 'bg-rose-100 text-rose-700 border-rose-200',
}

const PROVINCE_BAR_COLORS: Record<string, string> = {
  bagmati: 'bg-indigo-400', koshi: 'bg-emerald-400', madhesh: 'bg-amber-400',
  gandaki: 'bg-purple-400', lumbini: 'bg-orange-400', karnali: 'bg-teal-400',
  sudurpashchim: 'bg-rose-400',
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Geo sub-components ────────────────────────────────────────────────────────

function BarCell({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-2 min-w-0 w-32">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-700 shrink-0 w-5 text-right">{count}</span>
    </div>
  )
}

function MunicipalityRow({ muni, muniMax }: { muni: MunicipalityEntry; muniMax: number }) {
  const [open, setOpen] = useState(false)
  const wardMax = muni.wards.length > 0 ? muni.wards[0].count : 1
  return (
    <div className="border-l-2 border-gray-100 ml-3 pl-2">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 py-1 hover:bg-gray-50 rounded px-1 text-left">
        <MapPin size={9} className="text-gray-300 shrink-0" />
        <span className="text-xs text-gray-700 flex-1 truncate font-medium">{muni.municipality}</span>
        <BarCell count={muni.count} max={muniMax} />
        {open ? <ChevronUp size={9} className="text-gray-400 shrink-0" /> : <ChevronDown size={9} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="pl-4 pb-1 space-y-0.5">
          {muni.wards.map(w => (
            <div key={w.ward} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] text-gray-400 shrink-0 w-14">Ward {w.ward}</span>
              <BarCell count={w.count} max={wardMax} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DistrictRow({ dist, distMax }: { dist: DistrictEntry; distMax: number }) {
  const [open, setOpen] = useState(false)
  const muniMax = dist.municipalities.length > 0 ? dist.municipalities[0].count : 1
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden mb-1.5">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 transition text-left">
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">{dist.district}</span>
        <BarCell count={dist.count} max={distMax} />
        {open ? <ChevronUp size={11} className="text-gray-400 shrink-0" /> : <ChevronDown size={11} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="px-2 py-1.5 space-y-0.5">
          {dist.municipalities.map(m => (
            <MunicipalityRow key={m.municipality} muni={m} muniMax={muniMax} />
          ))}
        </div>
      )}
    </div>
  )
}

function ProvinceCard({ prov, totalMax }: { prov: ProvinceEntry; totalMax: number }) {
  const [open, setOpen] = useState(false)
  const colorCls = PROVINCE_COLORS[prov.province] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  const distMax = prov.districts.length > 0 ? prov.districts[0].count : 1
  const pct = totalMax > 0 ? Math.round((prov.count / totalMax) * 100) : 0
  return (
    <div className={`border rounded-xl overflow-hidden ${colorCls}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <Globe size={13} className="shrink-0 opacity-60" />
        <span className="font-bold text-sm flex-1 truncate">{prov.province_label} Province</span>
        <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full shrink-0">{prov.count}</span>
        <span className="text-[10px] opacity-50 shrink-0">{pct}%</span>
        {open ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />}
      </button>
      <div className="mx-4 mb-2">
        <div className="w-full bg-white/40 rounded-full h-1">
          <div className="bg-current h-1 rounded-full opacity-40" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3 bg-white/70">
          <div className="pt-2 space-y-1">
            {prov.districts.map(d => (
              <DistrictRow key={d.district} dist={d} distMax={distMax} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function GeoOverviewSection() {
  const [expanded, setExpanded] = useState(true)
  const { data: geo, isLoading, isError } = useQuery<GeoOverview>({
    queryKey: ['customers-geo-overview'],
    queryFn: () => apiClient.get(CUSTOMERS.GEO_OVERVIEW).then(r => r.data),
    staleTime: 60_000,
  })

  const located = (geo?.total ?? 0) - (geo?.unlocated ?? 0)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition text-left">
        <div className="flex items-center gap-2 flex-wrap">
          <TrendingUp size={16} className="text-indigo-500 shrink-0" />
          <span className="font-semibold text-gray-800 text-sm">Geographic Penetration Overview</span>
          {geo && (
            <span className="text-xs text-gray-400">
              &mdash; {located.toLocaleString()} of {geo.total.toLocaleString()} customers have address
              {geo.unlocated > 0 && (
                <span className="ml-2 text-amber-500 inline-flex items-center gap-0.5">
                  <AlertTriangle size={10} /> {geo.unlocated} without location
                </span>
              )}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading geographic data&hellip;
            </div>
          )}
          {isError && (
            <p className="py-4 text-sm text-red-400 text-center">Failed to load geographic data</p>
          )}
          {geo && geo.provinces.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">
              No geographic data yet. Add province / district to customer records to visualize penetration.
            </div>
          )}
          {geo && geo.provinces.length > 0 && (
            <div className="pt-4">
              <div className="flex h-3 rounded-full overflow-hidden mb-4 gap-0.5">
                {geo.provinces.map(p => {
                  const pct = geo.total > 0 ? (p.count / geo.total) * 100 : 0
                  return (
                    <div key={p.province} style={{ width: `${pct}%` }}
                      className={`${PROVINCE_BAR_COLORS[p.province] ?? 'bg-gray-400'} transition-all`}
                      title={`${p.province_label}: ${p.count}`} />
                  )
                })}
                {geo.unlocated > 0 && (
                  <div style={{ width: `${(geo.unlocated / geo.total) * 100}%` }}
                    className="bg-gray-200" title={`No location: ${geo.unlocated}`} />
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {geo.provinces.map(p => (
                  <span key={p.province}
                    className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${PROVINCE_COLORS[p.province] ?? 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${PROVINCE_BAR_COLORS[p.province] ?? 'bg-gray-400'}`} />
                    {p.province_label} ({p.count})
                  </span>
                ))}
                {geo.unlocated > 0 && (
                  <span className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-gray-100 text-gray-500 border-gray-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                    No location ({geo.unlocated})
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {geo.provinces.map(p => (
                  <ProvinceCard key={p.province} prov={p} totalMax={geo.provinces[0]?.count ?? 1} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomerListPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermissions()

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 400)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setPage(1) }, [debouncedSearch, typeFilter])

  const params = new URLSearchParams({
    page: String(page),
    page_size: String(PAGE_SIZE),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
  })

  const { data, isLoading, isFetching, isPlaceholderData } = useQuery<PaginatedCustomers>({
    queryKey: ['customers', page, debouncedSearch, typeFilter],
    queryFn: () =>
      apiClient.get(`${CUSTOMERS.LIST}?${params}`).then(r => {
        if (Array.isArray(r.data)) return { count: r.data.length, next: null, previous: null, results: r.data }
        // Backend wraps response in { success, data: [...], meta: { pagination: {...} } }
        const arr: Customer[] = Array.isArray(r.data.data)
          ? r.data.data
          : (r.data.data?.results ?? r.data.results ?? [])
        const pag = r.data.meta?.pagination ?? {}
        return { count: r.data.count ?? r.data.data?.count ?? arr.length, next: pag.next ?? null, previous: pag.previous ?? null, results: arr }
      }),
    placeholderData: prev => prev,
    staleTime: 30_000,
  })

  const customers = data?.results ?? []
  const totalCount = data?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(CUSTOMERS.DETAIL(id)),
    onSuccess: () => {
      toast.success('Customer deleted')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customers-geo-overview'] })
    },
    onError: () => toast.error('Failed to delete customer'),
  })

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
            <p className="text-xs text-gray-400">
              {isLoading ? 'Loading\u2026' : `${totalCount.toLocaleString()} total`}
            </p>
          </div>
        </div>
        {can('can_create_customers') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm">
            <Plus size={15} /> Add Customer
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: isLoading ? '\u2014' : totalCount.toLocaleString(), icon: Users, color: 'text-indigo-500 bg-indigo-50' },
          { label: 'Individuals', value: '\u2014', icon: User, color: 'text-blue-500 bg-blue-50' },
          { label: 'Organizations', value: '\u2014', icon: Building2, color: 'text-purple-500 bg-purple-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              <s.icon size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Geo Overview */}
      <GeoOverviewSection />

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name or phone\u2026"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          {TYPE_FILTER.map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                typeFilter === t ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-indigo-400" />}
      </div>

      {/* Table */}
      <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                <Loader2 size={20} className="animate-spin mx-auto" />
              </td></tr>
            )}
            {!isLoading && customers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                {debouncedSearch || typeFilter !== 'all' ? 'No customers match your filter.' : 'No customers yet.'}
              </td></tr>
            )}
            {customers.map(c => (
              <tr key={c.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/customers/${c.id}`)}>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {c.customer_number || '\u2014'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-900">{c.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.type === 'organization' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {c.type === 'organization' ? 'Org' : 'Individual'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <p className="text-sm">{c.email || '\u2014'}</p>
                  {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {c.province ? (
                    <div className="flex flex-col gap-0.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border w-fit ${PROVINCE_COLORS[c.province] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {c.province.charAt(0).toUpperCase() + c.province.slice(1)}
                      </span>
                      {c.district && (
                        <span className="text-gray-400 truncate max-w-28">
                          {c.district}{c.municipality ? `, ${c.municipality}` : ''}
                        </span>
                      )}
                    </div>
                  ) : <span className="text-gray-300">\u2014</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  <DateDisplay adDate={c.created_at} compact />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end items-center gap-1" onClick={e => e.stopPropagation()}>
                    {can('can_delete_customers') && (
                      <button onClick={() => setDeleteTarget(c)}
                        className="p-1.5 rounded hover:bg-red-50 text-red-400">
                        <Trash2 size={14} />
                      </button>
                    )}
                    <ChevronRight size={14} className="text-gray-300 ml-1" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages} &middot; {totalCount.toLocaleString()} customers
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">&laquo;</button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2.5 py-1 text-xs rounded border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">&lsaquo; Prev</button>
              {(() => {
                const pages: number[] = []
                for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) pages.push(i)
                return pages.map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 text-xs rounded border transition ${
                      n === page ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 hover:bg-white text-gray-600'
                    }`}>
                    {n}
                  </button>
                ))
              })()}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2.5 py-1 text-xs rounded border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">Next &rsaquo;</button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed">&raquo;</button>
            </div>
          </div>
        )}
      </div>

      <CreateCustomerModal open={showCreate} onClose={() => setShowCreate(false)} />

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete customer?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-6">
          Delete <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>? This will soft-delete the record.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
          <button onClick={() => deleteMutation.mutate(deleteTarget!.id)} disabled={deleteMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
            {deleteMutation.isPending ? 'Deleting\u2026' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
