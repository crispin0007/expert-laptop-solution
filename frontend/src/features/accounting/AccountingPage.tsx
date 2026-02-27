/**
 * AccountingPage.tsx — Full multi-tab accounting module UI.
 * Tabs: dashboard | invoices | finance-review | bills | payments | credit-notes |
 *       quotations | debit-notes | tds | journals | accounts | banks |
 *       bank-reconciliation | recurring-journals | ledger | day-book |
 *       payslips | reports
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
  FileSpreadsheet, Printer, ShieldCheck,
  // New icons for extra tabs
  FileQuestion, Percent, Repeat2, BookMarked, CalendarDays,
  ArrowRightLeft, ChevronDown, Search, CheckSquare2, Play, Power,
} from 'lucide-react'

// ─── Shared types ──────────────────────────────────────────────────────────

interface InvoiceItem {
  description?: string; name?: string; qty?: number; quantity?: number
  unit_price: string; discount?: string; total?: string
}
interface Invoice {
  id: number; invoice_number: string; customer: number | null
  customer_name: string; ticket: number | null; project: number | null
  ticket_number?: string; project_name?: string
  line_items: InvoiceItem[]; subtotal: string; discount: string
  vat_rate: string; vat_amount: string; total: string; amount_paid: string
  amount_due: string; status: string; finance_status: string;
  finance_notes: string; finance_reviewed_at: string | null
  due_date: string | null; paid_at: string | null; notes: string; created_at: string
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

// ── New entity types ──────────────────────────────────────────────────────────
interface Quotation {
  id: number; quotation_number: string; customer: number | null; customer_name: string
  ticket: number | null; project: number | null; line_items: InvoiceItem[]
  subtotal: string; discount: string; vat_rate: string; vat_amount: string; total: string
  status: string; valid_until: string | null; notes: string; terms: string
  sent_at: string | null; accepted_at: string | null
  converted_invoice: number | null; converted_invoice_number: string
  created_at: string; updated_at: string
}
interface DebitNote {
  id: number; debit_note_number: string; bill: number; bill_number: string
  line_items: InvoiceItem[]; subtotal: string; vat_amount: string; total: string
  reason: string; status: string; issued_at: string | null; created_at: string
}
interface TDSEntry {
  id: number; bill: number | null; bill_number: string
  supplier_name: string; supplier_pan: string
  taxable_amount: string; tds_rate: string; tds_amount: string; net_payable: string
  status: string; period_month: number; period_year: number
  deposited_at: string | null; deposit_reference: string; created_at: string
}
interface BankReconciliationLine {
  id: number; date: string; description: string; amount: string
  is_matched: boolean; payment: number | null
}
interface BankReconciliation {
  id: number; bank_account: number; bank_account_name: string
  statement_date: string; opening_balance: string; closing_balance: string
  status: string; notes: string; reconciled_at: string | null
  difference: string; lines: BankReconciliationLine[]; created_at: string
}
interface RecurringJournal {
  id: number; name: string; description: string; frequency: string
  start_date: string; end_date: string | null; next_date: string
  is_active: boolean
  template_lines: Array<{ account_code: string; debit: string; credit: string; description: string }>
  last_run_at: string | null; created_at: string; updated_at: string
}
interface LedgerRow { date: string; entry_number: string; description: string; debit: string; credit: string; balance: string }
interface LedgerReport {
  account_code: string; account_name: string; date_from: string; date_to: string
  opening_balance: string; closing_balance: string; transactions: LedgerRow[]
}
interface DayBookLine { account_code: string; account_name: string; description: string; debit: string; credit: string }
interface DayBookEntry { entry_number: string; description: string; reference_type: string; total_debit: string; total_credit: string; lines: DayBookLine[] }
interface DayBookReport { date: string; entries: DayBookEntry[]; total_debit: string; total_credit: string }

interface ApiPage<T> { results: T[]; count: number }

/** Normalise a backend response that may be a plain array or a paginated object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPage<T = any>(raw: any): ApiPage<T> {
  if (Array.isArray(raw)) return { results: raw as T[], count: raw.length }
  return { results: raw?.results ?? [], count: raw?.count ?? 0 }
}

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
  { key: '',               label: 'Dashboard',         icon: LayoutDashboard },
  { key: 'invoices',       label: 'Invoices',           icon: Receipt         },
  { key: 'finance-review', label: 'Finance Review',     icon: ShieldCheck     },
  { key: 'bills',          label: 'Bills',              icon: FileText        },
  { key: 'payments',       label: 'Payments',           icon: CreditCard      },
  { key: 'credit-notes',   label: 'Credit Notes',       icon: RotateCcw       },
  { key: 'journals',       label: 'Journals',           icon: BookOpen        },
  { key: 'accounts',       label: 'Chart of Accounts',  icon: Layers          },
  { key: 'banks',          label: 'Bank Accounts',      icon: Building2       },
  { key: 'payslips',           label: 'Payslips & Coins',   icon: Coins           },
  { key: 'reports',            label: 'Reports',            icon: BarChart2       },
  { key: 'quotations',         label: 'Quotations',         icon: FileQuestion    },
  { key: 'debit-notes',        label: 'Debit Notes',        icon: FileText        },
  { key: 'tds',                label: 'TDS',                icon: Percent         },
  { key: 'bank-reconciliation',label: 'Reconciliation',     icon: ArrowRightLeft  },
  { key: 'recurring-journals', label: 'Recurring Journals', icon: Repeat2         },
  { key: 'ledger',             label: 'Ledger',             icon: BookMarked      },
  { key: 'day-book',           label: 'Day Book',           icon: CalendarDays    },
] as const

// ─── Dashboard Tab ─────────────────────────────────────────────────────────

function DashboardTab() {
  const { data: invoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'recent'],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES + '?page_size=10&ordering=-created_at').then(r => toPage<Invoice>(r.data)),
  })
  const { data: bills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'recent'],
    queryFn: () => apiClient.get(ACCOUNTING.BILLS + '?page_size=10&ordering=-created_at').then(r => toPage<Bill>(r.data)),
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

interface LineItemDraft { description: string; qty: string; unit_price: string; discount: string; line_type: 'service' | 'product' }
const emptyLine = (): LineItemDraft => ({ description: '', qty: '1', unit_price: '', discount: '0', line_type: 'service' })

function InvoiceCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
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
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
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
                  <th className="px-2 py-2 text-left text-gray-500 font-medium w-24">Type</th>
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
                      <select value={l.line_type} onChange={e => setLine(i, 'line_type', e.target.value as 'service' | 'product')}
                        className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="service">Service</option>
                        <option value="product">Product</option>
                      </select>
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

// ─── Invoice Detail Modal ─────────────────────────────────────────────────

function InvoiceDetailModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const handlePrint = () => window.print()
  return (
    <Modal title={`Invoice ${inv.invoice_number}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        {/* Meta row */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Customer</p>
            <p className="font-semibold text-gray-800">{inv.customer_name || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Status</p>
            <Badge status={inv.status} />
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Date</p>
            <p className="text-gray-700">{fmt(inv.created_at)}</p>
          </div>
          <div>
            <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Due Date</p>
            <p className="text-gray-700">{fmt(inv.due_date)}</p>
          </div>
          {inv.ticket_number && (
            <div>
              <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Ticket</p>
              <p className="text-gray-700">{inv.ticket_number}</p>
            </div>
          )}
          {inv.project_name && (
            <div>
              <p className="text-gray-400 font-medium uppercase tracking-wide mb-1">Project</p>
              <p className="text-gray-700">{inv.project_name}</p>
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-semibold">Description</th>
                <th className="px-2 py-2 text-right text-gray-500 font-semibold">Type</th>
                <th className="px-2 py-2 text-right text-gray-500 font-semibold">Qty</th>
                <th className="px-2 py-2 text-right text-gray-500 font-semibold">Unit Price</th>
                <th className="px-2 py-2 text-right text-gray-500 font-semibold">Disc%</th>
                <th className="px-2 py-2 text-right text-gray-500 font-semibold">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(inv.line_items ?? []).map((item, i) => {
                const qty = Number(item.qty ?? item.quantity ?? 1)
                const price = Number(item.unit_price)
                const disc = Number(item.discount ?? 0)
                const lineTotal = qty * price * (1 - disc / 100)
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{item.description ?? item.name ?? '—'}</td>
                    <td className="px-2 py-2 text-right text-gray-500 capitalize">{(item as {line_type?: string}).line_type ?? 'service'}</td>
                    <td className="px-2 py-2 text-right text-gray-700">{qty}</td>
                    <td className="px-2 py-2 text-right text-gray-700">{npr(price)}</td>
                    <td className="px-2 py-2 text-right text-gray-500">{disc > 0 ? `${disc}%` : '—'}</td>
                    <td className="px-2 py-2 text-right font-medium text-gray-800">{npr(lineTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-1 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span><span className="font-medium">{npr(inv.subtotal)}</span>
            </div>
            {Number(inv.discount) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount</span><span className="font-medium text-red-600">− {npr(inv.discount)}</span>
              </div>
            )}
            {Number(inv.vat_amount) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>VAT ({Number(inv.vat_rate) * 100}%)</span>
                <span className="font-medium">{npr(inv.vat_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-900 font-bold border-t border-gray-200 pt-1">
              <span>Total</span><span>{npr(inv.total)}</span>
            </div>
            {Number(inv.amount_paid) > 0 && (
              <div className="flex justify-between text-green-700">
                <span>Paid</span><span>− {npr(inv.amount_paid)}</span>
              </div>
            )}
            {Number(inv.amount_due) > 0 && (
              <div className="flex justify-between text-red-600 font-semibold">
                <span>Balance Due</span><span>{npr(inv.amount_due)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notes */}
        {inv.notes && (
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">Notes</p>
            <p className="text-xs text-gray-600 whitespace-pre-line">{inv.notes}</p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            <Printer size={14} /> Print
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Close</button>
        </div>
      </div>
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
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES + (statusFilter ? `?status=${statusFilter}` : '')).then(r => toPage<Invoice>(r.data)),
  })

  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)

  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.INVOICE_ISSUE(id)),
    onSuccess: () => { toast.success('Invoice issued — journal entry created'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError:   (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to issue invoice'),
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
      {detailInvoice && <InvoiceDetailModal inv={detailInvoice} onClose={() => setDetailInvoice(null)} />}
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
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
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600 cursor-pointer hover:underline"
                    onClick={() => setDetailInvoice(inv)}>{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(inv.created_at)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(inv.due_date)}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(inv.total)}</td>
                  <td className="px-4 py-3 text-green-700 text-xs">{inv.amount_paid !== '0.00' ? npr(inv.amount_paid) : '—'}</td>
                  <td className="px-4 py-3 text-red-700 text-xs">{Number(inv.amount_due) > 0 ? npr(inv.amount_due) : '—'}</td>
                  <td className="px-4 py-3"><Badge status={inv.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDetailInvoice(inv)} title="View Detail" className="p-1.5 rounded hover:bg-gray-100 text-gray-500 transition-colors">
                        <FileText size={14} />
                      </button>
                      <button onClick={() => downloadPdf(inv)} title="Download PDF" className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 transition-colors">
                        <Download size={14} />
                      </button>
                      {inv.status === 'draft' && (
                        <button onClick={() => { if (confirm('Issue this invoice? This will create a journal entry and send it to the customer.')) mutateIssue.mutate(inv.id) }}
                          title="Issue Invoice" className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors">
                          <Play size={14} />
                        </button>
                      )}
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
          </div>
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
    queryFn: () => apiClient.get(ACCOUNTING.BILLS + (statusFilter ? `?status=${statusFilter}` : '')).then(r => toPage<Bill>(r.data)),
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
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
          </div>
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
    queryFn: () => apiClient.get(ACCOUNTING.PAYMENTS).then(r => toPage<Payment>(r.data)),
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">Payments are recorded automatically when invoices or bills are marked as paid.</p>
        <span className="text-sm text-gray-400">{data?.count ?? 0} payment{data?.count !== 1 ? 's' : ''}</span>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
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
          </div>
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
    queryFn: () => apiClient.get(ACCOUNTING.CREDIT_NOTES).then(r => toPage<CreditNote>(r.data)),
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
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
          </div>
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
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?page_size=500').then(r => toPage<Account>(r.data)),
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
    queryFn: () => apiClient.get(ACCOUNTING.JOURNALS).then(r => toPage<JournalEntry>(r.data)),
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
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS).then(r => toPage<Account>(r.data)),
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
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS).then(r => toPage<BankAccount>(r.data)),
  })

  const { data: cashData, isLoading: cashLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['cash-ledger'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?method=cash&page_size=100&ordering=-date`).then(r => toPage<Payment>(r.data)),
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
    queryFn: () => apiClient.get(ACCOUNTING.PAYSLIPS).then(r => toPage<Payslip>(r.data)),
  })
  const { data: coins, isLoading: coinsLoading } = useQuery<ApiPage<CoinTx>>({
    queryKey: ['coins'],
    queryFn: () => apiClient.get(ACCOUNTING.COINS).then(r => toPage<CoinTx>(r.data)),
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

// ─── Finance Review Tab ──────────────────────────────────────────────────────

const FIN_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Pending Payment',  cls: 'bg-gray-100 text-gray-500'      },
  submitted: { label: 'Awaiting Review',  cls: 'bg-yellow-100 text-yellow-700'  },
  approved:  { label: 'Approved',         cls: 'bg-emerald-100 text-emerald-700'},
  rejected:  { label: 'Rejected',         cls: 'bg-red-100 text-red-600'        },
}

function FinanceReviewTab() {
  const qc = useQueryClient()
  const [finNotes, setFinNotes] = useState<Record<number, string>>({})
  const [reviewing, setReviewing] = useState<number | null>(null)

  const { data: submitted = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', 'finance-review'],
    queryFn: () =>
      apiClient
        .get(ACCOUNTING.INVOICES_PENDING_FINANCE)
        .then(r => (Array.isArray(r.data) ? r.data : (r.data.results ?? []))),
    refetchInterval: 30_000,
  })

  function handleReview(inv: Invoice, action: 'approve' | 'reject') {
    const notes = finNotes[inv.id] ?? ''
    if (action === 'reject' && !notes.trim()) {
      toast.error('Notes are required when rejecting')
      return
    }
    setReviewing(inv.id)
    apiClient
      .post(ACCOUNTING.INVOICE_FINANCE_REVIEW(inv.id), { action, notes })
      .then(() => {
        toast.success(action === 'approve'
          ? `Invoice ${inv.invoice_number} approved — ticket closed & coins queued`
          : `Invoice ${inv.invoice_number} rejected`)
        setReviewing(null)
        qc.invalidateQueries({ queryKey: ['invoices', 'finance-review'] })
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.detail || 'Review failed')
        setReviewing(null)
      })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={28} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (submitted.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <ShieldCheck size={36} className="mx-auto mb-3 text-emerald-400" />
        <p className="font-medium text-gray-500">No invoices pending finance review</p>
        <p className="text-sm mt-1">All submitted invoices have been processed.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={16} className="text-yellow-600" />
        <p className="text-sm text-gray-600 font-medium">
          {submitted.length} invoice{submitted.length !== 1 ? 's' : ''} awaiting finance review
        </p>
      </div>

      {submitted.map(inv => {
        const fsCfg = FIN_STATUS_CFG[inv.finance_status] ?? { label: inv.finance_status, cls: 'bg-gray-100 text-gray-500' }
        const isProcessing = reviewing === inv.id
        return (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800 text-sm font-mono">#{inv.invoice_number}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${fsCfg.cls}`}>
                    {fsCfg.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{inv.customer_name || '—'}</p>
                {inv.ticket && (
                  <p className="text-xs text-indigo-500 mt-0.5">Ticket #{inv.ticket}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-gray-800">Rs. {parseFloat(inv.total).toFixed(2)}</p>
                <p className="text-xs text-gray-400">Paid: Rs. {parseFloat(inv.amount_paid).toFixed(2)}</p>
                {parseFloat(inv.amount_due) > 0 && (
                  <p className="text-xs text-red-500 font-medium">Due: Rs. {parseFloat(inv.amount_due).toFixed(2)}</p>
                )}
              </div>
            </div>

            {/* Line items summary */}
            <div className="bg-gray-50 rounded-lg p-3 divide-y divide-gray-100 text-sm">
              {inv.line_items.map((li, i) => (
                <div key={i} className="flex justify-between py-1.5">
                  <span className="text-gray-600">
                    {li.description ?? li.name}
                    {(li as any).line_type && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium
                        ${(li as any).line_type === 'service' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                        {(li as any).line_type}
                      </span>
                    )}
                  </span>
                  <span className="text-gray-700 font-medium">
                    {li.total ? `Rs. ${parseFloat(li.total).toFixed(2)}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals row */}
            <div className="flex gap-6 text-sm text-gray-500">
              <span>Subtotal: <strong className="text-gray-700">Rs. {parseFloat(inv.subtotal).toFixed(2)}</strong></span>
              <span>VAT: <strong className="text-gray-700">Rs. {parseFloat(inv.vat_amount).toFixed(2)}</strong></span>
              <span>Created: <strong className="text-gray-700">{inv.created_at?.slice(0, 10)}</strong></span>
            </div>

            {/* Notes input + approve/reject */}
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <textarea
                rows={2}
                value={finNotes[inv.id] ?? ''}
                onChange={e => setFinNotes(prev => ({ ...prev, [inv.id]: e.target.value }))}
                placeholder="Finance notes (required when rejecting)…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(inv, 'approve')}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {isProcessing
                    ? <Loader2 size={13} className="animate-spin" />
                    : <CheckCircle size={13} />}
                  Approve — Close Ticket
                </button>
                <button
                  onClick={() => handleReview(inv, 'reject')}
                  disabled={isProcessing || !(finNotes[inv.id] ?? '').trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition"
                >
                  {isProcessing
                    ? <Loader2 size={13} className="animate-spin" />
                    : <XCircle size={13} />}
                  Reject
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Quotations Tab ──────────────────────────────────────────────────────────

const QUO_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700', declined: 'bg-red-100 text-red-600',
  expired: 'bg-yellow-100 text-yellow-700',
}

function QuotationsTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery<ApiPage<Quotation>>({
    queryKey: ['quotations', statusFilter],
    queryFn: () => apiClient.get(ACCOUNTING.QUOTATIONS + (statusFilter ? `?status=${statusFilter}` : '')).then(r => toPage<Quotation>(r.data)),
  })

  const mutateSend    = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_SEND(id)),    onSuccess: () => { toast.success('Quotation sent'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateAccept  = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_ACCEPT(id)),  onSuccess: () => { toast.success('Quotation accepted'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateDecline = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_DECLINE(id)), onSuccess: () => { toast.success('Quotation declined'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateConvert = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_CONVERT(id)), onSuccess: () => { toast.success('Converted to invoice'); qc.invalidateQueries({ queryKey: ['quotations'] }); qc.invalidateQueries({ queryKey: ['invoices'] }) }, onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Convert failed') })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'sent', 'accepted', 'declined', 'expired'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{data?.count ?? 0} quotations</span>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        data?.results?.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <FileQuestion size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No quotations yet</p>
            <p className="text-xs text-gray-400 mt-1">Quotations are created from tickets or projects.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['#', 'Customer', 'Total', 'Valid Until', 'Status', 'Converted', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.results?.map(q => (
                    <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-700 whitespace-nowrap">{q.quotation_number}</td>
                      <td className="px-4 py-3 text-gray-600">{q.customer_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{npr(q.total)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{q.valid_until ? fmt(q.valid_until) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${QUO_STATUS[q.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {q.converted_invoice_number || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {q.status === 'draft' && (
                            <button onClick={() => mutateSend.mutate(q.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap">Send</button>
                          )}
                          {q.status === 'sent' && (
                            <>
                              <button onClick={() => mutateAccept.mutate(q.id)} className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap">Accept</button>
                              <button onClick={() => mutateDecline.mutate(q.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap">Decline</button>
                            </>
                          )}
                          {q.status === 'accepted' && !q.converted_invoice && (
                            <button onClick={() => mutateConvert.mutate(q.id)} disabled={mutateConvert.isPending} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap disabled:opacity-50">
                              {mutateConvert.isPending ? 'Converting…' : 'Convert → Invoice'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── Debit Notes Tab ──────────────────────────────────────────────────────────

const DN_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', issued: 'bg-blue-100 text-blue-700',
  applied: 'bg-emerald-100 text-emerald-700', void: 'bg-red-100 text-red-500',
}

function DebitNotesTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')

  const { data, isLoading } = useQuery<ApiPage<DebitNote>>({
    queryKey: ['debit-notes', statusFilter],
    queryFn: () => apiClient.get(ACCOUNTING.DEBIT_NOTES + (statusFilter ? `?status=${statusFilter}` : '')).then(r => toPage<DebitNote>(r.data)),
  })

  const mutateIssue = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.DEBIT_NOTE_ISSUE(id)), onSuccess: () => { toast.success('Debit note issued'); qc.invalidateQueries({ queryKey: ['debit-notes'] }) }, onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Failed') })
  const mutateVoid  = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.DEBIT_NOTE_VOID(id)),  onSuccess: () => { toast.success('Debit note voided');  qc.invalidateQueries({ queryKey: ['debit-notes'] }) }, onError: () => toast.error('Failed') })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'issued', 'applied', 'void'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{data?.count ?? 0} debit notes</span>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-amber-700">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>Debit notes are raised against approved bills when goods or services are returned to a supplier.</span>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        data?.results?.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Percent size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No debit notes found</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['#', 'Bill', 'Total', 'Reason', 'Status', 'Issued', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.results?.map(dn => (
                    <tr key={dn.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-700 whitespace-nowrap">{dn.debit_note_number}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{dn.bill_number}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{npr(dn.total)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{dn.reason || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${DN_STATUS[dn.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {dn.status.charAt(0).toUpperCase() + dn.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(dn.issued_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {dn.status === 'draft' && (
                            <button onClick={() => mutateIssue.mutate(dn.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap">Issue</button>
                          )}
                          {dn.status !== 'void' && dn.status !== 'applied' && (
                            <button onClick={() => mutateVoid.mutate(dn.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap">Void</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── TDS Tab ─────────────────────────────────────────────────────────────────

const NEPALI_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashoj','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']

function TDSTab() {
  const qc = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const thisYear = new Date().getFullYear() + 57

  const { data, isLoading } = useQuery<ApiPage<TDSEntry>>({
    queryKey: ['tds', statusFilter, yearFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (yearFilter)  params.set('year', yearFilter)
      return apiClient.get(ACCOUNTING.TDS + (params.toString() ? `?${params}` : '')).then(r => toPage<TDSEntry>(r.data))
    },
  })

  const { data: summaryData } = useQuery({
    queryKey: ['tds-summary', yearFilter],
    queryFn: () => apiClient.get(ACCOUNTING.TDS_SUMMARY + (yearFilter ? `?year=${yearFilter}` : '')).then(r => r.data),
  })

  const [depRef, setDepRef] = useState<Record<number, string>>({})
  const mutateDeposit = useMutation({
    mutationFn: ({ id, ref }: { id: number; ref: string }) => apiClient.post(ACCOUNTING.TDS_MARK_DEPOSITED(id), { deposit_reference: ref }),
    onSuccess: () => { toast.success('Marked as deposited'); qc.invalidateQueries({ queryKey: ['tds'] }); qc.invalidateQueries({ queryKey: ['tds-summary'] }) },
    onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  const summary = Array.isArray(summaryData) ? summaryData : []
  const totalPending   = summary.filter((r: {status: string; total_tds: string}) => r.status === 'pending').reduce((s: number, r: {total_tds: string}) => s + Number(r.total_tds), 0)
  const totalDeposited = summary.filter((r: {status: string; total_tds: string}) => r.status === 'deposited').reduce((s: number, r: {total_tds: string}) => s + Number(r.total_tds), 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-xs text-yellow-700 font-semibold uppercase tracking-wide">Pending Deposit to IRD</p>
          <p className="text-2xl font-bold text-yellow-800 mt-1">{npr(totalPending)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Total Deposited</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{npr(totalDeposited)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Status</option>
          <option value="pending">Pending</option>
          <option value="deposited">Deposited</option>
        </select>
        <input type="number" placeholder={`Year (e.g. ${thisYear})`} value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <span className="text-sm text-gray-400 ml-auto">{data?.count ?? 0} entries</span>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        data?.results?.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Percent size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No TDS entries found</p>
            <p className="text-xs text-gray-400 mt-1">TDS entries are auto-created when bills with TDS are approved.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Supplier', 'PAN', 'Taxable', 'Rate', 'TDS', 'Net Payable', 'Period', 'Status', 'Deposit Ref', 'Action'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.results?.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-700">{t.supplier_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.supplier_pan || '—'}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{npr(t.taxable_amount)}</td>
                      <td className="px-4 py-3 text-gray-600">{(Number(t.tds_rate) * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 font-semibold text-red-600 whitespace-nowrap">{npr(t.tds_amount)}</td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{npr(t.net_payable)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{NEPALI_MONTHS[(t.period_month - 1) % 12]} {t.period_year}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.status === 'pending' ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {t.status === 'pending' ? 'Pending' : 'Deposited'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {t.status === 'deposited' ? (
                          <span className="text-xs text-gray-500 font-mono">{t.deposit_reference || '—'}</span>
                        ) : (
                          <input value={depRef[t.id] ?? ''} onChange={e => setDepRef(p => ({ ...p, [t.id]: e.target.value }))} placeholder="IRD receipt #" className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.status === 'pending' && (
                          <button onClick={() => mutateDeposit.mutate({ id: t.id, ref: depRef[t.id] ?? '' })} disabled={mutateDeposit.isPending}
                            className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap disabled:opacity-50">
                            Mark Deposited
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ─── Bank Reconciliation Tab ──────────────────────────────────────────────────

function BankReconciliationTab() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<BankReconciliation | null>(null)
  const [newLine, setNewLine] = useState({ date: '', description: '', amount: '' })
  const [showNew, setShowNew] = useState(false)
  const [newRec, setNewRec] = useState({ bank_account: '', statement_date: '', opening_balance: '', closing_balance: '', notes: '' })
  const [showCreate, setShowCreate] = useState(false)

  const { data: banks } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => r.data?.results ?? []),
  })

  const { data, isLoading } = useQuery<ApiPage<BankReconciliation>>({
    queryKey: ['bank-reconciliations'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_RECONCILIATIONS).then(r => toPage<BankReconciliation>(r.data)),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<BankReconciliation>({
    queryKey: ['bank-reconciliation', selected?.id],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_RECONCILIATION_DETAIL(selected!.id)).then(r => r.data),
    enabled: !!selected,
  })

  const mutateCreate = useMutation({
    mutationFn: (d: typeof newRec) => apiClient.post(ACCOUNTING.BANK_RECONCILIATIONS, d),
    onSuccess: () => { toast.success('Reconciliation created'); qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }); setShowCreate(false); setNewRec({ bank_account: '', statement_date: '', opening_balance: '', closing_balance: '', notes: '' }) },
    onError: () => toast.error('Failed to create'),
  })
  const mutateAddLine = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_ADD_LINE(selected!.id), newLine),
    onSuccess: () => { toast.success('Line added'); qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }); setNewLine({ date: '', description: '', amount: '' }); setShowNew(false) },
    onError: () => toast.error('Failed'),
  })
  const mutateMatch = useMutation({
    mutationFn: (lineId: number) => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_MATCH_LINE(detail!.id), { line_id: lineId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }) },
    onError: () => toast.error('Match failed'),
  })
  const mutateUnmatch = useMutation({
    mutationFn: (lineId: number) => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_UNMATCH_LINE(detail!.id), { line_id: lineId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }) },
    onError: () => toast.error('Unmatch failed'),
  })
  const mutateReconcile = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_RECONCILE(detail!.id)),
    onSuccess: () => { toast.success('Reconciliation locked ✓'); qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }); qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }) },
    onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  const bankList: Array<{id: number; name: string; bank_name: string}> = Array.isArray(banks) ? banks : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Bank Reconciliation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Match system payments to your bank statement lines.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus size={15} /> New Reconciliation
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-gray-800 mb-4">Create Reconciliation</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
              <select value={newRec.bank_account} onChange={e => setNewRec(p => ({ ...p, bank_account: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select…</option>
                {bankList.map(b => <option key={b.id} value={b.id}>{b.name} — {b.bank_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Statement Date</label>
              <input type="date" value={newRec.statement_date} onChange={e => setNewRec(p => ({ ...p, statement_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opening Balance</label>
              <input type="number" step="0.01" value={newRec.opening_balance} onChange={e => setNewRec(p => ({ ...p, opening_balance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Closing Balance</label>
              <input type="number" step="0.01" value={newRec.closing_balance} onChange={e => setNewRec(p => ({ ...p, closing_balance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea rows={2} value={newRec.notes} onChange={e => setNewRec(p => ({ ...p, notes: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => mutateCreate.mutate(newRec)} disabled={mutateCreate.isPending || !newRec.bank_account || !newRec.statement_date} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {mutateCreate.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="space-y-2">
          {isLoading ? <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-indigo-400" /></div> :
            data?.results?.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No reconciliations yet</div>
            ) : data?.results?.map(rec => (
              <button key={rec.id} onClick={() => setSelected(rec)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${selected?.id === rec.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{rec.bank_account_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmt(rec.statement_date)}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${rec.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {rec.status === 'reconciled' ? 'Reconciled' : 'Draft'}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-gray-500">
                  <span>Open: {npr(rec.opening_balance)}</span>
                  <span>Close: {npr(rec.closing_balance)}</span>
                </div>
              </button>
            ))
          }
        </div>

        {/* Detail pane */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-gray-400">
              <ArrowRightLeft size={36} className="mb-3 text-gray-300" />
              <p className="text-sm">Select a reconciliation to view lines</p>
            </div>
          ) : detailLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
          ) : detail && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-800">{detail.bank_account_name}</p>
                  <p className="text-xs text-gray-500">{fmt(detail.statement_date)}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${Number(detail.difference) === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    Difference: {npr(detail.difference)}
                  </span>
                  {detail.status === 'draft' && (
                    <>
                      <button onClick={() => setShowNew(n => !n)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                        <Plus size={14} /> Add Line
                      </button>
                      <button onClick={() => mutateReconcile.mutate()} disabled={Number(detail.difference) !== 0 || mutateReconcile.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                        <CheckSquare2 size={14} /> Reconcile
                      </button>
                    </>
                  )}
                </div>
              </div>

              {showNew && (
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <input type="date" value={newLine.date} onChange={e => setNewLine(p => ({ ...p, date: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <input value={newLine.description} onChange={e => setNewLine(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Customer payment" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                      <input type="number" step="0.01" value={newLine.amount} onChange={e => setNewLine(p => ({ ...p, amount: e.target.value }))} placeholder="+ inflow, − outflow" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <button onClick={() => mutateAddLine.mutate()} disabled={mutateAddLine.isPending || !newLine.date || !newLine.description || !newLine.amount}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                      {mutateAddLine.isPending ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date', 'Description', 'Amount', 'Matched', 'Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {detail.lines.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No statement lines yet. Add lines above.</td></tr>
                    ) : detail.lines.map(line => (
                      <tr key={line.id} className={`transition-colors ${line.is_matched ? 'bg-emerald-50/40' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(line.date)}</td>
                        <td className="px-4 py-3 text-gray-700">{line.description}</td>
                        <td className={`px-4 py-3 font-semibold whitespace-nowrap ${Number(line.amount) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {Number(line.amount) >= 0 ? '+' : ''}{npr(line.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {line.is_matched
                            ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle size={13} /> Matched</span>
                            : <span className="text-gray-400 text-xs">Unmatched</span>}
                        </td>
                        <td className="px-4 py-3">
                          {detail.status === 'draft' && (
                            line.is_matched
                              ? <button onClick={() => mutateUnmatch.mutate(line.id)} className="text-xs text-gray-500 hover:text-red-500 transition-colors">Unmatch</button>
                              : <button onClick={() => mutateMatch.mutate(line.id)} className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors">Match</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Recurring Journals Tab ───────────────────────────────────────────────────

const FREQ_LABELS: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' }

function RecurringJournalsTab() {
  const qc = useQueryClient()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', frequency: 'monthly', start_date: '', end_date: '' })
  const [templateLines, setTemplateLines] = useState([{ account_code: '', debit: '', credit: '', description: '' }])

  const { data, isLoading } = useQuery<ApiPage<RecurringJournal>>({
    queryKey: ['recurring-journals'],
    queryFn: () => apiClient.get(ACCOUNTING.RECURRING_JOURNALS).then(r => toPage<RecurringJournal>(r.data)),
  })

  const mutateCreate = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.RECURRING_JOURNALS, payload),
    onSuccess: () => { toast.success('Recurring journal created'); qc.invalidateQueries({ queryKey: ['recurring-journals'] }); setShowCreate(false) },
    onError: () => toast.error('Failed to create'),
  })
  const mutateRun = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.RECURRING_JOURNAL_RUN(id)),
    onSuccess: () => { toast.success('Journal entry created'); qc.invalidateQueries({ queryKey: ['recurring-journals'] }); qc.invalidateQueries({ queryKey: ['journals'] }) },
    onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Run failed'),
  })
  const mutateToggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => apiClient.patch(ACCOUNTING.RECURRING_JOURNAL_DETAIL(id), { is_active: active }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring-journals'] }) },
    onError: () => toast.error('Failed'),
  })

  function addTemplateLine() { setTemplateLines(p => [...p, { account_code: '', debit: '', credit: '', description: '' }]) }
  function updateTemplateLine(i: number, field: string, value: string) {
    setTemplateLines(p => p.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }
  function removeTemplateLine(i: number) { setTemplateLines(p => p.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Templates for recurring entries — rent, subscriptions, depreciation, etc.</p>
        <button onClick={() => setShowCreate(s => !s)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus size={15} /> New Template
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          <h4 className="text-sm font-semibold text-gray-800">New Recurring Journal</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Monthly Office Rent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
              <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date (optional)</label>
              <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Monthly office rent — payable on 1st of each month" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Journal Lines</label>
              <button onClick={addTemplateLine} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><Plus size={12} /> Add Line</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>{['Account Code', 'Description', 'Debit', 'Credit', ''].map(h => <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {templateLines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1"><input value={l.account_code} onChange={e => updateTemplateLine(i, 'account_code', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="1001" /></td>
                      <td className="px-2 py-1"><input value={l.description} onChange={e => updateTemplateLine(i, 'description', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Description" /></td>
                      <td className="px-2 py-1"><input type="number" step="0.01" value={l.debit} onChange={e => updateTemplateLine(i, 'debit', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="0.00" /></td>
                      <td className="px-2 py-1"><input type="number" step="0.01" value={l.credit} onChange={e => updateTemplateLine(i, 'credit', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="0.00" /></td>
                      <td className="px-2 py-1">{templateLines.length > 1 && <button onClick={() => removeTemplateLine(i)} className="text-red-400 hover:text-red-600"><X size={13} /></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => mutateCreate.mutate({ ...form, template_lines: templateLines, next_date: form.start_date })} disabled={mutateCreate.isPending || !form.name || !form.start_date}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {mutateCreate.isPending ? 'Creating…' : 'Create Template'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        data?.results?.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Repeat2 size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No recurring journals yet</p>
            <p className="text-xs text-gray-400 mt-1">Create templates for rent, subscriptions, depreciation, etc.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data?.results?.map(rj => (
              <div key={rj.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-4 flex-wrap cursor-pointer" onClick={() => setExpanded(e => e === rj.id ? null : rj.id)}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${rj.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm">{rj.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {FREQ_LABELS[rj.frequency]} · Next: {fmt(rj.next_date)}
                      {rj.last_run_at && ` · Last run: ${fmt(rj.last_run_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => mutateToggle.mutate({ id: rj.id, active: !rj.is_active })}
                      className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-colors ${rj.is_active ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                      <Power size={12} /> {rj.is_active ? 'Pause' : 'Activate'}
                    </button>
                    {rj.is_active && (
                      <button onClick={() => mutateRun.mutate(rj.id)} disabled={mutateRun.isPending}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-50">
                        <Play size={12} /> Run Now
                      </button>
                    )}
                    <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded === rj.id ? '' : '-rotate-90'}`} />
                  </div>
                </div>
                {expanded === rj.id && (
                  <div className="px-5 pb-4 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Template Lines</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-500">
                          <th className="py-1 text-left font-medium">Account</th>
                          <th className="py-1 text-left font-medium px-2">Description</th>
                          <th className="py-1 text-right font-medium">Debit</th>
                          <th className="py-1 text-right font-medium">Credit</th>
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {rj.template_lines.map((l, i) => (
                            <tr key={i}>
                              <td className="py-1 font-mono text-gray-700">{l.account_code}</td>
                              <td className="py-1 text-gray-500 px-2">{l.description || '—'}</td>
                              <td className="py-1 text-right text-gray-700">{Number(l.debit) > 0 ? npr(l.debit) : '—'}</td>
                              <td className="py-1 text-right text-gray-700">{Number(l.credit) > 0 ? npr(l.credit) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

// ─── Ledger Tab ───────────────────────────────────────────────────────────────

function LedgerTab() {
  const { data: accounts } = useQuery<ApiPage<Account>>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?page_size=500').then(r => toPage<Account>(r.data)),
  })

  const [accountCode, setAccountCode] = useState('')
  const [dateFrom, setDateFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
  const [dateTo, setDateTo]     = useState(() => new Date().toISOString().slice(0, 10))
  const [submitted, setSubmitted] = useState(false)

  const { data: ledger, isLoading, isFetching } = useQuery<LedgerReport>({
    queryKey: ['ledger', accountCode, dateFrom, dateTo],
    queryFn: () => apiClient.get(`${ACCOUNTING.REPORT_LEDGER}?account_code=${accountCode}&date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.data),
    enabled: submitted && !!accountCode,
  })

  const accList = accounts?.results ?? []

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Account</label>
            <select value={accountCode} onChange={e => { setAccountCode(e.target.value); setSubmitted(false) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select account…</option>
              {accList.map(a => <option key={a.id} value={a.code}>{a.code} — {a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setSubmitted(false) }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setSubmitted(false) }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <button onClick={() => { if (!accountCode) { toast.error('Select an account'); return } setSubmitted(true) }} disabled={!accountCode || isFetching}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
          {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          Run Ledger
        </button>
      </div>

      {submitted && (isLoading || isFetching) && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>}

      {ledger && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Account Ledger</p>
              <h2 className="text-base font-bold text-gray-800">{ledger.account_code} — {ledger.account_name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{fmt(ledger.date_from)} → {fmt(ledger.date_to)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Opening: <strong className="text-gray-800">{npr(ledger.opening_balance)}</strong></p>
              <p className="text-xs text-gray-500">Closing: <strong className="text-gray-800">{npr(ledger.closing_balance)}</strong></p>
            </div>
          </div>
          {ledger.transactions.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No transactions in this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Date', 'Entry #', 'Description', 'Debit', 'Credit', 'Balance'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ledger.transactions.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(row.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.entry_number}</td>
                      <td className="px-4 py-3 text-gray-700">{row.description || '—'}</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium whitespace-nowrap">{Number(row.debit)  > 0 ? npr(row.debit)  : '—'}</td>
                      <td className="px-4 py-3 text-red-600    font-medium whitespace-nowrap">{Number(row.credit) > 0 ? npr(row.credit) : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{npr(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Day Book Tab ─────────────────────────────────────────────────────────────

function DayBookTab() {
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]          = useState(today)
  const [submitted, setSubmitted] = useState(false)
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null)

  const { data: dayBook, isLoading, isFetching } = useQuery<DayBookReport>({
    queryKey: ['day-book', date],
    queryFn: () => apiClient.get(`${ACCOUNTING.REPORT_DAY_BOOK}?date=${date}`).then(r => r.data),
    enabled: submitted,
  })

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
            <input type="date" value={date} onChange={e => { setDate(e.target.value); setSubmitted(false) }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <button onClick={() => setSubmitted(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
            Load Day Book
          </button>
        </div>
      </div>

      {submitted && (isLoading || isFetching) && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>}

      {dayBook && !isLoading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium">Date</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">{fmt(dayBook.date)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
              <p className="text-xs text-emerald-700 font-medium">Total Debit</p>
              <p className="text-base font-bold text-emerald-800 mt-0.5">{npr(dayBook.total_debit)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-4">
              <p className="text-xs text-red-700 font-medium">Total Credit</p>
              <p className="text-base font-bold text-red-800 mt-0.5">{npr(dayBook.total_credit)}</p>
            </div>
          </div>

          {dayBook.entries.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <CalendarDays size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 font-medium">No journal entries on {fmt(dayBook.date)}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {dayBook.entries.map(entry => (
                <div key={entry.entry_number} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedEntry(e => e === entry.entry_number ? null : entry.entry_number)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-500">{entry.entry_number}</span>
                        {entry.reference_type && (
                          <span className="bg-indigo-50 text-indigo-600 text-[11px] px-1.5 py-0.5 rounded font-medium">{entry.reference_type}</span>
                        )}
                        <span className="text-sm font-medium text-gray-800 truncate">{entry.description || 'No description'}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right hidden sm:block">
                      <span className="text-xs text-gray-500">Dr: </span>
                      <span className="text-xs font-semibold text-emerald-700">{npr(entry.total_debit)}</span>
                      <span className="text-xs text-gray-400 mx-1">·</span>
                      <span className="text-xs text-gray-500">Cr: </span>
                      <span className="text-xs font-semibold text-red-600">{npr(entry.total_credit)}</span>
                    </div>
                    <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${expandedEntry === entry.entry_number ? '' : '-rotate-90'}`} />
                  </button>
                  {expandedEntry === entry.entry_number && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            {['Account', 'Description', 'Debit', 'Credit'].map(h => (
                              <th key={h} className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {entry.lines.map((l, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-4 py-2 font-mono">{l.account_code} <span className="text-gray-500 font-sans">{l.account_name}</span></td>
                              <td className="px-4 py-2 text-gray-500">{l.description || '—'}</td>
                              <td className="px-4 py-2 text-emerald-700 font-medium text-right">{Number(l.debit)  > 0 ? npr(l.debit)  : '—'}</td>
                              <td className="px-4 py-2 text-red-600    font-medium text-right">{Number(l.credit) > 0 ? npr(l.credit) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? ''

  function renderTab() {
    switch (activeTab) {
      case '':             return <DashboardTab />
      case 'invoices':       return <InvoicesTab />
      case 'finance-review': return <FinanceReviewTab />
      case 'bills':          return <BillsTab />
      case 'payments':     return <PaymentsTab />
      case 'credit-notes': return <CreditNotesTab />
      case 'journals':              return <JournalsTab />
      case 'accounts':              return <AccountsTab />
      case 'banks':                 return <BanksTab />
      case 'payslips':              return <PayslipsTab />
      case 'reports':               return <ReportsTab />
      case 'quotations':            return <QuotationsTab />
      case 'debit-notes':           return <DebitNotesTab />
      case 'tds':                   return <TDSTab />
      case 'bank-reconciliation':   return <BankReconciliationTab />
      case 'recurring-journals':    return <RecurringJournalsTab />
      case 'ledger':                return <LedgerTab />
      case 'day-book':              return <DayBookTab />
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
