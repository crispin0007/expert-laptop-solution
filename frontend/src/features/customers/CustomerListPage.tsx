import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Users, Plus, Search, Building2, User, Trash2, ChevronRight } from 'lucide-react'
import apiClient from '../../api/client'
import type { Customer } from './types'
import CreateCustomerModal from './CreateCustomerModal'
import Modal from '../../components/Modal'

const TYPE_FILTER = ['all', 'individual', 'organization'] as const
type TypeFilter = (typeof TYPE_FILTER)[number]

export default function CustomerListPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers'],
    queryFn: async () => {
      const res = await apiClient.get('/customers/')
      return res.data.results ?? res.data
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`/customers/${id}/`),
    onSuccess: () => {
      toast.success('Customer deleted')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: () => toast.error('Failed to delete customer'),
  })

  const filtered = customers.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    }
    return true
  })

  const total = customers.length
  const individuals = customers.filter(c => c.type === 'individual').length
  const orgs = customers.filter(c => c.type === 'organization').length

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-indigo-500" size={24} />
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Customers</h1>
            <p className="text-xs text-gray-400">{total} total</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm">
          <Plus size={15} /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total', value: total, icon: Users },
          { label: 'Individuals', value: individuals, icon: User },
          { label: 'Organizations', value: orgs, icon: Building2 },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
              <stat.icon size={18} className="text-indigo-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-400">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search name or email…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64" />
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
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">VAT / PAN</th>
              <th className="px-4 py-3">Added</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">Loading customers…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                {search || typeFilter !== 'all' ? 'No customers match your filter.' : 'No customers yet.'}
              </td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`/customers/${c.id}`)}>
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {c.customer_number || '—'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600 flex-shrink-0">
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
                  <p>{c.email || '—'}</p>
                  {c.phone && <p className="text-xs text-gray-400">{c.phone}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                  {c.vat_number || c.pan_number
                    ? <>{c.vat_number && <span>VAT: {c.vat_number}</span>}{c.vat_number && c.pan_number && <br />}{c.pan_number && <span>PAN: {c.pan_number}</span>}</>
                    : '—'
                  }
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(c.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end items-center gap-1" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setDeleteTarget(c)}
                      className="p-1.5 rounded hover:bg-red-50 text-red-400">
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={14} className="text-gray-300 ml-1" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateCustomerModal open={showCreate} onClose={() => setShowCreate(false)} />

      {/* Delete confirm */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete customer?" width="max-w-sm">
        <p className="text-sm text-gray-600 mb-6">
          Delete <span className="font-semibold text-gray-900">{deleteTarget?.name}</span>? This will soft-delete the record.
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
