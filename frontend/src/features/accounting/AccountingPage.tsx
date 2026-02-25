/**
 * AccountingPage.tsx — Full multi-tab accounting module UI.
 * Tabs: dashboard | invoices | bills | payments | credit-notes |
 *       journals | accounts | banks | payslips | reports
 */
import { useState, useCallback, useRef, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { ACCOUNTING } from '../../api/endpoints'
import toast from 'react-hot-toast'
import {
  LayoutDashboard, Receipt, FileText, CreditCard, RotateCcw,
  BookOpen, Layers, Building2, Coins, BarChart2, ArrowLeftRight,
  Loader2, CheckCircle, XCircle, Download, Plus, X,
  ChevronRight, AlertCircle, TrendingUp, TrendingDown, Trash2,
  FileSpreadsheet, Printer,
} from 'lucide-react'

// ─── Shared types ──────────────────────────────────────────────────────────

interface InvoiceItem {
  description?: string; name?: string; qty?: number; quantity?: number
  unit_price: string; discount?: string; total?: string
}
interface Invoice {
  id: number; invoice_number: string; customer: number | null
  customer_name: string; ticket: number | null; project: number | null
  line_items: InvoiceItem[]; subtotal: string; discount: string
  vat_rate: string; vat_amount: string; total: string; amount_paid: string
  amount_due: string; status: string; due_date: string | null
  paid_at: string | null; notes: string; created_at: string
}
interface Bill {
  id: number; bill_number: string; supplier: number | null
  supplier_name: string; line_items: unknown[]; subtotal: string
  total: string; amount_paid: string; amount_due: string
  status: string; due_date: string | null; approved_at: string | null
  paid_at: string | null; created_at: string
}
interface Payment {
  id: number; payment_number: string; date: string; type: string
  method: string; amount: string; invoice: number | null
  bill: number | null; bank_account: number | null; reference: string
  created_at: string
}
interface CreditNote {
  id: number; credit_note_number: string; invoice: number | null
  line_items: unknown[]; subtotal: string; total: string
  status: string; issued_at: string | null; created_at: string
}
interface JournalEntry {
  id: number; entry_number: string; date: string; description: string
  reference_type: string; reference_id: number | null; is_posted: boolean
  total_debit: string; total_credit: string; created_at: string
  lines: JournalLine[]
}
interface JournalLine {
  id: number; account_name: string; account_code: string
  debit: string; credit: string; description: string
}
interface Account {
  id: number; code: string; name: string; type: string
  is_system: boolean; is_active: boolean; parent: number | null
  balance: string
}
interface BankAccount {
  id: number; name: string; bank_name: string; account_number: string
  currency: string; opening_balance: string; current_balance: string
  linked_account: number | null; created_at: string
}
interface Payslip {
  id: number; staff: number; staff_name: string; period_start: string
  period_end: string; total_coins: string; coin_to_money_rate: string
  gross_amount: string; base_salary: string; bonus: string
  deductions: string; net_pay: string; status: string
  issued_at: string | null; paid_at: string | null; created_at: string
}
interface CoinTx {
  id: number; staff: number; staff_name: string; amount: string
  source_type: string; status: string; note: string
  approved_by_name: string | null; created_at: string
}
interface Customer { id: number; name: string }
interface ApiPage<T> { results: T[]; count: number }

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function npr(v: string | number) {
  return `NPR ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  issued:   'bg-blue-100 text-blue-700',
  approved: 'bg-indigo-100 text-indigo-700',
  paid:     'bg-green-100 text-green-700',
  void:     'bg-red-100 text-red-500',
  pending:  'bg-yellow-100 text-yellow-700',
  rejected: 'bg-red-100 text-red-600',
  posted:   'bg-green-100 text-green-700',
  applied:  'bg-purple-100 text-purple-700',
  incoming: 'bg-green-100 text-green-700',
  outgoing: 'bg-orange-100 text-orange-700',
}

function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}
function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-indigo-500" size={28} /></div>
}
function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <AlertCircle size={32} className="mb-2" />
      <p className="text-sm">{message}</p>
    </div>
  )
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS = [
  { key: '',             label: 'Dashboard',         icon: LayoutDashboard },
  { key: 'invoices',     label: 'Invoices',           icon: Receipt         },
  { key: 'bills',        label: 'Bills',              icon: FileText        },
  { key: 'payments',     label: 'Payments',           icon: CreditCard      },
  { key: 'credit-notes', label: 'Credit Notes',       icon: RotateCcw       },
  { key: 'journals',     label: 'Journals',           icon: BookOpen        },
  { key: 'accounts',     label: 'Chart of Accounts',  icon: Layers          },
  { key: 'banks',        label: 'Bank Accounts',      icon: Building2       },
  { key: 'payslips',     label: 'Payslips & Coins',   icon: Coins           },
  { key: 'reports',      label: 'Reports',            icon: BarChart2       },
] as const

// ─── Dashboard Tab ─────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: invoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'recent'],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES + '?page_size=10&ordering=-created_at').then(r => r.data),
  })
  const { data: bills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'recent'],
    queryFn: () => apiClient.get(ACCOUNTING.BILLS + '?page_size=10&ordering=-created_at').then(r => r.data),
  })

  const cards = [
    { label: 'Total Invoices',  value: invoices?.count ?? '—',                                                     icon: TrendingUp,   color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'Total Bills',     value: bills?.count ?? '—',                                                        icon: TrendingDown, color: 'text-red-600',    bg: 'bg-red-50'    },
    { label: 'Unpaid Invoices', value: invoices?.results?.filter(i => i.status === 'issued').length ?? '—',        icon: CreditCard,   color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Pending Bills',   value: bills?.results?.filter(b => b.status === 'draft').length ?? '—',            icon: CreditCard,   color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-5 flex items-center gap-4`}>
            <div className={`${c.color} shrink-0`}><c.icon size={28} /></div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{c.label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-0.5">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700">Recent Invoices</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {(invoices?.results?.slice(0, 5) ?? []).map(inv => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{inv.invoice_number}</p>
                  <p className="text-xs text-gray-400">{inv.customer_name || 'No customer'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{npr(inv.total)}</p>
                  <Badge status={inv.status} />
                </div>
              </div>
            ))}
            {!invoices?.results?.length && <div className="py-8 text-center text-sm text-gray-400">No invoices yet.</div>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-700">Recent Bills</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {(bills?.results?.slice(0, 5) ?? []).map(bill => (
              <div key={bill.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{bill.bill_number}</p>
                  <p className="text-xs text-gray-400">{bill.supplier_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{npr(bill.total)}</p>
                  <Badge status={bill.status} />
                </div>
              </div>
            ))}
            {!bills?.results?.length && <div className="py-8 text-center text-sm text-gray-400">No bills yet.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Invoice Create Modal ──────────────────────────────────────────────────

interface LineItemDraft { description: string; qty: string; unit_price: string; discount: string }
const emptyLine = (): LineItemDraft => ({ description: '', qty: '1', unit_price: '', discount: '0' })

function InvoiceCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.INVOICES, payload),
    onSuccess: () => {
      toast.success('Invoice created')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create invoice'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lines.some(l => l.description && l.unit_price)) {
      toast.error('Add at least one line item with a description and price')
      return
    }
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      due_date: dueDate || null,
      notes,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0' })),
    })
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    const gross = Number(l.qty) * Number(l.unit_price)
    const disc = gross * (Number(l.discount) / 100)
    return s + gross - disc
  }, 0)

  return (
    <Modal title="New Invoice" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Due Date">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
          </Field>
        </div>

        {/* Line items */}
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
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Disc%</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                        placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" required />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" required />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
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
          <div className="flex justify-end mt-2 text-sm text-gray-600">
            Subtotal: <span className="font-semibold ml-2">{npr(subtotal)}</span>
          </div>
        </div>

        <Field label="Notes">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className={inputCls} placeholder="Payment terms, additional notes…" />
        </Field>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Invoice
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Invoices Tab ──────────────────────────────────────────────────────────

function InvoicesTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const { data, isLoading } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', statusFilter],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES + (statusFilter ? `?status=${statusFilter}` : '')).then(r => r.data),
  })

  const mutatePaid = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.INVOICE_MARK_PAID(id)),
    onSuccess: () => { toast.success('Invoice marked as paid'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError:   () => toast.error('Action failed'),
  })
  const mutateVoid = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.INVOICE_VOID(id)),
    onSuccess: () => { toast.success('Invoice voided'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError:   () => toast.error('Action failed'),
  })

  const downloadPdf = useCallback(async (inv: Invoice) => {
    try {
      const res = await apiClient.get(ACCOUNTING.INVOICE_PDF(inv.id), { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a   = document.createElement('a')
      a.href = url; a.download = `${inv.invoice_number}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PDF download failed')
    }
  }, [])

  return (
    <div className="space-y-4">
      {showCreate && <InvoiceCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex items-center justify-between">
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {['draft','issued','paid','void'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} invoice{data?.count !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Invoice #','Customer','Date','Due','Total','Paid','Balance','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(inv => (
                <tr key={inv.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(inv.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(inv.due_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(inv.total)}</td>
                  <td className="px-4 py-3 text-green-700 text-xs">{inv.amount_paid !== '0.00' ? npr(inv.amount_paid) : '—'}</td>
                  <td className="px-4 py-3 text-red-700 text-xs">{Number(inv.amount_due) > 0 ? npr(inv.amount_due) : '—'}</td>
                  <td className="px-4 py-3"><Badge status={inv.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => downloadPdf(inv)} title="Download PDF" className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 transition-colors">
                        <Download size={14} />
                      </button>
                      {inv.status === 'issued' && (
                        <button onClick={() => mutatePaid.mutate(inv.id)} title="Mark Paid" className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {inv.status !== 'void' && inv.status !== 'paid' && (
                        <button onClick={() => { if (confirm('Void this invoice?')) mutateVoid.mutate(inv.id) }} title="Void" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.results?.length && <EmptyState message="No invoices found." />}
        </div>
      )}
    </div>
  )
}

// ─── Bill Create Modal ─────────────────────────────────────────────────────

function BillCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [supplierName, setSupplierName] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

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

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierName.trim()) { toast.error('Supplier name is required'); return }
    mutation.mutate({
      supplier_name: supplierName,
      due_date: dueDate || null,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0' })),
    })
  }

  return (
    <Modal title="New Bill" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier Name *">
            <input value={supplierName} onChange={e => setSupplierName(e.target.value)}
              placeholder="Supplier / vendor name" className={inputCls} required />
          </Field>
          <Field label="Due Date">
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputCls} />
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
                      <input value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                        placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
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

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Bill
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bills Tab ─────────────────────────────────────────────────────────────

function BillsTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const { data, isLoading } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', statusFilter],
    queryFn: () => apiClient.get(ACCOUNTING.BILLS + (statusFilter ? `?status=${statusFilter}` : '')).then(r => r.data),
  })

  const approve  = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.BILL_APPROVE(id)),
    onSuccess: () => { toast.success('Bill approved'); qc.invalidateQueries({ queryKey: ['bills'] }) },
    onError: () => toast.error('Action failed'),
  })
  const voidBill = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.BILL_VOID(id)),
    onSuccess: () => { toast.success('Bill voided'); qc.invalidateQueries({ queryKey: ['bills'] }) },
    onError: () => toast.error('Action failed'),
  })
  const markPaid = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.BILL_MARK_PAID(id)),
    onSuccess: () => { toast.success('Bill marked as paid'); qc.invalidateQueries({ queryKey: ['bills'] }) },
    onError: () => toast.error('Action failed'),
  })

  return (
    <div className="space-y-4">
      {showCreate && <BillCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex items-center justify-between">
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          {['draft','approved','paid','void'].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} bill{data?.count !== 1 ? 's' : ''}</span>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> New Bill
          </button>
        </div>
      </div>

      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Bill #','Supplier','Date','Due','Total','Balance','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(bill => (
                <tr key={bill.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{bill.bill_number}</td>
                  <td className="px-4 py-3 text-gray-700">{bill.supplier_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(bill.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(bill.due_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(bill.total)}</td>
                  <td className="px-4 py-3 text-red-700 text-xs">{Number(bill.amount_due) > 0 ? npr(bill.amount_due) : '—'}</td>
                  <td className="px-4 py-3"><Badge status={bill.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {bill.status === 'draft' && (
                        <button onClick={() => approve.mutate(bill.id)} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Approve</button>
                      )}
                      {bill.status === 'approved' && (
                        <button onClick={() => markPaid.mutate(bill.id)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Mark Paid</button>
                      )}
                      {bill.status !== 'void' && bill.status !== 'paid' && (
                        <button onClick={() => { if (confirm('Void this bill?')) voidBill.mutate(bill.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Void</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.results?.length && <EmptyState message="No bills found." />}
        </div>
      )}
    </div>
  )
}

// ─── Payments Tab ──────────────────────────────────────────────────────────

function PaymentsTab() {
  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments'],
    queryFn: () => apiClient.get(ACCOUNTING.PAYMENTS).then(r => r.data),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">Payments are recorded automatically when invoices or bills are marked as paid.</p>
        <span className="text-sm text-gray-400">{data?.count ?? 0} payment{data?.count !== 1 ? 's' : ''}</span>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Payment #','Date','Type','Method','Amount','Invoice','Bill'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.date)}</td>
                  <td className="px-4 py-3"><Badge status={p.type} /></td>
                  <td className="px-4 py-3 text-gray-600 text-xs capitalize">{p.method.replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.bill ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.results?.length && <EmptyState message="No payments recorded yet." />}
        </div>
      )}
    </div>
  )
}

// ─── Credit Notes Tab ──────────────────────────────────────────────────────

function CreditNotesTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery<ApiPage<CreditNote>>({
    queryKey: ['credit-notes'],
    queryFn: () => apiClient.get(ACCOUNTING.CREDIT_NOTES).then(r => r.data),
  })
  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.CREDIT_NOTE_ISSUE(id)),
    onSuccess: () => { toast.success('Credit note issued'); qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateVoid = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.CREDIT_NOTE_VOID(id)),
    onSuccess: () => { toast.success('Credit note voided'); qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
    onError: () => toast.error('Action failed'),
  })

  return (
    <div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['CN #','Invoice','Total','Status','Issued','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(cn => (
                <tr key={cn.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{cn.credit_note_number}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{cn.invoice ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(cn.total)}</td>
                  <td className="px-4 py-3"><Badge status={cn.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(cn.issued_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {cn.status === 'draft' && (
                        <button onClick={() => mutateIssue.mutate(cn.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                      )}
                      {cn.status !== 'void' && (
                        <button onClick={() => { if (confirm('Void?')) mutateVoid.mutate(cn.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Void</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.results?.length && <EmptyState message="No credit notes yet." />}
        </div>
      )}
    </div>
  )
}

// ─── Journal Entry Create Modal ────────────────────────────────────────────

interface JournalLineDraft { account: string; debit: string; credit: string; description: string }
const emptyJLine = (): JournalLineDraft => ({ account: '', debit: '', credit: '', description: '' })

function JournalCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [jLines, setJLines] = useState<JournalLineDraft[]>([emptyJLine(), emptyJLine()])

  const { data: accounts } = useQuery<ApiPage<Account>>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?page_size=500').then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.JOURNALS, payload),
    onSuccess: () => {
      toast.success('Journal entry created')
      qc.invalidateQueries({ queryKey: ['journals'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create entry'),
  })

  function setJLine<K extends keyof JournalLineDraft>(idx: number, key: K, val: string) {
    setJLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  const totalDebit  = jLines.reduce((s, l) => s + Number(l.debit  || 0), 0)
  const totalCredit = jLines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.001

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!balanced) { toast.error('Debits must equal credits'); return }
    if (!description.trim()) { toast.error('Description is required'); return }
    const validLines = jLines.filter(l => l.account && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { toast.error('At least 2 journal lines required'); return }
    mutation.mutate({
      date,
      description,
      reference_type: 'manual',
      lines: validLines.map(l => ({
        account: Number(l.account),
        debit:   l.debit  || '0',
        credit:  l.credit || '0',
        description: l.description,
      })),
    })
  }

  return (
    <Modal title="New Journal Entry" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date *">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Description *">
            <input value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Adjustment, accrual…" className={inputCls} required />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Journal Lines</label>
            <button type="button" onClick={() => setJLines(ls => [...ls, emptyJLine()])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Account</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Debit</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Credit</th>
                  <th className="px-2 py-2 text-left text-gray-500 font-medium">Note</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jLines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <select value={l.account} onChange={e => setJLine(i, 'account', e.target.value)}
                        className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="">— Select account —</option>
                        {accounts?.results?.map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={l.debit}
                        onChange={e => setJLine(i, 'debit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input type="number" min="0" step="0.01" value={l.credit}
                        onChange={e => setJLine(i, 'credit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input value={l.description} onChange={e => setJLine(i, 'description', e.target.value)}
                        placeholder="Optional note" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {jLines.length > 2 && (
                        <button type="button" onClick={() => setJLines(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-3 py-2 text-xs font-medium text-gray-500">Totals</td>
                  <td className={`px-2 py-2 text-xs text-right font-semibold ${balanced ? 'text-green-700' : 'text-red-600'}`}>
                    {npr(totalDebit)}
                  </td>
                  <td className={`px-2 py-2 text-xs text-right font-semibold ${balanced ? 'text-red-700' : 'text-red-600'}`}>
                    {npr(totalCredit)}
                  </td>
                  <td colSpan={2} className="px-2 py-2 text-xs">
                    {!balanced && <span className="text-red-500 font-medium">⚠ Not balanced (diff: {npr(Math.abs(totalDebit - totalCredit))})</span>}
                    {balanced && totalDebit > 0 && <span className="text-green-600 font-medium">✓ Balanced</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending || !balanced}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Entry
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Journal Entries Tab ───────────────────────────────────────────────────

function JournalsTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const { data, isLoading } = useQuery<ApiPage<JournalEntry>>({
    queryKey: ['journals'],
    queryFn: () => apiClient.get(ACCOUNTING.JOURNALS).then(r => r.data),
  })
  const mutatePost = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.JOURNAL_POST(id)),
    onSuccess: () => { toast.success('Entry posted'); qc.invalidateQueries({ queryKey: ['journals'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Post failed'),
  })

  return (
    <div className="space-y-4">
      {showCreate && <JournalCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">Journal entries are auto-created from invoices, bills, and payments. Manual entries for adjustments.</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={15} /> Manual Entry
        </button>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['','Entry #','Date','Description','Ref','Debit','Credit','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(je => (
                <Fragment key={je.id}>
                  <tr className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpanded(expanded === je.id ? null : je.id)}>
                    <td className="px-3 py-3">
                      <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded === je.id ? 'rotate-90' : ''}`} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{je.entry_number}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(je.date)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{je.description}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs capitalize">{je.reference_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3 text-green-700">{npr(je.total_debit)}</td>
                    <td className="px-4 py-3 text-red-700">{npr(je.total_credit)}</td>
                    <td className="px-4 py-3">
                      {je.is_posted
                        ? <Badge status="posted" />
                        : <button onClick={e => { e.stopPropagation(); mutatePost.mutate(je.id) }} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Post</button>
                      }
                    </td>
                  </tr>
                  {expanded === je.id && (
                    <tr>
                      <td colSpan={8} className="px-8 py-3 bg-gray-50">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left pb-1">Account</th>
                              <th className="text-left pb-1">Description</th>
                              <th className="text-right pb-1">Debit</th>
                              <th className="text-right pb-1">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {je.lines?.map(l => (
                              <tr key={l.id} className="border-t border-gray-100">
                                <td className="py-1 text-gray-600">{l.account_code} — {l.account_name}</td>
                                <td className="py-1 text-gray-400">{l.description}</td>
                                <td className="py-1 text-right text-green-700">{Number(l.debit) > 0 ? npr(l.debit) : ''}</td>
                                <td className="py-1 text-right text-red-700">{Number(l.credit) > 0 ? npr(l.credit) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!data?.results?.length && <EmptyState message="No journal entries yet. They are created automatically from invoices, bills, and payments." />}
        </div>
      )}
    </div>
  )
}

// ─── Chart of Accounts Tab ─────────────────────────────────────────────────

function AccountsTab() {
  const { data, isLoading } = useQuery<ApiPage<Account>>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS).then(r => r.data),
  })

  const grouped: Record<string, Account[]> = {}
  data?.results?.forEach(a => {
    if (!grouped[a.type]) grouped[a.type] = []
    grouped[a.type].push(a)
  })

  const typeLabels: Record<string, string> = {
    asset: 'Assets', liability: 'Liabilities',
    equity: 'Equity', revenue: 'Revenue', expense: 'Expenses',
  }

  return (
    <div>
      {isLoading ? <Spinner /> : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([type, accounts]) => (
            <div key={type} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 font-semibold text-gray-700 text-sm">
                {typeLabels[type] ?? type.charAt(0).toUpperCase() + type.slice(1)}
              </div>
              <table className="w-full text-sm">
                <thead className="border-b border-gray-50">
                  <tr>
                    {['Code','Account Name','Balance','System','Active'].map(h => (
                      <th key={h} className="px-4 py-2 text-left text-xs text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {accounts.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 font-mono text-xs text-indigo-600">{a.code}</td>
                      <td className="px-4 py-2 text-gray-700">{a.name}</td>
                      <td className="px-4 py-2 text-gray-800 font-medium text-xs">{npr(a.balance)}</td>
                      <td className="px-4 py-2 text-xs">{a.is_system ? <span className="text-gray-400">System</span> : ''}</td>
                      <td className="px-4 py-2 text-xs">
                        {a.is_active
                          ? <span className="text-green-600 font-medium">Active</span>
                          : <span className="text-gray-400">Inactive</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {!data?.results?.length && <EmptyState message="No accounts. Chart of Accounts is seeded automatically when the accounting module is enabled." />}
        </div>
      )}
    </div>
  )
}

// ─── Bank Account Create Modal ─────────────────────────────────────────────

// ─── Cash Payment Create Modal ────────────────────────────────────────────

function CashPaymentCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [type, setType]           = useState<'incoming' | 'outgoing'>('incoming')
  const [amount, setAmount]       = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote]           = useState('')

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.PAYMENTS, payload),
    onSuccess: () => {
      toast.success('Cash transaction recorded')
      qc.invalidateQueries({ queryKey: ['cash-ledger'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to record cash transaction'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ date, type, method: 'cash', amount, reference, note })
  }

  return (
    <Modal title="Record Cash Transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date *">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} required />
          </Field>
          <Field label="Type *">
            <select value={type} onChange={e => setType(e.target.value as 'incoming' | 'outgoing')} className={selectCls}>
              <option value="incoming">Cash In (Incoming)</option>
              <option value="outgoing">Cash Out (Outgoing)</option>
            </select>
          </Field>
          <Field label="Amount (NPR) *">
            <input type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputCls} required />
          </Field>
          <Field label="Reference">
            <input value={reference} onChange={e => setReference(e.target.value)}
              placeholder="e.g. Receipt #, Voucher #" className={inputCls} />
          </Field>
        </div>
        <Field label="Note">
          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional description" className={inputCls} />
        </Field>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Record Transaction
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bank Account Create Modal ─────────────────────────────────────────────

function BankAccountCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [currency, setCurrency] = useState('NPR')

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.BANK_ACCOUNTS, payload),
    onSuccess: () => {
      toast.success('Bank account created')
      qc.invalidateQueries({ queryKey: ['bank-accounts'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create bank account'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ name, bank_name: bankName, account_number: accountNumber, opening_balance: openingBalance, currency })
  }

  return (
    <Modal title="New Bank Account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account Label *">
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Main Operating Account" className={inputCls} required />
          </Field>
          <Field label="Bank Name *">
            <input value={bankName} onChange={e => setBankName(e.target.value)}
              placeholder="e.g. Nabil Bank" className={inputCls} required />
          </Field>
          <Field label="Account Number *">
            <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
              placeholder="00100012345678" className={inputCls} required />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
              <option value="NPR">NPR — Nepali Rupee</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </Field>
          <Field label="Opening Balance" hint="Current balance at the time of adding this account">
            <input type="number" min="0" step="0.01" value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Add Bank Account
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bank Accounts + Cash Ledger Tab ─────────────────────────────────────

function BanksTab() {
  const [subTab, setSubTab]     = useState<'banks' | 'cash'>('banks')
  const [showCreateBank, setShowCreateBank] = useState(false)
  const [showCreateCash, setShowCreateCash] = useState(false)

  const { data: bankData, isLoading: bankLoading } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS).then(r => r.data),
  })

  const { data: cashData, isLoading: cashLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['cash-ledger'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?method=cash&page_size=100&ordering=-date`).then(r => r.data),
  })

  // Compute cash summary
  const cashIn  = cashData?.results?.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0) ?? 0
  const cashOut = cashData?.results?.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0) ?? 0
  const cashNet = cashIn - cashOut

  return (
    <div className="space-y-4">
      {showCreateBank && <BankAccountCreateModal onClose={() => setShowCreateBank(false)} />}
      {showCreateCash && <CashPaymentCreateModal onClose={() => setShowCreateCash(false)} />}

      {/* Sub-tab switcher */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setSubTab('banks')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === 'banks' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-1.5"><Building2 size={14} /> Bank Accounts</span>
          </button>
          <button
            onClick={() => setSubTab('cash')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              subTab === 'cash' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-1.5"><Coins size={14} /> Cash Ledger</span>
          </button>
        </div>

        {subTab === 'banks' && (
          <button onClick={() => setShowCreateBank(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Add Bank Account
          </button>
        )}
        {subTab === 'cash' && (
          <button onClick={() => setShowCreateCash(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Record Cash
          </button>
        )}
      </div>

      {/* ── Bank Accounts ── */}
      {subTab === 'banks' && (
        bankLoading ? <Spinner /> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Bank', 'Account No.', 'Currency', 'Opening Balance', 'Current Balance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bankData?.results?.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">{b.name}</td>
                    <td className="px-4 py-3 text-gray-600">{b.bank_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.account_number}</td>
                    <td className="px-4 py-3 text-gray-500">{b.currency}</td>
                    <td className="px-4 py-3">{npr(b.opening_balance)}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-700">{npr(b.current_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!bankData?.results?.length && <EmptyState message="No bank accounts configured." />}
          </div>
        )
      )}

      {/* ── Cash Ledger ── */}
      {subTab === 'cash' && (
        cashLoading ? <Spinner /> : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-green-700 text-xs font-semibold uppercase tracking-wide mb-1">
                  <TrendingUp size={14} /> Cash In
                </div>
                <p className="text-2xl font-bold text-green-700">{npr(cashIn.toFixed(2))}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {cashData?.results?.filter(p => p.type === 'incoming').length ?? 0} transaction(s)
                </p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700 text-xs font-semibold uppercase tracking-wide mb-1">
                  <TrendingDown size={14} /> Cash Out
                </div>
                <p className="text-2xl font-bold text-red-700">{npr(cashOut.toFixed(2))}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {cashData?.results?.filter(p => p.type === 'outgoing').length ?? 0} transaction(s)
                </p>
              </div>
              <div className={`${cashNet >= 0 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-orange-50 border-orange-100 text-orange-700'} border rounded-xl p-4`}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1">
                  <Coins size={14} /> Net Cash Balance
                </div>
                <p className="text-2xl font-bold">{npr(cashNet.toFixed(2))}</p>
                <p className="text-xs mt-0.5 opacity-70">Cash In minus Cash Out</p>
              </div>
            </div>

            {/* Transactions table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Date', 'Payment #', 'Type', 'Reference', 'Invoice', 'Bill', 'Amount'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cashData?.results?.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                      <td className="px-4 py-3"><Badge status={p.type} /></td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.bill ?? '—'}</td>
                      <td className={`px-4 py-3 font-semibold ${p.type === 'incoming' ? 'text-green-700' : 'text-red-600'}`}>
                        {p.type === 'outgoing' ? '−' : '+'}{npr(p.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cashData?.results?.length && <EmptyState message="No cash transactions recorded. Click 'Record Cash' to add one." />}
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── Payslips & Coins Tab ──────────────────────────────────────────────────

function PayslipsTab() {
  const qc = useQueryClient()
  const [subTab, setSubTab] = useState<'payslips' | 'coins'>('payslips')

  const { data: payslips, isLoading: psLoading } = useQuery<ApiPage<Payslip>>({
    queryKey: ['payslips'],
    queryFn: () => apiClient.get(ACCOUNTING.PAYSLIPS).then(r => r.data),
  })
  const { data: coins, isLoading: coinsLoading } = useQuery<ApiPage<CoinTx>>({
    queryKey: ['coins'],
    queryFn: () => apiClient.get(ACCOUNTING.COINS).then(r => r.data),
  })

  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.PAYSLIP_ISSUE(id)),
    onSuccess: () => { toast.success('Payslip issued'); qc.invalidateQueries({ queryKey: ['payslips'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutatePay = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.PAYSLIP_MARK_PAID(id)),
    onSuccess: () => { toast.success('Payslip marked as paid'); qc.invalidateQueries({ queryKey: ['payslips'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateApprove = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_APPROVE(id)),
    onSuccess: () => { toast.success('Coin approved'); qc.invalidateQueries({ queryKey: ['coins'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateReject = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_REJECT(id)),
    onSuccess: () => { toast.success('Coin rejected'); qc.invalidateQueries({ queryKey: ['coins'] }) },
    onError: () => toast.error('Action failed'),
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200">
        {(['payslips','coins'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              subTab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'payslips' ? 'Payslips' : 'Coin Transactions'}
          </button>
        ))}
      </div>

      {subTab === 'payslips' && (psLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Staff','Period','Base Salary','Coins','Gross','Deductions','Net Pay','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payslips?.results?.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-700">{p.staff_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.period_start)} – {fmt(p.period_end)}</td>
                  <td className="px-4 py-3 text-gray-600">{npr(p.base_salary)}</td>
                  <td className="px-4 py-3 text-gray-600">{p.total_coins} × {p.coin_to_money_rate}</td>
                  <td className="px-4 py-3 text-gray-800">{npr(p.gross_amount)}</td>
                  <td className="px-4 py-3 text-red-600">{npr(p.deductions)}</td>
                  <td className="px-4 py-3 font-semibold text-indigo-700">{npr(p.net_pay)}</td>
                  <td className="px-4 py-3"><Badge status={p.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {p.status === 'draft' && (
                        <button onClick={() => mutateIssue.mutate(p.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                      )}
                      {p.status === 'issued' && (
                        <button onClick={() => mutatePay.mutate(p.id)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Mark Paid</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!payslips?.results?.length && <EmptyState message="No payslips yet. Use POST /payslips/generate/ to create payslips from coins." />}
        </div>
      ))}

      {subTab === 'coins' && (coinsLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Staff','Amount','Source','Note','Status','Approved By','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coins?.results?.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-gray-700">{c.staff_name}</td>
                  <td className="px-4 py-3 font-semibold text-indigo-700">{c.amount} coins</td>
                  <td className="px-4 py-3 text-gray-500 text-xs capitalize">{c.source_type.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{c.note || '—'}</td>
                  <td className="px-4 py-3"><Badge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.approved_by_name ?? '—'}</td>
                  <td className="px-4 py-3">
                    {c.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => mutateApprove.mutate(c.id)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>
                        <button onClick={() => mutateReject.mutate(c.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!coins?.results?.length && <EmptyState message="No coin transactions." />}
        </div>
      ))}
    </div>
  )
}

// ─── Reports Tab ───────────────────────────────────────────────────────────

type ReportType = 'pl' | 'balance-sheet' | 'trial-balance' | 'aged-receivables' | 'aged-payables' | 'vat' | 'cash-flow'

const REPORTS: { key: ReportType; label: string; endpoint: string; icon: React.ElementType }[] = [
  { key: 'pl',               label: 'Profit & Loss',    endpoint: ACCOUNTING.REPORT_PL,               icon: TrendingUp     },
  { key: 'balance-sheet',    label: 'Balance Sheet',    endpoint: ACCOUNTING.REPORT_BALANCE_SHEET,    icon: Layers         },
  { key: 'trial-balance',    label: 'Trial Balance',    endpoint: ACCOUNTING.REPORT_TRIAL_BALANCE,    icon: BookOpen       },
  { key: 'aged-receivables', label: 'Aged Receivables', endpoint: ACCOUNTING.REPORT_AGED_RECEIVABLES, icon: AlertCircle    },
  { key: 'aged-payables',    label: 'Aged Payables',    endpoint: ACCOUNTING.REPORT_AGED_PAYABLES,    icon: TrendingDown   },
  { key: 'vat',              label: 'VAT Report',       endpoint: ACCOUNTING.REPORT_VAT,              icon: Receipt        },
  { key: 'cash-flow',        label: 'Cash Flow',        endpoint: ACCOUNTING.REPORT_CASH_FLOW,        icon: ArrowLeftRight },
]

// ── typed data shapes ──────────────────────────────────────────────────────

interface RptAccount  { code: string; name: string; balance: string | number }
interface PLReport    { date_from: string; date_to: string; revenue: RptAccount[]; total_revenue: string | number; expenses: RptAccount[]; total_expenses: string | number; net_profit: string | number }
interface BSReport    { as_of_date: string; assets: RptAccount[]; total_assets: string | number; liabilities: RptAccount[]; total_liabilities: string | number; equity: RptAccount[]; total_equity: string | number; balanced: boolean }
interface TBRow       { code: string; name: string; debit: string | number; credit: string | number }
interface TBReport    { date_from: string; date_to: string; accounts: TBRow[]; total_debit: string | number; total_credit: string | number; balanced: boolean }
interface AgedItem    { id: number; invoice_number?: string; bill_number?: string; customer?: string; supplier?: string; due_date: string; amount_due: number }
interface AgedBucket  { items: AgedItem[]; total: number }
interface AgedReport  { as_of_date: string; current: AgedBucket; '1_30': AgedBucket; '31_60': AgedBucket; '61_90': AgedBucket; '90_plus': AgedBucket; grand_total: number }
interface VATReport   { period_start: string; period_end: string; vat_collected: string | number; vat_reclaimable: string | number; vat_payable: string | number; invoice_count: number; bill_count: number }
interface CFMethod    { method: string; incoming: string | number; outgoing: string | number }
interface CFReport    { date_from: string; date_to: string; total_incoming: string | number; total_outgoing: string | number; net_cash_flow: string | number; by_method: CFMethod[] }

// ── shared sub-components ─────────────────────────────────────────────────

function RptSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="bg-gray-50 px-4 py-1.5 border-y border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{title}</span>
      </div>
      {children}
    </div>
  )
}

function RptGrandTotal({ label, amount, note }: { label: string; amount: string | number; note?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 text-white">
      <div>
        <span className="text-sm font-bold uppercase tracking-wide">{label}</span>
        {note && <span className="ml-2 text-xs text-gray-400 font-normal">{note}</span>}
      </div>
      <span className="text-base font-bold tabular-nums">{npr(amount)}</span>
    </div>
  )
}

function RptRow({ code, name, amount, indent = false, bold = false }: { code?: string; name: string; amount: string | number; indent?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-4 py-1.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${indent ? 'pl-8' : ''}`}>
      <div className="flex items-center gap-3 min-w-0">
        {code && <span className="font-mono text-xs text-gray-400 w-14 shrink-0">{code}</span>}
        <span className={`text-sm truncate ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{name}</span>
      </div>
      <span className={`text-sm tabular-nums shrink-0 ml-4 ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>{npr(amount)}</span>
    </div>
  )
}

function RptTotal({ label, amount }: { label: string; amount: string | number }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-t border-gray-300">
      <span className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-bold tabular-nums text-gray-900">{npr(amount)}</span>
    </div>
  )
}

function RptDateBadge({ label }: { label: string }) {
  return <p className="text-xs text-gray-400 text-center mt-1">{label}</p>
}

// ── Profit & Loss renderer ────────────────────────────────────────────────

function PLReportView({ data }: { data: PLReport }) {
  const net      = parseFloat(String(data.net_profit))
  const isProfit = net >= 0
  return (
    <div className="divide-y divide-gray-100">
      <RptSection title="Income / Revenue">
        {data.revenue?.map(r => <RptRow key={r.code} code={r.code} name={r.name} amount={r.balance} indent />)}
        {!data.revenue?.length && <p className="px-8 py-2 text-xs text-gray-400 italic">No revenue accounts with activity.</p>}
        <RptTotal label="Total Revenue" amount={data.total_revenue} />
      </RptSection>

      <RptSection title="Expenses">
        {data.expenses?.map(r => <RptRow key={r.code} code={r.code} name={r.name} amount={r.balance} indent />)}
        {!data.expenses?.length && <p className="px-8 py-2 text-xs text-gray-400 italic">No expense accounts with activity.</p>}
        <RptTotal label="Total Expenses" amount={data.total_expenses} />
      </RptSection>

      <RptGrandTotal
        label={isProfit ? 'Net Profit' : 'Net Loss'}
        amount={Math.abs(net).toFixed(2)}
        note={isProfit ? undefined : '(Expenditure exceeds income)'}
      />
    </div>
  )
}

// ── Balance Sheet renderer ────────────────────────────────────────────────

function BSReportView({ data }: { data: BSReport }) {
  return (
    <div>
      {data.balanced === false && (
        <div className="mx-4 mt-4 px-4 py-2 bg-gray-50 border border-gray-300 rounded flex items-center gap-2 text-sm text-gray-700">
          <AlertCircle size={14} className="shrink-0" /> Out of balance — Assets ≠ Liabilities + Equity. Check posted journal entries.
        </div>
      )}
      <div className="grid grid-cols-2 divide-x divide-gray-200 mt-4">
        <div>
          <RptSection title="Liabilities">
            {data.liabilities?.map(r => <RptRow key={r.code} code={r.code} name={r.name} amount={r.balance} indent />)}
            {!data.liabilities?.length && <p className="px-8 py-2 text-xs text-gray-400 italic">None</p>}
            <RptTotal label="Total Liabilities" amount={data.total_liabilities} />
          </RptSection>
          <div className="mt-2">
            <RptSection title="Capital / Equity">
              {data.equity?.map(r => <RptRow key={r.code} code={r.code} name={r.name} amount={r.balance} indent />)}
              {!data.equity?.length && <p className="px-8 py-2 text-xs text-gray-400 italic">None</p>}
              <RptTotal label="Total Equity" amount={data.total_equity} />
            </RptSection>
          </div>
          <RptGrandTotal
            label="Total Liabilities + Equity"
            amount={String(parseFloat(String(data.total_liabilities)) + parseFloat(String(data.total_equity)))}
          />
        </div>

        <div>
          <RptSection title="Assets">
            {data.assets?.map(r => <RptRow key={r.code} code={r.code} name={r.name} amount={r.balance} indent />)}
            {!data.assets?.length && <p className="px-8 py-2 text-xs text-gray-400 italic">None</p>}
          </RptSection>
          <RptGrandTotal
            label="Total Assets"
            amount={data.total_assets}
            note={data.balanced ? '(Balanced ✓)' : undefined}
          />
        </div>
      </div>
    </div>
  )
}

// ── Trial Balance renderer ────────────────────────────────────────────────

function TBReportView({ data }: { data: TBReport }) {
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Code</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Account Name</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Debit (Dr)</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Credit (Cr)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.accounts?.map(row => (
            <tr key={row.code} className="hover:bg-gray-50">
              <td className="px-4 py-2 font-mono text-xs text-gray-400">{row.code}</td>
              <td className="px-4 py-2 text-gray-700">{row.name}</td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-800">{parseFloat(String(row.debit)) ? npr(row.debit) : <span className="text-gray-300">—</span>}</td>
              <td className="px-4 py-2 text-right tabular-nums text-gray-800">{parseFloat(String(row.credit)) ? npr(row.credit) : <span className="text-gray-300">—</span>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-800 text-white">
          <tr>
            <td colSpan={2} className="px-4 py-2.5 text-sm font-bold uppercase tracking-wide">
              Total
              <span className="ml-2 text-xs text-gray-400 font-normal">
                {data.balanced ? '(Balanced ✓)' : '(NOT balanced ✗)'}
              </span>
            </td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_debit)}</td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_credit)}</td>
          </tr>
        </tfoot>
      </table>
      {!data.accounts?.length && <EmptyState message="No posted journal entries in this period." />}
    </div>
  )
}

// ── Aged Receivables / Payables renderer ──────────────────────────────────

const AGED_BUCKETS: { key: keyof Omit<AgedReport, 'as_of_date' | 'grand_total'>; label: string }[] = [
  { key: 'current', label: 'Current'    },
  { key: '1_30',    label: '1–30 days'  },
  { key: '31_60',   label: '31–60 days' },
  { key: '61_90',   label: '61–90 days' },
  { key: '90_plus', label: '90+ days'   },
]

function AgedReportView({ data, type }: { data: AgedReport; type: 'receivables' | 'payables' }) {
  const isRec = type === 'receivables'
  // Build flat rows: one row per customer/supplier with amounts per bucket
  const entityMap: Record<string, Record<string, number>> = {}

  AGED_BUCKETS.forEach(({ key }) => {
    data[key]?.items?.forEach(item => {
      const name = isRec ? (item.customer ?? '—') : (item.supplier ?? '—')
      if (!entityMap[name]) entityMap[name] = {}
      entityMap[name][key] = (entityMap[name][key] ?? 0) + item.amount_due
    })
  })

  const entities = Object.entries(entityMap)

  return (
    <div>
      {/* Summary strip */}
      <div className="grid grid-cols-5 divide-x divide-gray-200 bg-gray-50 border-b border-gray-200">
        {AGED_BUCKETS.map(b => (
          <div key={b.key} className="px-4 py-3 text-center">
            <p className="text-xs text-gray-500 mb-1">{b.label}</p>
            <p className="text-sm font-bold tabular-nums text-gray-800">{npr(data[b.key]?.total ?? 0)}</p>
          </div>
        ))}
      </div>

      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {isRec ? 'Customer' : 'Supplier'}
            </th>
            {AGED_BUCKETS.map(b => (
              <th key={b.key} className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{b.label}</th>
            ))}
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entities.map(([name, buckets]) => {
            const rowTotal = AGED_BUCKETS.reduce((s, b) => s + (buckets[b.key] ?? 0), 0)
            return (
              <tr key={name} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-gray-700 font-medium">{name}</td>
                {AGED_BUCKETS.map(b => (
                  <td key={b.key} className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {buckets[b.key] ? npr(buckets[b.key].toFixed(2)) : <span className="text-gray-200">—</span>}
                  </td>
                ))}
                <td className="px-4 py-2 text-right tabular-nums font-semibold text-gray-800">{npr(rowTotal.toFixed(2))}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-gray-800 text-white">
          <tr>
            <td className="px-4 py-2.5 text-sm font-bold uppercase tracking-wide">Grand Total</td>
            {AGED_BUCKETS.map(b => (
              <td key={b.key} className="px-3 py-2.5 text-right font-bold tabular-nums">{npr((data[b.key]?.total ?? 0).toFixed(2))}</td>
            ))}
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr((data.grand_total ?? 0).toFixed(2))}</td>
          </tr>
        </tfoot>
      </table>
      {!entities.length && <EmptyState message={`No outstanding ${isRec ? 'receivables' : 'payables'}.`} />}
    </div>
  )
}

// ── VAT Report renderer ───────────────────────────────────────────────────

function VATReportView({ data }: { data: VATReport }) {
  const payable  = parseFloat(String(data.vat_payable))
  const isRefund = payable < 0
  return (
    <div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-100">
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 font-mono text-xs text-gray-400 w-10">A</td>
            <td className="px-4 py-3 text-gray-700">Output VAT — collected on invoices issued ({data.invoice_count} invoices)</td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium w-40">{npr(data.vat_collected)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 font-mono text-xs text-gray-400">B</td>
            <td className="px-4 py-3 text-gray-700">Input VAT — reclaimable on bills approved ({data.bill_count} bills)</td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">{npr(data.vat_reclaimable)}</td>
          </tr>
          <tr className="bg-gray-100 border-t border-gray-300">
            <td className="px-4 py-3 font-mono text-xs text-gray-500">C</td>
            <td className="px-4 py-3 font-semibold text-gray-800">
              {isRefund ? 'C = B − A  →  VAT Refund Due from IRD' : 'C = A − B  →  Net VAT Payable to IRD'}
            </td>
            <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{npr(Math.abs(payable).toFixed(2))}</td>
          </tr>
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">
        Nepal VAT rate: 13%. Period: {fmt(data.period_start)} – {fmt(data.period_end)}.
        {isRefund ? ' Input VAT exceeds Output VAT — refund may be claimed from IRD.' : ' Amount payable to IRD for this period.'}
      </p>
    </div>
  )
}

// ── Cash Flow renderer ────────────────────────────────────────────────────

function CFReportView({ data }: { data: CFReport }) {
  const net    = parseFloat(String(data.net_cash_flow))
  const isPos  = net >= 0
  const METHOD_LABELS: Record<string, string> = {
    cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque',
    esewa: 'eSewa', khalti: 'Khalti', credit_note: 'Credit Note',
  }
  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
            <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-700">Total Cash Inflows</td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">{npr(data.total_incoming)}</td>
          </tr>
          <tr className="hover:bg-gray-50">
            <td className="px-4 py-3 text-gray-700">Total Cash Outflows</td>
            <td className="px-4 py-3 text-right tabular-nums text-gray-800 font-medium">({npr(data.total_outgoing)})</td>
          </tr>
        </tbody>
        <tfoot className="bg-gray-800 text-white">
          <tr>
            <td className="px-4 py-2.5 text-sm font-bold uppercase tracking-wide">
              Net Cash Flow
              <span className="ml-2 text-xs text-gray-400 font-normal">{isPos ? '(Positive)' : '(Negative)'}</span>
            </td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">
              {isPos ? '' : '('}{npr(Math.abs(net).toFixed(2))}{isPos ? '' : ')'}
            </td>
          </tr>
        </tfoot>
      </table>

      {data.by_method?.length > 0 && (
        <div className="mt-4 border-t border-gray-200">
          <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Breakdown by Payment Method</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Method</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Inflows</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Outflows</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.by_method.map(m => {
                const mNet = parseFloat(String(m.incoming)) - parseFloat(String(m.outgoing))
                return (
                  <tr key={m.method} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{METHOD_LABELS[m.method] ?? m.method}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">{npr(m.incoming)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-gray-700">({npr(m.outgoing)})</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                      {mNet < 0 ? '(' : ''}{npr(Math.abs(mNet).toFixed(2))}{mNet < 0 ? ')' : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── CSV serialiser ────────────────────────────────────────────────────────

function toCSV(key: ReportType, data: Record<string, unknown>): string {
  const rows: string[][] = []
  const esc = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const row = (...cells: (string | number | undefined)[]) => rows.push(cells.map(esc))

  switch (key) {
    case 'pl': {
      const d = data as unknown as PLReport
      row('Section', 'Code', 'Account', 'Amount')
      d.revenue?.forEach(r  => row('Revenue',  r.code, r.name, r.balance))
      row('', '', 'Total Revenue',   d.total_revenue)
      d.expenses?.forEach(r => row('Expenses', r.code, r.name, r.balance))
      row('', '', 'Total Expenses',  d.total_expenses)
      row('', '', 'Net Profit/Loss', d.net_profit)
      break
    }
    case 'balance-sheet': {
      const d = data as unknown as BSReport
      row('Section', 'Code', 'Account', 'Amount')
      d.liabilities?.forEach(r => row('Liabilities', r.code, r.name, r.balance))
      row('', '', 'Total Liabilities', d.total_liabilities)
      d.equity?.forEach(r    => row('Equity',      r.code, r.name, r.balance))
      row('', '', 'Total Equity', d.total_equity)
      d.assets?.forEach(r    => row('Assets',      r.code, r.name, r.balance))
      row('', '', 'Total Assets', d.total_assets)
      break
    }
    case 'trial-balance': {
      const d = data as unknown as TBReport
      row('Code', 'Account', 'Debit (Dr)', 'Credit (Cr)')
      d.accounts?.forEach(r => row(r.code, r.name, r.debit, r.credit))
      row('', 'TOTAL', d.total_debit, d.total_credit)
      break
    }
    case 'aged-receivables':
    case 'aged-payables': {
      const d      = data as unknown as AgedReport
      const entity = key === 'aged-receivables' ? 'Customer' : 'Supplier'
      row('Bucket', entity, 'Invoice/Bill No.', 'Due Date', 'Amount Due')
      const buckets = ['current', '1_30', '31_60', '61_90', '90_plus'] as const
      buckets.forEach(b =>
        d[b]?.items?.forEach(item =>
          row(b, item.customer ?? item.supplier, item.invoice_number ?? item.bill_number, item.due_date, item.amount_due)
        )
      )
      row('', 'Grand Total', '', '', d.grand_total)
      break
    }
    case 'vat': {
      const d = data as unknown as VATReport
      row('Line', 'Description', 'Amount')
      row('A', `Output VAT — collected on invoices (${d.invoice_count})`, d.vat_collected)
      row('B', `Input VAT  — reclaimable on bills  (${d.bill_count})`,    d.vat_reclaimable)
      row('C', 'Net VAT Payable / (Refund Due)',                           d.vat_payable)
      break
    }
    case 'cash-flow': {
      const d = data as unknown as CFReport
      row('Method', 'Inflows', 'Outflows', 'Net')
      d.by_method?.forEach(m =>
        row(m.method, m.incoming, m.outgoing,
          (parseFloat(String(m.incoming)) - parseFloat(String(m.outgoing))).toFixed(2))
      )
      row('TOTAL', d.total_incoming, d.total_outgoing, d.net_cash_flow)
      break
    }
  }
  return rows.map(r => r.join(',')).join('\n')
}

// ── Main ReportsTab ───────────────────────────────────────────────────────

function ReportsTab() {
  const today        = new Date().toISOString().slice(0, 10)
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  const [reportKey, setReportKey] = useState<ReportType>('pl')
  const [dateFrom,  setDateFrom]  = useState(firstOfMonth)
  const [dateTo,    setDateTo]    = useState(today)

  const report     = REPORTS.find(r => r.key === reportKey)!
  const isAsOf     = reportKey === 'balance-sheet' || reportKey === 'aged-receivables' || reportKey === 'aged-payables'
  const isVat      = reportKey === 'vat'
  const params     = isAsOf ? `?as_of_date=${dateTo}`
                   : isVat  ? `?period_start=${dateFrom}&period_end=${dateTo}`
                   :          `?date_from=${dateFrom}&date_to=${dateTo}`
  const printRef   = useRef<HTMLDivElement>(null)

  function exportCSV() {
    if (!reportData) return
    const csv  = toCSV(reportKey, reportData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${report.label.replace(/\s+/g, '_')}_${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportPDF() {
    const el = printRef.current
    if (!el) return
    const subtitle = isAsOf ? `As of ${dateTo}` : `${dateFrom} to ${dateTo}`
    const w = window.open('', '_blank')
    if (!w) { toast.error('Pop-up blocked — allow pop-ups and try again'); return }
    w.document.write(`<!DOCTYPE html><html><head><title>${report.label}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:24px}
  h1{font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;text-align:center;margin-bottom:2px}
  .sub{font-size:10px;color:#666;text-align:center;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;margin-bottom:10px}
  th{background:#f1f3f5;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;padding:5px 8px;text-align:left;border-bottom:1px solid #ccc}
  td{padding:4px 8px;border-bottom:1px solid #eee}
  tfoot td,tr.grand td{background:#1f2937;color:#fff;font-weight:700}
  .bg-gray-50{background:#f8f9fa}
  .bg-gray-100{background:#f1f3f5;font-weight:600}
  .bg-gray-800{background:#1f2937;color:#fff;font-weight:700}
  .text-right,.tabular-nums{text-align:right}
  @media print{body{padding:8px}}
</style></head><body>
<h1>${report.label}</h1><p class="sub">${subtitle}</p>
${el.innerHTML}
</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print() }, 500)
  }

  const { data: reportData, isLoading, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['report', reportKey, dateFrom, dateTo],
    queryFn: () => apiClient.get(report.endpoint + params).then(r => r.data),
    enabled: false,
  })

  function renderReport() {
    if (!reportData) return null
    switch (reportKey) {
      case 'pl':               return <PLReportView  data={reportData as unknown as PLReport}  />
      case 'balance-sheet':    return <BSReportView  data={reportData as unknown as BSReport}  />
      case 'trial-balance':    return <TBReportView  data={reportData as unknown as TBReport}  />
      case 'aged-receivables': return <AgedReportView data={reportData as unknown as AgedReport} type="receivables" />
      case 'aged-payables':    return <AgedReportView data={reportData as unknown as AgedReport} type="payables"    />
      case 'vat':              return <VATReportView  data={reportData as unknown as VATReport}  />
      case 'cash-flow':        return <CFReportView   data={reportData as unknown as CFReport}   />
    }
  }

  const periodLabel = isAsOf
    ? `As of ${fmt(dateTo)}`
    : `${fmt(dateFrom)} – ${fmt(dateTo)}`

  return (
    <div className="space-y-5">

      {/* Report type picker */}
      <div className="grid grid-cols-7 gap-2">
        {REPORTS.map(r => {
          const Icon = r.icon
          return (
            <button
              key={r.key}
              onClick={() => setReportKey(r.key)}
              className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-colors ${
                reportKey === r.key
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <Icon size={18} />
              <span className="text-xs font-medium leading-tight">{r.label}</span>
            </button>
          )
        })}
      </div>

      {/* Date controls */}
      <div className="flex flex-wrap items-end gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4">
        {!isAsOf && (
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              {isVat ? 'Period Start' : 'Date From'}
            </label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">
            {isAsOf ? 'As Of Date' : isVat ? 'Period End' : 'Date To'}
          </label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <button onClick={() => refetch()}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <BarChart2 size={15} /> Run Report
        </button>
      </div>

      {isLoading && <div className="py-12"><Spinner /></div>}

      {reportData && !isLoading && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          {/* Report header */}
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gray-50">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-0.5">Statement</p>
              <h2 className="text-lg font-extrabold text-gray-900 uppercase tracking-wide">{report.label}</h2>
              <RptDateBadge label={periodLabel} />
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4 mt-1">
              <button
                onClick={exportCSV}
                title="Export to CSV (open in Excel)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <FileSpreadsheet size={13} /> CSV
              </button>
              <button
                onClick={exportPDF}
                title="Print / Save as PDF"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Printer size={13} /> PDF
              </button>
            </div>
          </div>
          <div ref={printRef}>{renderReport()}</div>
        </div>
      )}

      {!reportData && !isLoading && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl py-14 text-center">
          <BarChart2 size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 font-medium">Select a report above and click <strong>Run Report</strong></p>
          <p className="text-xs text-gray-400 mt-1">Profit & Loss · Balance Sheet · Trial Balance · Aged · VAT · Cash Flow</p>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? ''

  function setTab(key: string) {
    setSearchParams(key ? { tab: key } : {}, { replace: true })
  }

  function renderTab() {
    switch (activeTab) {
      case '':             return <DashboardTab />
      case 'invoices':     return <InvoicesTab />
      case 'bills':        return <BillsTab />
      case 'payments':     return <PaymentsTab />
      case 'credit-notes': return <CreditNotesTab />
      case 'journals':     return <JournalsTab />
      case 'accounts':     return <AccountsTab />
      case 'banks':        return <BanksTab />
      case 'payslips':     return <PayslipsTab />
      case 'reports':      return <ReportsTab />
      default:             return <DashboardTab />
    }
  }

  const currentTab = TABS.find(t => t.key === activeTab) ?? TABS[0]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-screen-xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900">Accounting</h1>
          <p className="text-sm text-gray-400 mt-0.5">Double-entry bookkeeping · Invoices · Bills · Payments · Reports</p>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-screen-xl mx-auto flex gap-0 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-screen-xl mx-auto px-6 py-6">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-800 flex items-center gap-2">
            <currentTab.icon size={18} className="text-indigo-500" />
            {currentTab.label}
          </h2>
        </div>
        {renderTab()}
      </main>
    </div>
  )
}
