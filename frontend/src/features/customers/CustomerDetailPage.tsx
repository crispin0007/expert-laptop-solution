import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Building2, User, Pencil, Save, X } from 'lucide-react'
import apiClient from '../../api/client'
import type { Customer } from './types'
import CustomerContactsTab from './CustomerContactsTab'
import NepalAddressFields, { type NepalAddressValue } from './NepalAddressFields'
import DateDisplay from '../../components/DateDisplay'
import { usePermissions } from '../../hooks/usePermissions'

const TABS = ['Info', 'Tickets', 'Contacts'] as const
type Tab = (typeof TABS)[number]

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const customerId = Number(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('Info')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Customer>>({})
  const { can } = usePermissions()

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ['customers', customerId],
    queryFn: async () => {
      const res = await apiClient.get(`/customers/${customerId}/`)
      // Unwrap NexusPageNumberPagination / ApiResponse envelope
      return (res.data?.data ?? res.data) as Customer
    },
    enabled: !!customerId,
  })

  const { data: customerTickets } = useQuery<any[]>({
    queryKey: ['customers', customerId, 'tickets'],
    queryFn: async () => {
      const res = await apiClient.get('/tickets/', { params: { customer: customerId, page_size: 100 } })
      const d = res.data?.data ?? res.data
      return Array.isArray(d) ? d : (d?.results ?? [])
    },
    enabled: !!customerId && tab === 'Tickets',
  })

  const patchMutation = useMutation({
    mutationFn: (payload: Partial<Customer>) => apiClient.patch(`/customers/${customerId}/`, payload),
    onSuccess: () => {
      toast.success('Customer updated')
      setEditing(false)
      qc.invalidateQueries({ queryKey: ['customers', customerId] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
    onError: () => toast.error('Failed to update customer'),
  })

  function startEdit() {
    if (customer) setForm({ ...customer })
    setEditing(true)
  }

  function cancelEdit() {
    setEditing(false)
  }

  if (isLoading) {
    return <div className="p-6 text-center text-gray-400">Loading…</div>
  }

  if (!customer) {
    return <div className="p-6 text-center text-red-400">Customer not found.</div>
  }

  const displayForm = editing ? form : customer

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <button onClick={() => navigate('/customers')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600">
        <ArrowLeft size={15} /> Back to Customers
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-lg font-bold text-indigo-600">
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              {customer.type === 'organization'
                ? <Building2 size={15} className="text-blue-500" />
                : <User size={15} className="text-gray-400" />}
              <h1 className="text-lg font-semibold text-gray-900">{customer.name}</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                customer.type === 'organization' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {customer.type === 'organization' ? 'Organization' : 'Individual'}
              </span>
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{customer.email || 'No email'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {can('can_update_customers') && (editing ? (
            <>
              <button onClick={cancelEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                <X size={14} /> Cancel
              </button>
              <button onClick={() => patchMutation.mutate(form)} disabled={patchMutation.isPending}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                <Save size={14} /> {patchMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Pencil size={14} /> Edit
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Info' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            {([
              { label: 'Email', key: 'email' as keyof Customer, type: 'email', optional: true },
              { label: 'Phone', key: 'phone' as keyof Customer, type: 'tel' },
              { label: 'VAT Number', key: 'vat_number' as keyof Customer, type: 'text' },
              { label: 'PAN Number', key: 'pan_number' as keyof Customer, type: 'text' },
            ]).map(({ label, key, type, optional }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {label}
                  {optional && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
                </label>
                {editing ? (
                  <input type={type} value={(form[key] as string) ?? ''}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                ) : (
                  <p className="text-sm text-gray-900">{(displayForm[key] as string) || '—'}</p>
                )}
              </div>
            ))}

            {/* Nepal hierarchical address */}
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Address
                {editing && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
              </label>
              {editing ? (
                <NepalAddressFields
                  value={{
                    province:     form.province     ?? '',
                    district:     form.district     ?? '',
                    municipality: form.municipality ?? '',
                    ward_no:      form.ward_no      ?? '',
                    street:       form.street       ?? '',
                  }}
                  onChange={(next: NepalAddressValue) => setForm(f => ({ ...f, ...next }))}
                />
              ) : (
                <div className="text-sm text-gray-900">
                  {customer.full_address
                    ? <p>{customer.full_address}</p>
                    : <p className="text-gray-400">—</p>
                  }
                </div>
              )}
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              {editing ? (
                <textarea rows={3} value={form.notes ?? ''}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              ) : (
                <p className="text-sm text-gray-900 whitespace-pre-wrap">{customer.notes || '—'}</p>
              )}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex gap-6 text-xs text-gray-400">
            <span>Created <DateDisplay adDate={customer.created_at} compact /></span>
            {customer.created_by_name && <span>by {customer.created_by_name}</span>}
          </div>
        </div>
      )}

      {tab === 'Tickets' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {(!customerTickets || customerTickets.length === 0) ? (
            <div className="p-10 text-center text-gray-400 text-sm">No tickets for this customer yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Title</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Priority</th>
                  <th className="px-4 py-3 text-left">Assigned</th>
                  <th className="px-4 py-3 text-left">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customerTickets.map((t: any) => {
                  const allAssignees = [
                    t.assigned_to_name,
                    ...(t.team_member_names ?? []),
                  ].filter(Boolean)
                  return (
                    <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/tickets/${t.id}`)}>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{t.ticket_number}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          t.status === 'open' ? 'bg-blue-100 text-blue-700'
                          : t.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700'
                          : t.status === 'resolved' ? 'bg-green-100 text-green-700'
                          : t.status === 'closed' ? 'bg-gray-100 text-gray-600'
                          : 'bg-red-100 text-red-700'
                        }`}>{t.status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          t.priority === 'critical' ? 'bg-red-100 text-red-700'
                          : t.priority === 'high' ? 'bg-orange-100 text-orange-700'
                          : t.priority === 'medium' ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-500'
                        }`}>{t.priority}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {allAssignees.length > 0 ? allAssignees.join(', ') : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {new Date(t.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'Contacts' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <CustomerContactsTab customerId={customerId} />
        </div>
      )}
    </div>
  )
}
