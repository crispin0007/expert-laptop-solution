import { useState, type ChangeEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING, INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { Truck, Plus, Pencil, Loader2 } from 'lucide-react'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatNpr, toPage } from '../utils'
import { Modal, Field, Spinner, inputCls, SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass, tableCellClass, tableNumericCellClass } from '../components/accountingShared'
import type { Bill, InventorySupplier } from '../types/accounting'

export default function SuppliersPage() {
  const { fyYear } = useAccountingFy()
  const [showCreate, setShowCreate] = useState(false)
  const [editSupplier, setEditSupplier] = useState<InventorySupplier | null>(null)

  const { data: suppliers = [], isLoading } = useQuery<InventorySupplier[]>({
    queryKey: ['inventory-suppliers'],
    queryFn: () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=500`).then(r => toPage<InventorySupplier>(r.data).results),
  })

  const { data: bills = [] } = useQuery<Bill[]>({
    queryKey: ['bills', 'all', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.BILLS}?page_size=500`, fyYear)).then(r => toPage<Bill>(r.data).results),
  })

  const supplierStats = suppliers.map(s => {
    const sb = bills.filter(b => b.supplier === s.id)
    const total = sb.reduce((acc, b) => acc + Number(b.total ?? 0), 0)
    const unpaid = sb.filter(b => ['draft', 'approved'].includes(b.status))
    const unpaidTotal = unpaid.reduce((acc, b) => acc + Number(b.amount_due ?? 0), 0)
    return { ...s, billCount: sb.length, total, unpaidTotal }
  }).filter(s => s.billCount > 0 || s.is_active)

  const statusBadge = (active: boolean) =>
    active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'

  return (
    <div className="space-y-4">
      {showCreate && <SupplierCreateModal onClose={() => { setShowCreate(false); setEditSupplier(null) }} initial={editSupplier} />}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            <Truck size={15} className="text-orange-500" /> Suppliers
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{suppliers.length} suppliers</span>
            <button onClick={() => { setEditSupplier(null); setShowCreate(true) }} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New Supplier
            </button>
          </div>
        </div>
        {isLoading ? <div className="py-12"><Spinner /></div> : (
          <SectionCard>
            <TableContainer className="min-w-[900px]">
              <thead className={tableHeadClass}>
                <tr>{['Supplier', 'Contact', 'PAN', 'City', 'Bills', 'Total Billed', 'Outstanding', 'Status', ''].map(h => (
                  <th key={h} className={tableHeaderCellClass}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {supplierStats.length === 0 ? (
                  <tr><td colSpan={9} className="py-12 text-center text-sm text-gray-400">No suppliers found.</td></tr>
                ) : supplierStats.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className={tableCellClass}>{s.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.contact_person || s.email || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">{s.pan_number || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.city || '—'}</td>
                    <td className={tableNumericCellClass}>{s.billCount}</td>
                    <td className={tableNumericCellClass}>{formatNpr(s.total)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={s.unpaidTotal > 0 ? 'text-orange-600 font-semibold' : 'text-gray-400'}>
                        {formatNpr(s.unpaidTotal)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(s.is_active)}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditSupplier(s); setShowCreate(true) }}
                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors">
                        <Pencil size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          </SectionCard>
        )}
      </div>
    </div>
  )
}

function SupplierCreateModal({ onClose, initial }: { onClose: () => void; initial?: InventorySupplier | null }) {
  const qc = useQueryClient()
  const isEdit = !!initial

  const empty = { name: '', contact_person: '', email: '', phone: '', address: '', city: '', country: 'Nepal', website: '', payment_terms: '', notes: '', pan_number: '', is_active: true }
  const [form, setForm] = useState(() => initial ? {
    name: initial.name,
    contact_person: initial.contact_person ?? '',
    email: initial.email ?? '',
    phone: initial.phone ?? '',
    address: initial.address ?? '',
    city: initial.city ?? '',
    country: initial.country ?? 'Nepal',
    website: initial.website ?? '',
    payment_terms: initial.payment_terms ?? '',
    notes: initial.notes ?? '',
    pan_number: initial.pan_number ?? '',
    is_active: initial.is_active,
  } : empty)

  const setField = (key: keyof typeof empty) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [key]: event.target.value }))

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? apiClient.patch(INVENTORY.SUPPLIER_DETAIL(initial!.id), form)
      : apiClient.post(INVENTORY.SUPPLIERS, form),
    onSuccess: () => {
      toast.success(isEdit ? 'Supplier updated' : 'Supplier added')
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] })
      qc.invalidateQueries({ queryKey: ['inventory-suppliers-select'] })
      qc.invalidateQueries({ queryKey: ['report'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? (isEdit ? 'Failed to update supplier' : 'Failed to add supplier')),
  })

  return (
    <Modal title={isEdit ? 'Edit Supplier' : 'New Supplier'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
        <Field label="Supplier Name *">
          <input data-lpignore="true" value={form.name} onChange={setField('name')} className={inputCls} required placeholder="Supplier / vendor name" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Person">
            <input data-lpignore="true" value={form.contact_person} onChange={setField('contact_person')} className={inputCls} placeholder="Full name" autoComplete="off" />
          </Field>
          <Field label="Phone">
            <input data-lpignore="true" value={form.phone} onChange={setField('phone')} className={inputCls} placeholder="Phone number" autoComplete="off" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PAN / VAT Number">
            <input data-lpignore="true" value={form.pan_number} onChange={setField('pan_number')} className={inputCls} placeholder="9-digit PAN" autoComplete="off" />
          </Field>
          <Field label="Email">
            <input data-lpignore="true" type="email" value={form.email} onChange={setField('email')} className={inputCls} placeholder="email@example.com" autoComplete="off" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Website">
            <input data-lpignore="true" value={form.website} onChange={setField('website')} className={inputCls} placeholder="https://" autoComplete="off" />
          </Field>
          <Field label="Payment Terms">
            <select value={form.payment_terms} onChange={setField('payment_terms')} className={inputCls}>
              <option value="">Select…</option>
              <option value="immediate">Immediate</option>
              <option value="net15">Net 15</option>
              <option value="net30">Net 30</option>
              <option value="net45">Net 45</option>
              <option value="net60">Net 60</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="City">
            <input data-lpignore="true" value={form.city} onChange={setField('city')} className={inputCls} placeholder="City" autoComplete="off" />
          </Field>
          <Field label="Country">
            <input data-lpignore="true" value={form.country} onChange={setField('country')} className={inputCls} placeholder="Country" autoComplete="off" />
          </Field>
        </div>
        <Field label="Address">
          <input data-lpignore="true" value={form.address} onChange={setField('address')} className={inputCls} placeholder="Street address" autoComplete="off" />
        </Field>
        <Field label="Notes">
          <textarea value={form.notes} onChange={setField('notes')} className={inputCls + ' resize-none'} rows={2} placeholder="Internal notes" />
        </Field>
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input data-lpignore="true" type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded" />
            Active supplier
          </label>
        )}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending || !form.name.trim()}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Supplier'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
