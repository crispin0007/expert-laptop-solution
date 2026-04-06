import { useState, useEffect, type FormEvent } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING, INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { useAccountingFy } from '../hooks'
import { buildAccountingUrl, formatBsDate, formatNpr, toPage } from '../utils'
import { adStringToBsDisplay } from '../../../utils/nepaliDate'
import { fetchBankAccounts, fetchBills, approveBill, voidBill, markBillPaid, deleteBill } from '../services'
import { Badge, Spinner, EmptyState, Modal, Field, inputCls, SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass, tableCellClass, tableNumericCellClass } from '../components/accountingShared'
import { Plus, Search, Trash2, Pencil, AlertCircle, CheckCircle } from 'lucide-react'
import { emptyAccountingLineItem, type AccountingLineItemDraft } from '../components/AccountingLineItemsEditor'
import type { ApiPage, BankAccount, Bill, Payment, InventorySupplier } from '../types/accounting'

type LineItemDraft = AccountingLineItemDraft
const emptyLine = emptyAccountingLineItem
const fmt = (value: string | null | undefined) => value ? formatBsDate(value) : '—'

export default function BillsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useAccountingFy()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editBill, setEditBill] = useState<Bill | null>(null)
  const [markPaidBill, setMarkPaidBill] = useState<Bill | null>(null)
  const [billReceiptPayment, setBillReceiptPayment] = useState<Payment | null>(null)
  const [focusedBillId, setFocusedBillId] = useState<number | null>(null)
  const focusBillId = Number(searchParams.get('focus_bill_id') ?? 0)

  const { data: billBankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts-bill-paid'],
    queryFn: () => fetchBankAccounts('page_size=100').then(r => r.results ?? []),
    enabled: !!markPaidBill,
  })

  const { data, isLoading } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', statusFilter, search, fyYear],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (fyYear) params.set('fiscal_year', String(fyYear))
      if (search) params.set('search', search)
      const qs = params.toString()
      return fetchBills(qs)
    },
  })

  const approve = useMutation({
    mutationFn: (id: number) => approveBill(id),
    onSuccess: () => { toast.success('Bill approved'); qc.invalidateQueries({ queryKey: ['bills'] }) },
    onError: () => toast.error('Action failed'),
  })
  const voidBillMutation = useMutation({
    mutationFn: (id: number) => voidBill(id),
    onSuccess: () => { toast.success('Bill voided'); qc.invalidateQueries({ queryKey: ['bills'] }) },
    onError: () => toast.error('Action failed'),
  })
  const markPaid = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { method: string; bank_account: number | null } }) =>
      markBillPaid(id, payload),
    onSuccess: (res) => {
      toast.success('Bill marked as paid')
      setMarkPaidBill(null)
      if ((res as any)?.payment) setBillReceiptPayment((res as any).payment)
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
    onError: () => toast.error('Action failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => deleteBill(id),
    onSuccess: () => { toast.success('Bill deleted'); qc.invalidateQueries({ queryKey: ['bills'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to delete bill'),
  })

  useEffect(() => {
    if (!focusBillId) return
    setFocusedBillId(focusBillId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`bill-row-${focusBillId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingUrl('bills'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusBillId, navigate])

  return (
    <div className="space-y-4">
      {showCreate && <BillCreateModal onClose={() => setShowCreate(false)} />}
      {editBill && <BillEditModal bill={editBill} onClose={() => setEditBill(null)} />}
      {markPaidBill && (
        <PaymentPickerModal
          title={`Mark Paid — ${markPaidBill.bill_number}`}
          amount={markPaidBill.amount_due}
          description="This will record an outgoing payment in the cash / bank ledger and mark the bill as Paid."
          bankAccounts={billBankAccounts}
          onClose={() => setMarkPaidBill(null)}
          onSubmit={(method, bankId) => markPaid.mutate({ id: markPaidBill.id, payload: { method, bank_account: bankId } })}
          isPending={markPaid.isPending}
        />
      )}
      {billReceiptPayment && <TransactionReceiptModal payment={billReceiptPayment} onClose={() => setBillReceiptPayment(null)} />}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All statuses</option>
            {['draft','approved','paid','void'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input data-lpignore="true"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search bill or supplier…"
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} bill{data?.count !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> New Bill
          </button>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <SectionCard>
          <TableContainer className="min-w-[800px]">
              <thead className={tableHeadClass}>
                <tr>
                  {['Bill #','Supplier','Date','Due','Total','Paid','Balance','Status','Actions'].map(h => (
                    <th key={h} className={tableHeaderCellClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.results?.map(bill => {
                  const isOverdue = bill.status === 'approved' && bill.due_date && new Date(bill.due_date) < new Date()
                  return (
                    <tr
                      key={bill.id}
                      id={`bill-row-${bill.id}`}
                      className={`hover:bg-gray-50/50 ${isOverdue ? 'bg-amber-50/50' : ''} ${focusedBillId === bill.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{bill.bill_number}</td>
                      <td className={tableCellClass}>{bill.supplier_name}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{fmt(bill.date || bill.created_at)}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className={isOverdue ? 'text-amber-700 font-semibold' : 'text-gray-500'}>{fmt(bill.due_date)}</span>
                        {isOverdue && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1 font-medium">Overdue</span>}
                      </td>
                      <td className={tableNumericCellClass}>{formatNpr(bill.total)}</td>
                      <td className="px-4 py-3 text-xs text-green-700">{Number(bill.amount_paid) > 0 ? formatNpr(bill.amount_paid) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-red-700">{Number(bill.amount_due) > 0 ? formatNpr(bill.amount_due) : '—'}</td>
                      <td className={tableCellClass}><Badge status={bill.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 items-center">
                          {can('can_manage_accounting') && (
                            <button onClick={() => setEditBill(bill)} title="Edit Bill"
                              className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                              <Pencil size={14} />
                            </button>
                          )}
                          {can('can_manage_accounting') && (
                            <button onClick={() => { confirm({ title: 'Delete Bill', message: `Delete ${bill.bill_number}? This cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(bill.id) }) }}
                              title="Delete Bill" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                          {bill.status === 'draft' && (
                            <button onClick={() => approve.mutate(bill.id)} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Approve</button>
                          )}
                          {bill.status === 'approved' && (
                            <button onClick={() => setMarkPaidBill(bill)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Mark Paid</button>
                          )}
                          {bill.status !== 'void' && bill.status !== 'paid' && (
                            <button onClick={() => { confirm({ title: 'Void Bill', message: 'Void this bill?', variant: 'danger', confirmLabel: 'Void' }).then(ok => { if (ok) voidBillMutation.mutate(bill.id) }) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Void</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
          </TableContainer>
          {!data?.results?.length && <EmptyState message="No bills found." />}
        </SectionCard>
      )}
    </div>
  )
}

function BillCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [vatEnabled, setVatEnabled] = useState(true)
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: suppliers = [] } = useQuery<InventorySupplier[]>({
    queryKey: ['inventory-suppliers-select'],
    queryFn: () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=500&is_active=true`).then(r => toPage<InventorySupplier>(r.data).results),
  })
  const subtotal = lines.reduce((acc, l) => {
    const qty = Number(l.qty) || 0
    const price = Number(l.unit_price) || 0
    return acc + qty * price
  }, 0)
  const vatAmt = vatEnabled ? subtotal * 0.13 : 0
  const total = subtotal + vatAmt

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.BILLS, payload),
    onSuccess: () => {
      toast.success('Bill created')
      qc.invalidateQueries({ queryKey: ['bills'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create bill'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string | number | undefined) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function handleSupplierChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__custom__') {
      setSupplierId(null)
      setSupplierName('')
    } else if (val) {
      const id = Number(val)
      const sup = suppliers.find(s => s.id === id)
      setSupplierId(id)
      setSupplierName(sup?.name ?? '')
    } else {
      setSupplierId(null)
      setSupplierName('')
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!supplierName.trim()) { toast.error('Supplier name is required'); return }
    mutation.mutate({
      supplier: supplierId || null,
      supplier_name: supplierName,
      date,
      due_date: dueDate || null,
      apply_vat: vatEnabled,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title="New Bill" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier *">
            {suppliers.length > 0 ? (
              <div className="space-y-1.5">
                <select
                  value={supplierId !== null ? String(supplierId) : (supplierName ? '__custom__' : '')}
                  onChange={handleSupplierChange}
                  className={inputCls}
                >
                  <option value="">— Select supplier —</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.name}</option>
                  ))}
                  <option value="__custom__">+ Enter manually</option>
                </select>
                {supplierId === null && (
                  <input data-lpignore="true" value={supplierName} onChange={e => setSupplierName(e.target.value)} className={inputCls} placeholder="Supplier name" />
                )}
              </div>
            ) : (
              <input data-lpignore="true" value={supplierName} onChange={e => setSupplierName(e.target.value)} className={inputCls} placeholder="Supplier name" />
            )}
          </Field>
          <Field label="Bill Date">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} />
          </Field>
          <Field label="Apply VAT">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input data-lpignore="true" type="checkbox" checked={vatEnabled} onChange={e => setVatEnabled(e.target.checked)} className="accent-indigo-600" />
              Include 13% VAT
            </label>
          </Field>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                        placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-2 text-sm text-gray-600">
          <p>Subtotal: {formatNpr(subtotal)}</p>
          <p>VAT: {formatNpr(vatAmt)}</p>
          <p className="font-semibold">Total: {formatNpr(total)}</p>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Plus size={14} className="animate-spin" />} Save Bill
          </button>
        </div>
      </form>
    </Modal>
  )
}

function BillEditModal({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const qc = useQueryClient()
  const [supplierId, setSupplierId] = useState<string>(bill.supplier ? String(bill.supplier) : '__custom__')
  const [supplierName, setSupplierName] = useState(bill.supplier_name ?? '')
  const [date, setDate] = useState(bill.date ?? new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(bill.due_date ?? '')
  const [lines, setLines] = useState<LineItemDraft[]>(() =>
    (bill.line_items as Record<string, unknown>[]).length > 0
      ? (bill.line_items as Record<string, unknown>[]).map(l => ({
          description: String(l.description ?? ''),
          qty: String(l.qty ?? 1),
          unit_price: String(l.unit_price ?? ''),
          discount: String(l.discount ?? '0'),
          line_type: (l.line_type as 'service' | 'product') ?? 'service',
        }))
      : [emptyLine()]
  )

  const { data: suppliers } = useQuery<ApiPage<InventorySupplier>>({
    queryKey: ['inv-suppliers-mini'],
    queryFn: () => apiClient.get(INVENTORY.SUPPLIERS + '?page_size=500&is_active=true').then(r => toPage<InventorySupplier>(r.data)),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.BILL_DETAIL(bill.id), payload),
    onSuccess: () => {
      toast.success('Bill updated')
      qc.invalidateQueries({ queryKey: ['bills'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update bill'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const resolvedName = supplierId !== '__custom__'
      ? (suppliers?.results?.find(s => String(s.id) === supplierId)?.name ?? supplierName)
      : supplierName
    if (!resolvedName.trim()) { toast.error('Supplier name is required'); return }
    mutation.mutate({
      supplier: supplierId !== '__custom__' ? Number(supplierId) : null,
      supplier_name: resolvedName,
      date,
      due_date: dueDate || null,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0' })),
    })
  }

  return (
    <Modal title={`Edit ${bill.bill_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {bill.status !== 'draft' && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              <strong>Admin override:</strong> This bill is{' '}
              <span className="font-semibold capitalize">{bill.status}</span>. Editing it will
              update line items and totals but will not reverse any posted journal entries.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier">
            <select value={supplierId} onChange={e => {
              setSupplierId(e.target.value)
              if (e.target.value !== '__custom__') setSupplierName('')
            }} className={inputCls}>
              <option value="__custom__">— Enter manually —</option>
              {suppliers?.results?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          {supplierId === '__custom__' && (
            <Field label="Supplier Name *">
              <input data-lpignore="true" value={supplierName} onChange={e => setSupplierName(e.target.value)}
                placeholder="Supplier / vendor name" className={inputCls} required />
            </Field>
          )}
          <Field label="Bill Date">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} />
          </Field>
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                <th className="px-2 py-2 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-2 py-1.5">
                    <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                      placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                      className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                      placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                        className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PaymentPickerModal({
  title, amount, description, bankAccounts, onClose, onSubmit, isPending,
}: {
  title: string
  amount: string
  description?: string
  bankAccounts: BankAccount[]
  onClose: () => void
  onSubmit: (method: string, bankId: number | null) => void
  isPending: boolean
}) {
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash')
  const [bankId, setBankId] = useState<number | null>(null)

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault()
          if (method !== 'cash' && !bankId) { toast.error('Please select a bank account'); return }
          onSubmit(method, method === 'cash' ? null : bankId)
        }}
      >
        <p className="text-sm text-gray-600">
          Amount: <span className="font-semibold text-indigo-700">{new Intl.NumberFormat('ne-NP', { style: 'currency', currency: 'NPR' }).format(parseFloat(amount))}</span>
        </p>
        <Field label="Payment Method *">
          <div className="flex gap-3">
            {[
              { value: 'cash', label: 'Cash' },
              { value: 'bank_transfer', label: 'Bank Transfer' },
              { value: 'cheque', label: 'Cheque' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                <input data-lpignore="true"
                  type="radio"
                  name="payment_method"
                  value={opt.value}
                  checked={method === opt.value}
                  onChange={() => { setMethod(opt.value as typeof method); if (opt.value === 'cash') setBankId(null) }}
                  className="accent-indigo-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </Field>
        {method !== 'cash' && (
          <Field label="Bank Account *">
            <select className={inputCls} value={bankId ?? ''} onChange={e => setBankId(Number(e.target.value) || null)} required>
              <option value="">— Select bank account —</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.name} — {b.bank_name} ({b.account_number})</option>
              ))}
            </select>
          </Field>
        )}
        {description && <p className="text-xs text-gray-400">{description}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
            {isPending ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function TransactionReceiptModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const npr = (v: string | number) =>
    new Intl.NumberFormat('ne-NP', { style: 'currency', currency: 'NPR' }).format(Number(v))
  const fmt = (d: string) => d ? (adStringToBsDisplay(d)?.bs ?? '—') : '—'
  const methodLabel: Record<string, string> = {
    cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
    esewa: 'eSewa', khalti: 'Khalti',
  }
  const isIncoming = payment.type === 'incoming'

  return (
    <Modal title="Transaction Receipt" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">Payment Recorded</p>
            <p className="text-xs text-green-600">Journal entry posted to ledger</p>
          </div>
          <span className="ml-auto font-mono text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">
            {payment.payment_number}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Amount</p>
            <p className="font-semibold text-gray-900 text-base">{npr(payment.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Direction</p>
            <p className={`font-medium ${isIncoming ? 'text-green-700' : 'text-red-700'}`}>
              {isIncoming ? '↑ Incoming' : '↓ Outgoing'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Method</p>
            <p className="text-gray-800">{methodLabel[payment.method] ?? payment.method}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-gray-800">{fmt(payment.date)}</p>
          </div>
          {payment.reference && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Reference</p>
              <p className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded inline-block">{payment.reference}</p>
            </div>
          )}
          {payment.invoice_number && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Invoice</p>
              <p className="font-mono text-xs text-indigo-700">{payment.invoice_number}</p>
            </div>
          )}
          {payment.bill_number && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Bill</p>
              <p className="font-mono text-xs text-indigo-700">{payment.bill_number}</p>
            </div>
          )}
          {payment.bank_account_name && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Bank Account</p>
              <p className="text-gray-800">{payment.bank_account_name}</p>
            </div>
          )}
          {payment.notes && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-gray-700 text-xs">{payment.notes}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center pt-1">
          This transaction now appears in the {payment.bank_account_name ? 'bank statement' : 'cash ledger'}.
        </p>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
