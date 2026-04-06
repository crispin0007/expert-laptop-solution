import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { usePermissions } from '../../../hooks/usePermissions'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import Modal from '../../../components/Modal'
import { useFyStore } from '../../../store/fyStore'
import { AlertCircle, Loader2 } from 'lucide-react'
import { AccountingField, accountingInputCls, accountingSelectCls } from '../components/AccountingFormHelpers'
import { AccountingLineItemsEditor, emptyAccountingLineItem, type AccountingLineItemDraft } from '../components/AccountingLineItemsEditor'
import { createInvoice, fetchInvoiceDetail, fetchInvoices, updateInvoice, fetchInvoicePdf } from '../services'
import { SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import { toPage } from '../utils/accountingUtils'

interface InvoiceItem {
  description?: string
  name?: string
  qty?: number
  quantity?: number
  unit_price: string
  discount?: string
  total?: string
  line_type?: string
  cost_price_snapshot?: string
  product_id?: number
}

interface Invoice {
  id: number
  invoice_number: string
  customer: number | null
  customer_name: string
  ticket: number | null
  project: number | null
  ticket_number?: string
  project_name?: string
  line_items: InvoiceItem[]
  subtotal: string
  discount: string
  vat_rate: string
  vat_amount: string
  total: string
  amount_paid: string
  amount_due: string
  status: string
  finance_status: string
  finance_notes: string
  finance_reviewed_at: string | null
  date: string
  due_date: string | null
  paid_at: string | null
  notes: string
  created_at: string
}

interface Customer { id: number; name: string }
interface ServiceItem { id: number; name: string; unit_price: string }
interface InventoryProduct { id: number; name: string; unit_price: string; sku: string }
interface ApiPage<T> { results: T[]; count: number }

function npr(v: string | number) {
  return `NPR ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Badge({ status }: { status: string }) {
  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    issued: 'bg-blue-100 text-blue-700',
    approved: 'bg-indigo-100 text-indigo-700',
    paid: 'bg-green-100 text-green-700',
    void: 'bg-red-100 text-red-500',
    pending: 'bg-yellow-100 text-yellow-700',
    rejected: 'bg-red-100 text-red-600',
    posted: 'bg-green-100 text-green-700',
    applied: 'bg-purple-100 text-purple-700',
    incoming: 'bg-green-100 text-green-700',
    outgoing: 'bg-orange-100 text-orange-700',
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

function InvoiceCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [applyVat, setApplyVat] = useState(true)
  const [lines, setLines] = useState<AccountingLineItemDraft[]>([emptyAccountingLineItem()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then((r: any) => toPage<Customer>(r.data)),
  })

  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products-all'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then((r: any) => {
      const d = r.data?.data ?? r.data
      return Array.isArray(d) ? d : d.results ?? []
    }),
  })

  const { data: services = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then((r: any) => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => createInvoice(payload),
    onSuccess: () => {
      toast.success('Invoice created')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create invoice'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lines.some(l => l.description && l.unit_price)) {
      toast.error('Add at least one line item with a description and price')
      return
    }
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      date,
      due_date: dueDate || null,
      notes,
      apply_vat: applyVat,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    const gross = Number(l.qty) * Number(l.unit_price)
    const disc = gross * (Number(l.discount) / 100)
    return s + gross - disc
  }, 0)
  const vatAmount = applyVat ? subtotal * 0.13 : 0
  const total = subtotal + vatAmount

  return (
    <Modal open={true} title="New Invoice" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <AccountingField label="Date">
            <NepaliDatePicker value={date} onChange={setDate} className="w-full" />
          </AccountingField>
          <AccountingField label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={accountingSelectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </AccountingField>
          <AccountingField label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} className="w-full" />
          </AccountingField>
        </div>

        <div>
          <AccountingLineItemsEditor
            lines={lines}
            onChange={setLines}
            products={products}
            services={services}
            showDiscount
          />
          <div className="mt-3 flex flex-col items-end gap-1 text-sm text-gray-600">
            <div className="flex items-center gap-6">
              <span>Subtotal</span>
              <span className="font-semibold w-28 text-right">{npr(subtotal)}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input data-lpignore="true" type="checkbox" checked={applyVat} onChange={e => setApplyVat(e.target.checked)} className="rounded border-gray-300 text-indigo-600" />
                <span className="text-xs text-gray-500">VAT 13%</span>
              </label>
              <span className={`w-28 text-right ${applyVat ? 'text-gray-700' : 'text-gray-300'}`}>+ {npr(vatAmount)}</span>
            </div>
            <div className="flex items-center gap-6 pt-1 border-t border-gray-200">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="font-bold text-indigo-700 w-28 text-right">{npr(total)}</span>
            </div>
          </div>
        </div>

        <AccountingField label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={accountingInputCls} placeholder="Payment terms, additional notes…" />
        </AccountingField>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Create Invoice
          </button>
        </div>
      </form>
    </Modal>
  )
}

function InvoiceDetailModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const handlePrint = async () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    if (!popup) {
      toast.error('Pop-up blocked. Please allow pop-ups to print invoice.')
      return
    }
    popup.document.write('<html><head><title>Loading invoice...</title></head><body style="font-family: Arial, sans-serif; padding: 16px;">Loading invoice PDF...</body></html>')
    popup.document.close()

    try {
      const res = await fetchInvoicePdf(inv.id)
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      popup.location.href = url
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      popup.close()
      toast.error('Invoice print failed')
    }
  }

  return (
    <Modal open={true} title={`Invoice ${inv.invoice_number}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Customer</p>
            <p className="font-semibold text-gray-800">{inv.customer_name || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Status</p>
            <Badge status={inv.status} />
          </div>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
            <div><span className="font-semibold text-gray-700">Invoice #</span> {inv.invoice_number}</div>
            <div><span className="font-semibold text-gray-700">Date</span> {inv.date}</div>
            <div><span className="font-semibold text-gray-700">Due Date</span> {inv.due_date || '—'}</div>
            <div><span className="font-semibold text-gray-700">Paid At</span> {inv.paid_at || '—'}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Subtotal</p>
              <p className="font-semibold text-gray-900">{npr(inv.subtotal)}</p>
            </div>
            <div>
              <p className="text-gray-500">Total</p>
              <p className="font-semibold text-gray-900">{npr(inv.total)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Paid</p>
              <p className="font-semibold text-gray-900">{npr(inv.amount_paid)}</p>
            </div>
            <div>
              <p className="text-gray-500">Balance Due</p>
              <p className="font-semibold text-gray-900">{npr(inv.amount_due)}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={handlePrint} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700">Print PDF</button>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  )
}

function InvoiceEditModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState(inv.customer ? String(inv.customer) : '')
  const [date, setDate] = useState(inv.date ?? new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState(inv.due_date ?? '')
  const [notes, setNotes] = useState(inv.notes ?? '')
  const [lines, setLines] = useState<AccountingLineItemDraft[]>(() => inv.line_items.length > 0 ? inv.line_items.map((l: InvoiceItem) => ({ description: l.description || l.name || '', qty: String(l.qty ?? l.quantity ?? 1), unit_price: String(l.unit_price || ''), discount: String(l.discount || '0'), line_type: (l.line_type as 'service' | 'product') || 'service' })) : [emptyAccountingLineItem()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then((r: any) => toPage<Customer>(r.data)),
  })
  const { data: editInvServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then((r: any) => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => updateInvoice(inv.id, payload),
    onSuccess: () => {
      toast.success('Invoice updated')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update invoice'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lines.some(l => l.description && l.unit_price)) {
      toast.error('Add at least one line item with a description and price')
      return
    }
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      date,
      due_date: dueDate || null,
      notes,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    return s + Number(l.qty) * Number(l.unit_price) * (1 - Number(l.discount) / 100)
  }, 0)

  return (
    <Modal open={true} title={`Edit ${inv.invoice_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {inv.status !== 'draft' && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              <strong>Admin override:</strong> This invoice is <span className="font-semibold capitalize">{inv.status}</span>. Editing it will update line items and totals but will not reverse any posted journal entries.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <AccountingField label="Date">
            <NepaliDatePicker value={date} onChange={setDate} className="w-full" />
          </AccountingField>
          <AccountingField label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={accountingSelectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </AccountingField>
          <AccountingField label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} className="w-full" />
          </AccountingField>
        </div>
        <div>
          <AccountingLineItemsEditor
            lines={lines}
            onChange={setLines}
            products={[]}
            services={editInvServices}
            showDiscount
          />
          <div className="flex justify-end mt-2 text-sm text-gray-600">Subtotal: <span className="font-semibold ml-2">{npr(subtotal)}</span></div>
        </div>
        <AccountingField label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={accountingInputCls} placeholder="Payment terms, additional notes…" />
        </AccountingField>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />} Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function InvoicesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useFyStore()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const focusInvoiceId = Number(searchParams.get('focus_invoice_id') ?? 0)

  const { data } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', statusFilter, search, fyYear],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (fyYear) params.set('fiscal_year', String(fyYear))
      if (search) params.set('search', search)
      const qs = params.toString()
      return fetchInvoices(qs)
    },
  })

  useEffect(() => {
    if (!focusInvoiceId) return
    let cancelled = false
    const openFocusedInvoice = async () => {
      const fromList = data?.results?.find(inv => inv.id === focusInvoiceId)
      if (fromList) {
        setDetailInvoice(fromList)
        navigate('/accounting/invoices', { replace: true })
        return
      }

      try {
        const inv = await fetchInvoiceDetail(focusInvoiceId)
        if (cancelled) return
        if (inv) {
          setDetailInvoice(inv)
        } else {
          toast.error('Linked invoice not found')
        }
      } catch {
        if (!cancelled) toast.error('Linked invoice not found')
      }
    }
    openFocusedInvoice()
    return () => { cancelled = true }
  }, [focusInvoiceId, data?.results, navigate])

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={accountingSelectCls}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="issued">Issued</option>
            <option value="paid">Paid</option>
            <option value="void">Voided</option>
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices…" className={accountingInputCls} />
        </div>
        <div className="flex flex-wrap gap-2">
          {can('can_manage_accounting') && (
            <button type="button" onClick={() => setShowCreate(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">New Invoice</button>
          )}
        </div>
      </div>

      <SectionCard>
        <TableContainer className="min-w-[600px]">
          <thead className={tableHeadClass}>
            <tr>
              <th className={tableHeaderCellClass}>Invoice</th>
              <th className={tableHeaderCellClass}>Customer</th>
              <th className={tableHeaderCellClass}>Status</th>
              <th className={`${tableHeaderCellClass} text-right`}>Total</th>
              <th className={`${tableHeaderCellClass} text-right`}>Paid</th>
              <th className={`${tableHeaderCellClass} text-right`}>Balance</th>
              <th className={`${tableHeaderCellClass} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data?.results.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs text-gray-700">{inv.invoice_number}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{inv.customer_name || '—'}</td>
                <td className="px-4 py-3 text-xs"><Badge status={inv.status} /></td>
                <td className="px-4 py-3 text-xs text-right">{npr(inv.total)}</td>
                <td className="px-4 py-3 text-xs text-right">{inv.amount_paid !== '0.00' ? npr(inv.amount_paid) : '—'}</td>
                <td className="px-4 py-3 text-xs text-right">{Number(inv.amount_due) > 0 ? npr(inv.amount_due) : '—'}</td>
                <td className="px-4 py-3 text-right text-xs space-x-2">
                  <button type="button" onClick={() => setDetailInvoice(inv)} className="text-indigo-600 hover:text-indigo-800">View</button>
                  {can('can_manage_accounting') && <button type="button" onClick={() => setEditInvoice(inv)} className="text-gray-600 hover:text-gray-900">Edit</button>}
                </td>
              </tr>
            ))}
          </tbody>
          </TableContainer>
        </SectionCard>

      {showCreate && <InvoiceCreateModal onClose={() => setShowCreate(false)} />}
      {detailInvoice && <InvoiceDetailModal inv={detailInvoice} onClose={() => setDetailInvoice(null)} />}
      {editInvoice && <InvoiceEditModal inv={editInvoice} onClose={() => setEditInvoice(null)} />}
    </div>
  )
}
