/**
 * AccountingPage.tsx — Full multi-tab accounting module UI.
 * Tabs: dashboard | invoices | finance-review | bills | payments | credit-notes |
 *       quotations | debit-notes | tds | journals | accounts | banks |
 *       bank-reconciliation | recurring-journals | ledger | day-book |
 *       payslips | reports
 */
import { useState, useCallback, useRef, useEffect, useMemo, Fragment } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { ACCOUNTING, INVENTORY, STAFF, CUSTOMERS } from '../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../components/ConfirmDialog'
import { usePermissions } from '../../hooks/usePermissions'
import {
  LayoutDashboard, Receipt, FileText, CreditCard, RotateCcw,
  BookOpen, Layers, Building2, Coins, BarChart2, ArrowLeftRight,
  Loader2, CheckCircle, XCircle, Download, Plus, X,
  ChevronRight, AlertCircle, TrendingUp, TrendingDown, Trash2,
  FileSpreadsheet, Printer, ShieldCheck,
  // New icons for extra tabs
  FileQuestion, Percent, Repeat2, BookMarked, CalendarDays,
  ArrowRightLeft, ChevronDown, Search, CheckSquare2, Play, Power, Pencil,
  // CoA + Quick Links icons
  Zap, Eye, EyeOff, Info, Wallet,
  // New tab icons
  Clock, Users, Truck, UserCheck, ShoppingBag,
  // 7-stubs tab icons
  ShoppingCart, ArrowDownLeft, ArrowUpRight, PackageCheck, Package, Link2, CircleDollarSign, Save,
  // Expand / collapse all
  ChevronsUpDown, ChevronsDownUp,
} from 'lucide-react'
import DateDisplay from '../../components/DateDisplay'
import NepaliDatePicker from '../../components/NepaliDatePicker'
import { adStringToBsDisplay, currentFiscalYear, fiscalYearAdParams, fiscalYearOf, fiscalYearDateRange } from '../../utils/nepaliDate'
import { useFyStore } from '../../store/fyStore'
import { useTenantStore } from '../../store/tenantStore'
import { useAuthStore } from '../../store/authStore'
import { CoinDetailDrawer } from './CoinsPage'

// ─── Fiscal Year — reads/writes the global persistent store ───────────────
function useFY() { return useFyStore() }

/**
 * Appends &fiscal_year=YYYY (or ?fiscal_year=YYYY) to any URL.
 * Returns the URL unchanged when fyYear is null ("All Time").
 */
function addFyParam(url: string, fyYear: number | null): string {
  if (!fyYear) return url
  return url.includes('?') ? `${url}&fiscal_year=${fyYear}` : `${url}?fiscal_year=${fyYear}`
}

function FiscalYearBar() {
  const { fyYear, setFyYear } = useFY()
  const fy = currentFiscalYear()
  const { startAd } = fiscalYearDateRange(fy)
  const lastFy = fiscalYearOf(new Date(startAd.getTime() - 86_400_000))
  const { startAd: lastStart } = fiscalYearDateRange(lastFy)
  const prevFy = fiscalYearOf(new Date(lastStart.getTime() - 86_400_000))

  const options = [
    { year: fy.bsYear,     label: fy.label,     title: fy.labelFull    },
    { year: lastFy.bsYear, label: lastFy.label,  title: lastFy.labelFull },
    { year: prevFy.bsYear, label: prevFy.label,  title: prevFy.labelFull },
  ]

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 mb-4 flex items-center gap-3 flex-wrap shadow-sm">
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest shrink-0">FY</span>
      <button
        onClick={() => setFyYear(null)}
        className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
          fyYear === null
            ? 'bg-gray-700 text-white border-gray-700'
            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
        }`}
      >
        All Time
      </button>
      {options.map(({ year, label, title }) => (
        <button
          key={year}
          onClick={() => setFyYear(year)}
          title={`Nepal Fiscal Year ${title}`}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
            fyYear === year
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
          }`}
        >
          {label}
        </button>
      ))}
      {fyYear !== null && (
        <span className="text-xs text-indigo-500 font-medium ml-1">
          Showing FY {options.find(o => o.year === fyYear)?.label ?? fyYear} data
        </span>
      )}
    </div>
  )
}

// ─── Shared types ──────────────────────────────────────────────────────────

interface InvoiceItem {
  description?: string; name?: string; qty?: number; quantity?: number
  unit_price: string; discount?: string; total?: string; line_type?: string
  cost_price_snapshot?: string; product_id?: number
}
interface Invoice {
  id: number; invoice_number: string; customer: number | null
  customer_name: string; ticket: number | null; project: number | null
  ticket_number?: string; project_name?: string
  line_items: InvoiceItem[]; subtotal: string; discount: string
  vat_rate: string; vat_amount: string; total: string; amount_paid: string
  amount_due: string; status: string; finance_status: string;
  finance_notes: string; finance_reviewed_at: string | null
  date: string; due_date: string | null; paid_at: string | null; notes: string; created_at: string
}
interface Bill {
  id: number; bill_number: string; supplier: number | null
  supplier_name: string; line_items: unknown[]; subtotal: string
  total: string; amount_paid: string; amount_due: string
  status: string; date: string; due_date: string | null; approved_at: string | null
  paid_at: string | null; notes: string; reference: string; created_at: string
}
interface Payment {
  id: number; payment_number: string; date: string; type: string
  method: string; amount: string; invoice: number | null; invoice_number: string
  bill: number | null; bill_number: string
  bank_account: number | null; bank_account_name: string
  account: number | null; account_name: string
  reference: string; notes: string
  party_name?: string; supplier_name?: string; customer_name?: string; cheque_status: string
  tds_rate?: string | number
  tds_withheld_amount?: string | number
  net_receipt_amount?: string | number
  tds_reference?: string
  created_by_name: string; created_at: string
}
interface CreditNote {
  id: number; credit_note_number: string; invoice: number | null; invoice_number: string
  line_items: unknown[]; subtotal: string; total: string
  reason: string; status: string; issued_at: string | null; created_at: string
}
interface JournalEntry {
  id: number; entry_number: string; date: string; description: string
  reference_type: string; reference_id: number | null
  purpose: string
  is_posted: boolean; total_debit: string; total_credit: string
  reversal_date: string | null; is_reversal: boolean; reversed_by_id: number | null
  reversal_reason: string; reversed_by_user_name: string; reversal_timestamp: string | null
  created_by_name: string; created_at: string
  lines: JournalLine[]
}
interface JournalLine {
  id: number; account: number; account_name: string; account_code: string
  debit: string; credit: string; description: string
}
interface Account {
  id: number; code: string; name: string; type: string
  is_system: boolean; is_active: boolean; parent: number | null
  balance: string; description: string; opening_balance: string
  group: number | null; group_name: string | null; group_slug: string | null
}
interface AccountGroup {
  id: number; slug: string; name: string; type: string
  report_section: string; normal_balance: string; is_system: boolean
  parent?: number | null; parent_name?: string
}
interface BankAccount {
  id: number; name: string; bank_name: string; account_number: string
  currency: string; opening_balance: string; current_balance: string
  linked_account: number | null; linked_account_is_system?: boolean; created_at: string
}
interface Payslip {
  id: number; staff: number; staff_name: string; period_start: string
  period_end: string; total_coins: string; coin_to_money_rate: string
  gross_amount: string; base_salary: string; bonus: string
  deductions: string; tds_amount: string
  deduction_breakdown: Array<{ label: string; amount: string; account_code?: string }>
  net_pay: string; cash_credit: string
  status: string
  issued_at: string | null; paid_at: string | null; created_at: string
  payment_method: string; bank_account: number | null; bank_account_name: string
}
interface StaffSalaryProfile {
  id: number; staff: number; staff_name: string; staff_email: string
  base_salary: string; tds_rate: string; bonus_default: string
  effective_from: string; notes: string; created_at: string; updated_at: string
}
interface CoinTx {
  id: number; staff: number; staff_name: string; amount: string
  source_type: string; source_id: number | null; status: string; note: string
  approved_by_name: string | null; created_at: string
}
interface Customer { id: number; name: string }
interface Expense {
  id: number; category: string; category_display: string; custom_category: string; description: string
  amount: string; date: string; account: number | null; account_name: string
  payment_account: number | null; payment_account_name: string; payment_account_code: string
  receipt_url: string; notes: string; status: string; status_display: string
  submitted_by: number; submitted_by_name: string
  approved_by: number | null; approved_by_name: string | null; approved_at: string | null
  rejected_by: number | null; rejected_by_name: string | null; rejected_at: string | null
  rejection_note: string; is_recurring: boolean; recur_interval: number | null
  next_recur_date: string | null; journal_entry: number | null; created_at: string
  service: number | null; service_name: string
}

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
interface PurchaseOrderItem {
  id: number; product: number; product_name: string
  quantity_ordered: number; quantity_received: number; unit_cost: string
  line_total: string; pending_quantity: number
}
interface PurchaseOrder {
  id: number; po_number: string; supplier: number; supplier_name: string
  status: string; expected_delivery: string | null; notes: string
  total_amount: string; total_ordered: number; total_received: number
  received_by_name: string | null; received_at: string | null
  created_by_name: string | null; created_at: string; updated_at: string
  items: PurchaseOrderItem[]
}
interface LedgerRow {
  line_id?: number
  entry_id?: number
  date: string
  entry_number: string
  description: string
  reference_type?: string
  reference_id?: number | null
  purpose?: string
  debit: string
  credit: string
  balance: string
}
interface LedgerReport {
  account_code: string; account_name: string; date_from: string; date_to: string
  opening_balance: string; closing_balance: string; transactions: LedgerRow[]
}
interface DayBookLine { account_code: string; account_name: string; description: string; debit: string; credit: string }
interface DayBookEntry { entry_number: string; description: string; reference_type: string; total_debit: string; total_credit: string; lines: DayBookLine[] }
interface DayBookDay { date: string; entries: DayBookEntry[]; total_debit: string; total_credit: string; entry_count: number }
interface DayBookRangeReport {
  date_from: string
  date_to: string
  days: DayBookDay[]
  total_debit: string
  total_credit: string
  entry_count: number
}

interface ApiPage<T> { results: T[]; count: number }

/** Normalise a backend response that may be a plain array or a paginated object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPage<T = any>(raw: any): ApiPage<T> {
  if (Array.isArray(raw)) return { results: raw as T[], count: raw.length }
  // Handle ApiResponse envelope: { success, data: [...], meta: ... }
  if (Array.isArray(raw?.data)) return { results: raw.data as T[], count: raw.data.length }
  return { results: raw?.results ?? [], count: raw?.count ?? 0 }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—'
  const bs = adStringToBsDisplay(d)
  return bs?.bs ?? '—'
}
function npr(v: string | number) {
  return `NPR ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function paymentPartyName(p: Payment): string {
  return p.party_name || p.supplier_name || p.customer_name || '—'
}

function buildAccountingTabUrl(
  tab: string,
  extra?: Record<string, string | number | null | undefined>,
) {
  const params = new URLSearchParams()
  params.set('tab', tab)
  if (extra) {
    Object.entries(extra).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        params.set(key, String(value))
      }
    })
  }
  return `/accounting?${params.toString()}`
}

function resolveLedgerSourceRoute(referenceType?: string, referenceId?: number | null) {
  if (!referenceType || !referenceId) return null
  if (referenceType === 'invoice') return { tab: 'invoices', key: 'focus_invoice_id', id: referenceId }
  if (referenceType === 'bill') return { tab: 'bills', key: 'focus_bill_id', id: referenceId }
  if (referenceType === 'payment') return { tab: 'payments', key: 'focus_payment_id', id: referenceId }
  if (referenceType === 'credit_note') return { tab: 'credit-notes', key: 'focus_credit_note_id', id: referenceId }
  if (referenceType === 'debit_note') return { tab: 'debit-notes', key: 'focus_debit_note_id', id: referenceId }
  return null
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
  { key: 'quotations',         label: 'Quotations',         icon: FileQuestion    },
  { key: 'debit-notes',        label: 'Debit Notes',        icon: FileText        },
  { key: 'tds',                label: 'TDS',                icon: Percent         },
  { key: 'bank-reconciliation',label: 'Reconciliation',     icon: ArrowRightLeft  },
  { key: 'recurring-journals', label: 'Recurring Journals', icon: Repeat2         },
  { key: 'ledger',             label: 'Ledger',             icon: BookMarked      },
  { key: 'day-book',           label: 'Day Book',           icon: CalendarDays    },
  { key: 'expenses',               label: 'Expenses',                    icon: Wallet          },
  // Sales sub-tabs
  { key: 'sales-orders',           label: 'Sales Orders',                icon: ShoppingBag     },
  { key: 'customer-payments',      label: 'Customer Payments',           icon: CreditCard      },
  { key: 'allocate-customer-payments', label: 'Allocate Customer Payments', icon: ArrowLeftRight },
  // Purchase sub-tabs
  { key: 'purchase-orders',        label: 'Purchase Orders',             icon: Truck           },
  { key: 'suppliers',              label: 'Suppliers',                   icon: Truck           },
  { key: 'supplier-payments',      label: 'Supplier Payments',           icon: CreditCard      },
  { key: 'allocate-supplier-payments', label: 'Allocate Supplier Payments', icon: ArrowRightLeft },
  // Banking / Ledger tools
  { key: 'cash-transfers',         label: 'Cash Transfers',              icon: ArrowLeftRight  },
  { key: 'quick-payment',          label: 'Quick Payment',               icon: Zap             },
  { key: 'quick-receipt',          label: 'Quick Receipt',               icon: Zap             },
  { key: 'cheque-register',        label: 'Cheque Register',             icon: FileText        },
] as const

// ─── Dashboard Tab ─────────────────────────────────────────────────────────

const QUICK_LINKS = [
  // AR / Sales
  { label: 'New Invoice',         tab: 'invoices',            icon: Receipt,        color: 'text-blue-600',    bg: 'bg-blue-50    hover:bg-blue-100',   group: 'Sales'     },
  { label: 'New Quotation',       tab: 'quotations',          icon: FileQuestion,   color: 'text-sky-600',     bg: 'bg-sky-50     hover:bg-sky-100',    group: 'Sales'     },
  { label: 'Finance Review',      tab: 'finance-review',      icon: ShieldCheck,    color: 'text-emerald-600', bg: 'bg-emerald-50 hover:bg-emerald-100', group: 'Sales'     },
  // AP / Purchases
  { label: 'New Bill',            tab: 'bills',               icon: FileText,       color: 'text-orange-600',  bg: 'bg-orange-50  hover:bg-orange-100', group: 'Purchases' },
  { label: 'Record Expense',      tab: 'expenses',            icon: Wallet,         color: 'text-red-600',     bg: 'bg-red-50     hover:bg-red-100',    group: 'Purchases' },
  // Banking
  { label: 'Record Payment',      tab: 'payments',            icon: CreditCard,     color: 'text-violet-600',  bg: 'bg-violet-50  hover:bg-violet-100', group: 'Banking'   },
  { label: 'Reconcile Bank',      tab: 'bank-reconciliation', icon: ArrowRightLeft, color: 'text-teal-600',    bg: 'bg-teal-50    hover:bg-teal-100',   group: 'Banking'   },
  // Ledger
  { label: 'Journal Entry',       tab: 'journals',            icon: BookOpen,       color: 'text-indigo-600',  bg: 'bg-indigo-50  hover:bg-indigo-100', group: 'Ledger'    },
  { label: 'Account Ledger',      tab: 'ledger',              icon: BookMarked,     color: 'text-gray-700',    bg: 'bg-gray-50    hover:bg-gray-100',   group: 'Ledger'    },
  { label: 'Day Book',            tab: 'day-book',            icon: CalendarDays,   color: 'text-gray-700',    bg: 'bg-gray-50    hover:bg-gray-100',   group: 'Ledger'    },
  // Reports
  { label: 'P&L Report',          tab: 'pl',                  icon: TrendingUp,     color: 'text-green-600',   bg: 'bg-green-50   hover:bg-green-100',  group: 'Reports'   },
  { label: 'Balance Sheet',       tab: 'balance-sheet',       icon: BarChart2,      color: 'text-blue-700',    bg: 'bg-blue-50    hover:bg-blue-100',   group: 'Reports'   },
] as const

function DashboardTab() {
  const { fyYear } = useFY()
  const navigate = useNavigate()
  const { data: invoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'recent', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.INVOICES + '?page_size=10&ordering=-created_at', fyYear)).then(r => toPage<Invoice>(r.data)),
  })
  const { data: bills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'recent', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.BILLS + '?page_size=10&ordering=-created_at', fyYear)).then(r => toPage<Bill>(r.data)),
  })

  const cards = [
    { label: 'Total Invoices',  value: invoices?.count ?? '—',                                                     icon: TrendingUp,   color: 'text-blue-600',   bg: 'bg-blue-50'   },
    { label: 'Total Bills',     value: bills?.count ?? '—',                                                        icon: TrendingDown, color: 'text-red-600',    bg: 'bg-red-50'    },
    { label: 'Unpaid Invoices', value: invoices?.results?.filter(i => i.status === 'issued').length ?? '—',        icon: CreditCard,   color: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'Pending Bills',   value: bills?.results?.filter(b => b.status === 'draft').length ?? '—',            icon: CreditCard,   color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  const quickGroups = ['Sales', 'Purchases', 'Banking', 'Ledger', 'Reports'] as const
  type GroupName = typeof quickGroups[number]
  const byGroup = quickGroups.reduce<Record<GroupName, typeof QUICK_LINKS[number][]>>(
    (acc, g) => { acc[g] = QUICK_LINKS.filter(l => l.group === g) as typeof QUICK_LINKS[number][]; return acc },
    { Sales: [], Purchases: [], Banking: [], Ledger: [], Reports: [] }
  )

  return (
    <div className="space-y-6">

      {/* ── Quick Actions ────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <Zap size={15} className="text-amber-500" />
          <h3 className="font-semibold text-gray-700 text-sm">Quick Actions</h3>
          <span className="text-xs text-gray-400 ml-1">— jump directly to any workflow</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {quickGroups.map(group => (
            <div key={group}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{group}</p>
              <div className="flex flex-col gap-1.5">
                {byGroup[group].map(link => (
                  <button
                    key={link.label}
                    onClick={() => navigate(['pl','balance-sheet'].includes(link.tab) ? `/reports?report=${link.tab}` : `/accounting?tab=${link.tab}`)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent text-left transition-all ${link.bg}`}
                  >
                    <link.icon size={14} className={link.color} />
                    <span className={`text-xs font-medium ${link.color}`}>{link.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── KPI cards ────────────────────────────────────────────────── */}
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

interface LineItemDraft { description: string; qty: string; unit_price: string; discount: string; line_type: 'service' | 'product'; product_id?: number; service_id?: number }
interface ServiceItem { id: number; name: string; unit_price: string }
const emptyLine = (): LineItemDraft => ({ description: '', qty: '1', unit_price: '', discount: '0', line_type: 'service' })

interface InventoryProduct { id: number; name: string; unit_price: string; sku: string }

function InvoiceCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [applyVat, setApplyVat] = useState(true)
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
  })

  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products-all'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then(r => {
      const d = r.data?.data ?? r.data
      return Array.isArray(d) ? d : d.results ?? []
    }),
  })

  const { data: services = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
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

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string | number | undefined) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectProduct(lineIdx: number, productId: number) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, product_id: p.id, description: p.name, unit_price: p.unit_price }
      : l
    ))
  }

  function selectService(lineIdx: number, serviceId: number) {
    const s = services.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

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
  const total     = subtotal + vatAmount

  return (
    <Modal title="New Invoice" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} />
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
                      {l.line_type === 'product' ? (
                        <select
                          value={l.product_id ?? ''}
                          onChange={e => e.target.value
                            ? selectProduct(i, Number(e.target.value))
                            : setLine(i, 'product_id', undefined)
                          }
                          className="w-full border-0 outline-none text-xs bg-transparent"
                        >
                          <option value="">— Select product —</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {services.length > 0 && (
                            <select
                              value={l.service_id?.toString() ?? ''}
                              onChange={e => e.target.value ? selectService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))}
                              className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full"
                            >
                              <option value="">From catalog…</option>
                              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          )}
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Or enter description" className="border-0 outline-none text-xs bg-transparent w-full" required />}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={l.line_type} onChange={e => {
                        const t = e.target.value as 'service' | 'product'
                        setLines(ls => ls.map((ln, j) => j === i
                          ? { ...ln, line_type: t, product_id: undefined, service_id: undefined, description: '', unit_price: '' }
                          : ln
                        ))
                      }}
                        className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="service">Service</option>
                        <option value="product">Product</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" required />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)}
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
          {/* Totals + VAT toggle */}
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
  const handlePrint = async () => {
    const popup = window.open('', '_blank', 'noopener,noreferrer')
    if (!popup) {
      toast.error('Pop-up blocked. Please allow pop-ups to print invoice.')
      return
    }
    popup.document.write('<html><head><title>Loading invoice...</title></head><body style="font-family: Arial, sans-serif; padding: 16px;">Loading invoice PDF...</body></html>')
    popup.document.close()

    try {
      const res = await apiClient.get(ACCOUNTING.INVOICE_PDF(inv.id), { responseType: 'blob' })
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
            <p className="text-gray-700">{fmt(inv.date || inv.created_at)}</p>
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
                <th className="px-2 py-2 text-right text-gray-500 font-semibold">Cost Snap</th>
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
                const snap = item.cost_price_snapshot ? Number(item.cost_price_snapshot) : null
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{item.description ?? item.name ?? '—'}</td>
                    <td className="px-2 py-2 text-right text-gray-500 capitalize">{(item as {line_type?: string}).line_type ?? 'service'}</td>
                    <td className="px-2 py-2 text-right text-gray-700">{qty}</td>
                    <td className="px-2 py-2 text-right text-gray-700">{npr(price)}</td>
                    <td className="px-2 py-2 text-right text-gray-400">
                      {snap != null ? <span title="Cost price at time of invoice">{npr(snap)}</span> : '—'}
                    </td>
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

// ─── Invoice Edit Modal ────────────────────────────────────────────────────

function InvoiceEditModal({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState(inv.customer ? String(inv.customer) : '')
  const [date, setDate]             = useState(inv.date ?? new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate]       = useState(inv.due_date ?? '')
  const [notes, setNotes]           = useState(inv.notes ?? '')
  const [lines, setLines]           = useState<LineItemDraft[]>(() =>
    inv.line_items.length > 0
      ? inv.line_items.map((l: InvoiceItem) => ({
          description: l.description || l.name || '',
          qty:         String(l.qty ?? l.quantity ?? 1),
          unit_price:  String(l.unit_price || ''),
          discount:    String(l.discount || '0'),
          line_type:   (l.line_type as 'service' | 'product') || 'service',
        }))
      : [emptyLine()]
  )

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.INVOICE_DETAIL(inv.id), payload),
    onSuccess: () => {
      toast.success('Invoice updated')
      qc.invalidateQueries({ queryKey: ['invoices'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update invoice'),
  })

  const { data: editInvServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectEditInvService(lineIdx: number, serviceId: number) {
    const s = editInvServices.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lines.some(l => l.description && l.unit_price)) {
      toast.error('Add at least one line item with a description and price'); return
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
    <Modal title={`Edit ${inv.invoice_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {inv.status !== 'draft' && (
          <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              <strong>Admin override:</strong> This invoice is{' '}
              <span className="font-semibold capitalize">{inv.status}</span>. Editing it will
              update line items and totals but will not reverse any posted journal entries.
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} />
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
                      {l.line_type === 'service' ? (
                        <div className="flex flex-col gap-0.5">
                          {editInvServices.length > 0 && (
                            <select
                              value={l.service_id?.toString() ?? ''}
                              onChange={e => e.target.value ? selectEditInvService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))}
                              className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full"
                            >
                              <option value="">From catalog…</option>
                              {editInvServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          )}
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Or enter description" className="border-0 outline-none text-xs bg-transparent w-full" required />}
                        </div>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                          placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" required />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={l.line_type} onChange={e => {
                        const t = e.target.value as 'service' | 'product'
                        setLines(ls => ls.map((ln, j) => j === i ? { ...ln, line_type: t, service_id: undefined, description: '', unit_price: '' } : ln))
                      }} className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="service">Service</option>
                        <option value="product">Product</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" required />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)}
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
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Invoices Tab ──────────────────────────────────────────────────────────

function InvoicesTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useFY()
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const { data, isLoading } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', statusFilter, search, fyYear],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (fyYear)       params.set('fiscal_year', String(fyYear))
      if (search)       params.set('search', search)
      const qs = params.toString()
      return apiClient.get(qs ? `${ACCOUNTING.INVOICES}?${qs}` : ACCOUNTING.INVOICES).then(r => toPage<Invoice>(r.data))
    },
  })

  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null)
  const [markPaidInv, setMarkPaidInv] = useState<Invoice | null>(null)
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null)
  const focusInvoiceId = Number(searchParams.get('focus_invoice_id') ?? 0)

  useEffect(() => {
    if (!focusInvoiceId) return

    let cancelled = false

    const openFocusedInvoice = async () => {
      const clearFocus = () => navigate(buildAccountingTabUrl('invoices'), { replace: true })

      const fromList = data?.results?.find(inv => inv.id === focusInvoiceId)
      if (fromList) {
        setDetailInvoice(fromList)
        clearFocus()
        return
      }

      try {
        const r = await apiClient.get(ACCOUNTING.INVOICE_DETAIL(focusInvoiceId))
        if (cancelled) return
        const inv = (r.data?.data ?? r.data) as Invoice
        if (inv) {
          setDetailInvoice(inv)
        } else {
          toast.error('Linked invoice not found')
        }
      } catch {
        if (!cancelled) toast.error('Linked invoice not found')
      } finally {
        if (!cancelled) clearFocus()
      }
    }

    void openFocusedInvoice()
    return () => { cancelled = true }
  }, [focusInvoiceId, data?.results, navigate])

  const { data: invBankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts-inv-paid'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => r.data?.data ?? r.data?.results ?? []),
    enabled: !!markPaidInv,
  })

  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.INVOICE_ISSUE(id)),
    onSuccess: () => { toast.success('Invoice issued — journal entry created'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError:   (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to issue invoice'),
  })
  const mutatePaid = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { method: string; bank_account: number | null } }) =>
      apiClient.post(ACCOUNTING.INVOICE_MARK_PAID(id), payload),
    onSuccess: (res) => {
      toast.success('Invoice marked as paid')
      setMarkPaidInv(null)
      if (res.data?.payment) setReceiptPayment(res.data.payment)
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError:   () => toast.error('Action failed'),
  })
  const mutateVoid = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.INVOICE_VOID(id)),
    onSuccess: () => { toast.success('Invoice voided'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError:   () => toast.error('Action failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.INVOICE_DETAIL(id)),
    onSuccess: () => { toast.success('Invoice deleted'); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError:   (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to delete invoice'),
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
      {editInvoice && <InvoiceEditModal inv={editInvoice} onClose={() => setEditInvoice(null)} />}
      {markPaidInv && (
        <PaymentPickerModal
          title={`Mark Paid — ${markPaidInv.invoice_number}`}
          amount={markPaidInv.amount_due}
          description="This will record an incoming payment in the cash / bank ledger and mark the invoice as Paid."
          bankAccounts={invBankAccounts}
          onClose={() => setMarkPaidInv(null)}
          onSubmit={(method, bankId) => mutatePaid.mutate({ id: markPaidInv.id, payload: { method, bank_account: bankId } })}
          isPending={mutatePaid.isPending}
        />
      )}
      {receiptPayment && <TransactionReceiptModal payment={receiptPayment} onClose={() => setReceiptPayment(null)} />}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All statuses</option>
            {['draft','issued','paid','void'].map(s => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input data-lpignore="true"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice or customer…"
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-56"
            />
          </div>
        </div>
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
              {data?.results?.map(inv => {
                const isOverdue = inv.status === 'issued' && inv.due_date && new Date(inv.due_date) < new Date()
                return (
                <tr key={inv.id} className={`hover:bg-gray-50/50 transition-colors ${isOverdue ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600 cursor-pointer hover:underline"
                    onClick={() => setDetailInvoice(inv)}>{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(inv.date || inv.created_at)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={isOverdue ? 'text-amber-700 font-semibold' : 'text-gray-500'}>{fmt(inv.due_date)}</span>
                    {isOverdue && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1 font-medium">Overdue</span>}
                  </td>
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
                      {can('can_manage_accounting') && (
                        <button onClick={() => setEditInvoice(inv)} title="Edit Invoice"
                          className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                          <Pencil size={14} />
                        </button>
                      )}
                      {can('can_manage_accounting') && (
                        <button onClick={() => { confirm({ title: 'Delete Invoice', message: `Delete ${inv.invoice_number}? This cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(inv.id) }) }}
                          title="Delete Invoice" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                      {inv.status === 'draft' && (
                        <button onClick={() => { confirm({ title: 'Issue Invoice', message: 'Issue this invoice? This will create a journal entry and send it to the customer.', variant: 'warning', confirmLabel: 'Issue Invoice' }).then(ok => { if (ok) mutateIssue.mutate(inv.id) }) }}
                          title="Issue Invoice" className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors">
                          <Play size={14} />
                        </button>
                      )}
                      {inv.status === 'issued' && (
                        <button onClick={() => setMarkPaidInv(inv)} title="Mark Paid" className="p-1.5 rounded hover:bg-green-50 text-green-600 transition-colors">
                          <CheckCircle size={14} />
                        </button>
                      )}
                      {inv.status !== 'void' && inv.status !== 'paid' && (
                        <button onClick={() => { confirm({ title: 'Void Invoice', message: 'Void this invoice?', variant: 'danger', confirmLabel: 'Void' }).then(ok => { if (ok) mutateVoid.mutate(inv.id) }) }} title="Void" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                          <XCircle size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
              })}
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
  const [supplierId,   setSupplierId]   = useState<number | null>(null)
  const [supplierName, setSupplierName] = useState('')
  const [dueDate,      setDueDate]      = useState('')
  const [vatEnabled,   setVatEnabled]   = useState(true)
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  // Load inventory suppliers for dropdown
  const { data: suppliers = [] } = useQuery<InventorySupplier[]>({
    queryKey: ['inventory-suppliers-select'],
    queryFn: () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=500&is_active=true`).then(r => toPage<InventorySupplier>(r.data).results),
  })
  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then(r => toPage<InventoryProduct>(r.data).results),
  })

  const { data: billCreateServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  // Live total preview
  const subtotal = lines.reduce((acc, l) => {
    const qty   = Number(l.qty) || 0
    const price = Number(l.unit_price) || 0
    return acc + qty * price
  }, 0)
  const vatAmt = vatEnabled ? subtotal * 0.13 : 0
  const total  = subtotal + vatAmt

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

  function selectProduct(lineIdx: number, productId: number) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, product_id: p.id, description: p.name, unit_price: p.unit_price, line_type: 'product' as const }
      : l
    ))
  }

  function selectBillCreateService(lineIdx: number, serviceId: number) {
    const s = billCreateServices.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

  function handleSupplierChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (val === '__custom__') {
      setSupplierId(null)
      setSupplierName('')
    } else if (val) {
      const id  = Number(val)
      const sup = suppliers.find(s => s.id === id)
      setSupplierId(id)
      setSupplierName(sup?.name ?? '')
    } else {
      setSupplierId(null)
      setSupplierName('')
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierName.trim()) { toast.error('Supplier name is required'); return }
    mutation.mutate({
      supplier: supplierId || null,
      supplier_name: supplierName,
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
          {/* Supplier select */}
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
                  <input data-lpignore="true"
                    value={supplierName}
                    onChange={e => setSupplierName(e.target.value)}
                    placeholder="Supplier / vendor name"
                    className={inputCls}
                    required
                  />
                )}
              </div>
            ) : (
              <input data-lpignore="true" value={supplierName} onChange={e => setSupplierName(e.target.value)}
                placeholder="Supplier / vendor name" className={inputCls} required />
            )}
          </Field>
          <Field label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} />
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
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Description / Product</th>
                  <th className="px-2 py-2 text-left text-gray-500 font-medium w-20">Type</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-14">Qty</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-24">Unit Price</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'product' ? (
                        <select
                          value={l.product_id ?? ''}
                          onChange={e => e.target.value
                            ? selectProduct(i, Number(e.target.value))
                            : setLine(i, 'product_id', undefined)
                          }
                          className="w-full border-0 outline-none text-xs bg-transparent"
                        >
                          <option value="">— Select product —</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {billCreateServices.length > 0 && (
                            <select
                              value={l.service_id?.toString() ?? ''}
                              onChange={e => e.target.value ? selectBillCreateService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))}
                              className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full"
                            >
                              <option value="">From catalog…</option>
                              {billCreateServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                          )}
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Item description" className="border-0 outline-none text-xs bg-transparent w-full" />}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={l.line_type} onChange={e => {
                        const t = e.target.value as 'service' | 'product'
                        setLines(ls => ls.map((ln, j) => j === i
                          ? { ...ln, line_type: t, product_id: undefined, service_id: undefined, description: '', unit_price: '' }
                          : ln
                        ))
                      }}
                        className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="service">Service</option>
                        <option value="product">Product</option>
                      </select>
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

        {/* Totals + VAT toggle */}
        <div className="bg-gray-50 rounded-lg px-4 py-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between text-gray-600">
            <span>Subtotal</span>
            <span className="font-medium tabular-nums">{npr(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setVatEnabled(v => !v)}
                className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${vatEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${vatEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-gray-600">VAT 13%</span>
            </label>
            {vatEnabled && (
              <span className="text-orange-600 font-medium tabular-nums">{npr(vatAmt)}</span>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 font-semibold text-gray-800">
            <span>Total</span>
            <span className="tabular-nums">{npr(total)}</span>
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

// ─── Bill Edit Modal ──────────────────────────────────────────────────────

function BillEditModal({ bill, onClose }: { bill: Bill; onClose: () => void }) {
  const qc = useQueryClient()
  const [supplierId, setSupplierId] = useState<string>(bill.supplier ? String(bill.supplier) : '__custom__')
  const [supplierName, setSupplierName] = useState(bill.supplier_name ?? '')
  const [dueDate, setDueDate]           = useState(bill.due_date ?? '')
  const [lines, setLines]               = useState<LineItemDraft[]>(() =>
    (bill.line_items as Record<string, unknown>[]).length > 0
      ? (bill.line_items as Record<string, unknown>[]).map(l => ({
          description: String(l.description ?? ''),
          qty:         String(l.qty ?? 1),
          unit_price:  String(l.unit_price ?? ''),
          discount:    String(l.discount ?? '0'),
          line_type:   (l.line_type as 'service' | 'product') ?? 'service',
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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const resolvedName = supplierId !== '__custom__'
      ? (suppliers?.results?.find(s => String(s.id) === supplierId)?.name ?? supplierName)
      : supplierName
    if (!resolvedName.trim()) { toast.error('Supplier name is required'); return }
    mutation.mutate({
      supplier: supplierId !== '__custom__' ? Number(supplierId) : null,
      supplier_name: resolvedName,
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
          <Field label="Due Date">
            <NepaliDatePicker value={dueDate} onChange={setDueDate} />
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
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bills Tab ─────────────────────────────────────────────────────────────

function BillsTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useFY()
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
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => r.data?.data ?? r.data?.results ?? []),
    enabled: !!markPaidBill,
  })

  const { data, isLoading } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', statusFilter, search, fyYear],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      if (fyYear)       params.set('fiscal_year', String(fyYear))
      if (search)       params.set('search', search)
      const qs = params.toString()
      return apiClient.get(qs ? `${ACCOUNTING.BILLS}?${qs}` : ACCOUNTING.BILLS).then(r => toPage<Bill>(r.data))
    },
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
    mutationFn: ({ id, payload }: { id: number; payload: { method: string; bank_account: number | null } }) =>
      apiClient.post(ACCOUNTING.BILL_MARK_PAID(id), payload),
    onSuccess: (res) => {
      toast.success('Bill marked as paid')
      setMarkPaidBill(null)
      if (res.data?.payment) setBillReceiptPayment(res.data.payment)
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
    onError: () => toast.error('Action failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.BILL_DETAIL(id)),
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
    navigate(buildAccountingTabUrl('bills'), { replace: true })
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Bill #','Supplier','Date','Due','Total','Paid','Balance','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(bill => {
                const isOverdue = bill.status === 'approved' && bill.due_date && new Date(bill.due_date) < new Date()
                return (
                <tr
                  key={bill.id}
                  id={`bill-row-${bill.id}`}
                  className={`hover:bg-gray-50/50 ${isOverdue ? 'bg-amber-50/50' : ''} ${focusedBillId === bill.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{bill.bill_number}</td>
                  <td className="px-4 py-3 text-gray-700">{bill.supplier_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(bill.date || bill.created_at)}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className={isOverdue ? 'text-amber-700 font-semibold' : 'text-gray-500'}>{fmt(bill.due_date)}</span>
                    {isOverdue && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 rounded px-1 font-medium">Overdue</span>}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(bill.total)}</td>
                  <td className="px-4 py-3 text-green-700 text-xs">{Number(bill.amount_paid) > 0 ? npr(bill.amount_paid) : '—'}</td>
                  <td className="px-4 py-3 text-red-700 text-xs">{Number(bill.amount_due) > 0 ? npr(bill.amount_due) : '—'}</td>
                  <td className="px-4 py-3"><Badge status={bill.status} /></td>
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
                        <button onClick={() => { confirm({ title: 'Void Bill', message: 'Void this bill?', variant: 'danger', confirmLabel: 'Void' }).then(ok => { if (ok) voidBill.mutate(bill.id) }) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Void</button>
                      )}
                    </div>
                  </td>
                </tr>
              )
              })}
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
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useFY()
  const [focusedPaymentId, setFocusedPaymentId] = useState<number | null>(null)
  const focusPaymentId = Number(searchParams.get('focus_payment_id') ?? 0)
  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.PAYMENTS, fyYear)).then(r => toPage<Payment>(r.data)),
  })
  const mutateDeletePayment = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.PAYMENT_DETAIL(id)),
    onSuccess: () => { toast.success('Payment deleted'); qc.invalidateQueries({ queryKey: ['payments'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Delete failed'),
  })

  useEffect(() => {
    if (!focusPaymentId) return
    setFocusedPaymentId(focusPaymentId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`payment-row-${focusPaymentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingTabUrl('payments'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusPaymentId, navigate])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">Payments are auto-created when invoices/bills are marked as paid. Admins can delete — linked journal entries are <strong>not</strong> auto-reversed.</p>
        <span className="text-sm text-gray-400">{data?.count ?? 0} payment{data?.count !== 1 ? 's' : ''}</span>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Payment #','Date','Type','Method','Amount','Invoice','Bill',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(p => (
                <tr
                  key={p.id}
                  id={`payment-row-${p.id}`}
                  className={`hover:bg-gray-50/50 ${focusedPaymentId === p.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.date)}</td>
                  <td className="px-4 py-3"><Badge status={p.type} /></td>
                  <td className="px-4 py-3 text-gray-600 text-xs capitalize">{p.method.replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(p.amount)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.bill_number ?? '—'}</td>
                  <td className="px-4 py-3">
                    {can('can_manage_accounting') && (
                      <button onClick={() => confirm({ title: 'Delete Payment', message: `Delete payment ${p.payment_number}? The linked journal entry will NOT be auto-reversed — post a manual reversing entry if needed.`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeletePayment.mutate(p.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                    )}
                  </td>
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
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useFY()
  const [editCn, setEditCn] = useState<CreditNote | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [focusedCreditNoteId, setFocusedCreditNoteId] = useState<number | null>(null)
  const focusCreditNoteId = Number(searchParams.get('focus_credit_note_id') ?? 0)
  const { data, isLoading } = useQuery<ApiPage<CreditNote>>({
    queryKey: ['credit-notes', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.CREDIT_NOTES, fyYear)).then(r => toPage<CreditNote>(r.data)),
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
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.CREDIT_NOTE_DETAIL(id)),
    onSuccess: () => { toast.success('Credit note deleted'); qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to delete credit note'),
  })

  useEffect(() => {
    if (!focusCreditNoteId) return
    setFocusedCreditNoteId(focusCreditNoteId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`credit-note-row-${focusCreditNoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingTabUrl('credit-notes'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusCreditNoteId, navigate])

  return (
    <div>
      {editCn && <CreditNoteEditModal cn={editCn} onClose={() => setEditCn(null)} />}
      {showCreate && <CreditNoteCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">{data?.count ?? 0} credit notes</span>
        {can('can_manage_accounting') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> New Credit Note
          </button>
        )}
      </div>
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
                <tr
                  key={cn.id}
                  id={`credit-note-row-${cn.id}`}
                  className={`hover:bg-gray-50/50 ${focusedCreditNoteId === cn.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{cn.credit_note_number}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{cn.invoice_number ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{npr(cn.total)}</td>
                  <td className="px-4 py-3"><Badge status={cn.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmt(cn.issued_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 items-center">
                      {cn.status === 'draft' && can('can_manage_accounting') && (
                        <button onClick={() => setEditCn(cn)} title="Edit Credit Note"
                          className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                          <Pencil size={14} />
                        </button>
                      )}
                      {cn.status === 'draft' && can('can_manage_accounting') && (
                        <button onClick={() => { confirm({ title: 'Delete Credit Note', message: `Delete ${cn.credit_note_number}? This cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(cn.id) }) }}
                          title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      )}
                      {cn.status === 'draft' && (
                        <button onClick={() => mutateIssue.mutate(cn.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                      )}
                      {cn.status !== 'void' && (
                        <button onClick={() => { confirm({ title: 'Void Credit Note', message: 'Void this credit note?', variant: 'danger', confirmLabel: 'Void' }).then(ok => { if (ok) mutateVoid.mutate(cn.id) }) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Void</button>
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

// ─── Credit Note Create Modal ─────────────────────────────────────────────

function CreditNoteCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState('')
  const [invoiceId, setInvoiceId] = useState<string>('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: invoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices-mini'],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES + '?page_size=200&status=issued').then(r => toPage<Invoice>(r.data)),
  })
  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then(r => toPage<InventoryProduct>(r.data).results),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.CREDIT_NOTES, payload),
    onSuccess: () => { toast.success('Credit note created'); qc.invalidateQueries({ queryKey: ['credit-notes'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create credit note'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string | number | undefined) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectProduct(lineIdx: number, productId: number) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, product_id: p.id, description: p.name, unit_price: p.unit_price, line_type: 'product' as const }
      : l
    ))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter(l => l.description && l.unit_price)
    if (!validLines.length) { toast.error('Add at least one line item'); return }
    mutation.mutate({
      invoice: invoiceId ? Number(invoiceId) : null,
      reason,
      line_items: validLines.map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title="New Credit Note" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Linked Invoice (optional)</label>
          <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— Standalone credit note —</option>
            {invoices?.results?.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.customer_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Returned goods, billing error…" />
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
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Description / Product</th>
                  <th className="px-2 py-2 text-left text-gray-500 font-medium w-20">Type</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-14">Qty</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-24">Unit Price</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'product' ? (
                        <select
                          value={l.product_id ?? ''}
                          onChange={e => e.target.value
                            ? selectProduct(i, Number(e.target.value))
                            : setLine(i, 'product_id', undefined)
                          }
                          className="w-full border-0 outline-none text-xs bg-transparent"
                        >
                          <option value="">— Select product —</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                          placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={l.line_type} onChange={e => {
                        const t = e.target.value as 'service' | 'product'
                        setLines(ls => ls.map((ln, j) => j === i
                          ? { ...ln, line_type: t, product_id: undefined, description: '', unit_price: '' }
                          : ln
                        ))
                      }}
                        className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="service">Service</option>
                        <option value="product">Product</option>
                      </select>
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
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Creating…' : 'Create Credit Note'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Credit Note Edit Modal ───────────────────────────────────────────────

function CreditNoteEditModal({ cn, onClose }: { cn: CreditNote; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState(cn.reason ?? '')
  const [lines, setLines] = useState<LineItemDraft[]>(() =>
    (cn.line_items as Record<string, unknown>[]).length > 0
      ? (cn.line_items as Record<string, unknown>[]).map(l => ({
          description: String(l.description ?? ''),
          qty:         String(l.qty ?? 1),
          unit_price:  String(l.unit_price ?? ''),
          discount:    String(l.discount ?? '0'),
          line_type:   (l.line_type as 'service' | 'product') ?? 'service',
        }))
      : [emptyLine()]
  )

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.CREDIT_NOTE_DETAIL(cn.id), payload),
    onSuccess: () => {
      toast.success('Credit note updated')
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update credit note'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      reason,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0' })),
    })
  }

  return (
    <Modal title={`Edit ${cn.credit_note_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason">
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for credit note" className={inputCls} />
        </Field>
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
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Journal Entry Create Modal ────────────────────────────────────────────

interface JournalLineDraft { account: string; debit: string; credit: string; description: string }
const emptyJLine = (): JournalLineDraft => ({ account: '', debit: '', credit: '', description: '' })

// ─── Journal Edit Modal ───────────────────────────────────────────────────

function JournalEditModal({ je, onClose }: { je: JournalEntry; onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(je.date)
  const [description, setDescription] = useState(je.description)
  const [jLines, setJLines] = useState<JournalLineDraft[]>(
    je.lines.length >= 2
      ? je.lines.map(l => ({ account: String(l.account), debit: l.debit, credit: l.credit, description: l.description }))
      : [emptyJLine(), emptyJLine()]
  )

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-flat'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.JOURNAL_DETAIL(je.id), payload),
    onSuccess: () => {
      toast.success('Journal entry updated')
      qc.invalidateQueries({ queryKey: ['journals'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update entry'),
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
      lines: validLines.map(l => ({
        account: Number(l.account),
        debit:   l.debit  || '0',
        credit:  l.credit || '0',
        description: l.description,
      })),
    })
  }

  return (
    <Modal title={`Edit Journal Entry — ${je.entry_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-800"><strong>Admin edit:</strong> Saving will replace all journal lines. Related auto-generated journal entries from invoices/bills are not affected.</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date *">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Description *">
            <input data-lpignore="true" value={description} onChange={e => setDescription(e.target.value)}
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
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.debit}
                        onChange={e => setJLine(i, 'debit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.credit}
                        onChange={e => setJLine(i, 'credit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setJLine(i, 'description', e.target.value)}
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
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

function JournalCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [jLines, setJLines] = useState<JournalLineDraft[]>([emptyJLine(), emptyJLine()])

  // Use a distinct query key + no_page=1 so we always get the full flat array
  // (avoids cache collision with AccountsTab which caches under ['accounts'])
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-flat'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
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
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Description *">
            <input data-lpignore="true" value={description} onChange={e => setDescription(e.target.value)}
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
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.debit}
                        onChange={e => setJLine(i, 'debit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.credit}
                        onChange={e => setJLine(i, 'credit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setJLine(i, 'description', e.target.value)}
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

const PURPOSE_BADGE: Record<string, string> = {
  revenue:      'bg-green-100 text-green-700',
  cogs:         'bg-orange-100 text-orange-700',
  payslip:      'bg-blue-100 text-blue-700',
  vat:          'bg-purple-100 text-purple-700',
  tds:          'bg-violet-100 text-violet-700',
  payment:      'bg-sky-100 text-sky-700',
  reversal:     'bg-red-100 text-red-700',
  recurring:    'bg-gray-100 text-gray-600',
  depreciation: 'bg-amber-100 text-amber-700',
  fx_gain_loss: 'bg-cyan-100 text-cyan-700',
  adjustment:   'bg-gray-100 text-gray-600',
}

function PurposeBadge({ purpose }: { purpose: string }) {
  if (!purpose) return <span className="text-gray-300 text-xs">—</span>
  const cls = PURPOSE_BADGE[purpose] ?? 'bg-gray-100 text-gray-500'
  const label = purpose.replace(/_/g, ' ')
  return <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>{label}</span>
}

function printJournalVoucher(je: JournalEntry) {
  const bsDate = adStringToBsDisplay(je.date)?.bs ?? je.date
  const rows = (je.lines ?? []).map(l => `
    <tr>
      <td>${l.account_code} — ${l.account_name}</td>
      <td>${l.description ?? ''}</td>
      <td class="num">${Number(l.debit) > 0 ? Number(l.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
      <td class="num">${Number(l.credit) > 0 ? Number(l.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : ''}</td>
    </tr>`).join('')
  const total = Number(je.total_debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })
  const win = window.open('', '_blank', 'width=800,height=600')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>Journal Voucher — ${je.entry_number}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
    h2 { font-size: 16px; margin: 0 0 2px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0; font-size: 11px; }
    .meta span { color: #555; } .meta strong { color: #111; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: .04em;
         padding: 6px 8px; text-align: left; border: 1px solid #e5e7eb; }
    td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-weight: 700; background: #f9fafb; }
    .footer { margin-top: 32px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
    .sig-line { border-top: 1px solid #999; width: 160px; text-align: center; padding-top: 4px; margin-top: 40px; }
    @media print { body { margin: 12px; } }
  </style></head><body>
  <h2>Journal Voucher</h2>
  <p style="margin:0;font-size:11px;color:#555;">${je.entry_number}${je.is_reversal ? ' &nbsp;[REVERSING ENTRY]' : ''}</p>
  <div class="meta">
    <div><span>Date (BS): </span><strong>${bsDate}</strong></div>
    <div><span>Date (AD): </span><strong>${je.date}</strong></div>
    <div><span>Purpose: </span><strong>${(je.purpose ?? '').replace(/_/g, ' ')}</strong></div>
    <div><span>Ref Type: </span><strong>${(je.reference_type ?? '').replace(/_/g, ' ')}</strong></div>
    <div style="grid-column:1/-1"><span>Description: </span><strong>${je.description ?? ''}</strong></div>
    ${je.created_by_name ? `<div><span>Created by: </span><strong>${je.created_by_name}</strong></div>` : ''}
  </div>
  <table>
    <thead><tr>
      <th>Account</th><th>Narration</th>
      <th class="num">Debit (NPR)</th><th class="num">Credit (NPR)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr class="total-row">
      <td colspan="2" style="text-align:right;">Total</td>
      <td class="num">${total}</td><td class="num">${total}</td>
    </tr></tfoot>
  </table>
  <div class="footer">
    <div><div class="sig-line">Prepared By</div></div>
    <div><div class="sig-line">Checked By</div></div>
    <div><div class="sig-line">Approved By</div></div>
  </div>
  </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}

function JournalsTab() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [purposeFilter, setPurposeFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editJournal, setEditJournal] = useState<JournalEntry | null>(null)
  const { fyYear } = useFY()
  const { data, isLoading } = useQuery<ApiPage<JournalEntry>>({
    queryKey: ['journals', fyYear, purposeFilter],
    queryFn: () => {
      let url = addFyParam(ACCOUNTING.JOURNALS, fyYear)
      if (purposeFilter) url += (url.includes('?') ? '&' : '?') + `purpose=${purposeFilter}`
      return apiClient.get(url).then(r => toPage<JournalEntry>(r.data))
    },
  })
  const mutatePost = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.JOURNAL_POST(id)),
    onSuccess: () => { toast.success('Entry posted'); qc.invalidateQueries({ queryKey: ['journals'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Post failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.JOURNAL_DETAIL(id)),
    onSuccess: () => { toast.success('Journal entry deleted'); qc.invalidateQueries({ queryKey: ['journals'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Delete failed'),
  })

  return (
    <div className="space-y-4">
      {editJournal && <JournalEditModal je={editJournal} onClose={() => setEditJournal(null)} />}
      {showCreate && <JournalCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-xs text-gray-400">Journal entries are auto-created from invoices, bills, and payments. Manual entries for adjustments.</p>
        <div className="flex items-center gap-2">
          <select
            value={purposeFilter}
            onChange={e => setPurposeFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">All types</option>
            {Object.keys(PURPOSE_BADGE).map(p => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {(data?.results?.length ?? 0) > 0 && (
            expanded.size === (data?.results?.length ?? 0)
              ? <button onClick={() => setExpanded(new Set())}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsDownUp size={14} /> Collapse All
                </button>
              : <button onClick={() => setExpanded(new Set(data?.results?.map(je => je.id) ?? []))}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsUpDown size={14} /> Expand All
                </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Manual Entry
          </button>
        </div>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['','Entry #','Date','Description','Ref','Purpose','Debit','Credit','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(je => (
                <Fragment key={je.id}>
                  <tr className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpanded(s => { const n = new Set(s); n.has(je.id) ? n.delete(je.id) : n.add(je.id); return n })}>
                    <td className="px-3 py-3">
                      <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded.has(je.id) ? 'rotate-90' : ''}`} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">
                      {je.entry_number}
                      {je.is_reversal && <span className="ml-1 text-red-500" title="This is a reversing entry">R</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(je.date)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{je.description}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs capitalize">{je.reference_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3"><PurposeBadge purpose={je.purpose} /></td>
                    <td className="px-4 py-3 text-green-700">{npr(je.total_debit)}</td>
                    <td className="px-4 py-3 text-red-700">{npr(je.total_credit)}</td>
                    <td className="px-4 py-3">
                      {je.is_posted
                        ? <Badge status="posted" />
                        : <button onClick={e => { e.stopPropagation(); mutatePost.mutate(je.id) }} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Post</button>
                      }
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => printJournalVoucher(je)}
                          className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Print Voucher">
                          <Printer size={13} />
                        </button>
                        {!je.is_posted && can('can_manage_accounting') && (
                          <>
                            <button onClick={() => setEditJournal(je)}
                              className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Edit entry">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => confirm({ title: 'Delete Journal Entry', message: `Delete ${je.entry_number}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' }).then(ok => { if (ok) mutateDelete.mutate(je.id) })}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete entry">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded.has(je.id) && (
                    <tr>
                      <td colSpan={10} className="px-8 py-3 bg-gray-50">
                        <table className="w-full text-xs mb-2">
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
                        {(je.reversal_timestamp || je.reversal_reason || je.reversed_by_id) && (
                          <div className="mt-2 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
                            <p className="font-semibold">Reversal Audit Trail</p>
                            {je.reversed_by_user_name && <p>Reversed by: <span className="font-medium">{je.reversed_by_user_name}</span></p>}
                            {je.reversal_timestamp && <p>When: {new Date(je.reversal_timestamp).toLocaleString()}</p>}
                            {je.reversal_reason && <p>Reason: {je.reversal_reason}</p>}
                          </div>
                        )}
                        {je.created_by_name && (
                          <p className="text-xs text-gray-400 mt-1.5">Created by {je.created_by_name}</p>
                        )}
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

// ─── Chart of Accounts helpers ────────────────────────────────────────────

/** Next available child code: siblings' max numeric code + 1; falls back to parentCode+"1". */
function nextChildCode(parentId: number | null, parentCode: string, allAccts: Account[]): string {
  const siblings = allAccts.filter(a => (a.parent ?? null) === parentId)
  const nums = siblings.map(s => parseInt(s.code, 10)).filter(n => !isNaN(n))
  if (!nums.length) return parentCode + '1'
  return String(Math.max(...nums) + 1)
}

/** Next available root code for a given section (no parent). */
function nextRootCode(type: string, allAccts: Account[]): string {
  const roots = allAccts.filter(a => !a.parent && a.type === type)
  const nums = roots.map(s => parseInt(s.code, 10)).filter(n => !isNaN(n))
  if (!nums.length) return { asset: '1900', liability: '2900', equity: '3900', revenue: '4900', expense: '5900' }[type] ?? '9000'
  return String(Math.max(...nums) + 1)
}

function buildAccountTree(accounts: Account[], maxDepth = 5): { account: Account; depth: number }[] {
  const ids = new Set(accounts.map(a => a.id))
  const byParent = new Map<number | null, Account[]>()
  accounts.forEach(a => {
    // If a parent is not present in the current filtered set,
    // promote this node to root so filtered trees still render.
    const key = (a.parent != null && ids.has(a.parent)) ? a.parent : null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push(a)
  })
  byParent.forEach(arr => arr.sort((a, b) => a.code.localeCompare(b.code)))
  const result: { account: Account; depth: number }[] = []
  function walk(parentId: number | null, depth: number) {
    if (depth > maxDepth) return
    ;(byParent.get(parentId) ?? []).forEach(a => { result.push({ account: a, depth }); walk(a.id, depth + 1) })
  }
  walk(null, 0)
  return result
}

// ─── Inline edit row ───────────────────────────────────────────────────────

function InlineEditRow({
  account,
  onSave,
  onCancel,
}: {
  account: Account
  onSave: () => void
  onCancel: () => void
}) {
  const qc  = useQueryClient()
  const [name,        setName]        = useState(account.name)
  const [code,        setCode]        = useState(account.code)
  const [description, setDescription] = useState(account.description ?? '')
  const [openingBal,  setOpeningBal]  = useState(account.opening_balance ?? '0')
  const [isActive,    setIsActive]    = useState(account.is_active)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const mutation = useMutation({
    mutationFn: (payload: unknown) =>
      apiClient.patch(`${ACCOUNTING.ACCOUNTS}${account.id}/`, payload),
    onSuccess: () => {
      toast.success('Account updated')
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onSave()
    },
    onError: (e: { response?: { data?: { detail?: string; code?: string[] } } }) =>
      toast.error(e?.response?.data?.detail ?? e?.response?.data?.code?.[0] ?? 'Update failed'),
  })

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) { nameRef.current?.focus(); return }
    mutation.mutate({
      code: code.trim(),
      name: name.trim(),
      description: description.trim(),
      opening_balance: openingBal || '0',
      is_active: isActive,
    })
  }

  return (
    <tr className="bg-amber-50/50 border-y border-amber-100">
      <td className="py-2 pl-3 align-top">
        <input data-lpignore="true"
          value={code} onChange={e => setCode(e.target.value)}
          className="w-24 font-mono text-xs border border-amber-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      </td>
      <td className="py-2 pr-2 align-top" colSpan={2}>
        <form onSubmit={submit} className="space-y-1">
          <input data-lpignore="true"
            ref={nameRef}
            value={name} onChange={e => setName(e.target.value)}
            className="w-full text-sm border border-amber-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
            onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            placeholder="Account name"
          />
          <input data-lpignore="true"
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full text-xs border border-amber-100 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-amber-300 text-gray-500"
            placeholder="Description / notes (optional)"
          />
          <div className="flex items-center gap-3 mt-1">
            <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
              <span>Opening Bal:</span>
              <input data-lpignore="true"
                type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)}
                className="w-24 font-mono text-xs border border-amber-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsActive(v => !v)}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                isActive
                  ? 'border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                  : 'border-gray-300 text-gray-400 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {isActive ? <Eye size={11} /> : <EyeOff size={11} />}
              {isActive ? 'Active' : 'Inactive'}
            </button>
          </div>
        </form>
      </td>
      <td className="py-2 align-top" colSpan={2}>
        <div className="flex items-center gap-1">
          <button onClick={submit} disabled={mutation.isPending}
            className="p-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50" title="Save">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />}
          </button>
          <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Cancel (Esc)">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Inline add row ────────────────────────────────────────────────────────

interface InlineAddState {
  parentId: number | null
  resolvedParentId: number | null
  type: string
  depth: number
  suggestedCode: string
}

function InlineAddRow({
  state, allAccounts: _allAccounts, onSave, onCancel,
}: {
  state: InlineAddState
  allAccounts: Account[]
  onSave: () => void
  onCancel: () => void
}) {
  const qc = useQueryClient()
  const [name,        setName]        = useState('')
  const [code,        setCode]        = useState(state.suggestedCode)
  const [description, setDescription] = useState('')
  const [openingBal,  setOpeningBal]  = useState('0')
  const [groupId,     setGroupId]     = useState<number | ''>('')
  const [showGroupSelector, setShowGroupSelector] = useState(false)
  const parentAccount = useMemo(
    () => (state.resolvedParentId ? _allAccounts.find(a => a.id === state.resolvedParentId) ?? null : null),
    [state.resolvedParentId, _allAccounts],
  )
  const isControlParent = Boolean(
    parentAccount && parentAccount.is_system && parentAccount.parent === null &&
    ['1000', '2000', '3000', '4000', '5000'].includes(parentAccount.code)
  )
  const shouldInheritParentGroup = Boolean(parentAccount?.group) && !isControlParent
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => { nameRef.current?.focus() }, [])

  const { data: groups = [] } = useQuery<AccountGroup[]>({
    queryKey: ['account-groups', state.type],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNT_GROUPS + `?type=${state.type}`).then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
  })

  const typeColors: Record<string, string> = {
    asset: 'text-blue-600 bg-blue-50', liability: 'text-orange-600 bg-orange-50',
    equity: 'text-purple-600 bg-purple-50', revenue: 'text-green-600 bg-green-50',
    expense: 'text-red-600 bg-red-50',
  }

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.ACCOUNTS, payload),
    onSuccess: () => {
      toast.success('Account created')
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onSave()
    },
    onError: (e: { response?: { data?: { detail?: string; code?: string[]; group?: string[] } } }) =>
      toast.error(e?.response?.data?.detail ?? e?.response?.data?.group?.[0] ?? e?.response?.data?.code?.[0] ?? 'Failed to create account'),
  })

  const autoGroupId = useMemo<number | ''>(() => {
    if (shouldInheritParentGroup && parentAccount?.group) {
      return parentAccount.group
    }
    return groups[0]?.id ?? ''
  }, [groups, parentAccount, shouldInheritParentGroup])

  useEffect(() => {
    if (groupId) return
    if (autoGroupId) {
      setGroupId(autoGroupId)
    }
  }, [autoGroupId, groupId])

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!name.trim()) { nameRef.current?.focus(); return }
    const resolvedGroup = groupId || autoGroupId || ''
    if (!resolvedGroup) { toast.error('Please select an account group.'); return }
    mutation.mutate({
      code: code.trim(), name: name.trim(), type: state.type, parent: state.resolvedParentId,
      description: description.trim(),
      opening_balance: openingBal || '0',
      group: resolvedGroup,
    })
  }

  const indent = state.depth * 20

  return (
    <tr className="bg-indigo-50/40 border-y border-indigo-100">
      {/* Code cell */}
      <td className="py-2 align-top" style={{ paddingLeft: `${16 + indent + 20}px` }}>
        <input data-lpignore="true"
          value={code} onChange={e => setCode(e.target.value)}
          className="w-24 font-mono text-xs border border-indigo-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          placeholder="Code"
        />
      </td>
      {/* Name + description + opening balance cell */}
      <td className="py-2 pr-2 align-top" colSpan={2}>
        <form onSubmit={submit} className="space-y-1">
          <div className="flex items-center gap-2">
            <input data-lpignore="true"
              ref={nameRef}
              value={name} onChange={e => setName(e.target.value)}
              className="flex-1 text-sm border border-indigo-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
              placeholder="Account name…"
              onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
            />
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${typeColors[state.type] ?? ''}`}>
              {state.type}
            </span>
          </div>
          {showGroupSelector ? (
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-gray-500">Account Group</label>
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value ? Number(e.target.value) : '')}
                className={`w-full text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
                  !groupId ? 'border-indigo-300 text-gray-400' : 'border-indigo-200 text-gray-700'
                }`}
              >
                <option value="">Select account group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setGroupId(autoGroupId)
                  setShowGroupSelector(false)
                }}
                className="text-[11px] text-gray-500 hover:text-gray-700"
              >
                Use default group
              </button>
            </div>
          ) : (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setShowGroupSelector(true)}
                className="text-[11px] text-indigo-600 hover:text-indigo-800"
              >
                Assign different group
              </button>
            </div>
          )}
          <input data-lpignore="true"
            value={description} onChange={e => setDescription(e.target.value)}
            className="w-full text-xs border border-indigo-100 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 text-gray-500"
            placeholder="Description / notes (optional)"
          />
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <span>Opening Bal:</span>
            <input data-lpignore="true"
              type="number" value={openingBal} onChange={e => setOpeningBal(e.target.value)}
              className="w-24 font-mono text-xs border border-indigo-200 rounded px-2 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </label>
        </form>
      </td>
      {/* Actions cell */}
      <td className="py-2 align-top" colSpan={2}>
        <div className="flex items-center gap-1">
          <button onClick={submit} disabled={mutation.isPending}
            className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50" title="Save (Enter)">
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={13} />}
          </button>
          <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Cancel (Esc)">
            <X size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ─── Accounts Tab ──────────────────────────────────────────────────────────

function AccountsTab() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const { data, isLoading } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])),
  })

  const [inlineAdd,    setInlineAdd]    = useState<InlineAddState | null>(null)
  const [editingId,    setEditingId]    = useState<number | null>(null)
  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set())

  const allAccounts = data ?? []

  const defaultParentIdByType = useMemo(() => {
    const byCode = new Map(allAccounts.map(a => [a.code, a.id]))
    return {
      asset: byCode.get('1000') ?? null,
      liability: byCode.get('2000') ?? null,
      equity: byCode.get('3000') ?? null,
      revenue: byCode.get('4000') ?? null,
      expense: byCode.get('5000') ?? null,
    } as const
  }, [allAccounts])

  const controlHeaderCodes = new Set(['1000', '2000', '3000', '4000', '5000'])
  const isControlHeaderAccount = (a: Account) =>
    a.is_system && a.parent === null && controlHeaderCodes.has(a.code)

  const listAccounts = allAccounts.filter(a => !isControlHeaderAccount(a))

  const expandableAccountIds = useMemo(() => {
    const parentIds = new Set<number>()
    for (const a of listAccounts) {
      if (a.parent !== null) parentIds.add(a.parent)
    }
    return Array.from(parentIds)
  }, [listAccounts])

  const allExpanded =
    expandableAccountIds.length > 0 &&
    expandableAccountIds.every(id => expandedAccounts.has(id))

  // ── Client-side search + filter ──────────────────────────────────────
  const visibleAccounts = listAccounts.filter(a => {
    if (activeFilter === 'active'   && !a.is_active) return false
    if (activeFilter === 'inactive' &&  a.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) ||
             (a.description ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiClient.delete(`${ACCOUNTING.ACCOUNTS}${id}/`),
    onSuccess: () => {
      toast.success('Account deleted')
      qc.invalidateQueries({ queryKey: ['accounts'] })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Cannot delete this account'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      apiClient.patch(`${ACCOUNTING.ACCOUNTS}${id}/`, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounts'] }),
    onError: () => toast.error('Failed to update account status'),
  })

  function confirmDelete(a: Account) {
    if (a.is_system) { toast.error('System accounts cannot be deleted.'); return }
    confirm({
      title: 'Delete Account',
      message: `Delete "${a.code} \u2013 ${a.name}"? This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    }).then(ok => { if (ok) deleteMutation.mutate(a.id) })
  }

  function openChild(a: Account, depth: number) {
    setInlineAdd({
      parentId: a.id,
      resolvedParentId: a.id,
      type: a.type,
      depth,
      suggestedCode: nextChildCode(a.id, a.code, allAccounts),
    })
  }

  function openRoot(type: string) {
    const resolvedParentId = defaultParentIdByType[type as keyof typeof defaultParentIdByType] ?? null
    const parentCode = resolvedParentId ? (allAccounts.find(a => a.id === resolvedParentId)?.code ?? '') : ''
    setInlineAdd({
      // Keep root add row visible even when control parent (1000/2000/...) is hidden.
      parentId: null,
      resolvedParentId,
      type,
      depth: 0,
      suggestedCode: resolvedParentId && parentCode
        ? nextChildCode(resolvedParentId, parentCode, allAccounts)
        : nextRootCode(type, allAccounts),
    })
  }

  // ── CSV export ───────────────────────────────────────────────────────
  function exportCSV() {
    const header = ['Code', 'Account Name', 'Type', 'Parent Code', 'Description', 'Opening Balance', 'Current Balance', 'Active']
    const rows = allAccounts.map(a => {
      const parent = allAccounts.find(p => p.id === a.parent)
      return [
        a.code,
        `"${a.name.replace(/"/g, '""')}"`,
        a.type,
        parent?.code ?? '',
        `"${(a.description ?? '').replace(/"/g, '""')}"`,
        a.opening_balance ?? '0',
        a.balance ?? '0',
        a.is_active ? 'Yes' : 'No',
      ].join(',')
    })
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = 'chart-of-accounts.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  const typeOrder: Array<[string, string, string]> = [
    ['asset',     'Asset',     'text-blue-700   bg-blue-50   border-blue-100'],
    ['liability', 'Liability', 'text-orange-700 bg-orange-50 border-orange-100'],
    ['equity',    'Equity',    'text-purple-700 bg-purple-50 border-purple-100'],
    ['revenue',   'Revenue',   'text-green-700  bg-green-50  border-green-100'],
    ['expense',   'Expense',   'text-red-700    bg-red-50    border-red-100'],
  ]

  const protectedCoreCodes = new Set([
    '1000', '1100', '1150', '1200', '1300',
    '2000', '2100', '2200', '2300',
    '3000', '3100',
    '4000', '4100', '4200',
    '5000', '5100', '5200', '5300',
  ])

  // Build tree per type-section (using visibleAccounts for search, but tree needs parent hierarchy from allAccounts)
  function renderSection(type: string, label: string, sectionCls: string) {
    // When searching, show flat list; tree requires all parents to be visible
    const sectionAll     = listAccounts.filter(a => a.type === type)
    const sectionVisible = visibleAccounts.filter(a => a.type === type)
    const childParentIds = new Set(sectionAll.filter(a => a.parent !== null).map(a => a.parent as number))

    const isHiddenByAncestor = (acct: Account, depth: number) => {
      // Keep root (depth 0) visible.
      // All child levels are collapsed by default and revealed only when
      // their direct parent is expanded.
      if (depth < 1) return false
      const parentId = acct.parent
      if (!parentId) return false
      return !expandedAccounts.has(parentId)
    }

    const treeItems      = search
      ? sectionVisible.map(a => ({ account: a, depth: 0 }))
      : buildAccountTree(sectionAll).filter(({ account: a }) =>
          activeFilter === 'active'   ? a.is_active :
          activeFilter === 'inactive' ? !a.is_active : true)

    const isRootInline = inlineAdd?.parentId === null && inlineAdd?.type === type
    if (!treeItems.length && !isRootInline) return null

    return (
      <div key={type} className={`bg-white rounded-xl border overflow-hidden ${sectionCls}`}>
        {/* Section header */}
        <div className={`px-5 py-2.5 border-b flex items-center justify-between ${sectionCls}`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCollapsedSections(prev => {
                const next = new Set(prev)
                if (next.has(type)) next.delete(type)
                else next.add(type)
                return next
              })}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title={collapsedSections.has(type) ? 'Expand section' : 'Collapse section'}
            >
              <ChevronDown size={14} className={`transition-transform ${collapsedSections.has(type) ? '-rotate-90' : ''}`} />
            </button>
            <span className="font-semibold text-sm">{label} Accounts</span>
            <span className="text-xs text-gray-400 font-normal tabular-nums">
              ({treeItems.length} {activeFilter !== 'all' ? activeFilter : ''})
            </span>
          </div>
          <button
            onClick={() => isRootInline ? setInlineAdd(null) : openRoot(type)}
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1 rounded hover:bg-indigo-50">
            <Plus size={12} /> Add {label}
          </button>
        </div>

        {collapsedSections.has(type) ? null : (

        <table className="w-full text-sm">
          <thead className="border-b border-gray-50">
            <tr>
              {['Code', 'Account Name', 'Parent', 'Balance', ''].map((h, i) => (
                <th key={i} className="px-4 py-2 text-left text-xs text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {/* Root-level inline add row */}
            {isRootInline && (
              <InlineAddRow
                state={inlineAdd!}
                allAccounts={allAccounts}
                onSave={() => setInlineAdd(null)}
                onCancel={() => setInlineAdd(null)}
              />
            )}

            {treeItems.map(({ account: a, depth }) => {
              if (!search && isHiddenByAncestor(a, depth)) return null
              const isChildInline = inlineAdd?.parentId === a.id
              const isEditing     = editingId === a.id
              const canAddChild   = depth < 5
              const isProtectedCore = a.is_system && protectedCoreCodes.has(a.code)
              const parentAcc     = listAccounts.find(p => p.id === a.parent)
              const hasChildren   = childParentIds.has(a.id)
              const isExpanded    = expandedAccounts.has(a.id)
              return (
                <Fragment key={a.id}>
                  {isEditing ? (
                    <InlineEditRow
                      account={a}
                      onSave={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr className={`group ${a.is_active ? 'hover:bg-gray-50/60' : 'bg-gray-50/40 opacity-60 hover:opacity-80'}`}>
                      {/* Code */}
                      <td className="py-2 font-mono text-xs text-indigo-600"
                        style={{ paddingLeft: `${16 + depth * 20}px` }}>
                        <button
                          type="button"
                          disabled={!hasChildren}
                          onClick={() => {
                            if (!hasChildren) return
                            setExpandedAccounts(prev => {
                              const next = new Set(prev)
                              if (next.has(a.id)) next.delete(a.id)
                              else next.add(a.id)
                              return next
                            })
                          }}
                          className={`mr-1 inline-flex items-center justify-center ${hasChildren ? 'text-gray-400 hover:text-indigo-600' : 'text-transparent cursor-default'}`}
                          title={hasChildren ? (isExpanded ? 'Collapse sub-accounts' : 'Expand sub-accounts') : undefined}
                        >
                          <ChevronRight size={12} className={`transition-transform ${hasChildren && isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                        {a.code}
                      </td>
                      {/* Name + description */}
                      <td className="px-3 py-2" style={{ paddingLeft: `${8 + depth * 4}px` }}>
                        <div className="flex items-center gap-1.5">
                          <span className={a.is_active ? 'text-gray-700' : 'text-gray-400 line-through'}>{a.name}</span>
                          {!a.is_active && (
                            <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">inactive</span>
                          )}
                        </div>
                        {a.description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs" title={a.description}>{a.description}</p>
                        )}
                      </td>
                      {/* Parent code */}
                      <td className="px-4 py-2 text-xs text-gray-400">
                        {parentAcc ? parentAcc.code : '\u2014'}
                      </td>
                      {/* Balance */}
                      <td className="px-4 py-2 text-gray-800 font-medium text-xs tabular-nums">
                        {npr(a.balance)}
                      </td>
                      {/* Actions */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Active / Inactive toggle */}
                          <button
                            title={isProtectedCore ? 'Core system account status is locked' : (a.is_active ? 'Deactivate account' : 'Activate account')}
                            onClick={() => {
                              if (isProtectedCore) {
                                toast.error('Core system account status is locked.')
                                return
                              }
                              toggleActiveMutation.mutate({ id: a.id, is_active: !a.is_active })
                            }}
                            disabled={isProtectedCore}
                            className={`rounded p-1 transition-colors ${
                              isProtectedCore
                                ? 'text-gray-300 cursor-not-allowed'
                                : a.is_active
                                ? 'text-green-500 hover:text-green-700 hover:bg-green-50'
                                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                            }`}>
                            {a.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          {canAddChild && (
                            <button
                              title={`Add sub-account under ${a.code}`}
                              onClick={() => isChildInline ? setInlineAdd(null) : openChild(a, depth + 1)}
                              className="text-indigo-400 hover:text-indigo-700 hover:bg-indigo-50 rounded p-1">
                              <Plus size={13} />
                            </button>
                          )}
                          <button
                            title="Open ledger drill"
                            onClick={() => {
                              const fy = fiscalYearAdParams(currentFiscalYear())
                              navigate(buildAccountingTabUrl('ledger', {
                                account_code: a.code,
                                date_from: fy.date_from,
                                date_to: new Date().toISOString().slice(0, 10),
                                auto_run: 1,
                              }))
                            }}
                            className="text-gray-400 hover:text-indigo-700 hover:bg-indigo-50 rounded p-1"
                          >
                            <BookOpen size={12} />
                          </button>
                          <button
                            title={isProtectedCore ? 'Core system account is locked' : 'Edit account'}
                            onClick={() => {
                              if (isProtectedCore) {
                                toast.error('Core system account is locked.')
                                return
                              }
                              setInlineAdd(null)
                              setEditingId(a.id)
                            }}
                            disabled={isProtectedCore}
                            className={`rounded p-1 ${isProtectedCore ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}>
                            <Pencil size={12} />
                          </button>
                          {!a.is_system && (
                            <button
                              title="Delete account"
                              onClick={() => confirmDelete(a)}
                              disabled={deleteMutation.isPending}
                              className="text-gray-400 hover:text-red-600 hover:bg-red-50 rounded p-1 disabled:opacity-40">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline child add row */}
                  {isChildInline && (
                    <InlineAddRow
                      state={inlineAdd!}
                      allAccounts={allAccounts}
                      onSave={() => setInlineAdd(null)}
                      onCancel={() => setInlineAdd(null)}
                    />
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        )}
      </div>
    )
  }

  const totalAccounts  = listAccounts.length
  const activeCount    = listAccounts.filter(a =>  a.is_active).length
  const inactiveCount  = listAccounts.filter(a => !a.is_active).length

  return (
    <div className="space-y-4">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input data-lpignore="true"
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search code, name, or description…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>

        {/* Active filter */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {([['all', `All (${totalAccounts})`], ['active', `Active (${activeCount})`], ['inactive', `Inactive (${inactiveCount})`]] as const).map(([val, lbl]) => (
            <button key={val}
              onClick={() => setActiveFilter(val)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                activeFilter === val ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Export CSV */}
        <button
          onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors">
          <Download size={13} /> Export CSV
        </button>

        <button
          onClick={() => setExpandedAccounts(allExpanded ? new Set() : new Set(expandableAccountIds))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
          title={allExpanded ? 'Collapse all account rows' : 'Expand all account rows'}
        >
          {allExpanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>

      </div>

      {/* ── Legend ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {typeOrder.map(([type, label, cls]) => {
          const col = listAccounts.filter(a => a.type === type)
          return (
            <div key={type} className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${cls}`}>
              <span>{label}</span>
              <span className="opacity-60">({col.length})</span>
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
          <Info size={12} />
          <span>Click <BookOpen size={11} className="inline" /> to drill ledger · <Eye size={11} className="inline" /> to deactivate · <Pencil size={11} className="inline" /> to edit · <Plus size={11} className="inline" /> to add sub-account</span>
        </div>
      </div>

      {/* ── Account sections ────────────────────────────────────────── */}
      {isLoading ? <Spinner /> : (
        <div className="space-y-4">
          {typeOrder.map(([type, label, cls]) => renderSection(type, label, cls))}
          {!visibleAccounts.length && !isLoading && (
            <div className="bg-white border border-gray-200 rounded-xl py-12 text-center text-sm text-gray-400">
              No accounts match the current filter.
            </div>
          )}
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
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Type *">
            <select value={type} onChange={e => setType(e.target.value as 'incoming' | 'outgoing')} className={selectCls}>
              <option value="incoming">Cash In (Incoming)</option>
              <option value="outgoing">Cash Out (Outgoing)</option>
            </select>
          </Field>
          <Field label="Amount (NPR) *">
            <input data-lpignore="true" type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputCls} required />
          </Field>
          <Field label="Reference">
            <input data-lpignore="true" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="e.g. Receipt #, Voucher #" className={inputCls} />
          </Field>
        </div>
        <Field label="Note">
          <input data-lpignore="true" value={note} onChange={e => setNote(e.target.value)}
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
      qc.invalidateQueries({ queryKey: ['accounts'] })
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
            <input data-lpignore="true" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Main Operating Account" className={inputCls} required />
          </Field>
          <Field label="Bank Name *">
            <input data-lpignore="true" value={bankName} onChange={e => setBankName(e.target.value)}
              placeholder="e.g. Nabil Bank" className={inputCls} required />
          </Field>
          <Field label="Account Number *">
            <input data-lpignore="true" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
              placeholder="00100012345678" className={inputCls} required />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
              <option value="NPR">NPR — Nepali Rupee</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </Field>
          <Field label="Opening Balance" hint="Current balance at the time of adding this account">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={openingBalance}
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

// ─── Bank Account Edit Modal ────────────────────────────────────────────────

function BankAccountEditModal({ bank, onClose }: { bank: BankAccount; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: bank.name,
    bank_name: bank.bank_name,
    account_number: bank.account_number,
    currency: bank.currency,
    opening_balance: bank.opening_balance,
  })
  const mutateSave = useMutation({
    mutationFn: (d: typeof form) => apiClient.patch(ACCOUNTING.BANK_ACCOUNT_DETAIL(bank.id), d),
    onSuccess: () => { toast.success('Bank account updated'); qc.invalidateQueries({ queryKey: ['bank-accounts'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); onClose() },
    onError: () => toast.error('Update failed'),
  })
  return (
    <Modal title="Edit Bank Account" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mutateSave.mutate(form) }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account Label *">
            <input data-lpignore="true" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} required />
          </Field>
          <Field label="Bank Name *">
            <input data-lpignore="true" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className={inputCls} required />
          </Field>
          <Field label="Account Number">
            <input data-lpignore="true" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Currency">
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={selectCls}>
              <option value="NPR">NPR — Nepali Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </Field>
          <Field label="Opening Balance" hint="Balance when account was first created">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={form.opening_balance}
              onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutateSave.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutateSave.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bank Accounts + Cash Ledger Tab ─────────────────────────────────────

function BanksTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [subTab, setSubTab] = useState<'banks' | 'statement' | 'cash'>('banks')
  const [showCreateBank, setShowCreateBank] = useState(false)
  const [showCreateCash, setShowCreateCash] = useState(false)
  const [editBank, setEditBank] = useState<BankAccount | null>(null)
  const [selectedBankId, setSelectedBankId] = useState<string>('')
  const [statementSearch, setStatementSearch] = useState('')
  const [cashSearch, setCashSearch] = useState('')

  const mutateDeleteBank = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.BANK_ACCOUNT_DETAIL(id)),
    onSuccess: () => { toast.success('Bank account deleted'); qc.invalidateQueries({ queryKey: ['bank-accounts'] }); qc.invalidateQueries({ queryKey: ['accounts'] }) },
    onError: () => toast.error('Delete failed'),
  })

  const { data: bankData, isLoading: bankLoading } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=200').then(r => toPage<BankAccount>(r.data)),
  })

  const { fyYear } = useFY()
  // Cash ledger (method=cash, all entries)
  const { data: cashData, isLoading: cashLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['cash-ledger', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?method=cash&page_size=500&ordering=date`, fyYear)).then(r => toPage<Payment>(r.data)),
    enabled: subTab === 'cash',
  })

  // Bank statement — payments for the selected bank account, oldest first for running balance
  const { data: stmtData, isLoading: stmtLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['bank-statement', selectedBankId, fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?bank_account=${selectedBankId}&page_size=500&ordering=date`, fyYear)).then(r => toPage<Payment>(r.data)),
    enabled: subTab === 'statement' && !!selectedBankId,
  })

  const selectedBank = bankData?.results?.find(b => String(b.id) === selectedBankId)

  // Compute running balance from opening balance
  const stmtRows = (() => {
    if (!stmtData?.results || !selectedBank) return []
    let balance = parseFloat(selectedBank.opening_balance || '0')
    return stmtData.results.map(p => {
      const amt = parseFloat(p.amount || '0')
      if (p.type === 'incoming') balance += amt
      else balance -= amt
      return { ...p, runningBalance: balance }
    })
  })()

  const filteredStmtRows = useMemo(() => {
    const q = statementSearch.trim().toLowerCase()
    if (!q) return stmtRows
    return stmtRows.filter(p =>
      String(p.payment_number ?? '').toLowerCase().includes(q) ||
      String(p.reference ?? '').toLowerCase().includes(q) ||
      String(p.invoice_number ?? '').toLowerCase().includes(q) ||
      String(p.bill_number ?? '').toLowerCase().includes(q) ||
      String(p.method ?? '').toLowerCase().includes(q) ||
      String(p.type ?? '').toLowerCase().includes(q),
    )
  }, [stmtRows, statementSearch])

  const stmtIn  = stmtRows.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const stmtOut = stmtRows.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)

  // Cash summary (oldest-first for running balance)
  const cashRowsChron = cashData?.results ?? []
  const cashIn  = cashRowsChron.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashOut = cashRowsChron.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashNet = cashIn - cashOut
  const cashRows = (() => {
    let bal = 0
    return [...cashRowsChron].map(p => {
      const amt = parseFloat(p.amount || '0')
      if (p.type === 'incoming') bal += amt
      else bal -= amt
      return { ...p, runningBalance: bal }
    })
  })()

  const filteredCashRows = useMemo(() => {
    const q = cashSearch.trim().toLowerCase()
    if (!q) return cashRows
    return cashRows.filter(p =>
      String(p.payment_number ?? '').toLowerCase().includes(q) ||
      String(p.reference ?? '').toLowerCase().includes(q) ||
      String(p.invoice_number ?? '').toLowerCase().includes(q) ||
      String(p.bill_number ?? '').toLowerCase().includes(q) ||
      String(p.method ?? '').toLowerCase().includes(q) ||
      String(p.type ?? '').toLowerCase().includes(q),
    )
  }, [cashRows, cashSearch])

  const stmtInFiltered = filteredStmtRows.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const stmtOutFiltered = filteredStmtRows.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashInFiltered = filteredCashRows.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashOutFiltered = filteredCashRows.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashNetFiltered = cashInFiltered - cashOutFiltered

  return (
    <div className="space-y-4">
      {showCreateBank && <BankAccountCreateModal onClose={() => setShowCreateBank(false)} />}
      {showCreateCash && <CashPaymentCreateModal onClose={() => setShowCreateCash(false)} />}
      {editBank && <BankAccountEditModal bank={editBank} onClose={() => setEditBank(null)} />}

      {/* Sub-tab switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {([
            { key: 'banks',     label: 'Bank Accounts',   Icon: Building2     },
            { key: 'statement', label: 'Bank Statement',  Icon: BookOpen       },
            { key: 'cash',      label: 'Cash Ledger',     Icon: Coins          },
          ] as { key: 'banks' | 'statement' | 'cash'; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setSubTab(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                subTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <span className="flex items-center gap-1.5"><Icon size={14} />{label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
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
      </div>

      {/* ── Bank Accounts ── */}
      {subTab === 'banks' && (
        bankLoading ? <Spinner /> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Bank', 'Account No.', 'Currency', 'Opening Balance', 'Current Balance', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bankData?.results?.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <button onClick={() => { setSelectedBankId(String(b.id)); setSubTab('statement') }}
                        className="text-indigo-600 hover:underline font-medium">{b.name}</button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{b.bank_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.account_number}</td>
                    <td className="px-4 py-3 text-gray-500">{b.currency}</td>
                    <td className="px-4 py-3">{npr(b.opening_balance)}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-700">{npr(b.current_balance)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setSelectedBankId(String(b.id)); setSubTab('statement') }}
                          title="View Statement" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><BookOpen size={13} /></button>
                        {can('can_manage_accounting') && (
                          <>
                            <button onClick={() => setEditBank(b)} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} /></button>
                            {b.linked_account_is_system ? (
                              <button title="System-linked bank account cannot be deleted" className="p-1 text-gray-300 cursor-not-allowed rounded transition-colors" disabled><Trash2 size={13} /></button>
                            ) : (
                              <button onClick={() => confirm({ title: 'Delete Bank Account', message: `Delete "${b.name}"? Linked payments and reconciliations may be affected.`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeleteBank.mutate(b.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!bankData?.results?.length && <EmptyState message="No bank accounts configured." />}
          </div>
        )
      )}

      {/* ── Bank Statement ── */}
      {subTab === 'statement' && (
        <div className="space-y-4">
          {/* Bank picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-600">Bank Account:</label>
            <select
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[240px]"
            >
              <option value="">— Select a bank account —</option>
              {bankData?.results?.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
              ))}
            </select>
          </div>

          {!selectedBankId ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building2 size={36} className="mb-3 text-gray-300" />
              <p className="text-sm">Select a bank account to view its cash in / cash out statement</p>
            </div>
          ) : stmtLoading ? <Spinner /> : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Opening Balance</p>
                  <p className="text-xl font-bold text-gray-700">{npr(selectedBank?.opening_balance ?? '0')}</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp size={13} /> Cash In</p>
                  <p className="text-xl font-bold text-green-700">{npr(stmtIn.toFixed(2))}</p>
                  <p className="text-xs text-green-600 mt-0.5">{stmtRows.filter(p => p.type === 'incoming').length} transaction(s)</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown size={13} /> Cash Out</p>
                  <p className="text-xl font-bold text-red-700">{npr(stmtOut.toFixed(2))}</p>
                  <p className="text-xs text-red-600 mt-0.5">{stmtRows.filter(p => p.type === 'outgoing').length} transaction(s)</p>
                </div>
                <div className={`border rounded-xl p-4 ${(stmtRows[stmtRows.length - 1]?.runningBalance ?? 0) >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Current Balance</p>
                  <p className={`text-xl font-bold ${(stmtRows[stmtRows.length - 1]?.runningBalance ?? 0) >= 0 ? 'text-indigo-700' : 'text-orange-600'}`}>
                    {npr((stmtRows[stmtRows.length - 1]?.runningBalance ?? parseFloat(selectedBank?.opening_balance ?? '0')).toFixed(2))}
                  </p>
                </div>
              </div>

              {/* Statement table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">{selectedBank?.name} — {selectedBank?.bank_name}</h4>
                  <span className="text-xs text-gray-400">A/C: {selectedBank?.account_number}</span>
                </div>
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="relative max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input data-lpignore="true"
                      value={statementSearch}
                      onChange={e => setStatementSearch(e.target.value)}
                      placeholder="Search payment, reference, invoice, bill..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Date', 'Payment #', 'Method', 'Reference', 'Invoice', 'Bill', 'Cash In', 'Cash Out', 'Balance'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {/* Opening balance row */}
                      <tr className="bg-gray-50/70">
                        <td colSpan={8} className="px-4 py-2 text-xs text-gray-500 italic">Opening Balance</td>
                        <td className="px-4 py-2 text-xs font-semibold text-gray-700">{npr(selectedBank?.opening_balance ?? '0')}</td>
                      </tr>
                      {filteredStmtRows.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">{stmtRows.length === 0 ? 'No transactions for this bank account yet.' : 'No transactions match your search.'}</td></tr>
                      ) : filteredStmtRows.map(p => (
                        <tr key={p.id} className={`hover:bg-gray-50/50 ${p.type === 'incoming' ? 'bg-green-50/20' : 'bg-red-50/20'}`}>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(p.date)}</td>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs capitalize">{p.method.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice_number ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.bill_number ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-green-700">
                            {p.type === 'incoming' ? npr(p.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-red-600">
                            {p.type === 'outgoing' ? npr(p.amount) : '—'}
                          </td>
                          <td className={`px-4 py-3 font-semibold whitespace-nowrap ${p.runningBalance >= 0 ? 'text-gray-800' : 'text-orange-600'}`}>
                            {npr(p.runningBalance.toFixed(2))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredStmtRows.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Totals</td>
                          <td className="px-4 py-3 font-bold text-green-700">{npr(stmtInFiltered.toFixed(2))}</td>
                          <td className="px-4 py-3 font-bold text-red-600">{npr(stmtOutFiltered.toFixed(2))}</td>
                          <td className="px-4 py-3 font-bold text-indigo-700">{npr((filteredStmtRows[filteredStmtRows.length - 1]?.runningBalance ?? 0).toFixed(2))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
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
                  {cashRowsChron.filter(p => p.type === 'incoming').length} transaction(s)
                </p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700 text-xs font-semibold uppercase tracking-wide mb-1">
                  <TrendingDown size={14} /> Cash Out
                </div>
                <p className="text-2xl font-bold text-red-700">{npr(cashOut.toFixed(2))}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {cashRowsChron.filter(p => p.type === 'outgoing').length} transaction(s)
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

            {/* Cash statement table with running balance */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="relative max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input data-lpignore="true"
                    value={cashSearch}
                    onChange={e => setCashSearch(e.target.value)}
                    placeholder="Search payment, reference, invoice, bill..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date', 'Payment #', 'Type', 'Reference', 'Invoice', 'Bill', 'Cash In', 'Cash Out', 'Balance'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredCashRows.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">{cashRows.length === 0 ? 'No cash transactions recorded. Click \'Record Cash\' to add one.' : 'No transactions match your search.'}</td></tr>
                    ) : filteredCashRows.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-50/50 ${p.type === 'incoming' ? 'bg-green-50/20' : 'bg-red-50/20'}`}>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(p.date)}</td>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                        <td className="px-4 py-3"><Badge status={p.type} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice_number ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.bill_number ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-green-700">
                          {p.type === 'incoming' ? npr(p.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-red-600">
                          {p.type === 'outgoing' ? npr(p.amount) : '—'}
                        </td>
                        <td className={`px-4 py-3 font-semibold whitespace-nowrap ${p.runningBalance >= 0 ? 'text-gray-800' : 'text-orange-600'}`}>
                          {npr(p.runningBalance.toFixed(2))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredCashRows.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Totals</td>
                        <td className="px-4 py-3 font-bold text-green-700">{npr(cashInFiltered.toFixed(2))}</td>
                        <td className="px-4 py-3 font-bold text-red-600">{npr(cashOutFiltered.toFixed(2))}</td>
                        <td className="px-4 py-3 font-bold text-indigo-700">{npr(cashNetFiltered.toFixed(2))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [subTab, setSubTab] = useState<'payslips' | 'coins' | 'salaries'>('payslips')
  const [showGenerate, setShowGenerate] = useState(false)
  const [editPayslip, setEditPayslip] = useState<Payslip | null>(null)
  const [markPaidPayslip, setMarkPaidPayslip] = useState<Payslip | null>(null)
  const [payslipReceiptPayment, setPayslipReceiptPayment] = useState<Payment | null>(null)
  const [expandedPs, setExpandedPs] = useState<number | null>(null)

  // Salary profile form state — declared early so queries below can reference showSalaryForm
  const [showSalaryForm, setShowSalaryForm] = useState(false)
  const [editSalary, setEditSalary] = useState<StaffSalaryProfile | null>(null)
  const [salaryForm, setSalaryForm] = useState({ staff: '', base_salary: '0', tds_rate: '10', bonus_default: '0', effective_from: new Date().toISOString().slice(0, 10), notes: '' })
  const [selectedCoinId, setSelectedCoinId] = useState<number | null>(null)

  const { fyYear } = useFY()
  const { data: payslips, isLoading: psLoading } = useQuery<ApiPage<Payslip>>({
    queryKey: ['payslips', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.PAYSLIPS, fyYear)).then(r => toPage<Payslip>(r.data)),
  })
  const [coinStatusFilter, setCoinStatusFilter] = useState<'' | 'pending' | 'approved'>('pending')
  const [coinSourceFilter, setCoinSourceFilter] = useState<'' | 'ticket'>('')
  const { data: coins, isLoading: coinsLoading } = useQuery<ApiPage<CoinTx>>({
    queryKey: ['coins', coinStatusFilter, coinSourceFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (coinStatusFilter) params.set('status', coinStatusFilter)
      if (coinSourceFilter) params.set('source_type', coinSourceFilter)
      const qs = params.toString()
      return apiClient.get(qs ? `${ACCOUNTING.COINS}?${qs}` : ACCOUNTING.COINS).then(r => toPage<CoinTx>(r.data))
    },
  })
  // Staff list for the generate modal and salary form
  const { data: staffList = [] } = useQuery<{ id: number; full_name: string; display_name: string; email: string }[]>({
    queryKey: ['staff-list'],
    queryFn: () => apiClient.get(STAFF.LIST + '?page_size=500').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
    enabled: showGenerate || showSalaryForm,
  })

  // Salary profiles for the Staff Salaries sub-tab and generate auto-fill
  const { data: salaryProfiles, isLoading: salaryLoading } = useQuery<ApiPage<StaffSalaryProfile>>({
    queryKey: ['salary-profiles'],
    queryFn: () => apiClient.get(ACCOUNTING.SALARY_PROFILES + '?page_size=200').then(r => toPage<StaffSalaryProfile>(r.data)),
  })
  // Bank accounts for Mark Paid modal
  const { data: bankAccountsList = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts-payslip'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => r.data?.data ?? r.data?.results ?? []),
    enabled: !!markPaidPayslip,
  })

  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.PAYSLIP_ISSUE(id)),
    onSuccess: () => { toast.success('Payslip issued'); qc.invalidateQueries({ queryKey: ['payslips'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutatePay = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { payment_method: string; bank_account?: number | null } }) =>
      apiClient.post(ACCOUNTING.PAYSLIP_MARK_PAID(id), payload),
    onSuccess: (res) => {
      toast.success('Payslip marked as paid')
      setMarkPaidPayslip(null)
      if (res.data?.payment) setPayslipReceiptPayment(res.data.payment)
      qc.invalidateQueries({ queryKey: ['payslips'] })
    },
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
  const mutateDeletePayslip = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.PAYSLIP_DETAIL(id)),
    onSuccess: () => { toast.success('Payslip deleted'); qc.invalidateQueries({ queryKey: ['payslips'] }) },
    onError: () => toast.error('Delete failed'),
  })

  // Salary profile CRUD
  const mutateSalaryCreate = useMutation({
    mutationFn: (d: typeof salaryForm) => apiClient.post(ACCOUNTING.SALARY_PROFILES, { ...d, tds_rate: (parseFloat(d.tds_rate) / 100).toFixed(4) }),
    onSuccess: () => { toast.success('Salary profile saved'); qc.invalidateQueries({ queryKey: ['salary-profiles'] }); setShowSalaryForm(false); setSalaryForm({ staff: '', base_salary: '0', tds_rate: '10', bonus_default: '0', effective_from: new Date().toISOString().slice(0, 10), notes: '' }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Save failed'),
  })
  const mutateSalaryUpdate = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof salaryForm }) => apiClient.patch(ACCOUNTING.SALARY_PROFILE_DETAIL(id), { ...d, tds_rate: (parseFloat(d.tds_rate) / 100).toFixed(4) }),
    onSuccess: () => { toast.success('Salary profile updated'); qc.invalidateQueries({ queryKey: ['salary-profiles'] }); setEditSalary(null) },
    onError: () => toast.error('Update failed'),
  })
  const mutateSalaryDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.SALARY_PROFILE_DETAIL(id)),
    onSuccess: () => { toast.success('Salary profile deleted'); qc.invalidateQueries({ queryKey: ['salary-profiles'] }) },
    onError: () => toast.error('Delete failed'),
  })

  // Generate payslip modal state
  const today = new Date().toISOString().slice(0, 10)
  const fyrStart = fiscalYearAdParams(currentFiscalYear()).date_from
  const [genForm, setGenForm] = useState({
    staff: '', period_start: fyrStart, period_end: today,
    base_salary: '0', bonus: '0', deductions: '0', tds_rate: '0', employee_pan: '',
  })
  // Auto-fill generate form from salary profile when staff is selected
  const selectedStaffId = genForm.staff ? parseInt(genForm.staff) : null
  const matchedProfile = salaryProfiles?.results?.find(p => p.staff === selectedStaffId)
  useEffect(() => {
    if (matchedProfile) {
      setGenForm(f => ({
        ...f,
        base_salary: matchedProfile.base_salary,
        bonus: matchedProfile.bonus_default,
        tds_rate: (parseFloat(matchedProfile.tds_rate) * 100).toFixed(2),
      }))
    }
  }, [matchedProfile?.id])

  const mutateGenerate = useMutation({
    mutationFn: (payload: typeof genForm & { staff: string }) =>
      apiClient.post(ACCOUNTING.PAYSLIP_GENERATE, {
        ...payload,
        // Backend stores/expects tds_rate as a decimal fraction (0.10 = 10%)
        tds_rate: (parseFloat(payload.tds_rate) / 100).toFixed(4),
      }),
    onSuccess: () => {
      toast.success('Payslip generated')
      qc.invalidateQueries({ queryKey: ['payslips'] })
      qc.invalidateQueries({ queryKey: ['tds'] })
      setShowGenerate(false)
      setGenForm({ staff: '', period_start: fyrStart, period_end: today, base_salary: '0', bonus: '0', deductions: '0', tds_rate: '0', employee_pan: '' })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to generate payslip'),
  })

  return (
    <div className="space-y-4">
      {editPayslip && <PayslipEditModal ps={editPayslip} onClose={() => setEditPayslip(null)} />}
      {markPaidPayslip && (
        <MarkPaidModal
          payslip={markPaidPayslip}
          bankAccounts={bankAccountsList}
          onClose={() => setMarkPaidPayslip(null)}
          onSubmit={(method, bankId) => mutatePay.mutate({ id: markPaidPayslip.id, payload: { payment_method: method, bank_account: bankId } })}
          isPending={mutatePay.isPending}
        />
      )}
      {payslipReceiptPayment && (
        <TransactionReceiptModal payment={payslipReceiptPayment} onClose={() => setPayslipReceiptPayment(null)} />
      )}
      {/* Sub-tab navigation + Generate button */}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-2">
          {(['payslips', 'coins', 'salaries'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'payslips' ? 'Payslips' : t === 'coins' ? 'Coin Transactions' : 'Staff Salaries'}
            </button>
          ))}
        </div>
        {subTab === 'payslips' && (
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition mb-1"
          >
            <Plus size={13} /> Generate Payslip
          </button>
        )}
        {subTab === 'salaries' && can('can_manage_accounting') && (
          <button
            onClick={() => { setSalaryForm({ staff: '', base_salary: '0', tds_rate: '10', bonus_default: '0', effective_from: new Date().toISOString().slice(0, 10), notes: '' }); setShowSalaryForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition mb-1"
          >
            <Plus size={13} /> Add Salary Profile
          </button>
        )}
      </div>

      {/* Generate Payslip Modal */}
      {showGenerate && (
        <Modal title="Generate Payslip" onClose={() => setShowGenerate(false)}>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              if (!genForm.staff) { toast.error('Select a staff member'); return }
              mutateGenerate.mutate(genForm)
            }}
          >
            <Field label="Staff Member *">
              <select
                className={inputCls}
                value={genForm.staff}
                onChange={e => setGenForm(f => ({ ...f, staff: e.target.value }))}
                required
              >
                <option value="">— Select staff —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.email}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Period Start *">
                <NepaliDatePicker value={genForm.period_start}
                  onChange={v => setGenForm(f => ({ ...f, period_start: v }))} required />
              </Field>
              <Field label="Period End *">
                <NepaliDatePicker value={genForm.period_end}
                  onChange={v => setGenForm(f => ({ ...f, period_end: v }))} required />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Base Salary">
                <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={genForm.base_salary}
                  onChange={e => setGenForm(f => ({ ...f, base_salary: e.target.value }))} />
              </Field>
              <Field label="Bonus">
                <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={genForm.bonus}
                  onChange={e => setGenForm(f => ({ ...f, bonus: e.target.value }))} />
              </Field>
              <Field label="Other Deductions">
                <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={genForm.deductions}
                  onChange={e => setGenForm(f => ({ ...f, deductions: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Salary TDS Rate %" hint="e.g. 10 for 10% on Base+Bonus. Leave 0 to skip.">
                <input data-lpignore="true" type="number" min="0" max="50" step="0.01" className={inputCls} value={genForm.tds_rate}
                  onChange={e => setGenForm(f => ({ ...f, tds_rate: e.target.value }))} />
              </Field>
              <Field label="Employee PAN (for TDS)">
                <input data-lpignore="true" type="text" className={inputCls} value={genForm.employee_pan} placeholder="e.g. 123456789"
                  onChange={e => setGenForm(f => ({ ...f, employee_pan: e.target.value }))} />
              </Field>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              The system aggregates all <strong>approved</strong> coin transactions within the period.
              <em> Net Pay = Base + Bonus + (Coins × Rate) − TDS − Other Deductions</em>.
              If TDS Rate &gt; 0, a TDS entry is auto-created in the TDS tab and TDS amount is added to deductions.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowGenerate(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={mutateGenerate.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                {mutateGenerate.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {subTab === 'payslips' && (psLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['','Staff','Period','Base Salary','Coins','Gross','TDS','Deductions','Net Pay','Cash Out','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payslips?.results?.map(p => {
                const hasBkdwn = (p.deduction_breakdown ?? []).length > 0
                const cashDiffers = p.cash_credit && p.cash_credit !== p.net_pay
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`hover:bg-gray-50/50 ${hasBkdwn ? 'cursor-pointer' : ''}`}
                      onClick={() => hasBkdwn && setExpandedPs(expandedPs === p.id ? null : p.id)}
                    >
                      <td className="px-3 py-3">
                        {hasBkdwn && <ChevronRight size={14} className={`text-gray-400 transition-transform ${expandedPs === p.id ? 'rotate-90' : ''}`} />}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{p.staff_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.period_start)} – {fmt(p.period_end)}</td>
                      <td className="px-4 py-3 text-gray-600">{npr(p.base_salary)}</td>
                      <td className="px-4 py-3 text-gray-600">{p.total_coins} × {p.coin_to_money_rate}</td>
                      <td className="px-4 py-3 text-gray-800">{npr(p.gross_amount)}</td>
                      <td className="px-4 py-3 text-orange-600">{Number(p.tds_amount) > 0 ? `(${npr(p.tds_amount)})` : '—'}</td>
                      <td className="px-4 py-3 text-red-600">{Number(p.deductions) > 0 ? `(${npr(p.deductions)})` : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-indigo-700">{npr(p.net_pay)}</td>
                      <td className="px-4 py-3">
                        {p.cash_credit
                          ? <span className={`font-medium ${cashDiffers ? 'text-amber-600' : 'text-green-700'}`} title={cashDiffers ? `Net pay ${npr(p.net_pay)} vs cash ${npr(p.cash_credit)}` : 'Matches net pay'}>{npr(p.cash_credit)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3"><Badge status={p.status} /></td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap items-center">
                          {p.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => setEditPayslip(p)} title="Edit Payslip" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} /></button>
                          )}
                          {p.status === 'draft' && (
                            <button onClick={() => mutateIssue.mutate(p.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                          )}
                          {p.status === 'issued' && (
                            <button onClick={() => setMarkPaidPayslip(p)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Mark Paid</button>
                          )}
                          {p.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => confirm({ title: 'Delete Payslip', message: `Delete payslip for ${p.staff_name}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeletePayslip.mutate(p.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedPs === p.id && (p.deduction_breakdown ?? []).length > 0 && (
                      <tr>
                        <td colSpan={12} className="px-10 py-3 bg-orange-50/50">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Deduction Breakdown</p>
                          <table className="text-xs w-auto">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left pb-1 pr-8">Label</th>
                                <th className="text-left pb-1 pr-8">Account</th>
                                <th className="text-right pb-1">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.deduction_breakdown.map((d, i) => (
                                <tr key={i} className="border-t border-orange-100">
                                  <td className="py-1 pr-8 text-gray-700">{d.label}</td>
                                  <td className="py-1 pr-8 text-gray-400 font-mono">{d.account_code || '—'}</td>
                                  <td className="py-1 text-right text-red-600">({npr(d.amount)})</td>
                                </tr>
                              ))}
                              <tr className="border-t border-orange-200 font-semibold">
                                <td className="py-1 pr-8 text-gray-600">Total Deductions</td>
                                <td></td>
                                <td className="py-1 text-right text-red-700">({npr(p.deductions)})</td>
                              </tr>
                            </tbody>
                          </table>
                          {p.cash_credit && (
                            <p className="mt-2 text-xs text-gray-500">
                              Cash / Bank Credit (Gross − TDS − Deductions): <span className="font-semibold text-green-700">{npr(p.cash_credit)}</span>
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {!payslips?.results?.length && <EmptyState message={'No payslips yet. Click "Generate Payslip" to create one from approved coin transactions.'} />}
        </div>
      ))}

      {subTab === 'coins' && (coinsLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coin Transactions</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {([['pending', ''] as const, ['approved', ''] as const, ['' , ''] as const] as ['' | 'pending' | 'approved', '' | 'ticket'][]).map(([s, src], i) => {
                const label = s === 'pending' && !src ? 'Pending' : s === 'approved' && !src ? 'Approved' : 'All'
                const active = coinStatusFilter === s && coinSourceFilter === src
                return (
                  <button key={i} onClick={() => { setCoinStatusFilter(s); setCoinSourceFilter(src) }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      active ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                    }`}>
                    {label}
                  </button>
                )
              })}
              <span className="w-px h-5 bg-gray-200 self-center mx-0.5" />
              {([['pending', 'ticket'] as const, ['approved', 'ticket'] as const] as ['' | 'pending' | 'approved', '' | 'ticket'][]).map(([s, src], i) => {
                const label = s === 'pending' ? 'Ticket Pending' : 'Ticket Done'
                const active = coinStatusFilter === s && coinSourceFilter === src
                return (
                  <button key={i} onClick={() => { setCoinStatusFilter(s); setCoinSourceFilter(src) }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                      active ? 'bg-amber-100 text-amber-700' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                    }`}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
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
                <tr
                  key={c.id}
                  className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedCoinId(c.id)}
                >
                  <td className="px-4 py-3 text-gray-700">{c.staff_name}</td>
                  <td className="px-4 py-3 font-semibold text-indigo-700">{c.amount} coins</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.source_type === 'ticket' && c.source_id ? (
                      <a
                        href={`/tickets/${c.source_id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-indigo-600 hover:underline"
                      >
                        Ticket #{c.source_id}
                      </a>
                    ) : (
                      <span className="capitalize">{c.source_type.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{c.note || '—'}</td>
                  <td className="px-4 py-3"><Badge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.approved_by_name ?? '—'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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
          {!coins?.results?.length && <EmptyState message={`No ${coinSourceFilter === 'ticket' ? 'ticket ' : ''}${coinStatusFilter || ''} coin transactions.`} />}
        </div>
      ))}

      {/* Coin detail drawer */}
      {selectedCoinId !== null && (
        <CoinDetailDrawer
          coinId={selectedCoinId}
          onClose={() => setSelectedCoinId(null)}
          onApprove={id => { mutateApprove.mutate(id); setSelectedCoinId(null) }}
          onReject={id => { mutateReject.mutate(id); setSelectedCoinId(null) }}
          canManage={can('can_approve_coins')}
        />
      )}

      {/* ── Staff Salaries Sub-tab ─────────────────────────────────────────── */}
      {subTab === 'salaries' && (
        <>
          {/* Add / Edit Salary Profile Modal */}
          {(showSalaryForm || editSalary) && (
            <Modal
              title={editSalary ? `Edit Salary — ${editSalary.staff_name}` : 'Add Salary Profile'}
              onClose={() => { setShowSalaryForm(false); setEditSalary(null) }}
            >
              <form
                className="space-y-4"
                onSubmit={e => {
                  e.preventDefault()
                  if (editSalary) {
                    mutateSalaryUpdate.mutate({ id: editSalary.id, d: salaryForm })
                  } else {
                    mutateSalaryCreate.mutate(salaryForm)
                  }
                }}
              >
                {!editSalary && (
                  <Field label="Staff Member *">
                    <select className={inputCls} value={salaryForm.staff} onChange={e => setSalaryForm(f => ({ ...f, staff: e.target.value }))} required>
                      <option value="">— Select staff —</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.email}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Base Salary (NPR) *">
                    <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={salaryForm.base_salary}
                      onChange={e => setSalaryForm(f => ({ ...f, base_salary: e.target.value }))} required />
                  </Field>
                  <Field label="TDS Rate %" hint="e.g. 10 for 10%">
                    <input data-lpignore="true" type="number" min="0" max="50" step="0.01" className={inputCls} value={salaryForm.tds_rate}
                      onChange={e => setSalaryForm(f => ({ ...f, tds_rate: e.target.value }))} />
                  </Field>
                  <Field label="Default Bonus">
                    <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={salaryForm.bonus_default}
                      onChange={e => setSalaryForm(f => ({ ...f, bonus_default: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Effective From *">
                  <NepaliDatePicker value={salaryForm.effective_from} onChange={v => setSalaryForm(f => ({ ...f, effective_from: v }))} />
                </Field>
                <Field label="Notes">
                  <textarea className={inputCls} rows={2} value={salaryForm.notes}
                    onChange={e => setSalaryForm(f => ({ ...f, notes: e.target.value }))} />
                </Field>
                <p className="text-xs text-gray-400">
                  TDS rate is stored as a decimal (10% → 0.10). When generating a payslip, this profile auto-fills base salary, TDS rate, and default bonus.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => { setShowSalaryForm(false); setEditSalary(null) }}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={mutateSalaryCreate.isPending || mutateSalaryUpdate.isPending}
                    className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                    {mutateSalaryCreate.isPending || mutateSalaryUpdate.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {salaryLoading ? <Spinner /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Staff', 'Base Salary', 'TDS Rate', 'Default Bonus', 'Effective From', 'Notes', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {salaryProfiles?.results?.map(sp => (
                    <tr key={sp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-700">{sp.staff_name}</div>
                        <div className="text-xs text-gray-400">{sp.staff_email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{npr(sp.base_salary)}</td>
                      <td className="px-4 py-3 text-gray-600">{(parseFloat(sp.tds_rate) * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-gray-600">{npr(sp.bonus_default)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(sp.effective_from)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{sp.notes || '—'}</td>
                      <td className="px-4 py-3">
                        {can('can_manage_accounting') && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setSalaryForm({ staff: String(sp.staff), base_salary: sp.base_salary, tds_rate: (parseFloat(sp.tds_rate) * 100).toFixed(2), bonus_default: sp.bonus_default, effective_from: sp.effective_from, notes: sp.notes }); setEditSalary(sp) }}
                              title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} />
                            </button>
                            <button
                              onClick={() => confirm({ title: 'Delete Salary Profile', message: `Delete salary profile for ${sp.staff_name}?`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateSalaryDelete.mutate(sp.id) })}
                              title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!salaryProfiles?.results?.length && (
                <EmptyState message="No salary profiles yet. Click 'Add Salary Profile' to configure staff salaries. Profiles are used to auto-fill and auto-generate payslips." />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Payslip Edit Modal ─────────────────────────────────────────────────────

function PayslipEditModal({ ps, onClose }: { ps: Payslip; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    base_salary: ps.base_salary,
    bonus: ps.bonus,
    deductions: ps.deductions,
    period_start: ps.period_start,
    period_end: ps.period_end,
  })
  const mutateSave = useMutation({
    mutationFn: (d: typeof form) => apiClient.patch(ACCOUNTING.PAYSLIP_DETAIL(ps.id), d),
    onSuccess: () => { toast.success('Payslip updated'); qc.invalidateQueries({ queryKey: ['payslips'] }); onClose() },
    onError: () => toast.error('Update failed'),
  })
  return (
    <Modal title={`Edit Payslip — ${ps.staff_name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); mutateSave.mutate(form) }}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Period Start">
            <NepaliDatePicker value={form.period_start} onChange={v => setForm(f => ({ ...f, period_start: v }))} />
          </Field>
          <Field label="Period End">
            <NepaliDatePicker value={form.period_end} onChange={v => setForm(f => ({ ...f, period_end: v }))} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Base Salary">
            <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={form.base_salary}
              onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} />
          </Field>
          <Field label="Bonus">
            <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={form.bonus}
              onChange={e => setForm(f => ({ ...f, bonus: e.target.value }))} />
          </Field>
          <Field label="Deductions">
            <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={form.deductions}
              onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))} />
          </Field>
        </div>
        <p className="text-xs text-gray-400">Net Pay = Base + Bonus + (Coins × Rate) − Deductions, recalculated on save.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutateSave.isPending} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
            {mutateSave.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Payment Picker Modal (generic) ─────────────────────────────────────────

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

// ─── Mark Paid Modal (payslip wrapper) ───────────────────────────────────────

function MarkPaidModal({
  payslip, bankAccounts, onClose, onSubmit, isPending,
}: {
  payslip: Payslip
  bankAccounts: BankAccount[]
  onClose: () => void
  onSubmit: (method: string, bankId: number | null) => void
  isPending: boolean
}) {
  return (
    <PaymentPickerModal
      title={`Mark Paid — ${payslip.staff_name}`}
      amount={payslip.net_pay}
      description="This will record a salary outflow in the cash / bank ledger and mark the payslip as Paid."
      bankAccounts={bankAccounts}
      onClose={onClose}
      onSubmit={onSubmit}
      isPending={isPending}
    />
  )
}

// ─── Transaction Receipt Modal ────────────────────────────────────────────────

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
        {/* Header badge */}
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

        {/* Details grid */}
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
              <p className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded inline-block">
                {payment.reference}
              </p>
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

// ─── Reports Tab ───────────────────────────────────────────────────────────

type ReportCategory = 'accounting' | 'receivables' | 'payables' | 'sales' | 'purchases' | 'tax' | 'inventory' | 'system'
type ReportDateMode  = 'range' | 'asof' | 'vat' | 'none'
type ReportType =
  | 'pl' | 'balance-sheet' | 'trial-balance' | 'gl-summary' | 'gl-master' | 'cash-flow'
  | 'aged-receivables' | 'customer-receivable-summary' | 'invoice-age' | 'customer-statement'
  | 'aged-payables'    | 'supplier-payable-summary'     | 'bill-age'    | 'supplier-statement'
  | 'sales-by-customer' | 'sales-by-item' | 'sales-by-customer-monthly' | 'sales-by-item-monthly' | 'sales-master' | 'sales-summary'
  | 'purchase-by-supplier' | 'purchase-by-item' | 'purchase-by-supplier-monthly' | 'purchase-by-item-monthly' | 'purchase-master'
  | 'sales-register' | 'sales-return-register' | 'purchase-register' | 'purchase-return-register' | 'vat' | 'tds-report' | 'annex-13' | 'annex-5'
  | 'inventory-position' | 'inventory-movement' | 'inventory-master' | 'product-profitability'
  | 'activity-log' | 'user-log'

interface ReportMeta {
  key:           ReportType
  label:         string
  endpoint:      string
  icon:          React.ElementType
  category:      ReportCategory
  dateMode:      ReportDateMode
  needsCustomer?: boolean
  needsSupplier?: boolean
}

const REPORT_CATEGORIES: { id: ReportCategory; label: string; icon: React.ElementType }[] = [
  { id: 'accounting',  label: 'Accounting',  icon: BookOpen    },
  { id: 'receivables', label: 'Receivables', icon: TrendingUp  },
  { id: 'payables',    label: 'Payables',    icon: TrendingDown},
  { id: 'sales',       label: 'Sales',       icon: ShoppingBag },
  { id: 'purchases',   label: 'Purchases',   icon: ShoppingCart},
  { id: 'tax',         label: 'Tax / IRD',   icon: Percent     },
  { id: 'inventory',   label: 'Inventory',   icon: Package     },
  { id: 'system',      label: 'System',      icon: ShieldCheck },
]

const REPORTS: ReportMeta[] = [
  // ── Accounting ────────────────────────────────────────────────────────────
  { key: 'pl',               label: 'Profit & Loss',      endpoint: ACCOUNTING.REPORT_PL,               icon: TrendingUp,        category: 'accounting',  dateMode: 'range' },
  { key: 'balance-sheet',    label: 'Balance Sheet',      endpoint: ACCOUNTING.REPORT_BALANCE_SHEET,    icon: Layers,            category: 'accounting',  dateMode: 'asof'  },
  { key: 'trial-balance',    label: 'Trial Balance',      endpoint: ACCOUNTING.REPORT_TRIAL_BALANCE,    icon: BookMarked,        category: 'accounting',  dateMode: 'range' },
  { key: 'gl-summary',       label: 'GL Summary',         endpoint: ACCOUNTING.REPORT_GL_SUMMARY,       icon: BookOpen,          category: 'accounting',  dateMode: 'range' },
  { key: 'gl-master',        label: 'GL Master',          endpoint: ACCOUNTING.REPORT_GL_MASTER,        icon: Layers,            category: 'accounting',  dateMode: 'range' },
  { key: 'cash-flow',        label: 'Cash Flow',          endpoint: ACCOUNTING.REPORT_CASH_FLOW,        icon: ArrowLeftRight,    category: 'accounting',  dateMode: 'range' },
  // ── Receivables ──────────────────────────────────────────────────────────
  { key: 'aged-receivables',             label: 'Aged Receivables',   endpoint: ACCOUNTING.REPORT_AGED_RECEIVABLES,             icon: AlertCircle, category: 'receivables', dateMode: 'asof'  },
  { key: 'customer-receivable-summary',  label: 'Receivable Summary', endpoint: ACCOUNTING.REPORT_CUSTOMER_RECEIVABLE_SUMMARY,  icon: Users,       category: 'receivables', dateMode: 'asof'  },
  { key: 'invoice-age',                  label: 'Invoice Age Detail', endpoint: ACCOUNTING.REPORT_INVOICE_AGE,                  icon: Clock,       category: 'receivables', dateMode: 'asof'  },
  { key: 'customer-statement',           label: 'Customer Statement', endpoint: ACCOUNTING.REPORT_CUSTOMER_STATEMENT,           icon: FileText,    category: 'receivables', dateMode: 'range', needsCustomer: true },
  // ── Payables ─────────────────────────────────────────────────────────────
  { key: 'aged-payables',          label: 'Aged Payables',       endpoint: ACCOUNTING.REPORT_AGED_PAYABLES,          icon: AlertCircle, category: 'payables', dateMode: 'asof'  },
  { key: 'supplier-payable-summary', label: 'Payable Summary',   endpoint: ACCOUNTING.REPORT_SUPPLIER_PAYABLE_SUMMARY, icon: Truck,      category: 'payables', dateMode: 'asof'  },
  { key: 'bill-age',               label: 'Bill Age Detail',     endpoint: ACCOUNTING.REPORT_BILL_AGE,               icon: Clock,       category: 'payables', dateMode: 'asof'  },
  { key: 'supplier-statement',     label: 'Supplier Statement',  endpoint: ACCOUNTING.REPORT_SUPPLIER_STATEMENT,     icon: FileText,    category: 'payables', dateMode: 'range', needsSupplier: true },
  // ── Sales ─────────────────────────────────────────────────────────────────
  { key: 'sales-summary',              label: 'Sales Summary',         endpoint: ACCOUNTING.REPORT_SALES_SUMMARY,              icon: BarChart2,       category: 'sales', dateMode: 'range' },
  { key: 'sales-master',               label: 'Sales Master',          endpoint: ACCOUNTING.REPORT_SALES_MASTER,               icon: FileText,        category: 'sales', dateMode: 'range' },
  { key: 'sales-by-customer',          label: 'By Customer',           endpoint: ACCOUNTING.REPORT_SALES_BY_CUSTOMER,          icon: Users,           category: 'sales', dateMode: 'range' },
  { key: 'sales-by-item',              label: 'By Item',               endpoint: ACCOUNTING.REPORT_SALES_BY_ITEM,              icon: ShoppingBag,     category: 'sales', dateMode: 'range' },
  { key: 'sales-by-customer-monthly',  label: 'By Customer Monthly',   endpoint: ACCOUNTING.REPORT_SALES_BY_CUSTOMER_MONTHLY,  icon: CalendarDays,    category: 'sales', dateMode: 'range' },
  { key: 'sales-by-item-monthly',      label: 'By Item Monthly',       endpoint: ACCOUNTING.REPORT_SALES_BY_ITEM_MONTHLY,      icon: CalendarDays,    category: 'sales', dateMode: 'range' },
  // ── Purchases ─────────────────────────────────────────────────────────────
  { key: 'purchase-master',               label: 'Purchase Master',        endpoint: ACCOUNTING.REPORT_PURCHASE_MASTER,               icon: FileText,     category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-supplier',          label: 'By Supplier',            endpoint: ACCOUNTING.REPORT_PURCHASE_BY_SUPPLIER,          icon: Truck,        category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-item',              label: 'By Item',                endpoint: ACCOUNTING.REPORT_PURCHASE_BY_ITEM,              icon: Package,      category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-supplier-monthly',  label: 'By Supplier Monthly',    endpoint: ACCOUNTING.REPORT_PURCHASE_BY_SUPPLIER_MONTHLY,  icon: CalendarDays, category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-item-monthly',      label: 'By Item Monthly',        endpoint: ACCOUNTING.REPORT_PURCHASE_BY_ITEM_MONTHLY,      icon: CalendarDays, category: 'purchases', dateMode: 'range' },
  // ── Tax / IRD ────────────────────────────────────────────────────────────
  { key: 'vat',                    label: 'VAT Report',             endpoint: ACCOUNTING.REPORT_VAT,                    icon: Receipt,     category: 'tax', dateMode: 'vat'   },
  { key: 'sales-register',         label: 'Sales Register',         endpoint: ACCOUNTING.REPORT_SALES_REGISTER,         icon: BookOpen,    category: 'tax', dateMode: 'range' },
  { key: 'sales-return-register',  label: 'Sales Return Register',  endpoint: ACCOUNTING.REPORT_SALES_RETURN_REGISTER,  icon: RotateCcw,   category: 'tax', dateMode: 'range' },
  { key: 'purchase-register',      label: 'Purchase Register',      endpoint: ACCOUNTING.REPORT_PURCHASE_REGISTER,      icon: BookMarked,  category: 'tax', dateMode: 'range' },
  { key: 'purchase-return-register', label: 'Purchase Return Reg.', endpoint: ACCOUNTING.REPORT_PURCHASE_RETURN_REGISTER, icon: RotateCcw, category: 'tax', dateMode: 'range' },
  { key: 'tds-report',             label: 'TDS Report',             endpoint: ACCOUNTING.REPORT_TDS,                    icon: Percent,     category: 'tax', dateMode: 'range' },
  { key: 'annex-13',               label: 'Annex 13 (VAT Sales)',   endpoint: ACCOUNTING.REPORT_ANNEX_13,               icon: FileSpreadsheet, category: 'tax', dateMode: 'range' },
  { key: 'annex-5',                label: 'Annex 5 (VAT Summary)',  endpoint: ACCOUNTING.REPORT_ANNEX_5,                icon: FileSpreadsheet, category: 'tax', dateMode: 'range' },
  // ── Inventory ────────────────────────────────────────────────────────────
  { key: 'inventory-position',    label: 'Stock Position',       endpoint: ACCOUNTING.REPORT_INVENTORY_POSITION,    icon: PackageCheck,   category: 'inventory', dateMode: 'asof'  },
  { key: 'inventory-movement',    label: 'Stock Movement',       endpoint: ACCOUNTING.REPORT_INVENTORY_MOVEMENT,    icon: ArrowLeftRight, category: 'inventory', dateMode: 'range' },
  { key: 'inventory-master',      label: 'Inventory Master',     endpoint: ACCOUNTING.REPORT_INVENTORY_MASTER,      icon: Package,        category: 'inventory', dateMode: 'none'  },
  { key: 'product-profitability', label: 'Product Profitability', endpoint: ACCOUNTING.REPORT_PRODUCT_PROFITABILITY, icon: TrendingUp,     category: 'inventory', dateMode: 'range' },
  // ── System ────────────────────────────────────────────────────────────────
  { key: 'activity-log', label: 'Activity Log', endpoint: ACCOUNTING.REPORT_ACTIVITY_LOG, icon: Clock,      category: 'system', dateMode: 'range' },
  { key: 'user-log',     label: 'User Log',     endpoint: ACCOUNTING.REPORT_USER_LOG,     icon: UserCheck,  category: 'system', dateMode: 'range' },
]

// ── typed data shapes ──────────────────────────────────────────────────────

interface RptAccount  {
  id?: number
  code: string
  name: string
  balance: string | number
  group_name?: string
  parent_id?: number | null
  parent_code?: string
  parent_name?: string
  level?: number
}
interface PLReport    { date_from: string; date_to: string; revenue: RptAccount[]; total_revenue: string | number; expenses: RptAccount[]; total_expenses: string | number; net_profit: string | number }
interface BSReport {
  as_of_date: string
  as_of_date_bs?: string
  fixed_assets: RptAccount[]
  total_fixed_assets: string | number
  investments: RptAccount[]
  total_investments: string | number
  current_assets: RptAccount[]
  total_current_assets: string | number
  total_assets: string | number
  capital: RptAccount[]
  total_capital: string | number
  bank_od: RptAccount[]
  loans: RptAccount[]
  total_loans: string | number
  current_liabilities: RptAccount[]
  total_current_liabilities: string | number
  total_liabilities: string | number
  total_equity_and_liabilities: string | number
  balanced: boolean
}
interface TBRow {
  id?: number
  code: string
  name: string
  type?: string
  group_name?: string
  parent_id?: number | null
  parent_code?: string
  parent_name?: string
  level?: number
  opening_dr: string | number
  opening_cr: string | number
  period_dr: string | number
  period_cr: string | number
  closing_dr: string | number
  closing_cr: string | number
}
interface TBReport {
  date_from: string
  date_to: string
  accounts: TBRow[]
  total_opening_dr: string | number
  total_opening_cr: string | number
  total_period_dr: string | number
  total_period_cr: string | number
  total_closing_dr: string | number
  total_closing_cr: string | number
  balanced: boolean
}
interface AgedItem    { id: number; invoice_number?: string; bill_number?: string; customer?: string; supplier?: string; due_date: string; amount_due: number }
interface AgedBucket  { items: AgedItem[]; total: number }
interface AgedReport  { as_of_date: string; current: AgedBucket; '1_30': AgedBucket; '31_60': AgedBucket; '61_90': AgedBucket; '90_plus': AgedBucket; grand_total: number }
interface VATReport   { period_start: string; period_end: string; vat_collected: string | number; vat_reclaimable: string | number; vat_payable: string | number; invoice_count: number; bill_count: number }
interface CFMethod    { method: string; incoming: string | number; outgoing: string | number }
interface CFReport {
  date_from: string; date_to: string
  total_incoming: string | number; total_outgoing: string | number; net_cash_flow: string | number
  by_method: CFMethod[]
  // Indirect method fields (returned by backend alongside legacy aliases)
  operating?: {
    net_profit: string | number; net_profit_label?: string
    depreciation: string | number; depreciation_label?: string
    working_capital_changes: { label: string; amount: string | number }[]
    working_capital_total?: string | number; total: string | number
  }
  investing?: { items: { label: string; amount: string | number }[]; total: string | number }
  financing?: { items: { label: string; amount: string | number }[]; total: string | number }
  net_change?: string | number; opening_cash?: string | number; closing_cash?: string | number
  expected_closing?: string | number; difference?: string | number; balanced?: boolean
}

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

function groupByCoa(items: RptAccount[]): Array<{ group: string; rows: RptAccount[] }> {
  const grouped = new Map<string, RptAccount[]>()
  items.forEach((it) => {
    const key = it.group_name || 'Ungrouped'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(it)
  })
  return Array.from(grouped.entries()).map(([group, rows]) => ({
    group,
    rows: rows.sort((a, b) => String(a.code).localeCompare(String(b.code))),
  }))
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
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const sections = [
    { title: 'Fixed Assets', rows: data.fixed_assets ?? [], total: data.total_fixed_assets },
    { title: 'Investments', rows: data.investments ?? [], total: data.total_investments },
    { title: 'Current Assets', rows: data.current_assets ?? [], total: data.total_current_assets },
    { title: 'Capital', rows: data.capital ?? [], total: data.total_capital },
    { title: 'Loans', rows: [...(data.bank_od ?? []), ...(data.loans ?? [])], total: data.total_loans },
    { title: 'Current Liabilities', rows: data.current_liabilities ?? [], total: data.total_current_liabilities },
  ]
  const expandAllSections = () => {
    const next: Record<string, boolean> = {}
    sections.forEach((s) => { next[s.title] = true })
    setOpenSections(next)
  }
  const collapseAllSections = () => setOpenSections({})

  return (
    <div className="space-y-4">
      {data.balanced === false && (
        <div className="mx-4 mt-4 px-4 py-2 bg-gray-50 border border-gray-300 rounded flex items-center gap-2 text-sm text-gray-700">
          <AlertCircle size={14} className="shrink-0" /> Out of balance — Assets ≠ Liabilities + Equity. Check posted journal entries.
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-1">
        <button
          type="button"
          onClick={expandAllSections}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          <ChevronsDownUp size={13} /> Expand All
        </button>
        <button
          type="button"
          onClick={collapseAllSections}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          <ChevronsUpDown size={13} /> Collapse All
        </button>
      </div>
      {sections.map(section => (
        <div key={section.title} className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setOpenSections((prev) => ({ ...prev, [section.title]: !prev[section.title] }))}
            className="w-full bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between"
          >
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{section.title}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold tabular-nums text-gray-700">{npr(section.total)}</span>
              {openSections[section.title] ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
            </div>
          </button>
          {openSections[section.title] && groupByCoa(section.rows).map(group => (
            <div key={`${section.title}-${group.group}`}>
              <div className="px-4 py-1.5 bg-white border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{group.group}</div>
              {group.rows.map(r => {
                const level = Math.max(0, Number(r.level ?? 0))
                return (
                  <div key={`${section.title}-${r.code}`} className="flex items-center justify-between px-4 py-2 border-b border-gray-100 last:border-b-0">
                    <div className="text-sm text-gray-700" style={{ paddingLeft: `${level * 14}px` }}>
                      <span className="font-mono text-xs text-gray-400 mr-2">{r.code}</span>
                      <span>{r.name}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums text-gray-900">{npr(r.balance)}</span>
                  </div>
                )
              })}
            </div>
          ))}
          <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-t border-gray-300">
            <span className="text-sm font-semibold text-gray-700">Total {section.title}</span>
            <span className="text-sm font-bold tabular-nums text-gray-900">{npr(section.total)}</span>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gray-800 text-white rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide">Total Assets</span>
          <span className="font-bold tabular-nums">{npr(data.total_assets)}</span>
        </div>
        <div className="bg-gray-800 text-white rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold uppercase tracking-wide">Total Liabilities + Equity</span>
          <span className="font-bold tabular-nums">{npr(data.total_equity_and_liabilities)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Trial Balance renderer ────────────────────────────────────────────────

function TBReportView({ data }: { data: TBReport }) {
  const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({})
  const groupedByType = new Map<string, TBRow[]>()

  ;(data.accounts ?? []).forEach(row => {
    const typeKey = row.type ? row.type.replace(/_/g, ' ') : 'Other'
    if (!groupedByType.has(typeKey)) groupedByType.set(typeKey, [])
    groupedByType.get(typeKey)!.push(row)
  })

  const typeRows = Array.from(groupedByType.entries()).map(([type, rows]) => {
    const groupedByCoa = new Map<string, TBRow[]>()
    rows.forEach((r) => {
      const group = r.group_name || 'Ungrouped'
      if (!groupedByCoa.has(group)) groupedByCoa.set(group, [])
      groupedByCoa.get(group)!.push(r)
    })

    return {
      type,
      groups: Array.from(groupedByCoa.entries()).map(([group, groupRows]) => ({
        group,
        rows: groupRows.sort((a, b) => String(a.code).localeCompare(String(b.code))),
      })),
    }
  })
  const expandAllTypes = () => {
    const next: Record<string, boolean> = {}
    typeRows.forEach((t) => { next[t.type] = true })
    setOpenTypes(next)
  }
  const collapseAllTypes = () => setOpenTypes({})

  return (
    <div>
      <div className="flex items-center justify-end gap-2 px-1 mb-2">
        <button
          type="button"
          onClick={expandAllTypes}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          <ChevronsDownUp size={13} /> Expand All
        </button>
        <button
          type="button"
          onClick={collapseAllTypes}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          <ChevronsUpDown size={13} /> Collapse All
        </button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Account</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening Dr</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Opening Cr</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Period Dr</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Period Cr</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing Dr</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing Cr</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {typeRows.map(typeBlock => (
            <Fragment key={typeBlock.type}>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={7} className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenTypes((prev) => ({ ...prev, [typeBlock.type]: !prev[typeBlock.type] }))}
                    className="w-full flex items-center justify-between px-2 py-1"
                  >
                    <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{typeBlock.type}</span>
                    {openTypes[typeBlock.type] ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
                  </button>
                </td>
              </tr>
              {openTypes[typeBlock.type] && typeBlock.groups.map(gr => (
                <Fragment key={`${typeBlock.type}-${gr.group}`}>
                  <tr className="bg-white">
                    <td colSpan={7} className="px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-t border-gray-200">{gr.group}</td>
                  </tr>
                  {gr.rows.map(row => {
                    const level = Math.max(0, Number(row.level ?? 0))
                    return (
                      <tr key={`${typeBlock.type}-${row.code}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700" style={{ paddingLeft: `${16 + level * 14}px` }}>
                          <span className="font-mono text-xs text-gray-400 mr-2">{row.code}</span>
                          {row.name}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">{Number(row.opening_dr) ? npr(row.opening_dr) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">{Number(row.opening_cr) ? npr(row.opening_cr) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">{Number(row.period_dr) ? npr(row.period_dr) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">{Number(row.period_cr) ? npr(row.period_cr) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">{Number(row.closing_dr) ? npr(row.closing_dr) : <span className="text-gray-300">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">{Number(row.closing_cr) ? npr(row.closing_cr) : <span className="text-gray-300">—</span>}</td>
                      </tr>
                    )
                  })}
                </Fragment>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot className="bg-gray-800 text-white">
          <tr>
            <td className="px-4 py-2.5 text-sm font-bold uppercase tracking-wide">
              Total
              <span className="ml-2 text-xs text-gray-400 font-normal">
                {data.balanced ? '(Balanced ✓)' : '(NOT balanced ✗)'}
              </span>
            </td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(data.total_opening_dr)}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(data.total_opening_cr)}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(data.total_period_dr)}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(data.total_period_cr)}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(data.total_closing_dr)}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(data.total_closing_cr)}</td>
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
  const isIndirect = data.operating != null

  const n   = (v: string | number | null | undefined) => parseFloat(String(v ?? 0))
  const fmtAmt = (v: string | number) => {
    const x = n(v)
    return x < 0 ? `(${npr(Math.abs(x))})` : npr(x)
  }

  if (!isIndirect) {
    // Legacy direct-method fallback
    const net = n(data.net_cash_flow)
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
            <tr><td className="px-4 py-3 text-gray-700">Total Cash Inflows</td><td className="px-4 py-3 text-right tabular-nums font-medium">{npr(data.total_incoming)}</td></tr>
            <tr><td className="px-4 py-3 text-gray-700">Total Cash Outflows</td><td className="px-4 py-3 text-right tabular-nums font-medium">({npr(data.total_outgoing)})</td></tr>
          </tbody>
          <tfoot className="bg-gray-800 text-white">
            <tr>
              <td className="px-4 py-2.5 font-bold uppercase tracking-wide text-sm">Net Cash Flow</td>
              <td className="px-4 py-2.5 text-right font-bold tabular-nums">{net < 0 ? '(' : ''}{npr(Math.abs(net))}{net < 0 ? ')' : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // ── Indirect method ──────────────────────────────────────────────────────
  function Section({ title, children, total }: { title: string; children: React.ReactNode; total: string | number }) {
    return (
      <div className="mb-1">
        <div className="bg-indigo-50 px-4 py-2 border-y border-indigo-100">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest">{title}</span>
        </div>
        {children}
        <div className="flex justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 font-semibold text-sm">
          <span className="text-gray-700">Net {title} Activities</span>
          <span className={`tabular-nums ${n(total) < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtAmt(total)}</span>
        </div>
      </div>
    )
  }

  function ItemRow({ label, amount }: { label: string; amount: string | number }) {
    return (
      <div className="flex justify-between px-6 py-2 hover:bg-gray-50 border-b border-gray-100 text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-800">{fmtAmt(amount)}</span>
      </div>
    )
  }

  const op  = data.operating!
  const inv = data.investing!
  const fin = data.financing!
  const netChange = n(data.net_change)
  const opening   = n(data.opening_cash)
  const closing   = n(data.closing_cash)

  return (
    <div>
      <Section title="Operating" total={op.total}>
        <ItemRow label="Net Profit / (Loss)" amount={op.net_profit} />
        {n(op.depreciation) !== 0 && <ItemRow label="Add: Depreciation & Amortisation" amount={op.depreciation} />}
        {(op.working_capital_changes?.length ?? 0) > 0 && (
          <div className="bg-gray-50 px-4 py-1.5 border-b border-gray-200">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Working Capital Changes</span>
          </div>
        )}
        {op.working_capital_changes?.map(wc => <ItemRow key={wc.label} label={wc.label} amount={wc.amount} />)}
        {(op.working_capital_changes?.length ?? 0) > 0 && (
          <div className="flex justify-between px-6 py-1.5 border-b border-gray-100 text-xs font-semibold">
            <span className="text-gray-600">Net Working Capital Changes</span>
            <span className={`tabular-nums ${n(op.working_capital_total ?? 0) < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtAmt(op.working_capital_total ?? 0)}</span>
          </div>
        )}
      </Section>
      <Section title="Investing" total={inv.total}>
        {inv.items?.length ? inv.items.map(it => <ItemRow key={it.label} label={it.label} amount={it.amount} />) :
          <p className="px-6 py-2 text-xs text-gray-400 italic">No investing activities.</p>}
      </Section>
      <Section title="Financing" total={fin.total}>
        {fin.items?.length ? fin.items.map(it => <ItemRow key={it.label} label={it.label} amount={it.amount} />) :
          <p className="px-6 py-2 text-xs text-gray-400 italic">No financing activities.</p>}
      </Section>
      <div className="mt-2 mx-4 mb-4 border border-gray-200 rounded text-sm">
        <div className="flex justify-between px-4 py-2 border-b border-gray-100">
          <span className="text-gray-600">Opening Cash &amp; Bank Balance</span>
          <span className="tabular-nums font-medium">{npr(opening)}</span>
        </div>
        <div className="flex justify-between px-4 py-2 border-b border-gray-100">
          <span className="text-gray-600">Net Change in Cash</span>
          <span className={`tabular-nums font-medium ${netChange < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtAmt(netChange)}</span>
        </div>
        {data.expected_closing != null && (
          <div className="flex justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-gray-500 text-xs">Expected Closing (Opening + Net Change)</span>
            <span className="tabular-nums text-xs font-medium text-gray-700">{npr(n(data.expected_closing))}</span>
          </div>
        )}
        <div className="flex justify-between px-4 py-2.5 bg-gray-800 text-white rounded-b font-bold">
          <span>Closing Cash &amp; Bank Balance</span>
          <span className="tabular-nums">{npr(closing)}</span>
        </div>
        {data.balanced != null && (
          <div className={`flex items-center justify-between px-4 py-2 rounded-b border-t ${data.balanced ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
            <span className={`text-xs font-semibold ${data.balanced ? 'text-green-700' : 'text-red-700'}`}>
              {data.balanced ? 'Statement balanced' : 'Out of balance'}
            </span>
            {!data.balanced && data.difference != null && (
              <span className="text-xs text-red-600 tabular-nums">Difference: {fmtAmt(data.difference)}</span>
            )}
          </div>
        )}
      </div>
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
      const bsSections: Array<{ label: string; rows: RptAccount[]; total: string | number }> = [
        { label: 'Fixed Assets', rows: d.fixed_assets ?? [], total: d.total_fixed_assets },
        { label: 'Investments', rows: d.investments ?? [], total: d.total_investments },
        { label: 'Current Assets', rows: d.current_assets ?? [], total: d.total_current_assets },
        { label: 'Capital', rows: d.capital ?? [], total: d.total_capital },
        { label: 'Loans', rows: [...(d.bank_od ?? []), ...(d.loans ?? [])], total: d.total_loans },
        { label: 'Current Liabilities', rows: d.current_liabilities ?? [], total: d.total_current_liabilities },
      ]
      bsSections.forEach((section) => {
        section.rows.forEach((r) => row(section.label, r.code, r.name, r.balance))
        row('', '', `Total ${section.label}`, section.total)
      })
      row('', '', 'Total Assets', d.total_assets)
      row('', '', 'Total Liabilities + Equity', d.total_equity_and_liabilities)
      break
    }
    case 'trial-balance': {
      const d = data as unknown as TBReport
      row('Code', 'Account', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr')
      d.accounts?.forEach(r => row(r.code, r.name, r.opening_dr, r.opening_cr, r.period_dr, r.period_cr, r.closing_dr, r.closing_cr))
      row('', 'TOTAL', d.total_opening_dr, d.total_opening_cr, d.total_period_dr, d.total_period_cr, d.total_closing_dr, d.total_closing_cr)
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
      if (d.operating) {
        row('Section', 'Description', 'Amount')
        row('Operating', 'Net Profit / (Loss)', d.operating.net_profit)
        if (Number(d.operating.depreciation) !== 0) row('Operating', 'Depreciation', d.operating.depreciation)
        d.operating.working_capital_changes?.forEach(wc => row('Operating', wc.label, wc.amount))
        row('Operating', 'Net Operating Activities', d.operating.total)
        d.investing?.items?.forEach(it => row('Investing', it.label, it.amount))
        row('Investing', 'Net Investing Activities', d.investing?.total)
        d.financing?.items?.forEach(it => row('Financing', it.label, it.amount))
        row('Financing', 'Net Financing Activities', d.financing?.total)
        row('', 'Net Change in Cash', d.net_change)
        row('', 'Opening Cash', d.opening_cash)
        row('', 'Closing Cash', d.closing_cash)
        row('', 'Balanced', d.balanced ? 'Yes' : 'No')
      } else {
        row('Method', 'Inflows', 'Outflows', 'Net')
        d.by_method?.forEach(m =>
          row(m.method, m.incoming, m.outgoing,
            (parseFloat(String(m.incoming)) - parseFloat(String(m.outgoing))).toFixed(2))
        )
        row('TOTAL', d.total_incoming, d.total_outgoing, d.net_cash_flow)
      }
      break
    }
    default: {
      // Generic handler: export `rows` array if present
      const d = data as Record<string, unknown>
      const rowsArr = (d.rows as Record<string, unknown>[] | undefined) ?? []
      if (rowsArr.length) {
        const headers = Object.keys(rowsArr[0])
        row(...headers)
        rowsArr.forEach(r => row(...headers.map(h => r[h] as string | number | undefined)))
      }
      break
    }
  }
  return rows.map(r => r.join(',')).join('\n')
}

// ── Main ReportsTab ───────────────────────────────────────────────────────

// ── Generic table renderer ────────────────────────────────────────────────

const MONEY_COLS = new Set([
  'total', 'amount', 'subtotal', 'vat_amount', 'outstanding', 'invoiced',
  'paid', 'billed', 'credit', 'debit', 'balance', 'cogs', 'revenue',
  'gross_profit', 'cost_value', 'sale_value', 'net_payable', 'taxable_amount',
  'tds_amount', 'opening_balance', 'closing_balance', 'grand_total',
  'period_debit', 'period_credit', 'unit_price', 'cost_price',
])

function colIsAmount(key: string): boolean {
  const lower = key.toLowerCase()
  return MONEY_COLS.has(lower) ||
    lower.endsWith('_total') || lower.endsWith('_amount') || lower.endsWith('_value') ||
    lower.startsWith('total_') || lower.startsWith('grand_')
}

function prettyCol(k: string): string {
  return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

interface GenericTableProps {
  rows: Record<string, unknown>[]
  totalRow?: Record<string, unknown>
  summary?: { label: string; value: unknown }[]
  hideCols?: string[]
}

function GenericTableView({ rows, totalRow, summary, hideCols = [] }: GenericTableProps) {
  if (!rows?.length) return (
    <p className="px-6 py-10 text-sm text-gray-400 text-center italic">No data for this period.</p>
  )

  const allCols = Object.keys(rows[0]).filter(k => !hideCols.includes(k) && k !== 'sno')

  return (
    <div>
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-5 border-b border-gray-100">
          {summary.map(s => (
            <div key={s.label as string} className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-0.5">{s.label}</p>
              <p className="text-base font-bold text-gray-900 tabular-nums">{npr(s.value as number)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 bg-gray-50 border-b border-gray-200 w-10">#</th>
              {allCols.map(c => (
                <th key={c} className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200 whitespace-nowrap ${colIsAmount(c) ? 'text-right' : 'text-left'}`}>
                  {prettyCol(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-1.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                {allCols.map(c => {
                  const v = row[c]
                  const isAmt = colIsAmount(c)
                  return (
                    <td key={c} className={`px-4 py-1.5 ${isAmt ? 'text-right tabular-nums' : ''} max-w-[220px] truncate`}>
                      {isAmt && v != null ? npr(v as number) : v == null ? '' : String(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          {totalRow && (
            <tfoot>
              <tr className="bg-gray-800 text-white">
                <td className="px-4 py-2 text-xs font-semibold" />
                {allCols.map((c, ci) => {
                  const v = totalRow[c]
                  return (
                    <td key={c} className={`px-4 py-2 font-bold ${ci === 0 ? 'text-left text-xs uppercase tracking-wide' : 'text-right tabular-nums'}`}>
                      {ci === 0 ? 'Total' : v != null ? npr(v as number) : ''}
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

// ── Monthly pivot renderer ────────────────────────────────────────────────

interface MonthlyCrossData {
  months: string[]
  rows: Record<string, unknown>[]
  grand_total: unknown
}

function MonthlyCrossTableView({ data, entityKey }: { data: MonthlyCrossData; entityKey: string }) {
  const { months = [], rows = [] } = data
  if (!rows.length) return <p className="px-6 py-10 text-sm text-gray-400 text-center italic">No data.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-left w-10">#</th>
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-left min-w-[160px]">{prettyCol(entityKey)}</th>
            {months.map(m => (
              <th key={m} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">{m}</th>
            ))}
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-700 uppercase tracking-wide text-right bg-gray-100">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-1.5 text-xs text-gray-400">{i + 1}</td>
              <td className="px-4 py-1.5 font-medium text-gray-800 max-w-[200px] truncate">{String(row[entityKey] ?? '')}</td>
              {months.map(m => (
                <td key={m} className="px-4 py-1.5 text-right tabular-nums text-gray-600">
                  {row[m] ? npr(row[m] as number) : '—'}
                </td>
              ))}
              <td className="px-4 py-1.5 text-right tabular-nums font-semibold text-gray-900 bg-gray-50">{npr(row.total as number)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-gray-800 text-white">
            <td className="px-4 py-2" />
            <td className="px-4 py-2 text-xs font-bold uppercase tracking-wide">Grand Total</td>
            {months.map(m => {
              const colSum = rows.reduce((s, r) => s + parseFloat(String(r[m] ?? 0)), 0)
              return <td key={m} className="px-4 py-2 text-right tabular-nums font-bold">{npr(colSum)}</td>
            })}
            <td className="px-4 py-2 text-right tabular-nums font-bold">{npr(data.grand_total as number)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

// ── Statement renderer (running balance ledger) ───────────────────────────

interface StatementTxn {
  date: string
  type: string
  reference: string
  description: string
  debit:   number | string
  credit:  number | string
  balance: number | string
}

function StatementView({ data }: { data: { opening_balance: number; closing_balance: number; transactions: StatementTxn[]; [k: string]: unknown } }) {
  const { transactions = [], opening_balance, closing_balance } = data
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 px-5 py-4 border-b border-gray-100 bg-gray-50 text-sm">
        <div><span className="text-gray-500 text-xs uppercase tracking-wide font-semibold">Opening Balance</span><p className="font-bold text-gray-800 tabular-nums mt-0.5">{npr(opening_balance)}</p></div>
        <div><span className="text-gray-500 text-xs uppercase tracking-wide font-semibold">Closing Balance</span><p className="font-bold text-gray-800 tabular-nums mt-0.5">{npr(closing_balance)}</p></div>
      </div>
      {!transactions.length
        ? <p className="px-6 py-8 text-sm text-gray-400 italic text-center">No transactions in this period.</p>
        : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Date', 'Type', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'].map(h => (
                    <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${['Debit', 'Credit', 'Balance'].includes(h) ? 'text-right' : 'text-left'}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-1.5 text-gray-600 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-1.5 capitalize text-gray-500">{t.type.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-1.5 font-mono text-xs text-indigo-600">{t.reference}</td>
                    <td className="px-4 py-1.5 text-gray-700 max-w-[260px] truncate">{t.description}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-gray-700">{parseFloat(String(t.debit)) ? npr(t.debit as number) : '—'}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-emerald-700">{parseFloat(String(t.credit)) ? npr(t.credit as number) : '—'}</td>
                    <td className={`px-4 py-1.5 text-right tabular-nums font-semibold ${parseFloat(String(t.balance)) < 0 ? 'text-red-600' : 'text-gray-900'}`}>{npr(t.balance as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  )
}

// ── GL Summary renderer ───────────────────────────────────────────────────

interface GLSummaryGroup { label: string; rows: { code: string; name: string; balance: number }[]; total: number }

function GLSummaryView({ data }: { data: { groups: Record<string, GLSummaryGroup> } }) {
  const order = ['asset', 'liability', 'equity', 'revenue', 'expense']
  return (
    <div className="divide-y divide-gray-100">
      {order.map(k => {
        const g = data.groups?.[k]
        if (!g) return null
        return (
          <RptSection key={k} title={g.label}>
            {g.rows.map(r => <RptRow key={r.code} code={r.code} name={r.name} amount={r.balance} indent />)}
            {!g.rows.length && <p className="px-8 py-2 text-xs text-gray-400 italic">No activity.</p>}
            <RptTotal label={`Total ${g.label}`} amount={g.total} />
          </RptSection>
        )
      })}
    </div>
  )
}

// ── Sales Summary renderer ────────────────────────────────────────────────

function SalesSummaryView({ data }: { data: Record<string, unknown> }) {
  const stats = [
    { label: 'Total Invoiced',   value: data.total_invoiced },
    { label: 'Total Collected',  value: data.total_collected },
    { label: 'Outstanding',      value: data.total_outstanding },
    { label: 'VAT Collected',    value: data.total_vat },
    { label: 'Invoice Count',    value: String(data.invoice_count) },
    { label: 'Avg Invoice',      value: data.avg_invoice_value },
  ]
  const top = (data.top_customers as { customer: string; total: number }[]) ?? []
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-5 border-b border-gray-100">
        {stats.map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-0.5">{s.label}</p>
            <p className="text-base font-bold text-gray-900 tabular-nums">{isNaN(parseFloat(String(s.value))) ? String(s.value ?? 0) : npr(s.value as number)}</p>
          </div>
        ))}
      </div>
      {top.length > 0 && (
        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Top Customers by Revenue</p>
          <div className="space-y-1.5">
            {top.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2 bg-gray-50 rounded-lg">
                <span className="text-sm text-gray-700 font-medium">{i + 1}. {c.customer}</span>
                <span className="text-sm font-bold tabular-nums text-gray-900">{npr(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Annex 5 renderer ─────────────────────────────────────────────────────

function Annex5View({ data }: { data: Record<string, unknown> }) {
  const rows = [
    { side: 'Sales',    label: 'Taxable Sales',           value: data.sales_taxable },
    { side: 'Sales',    label: 'Output VAT (13%)',         value: data.output_vat },
    { side: 'Sales',    label: 'Less: Sales Returns Tax',  value: data.sales_return_taxable },
    { side: 'Sales',    label: 'Less: Sales Return VAT',   value: data.sales_return_vat },
    { side: 'Sales',    label: 'Net Output VAT',           value: data.net_output_vat },
    { side: 'Purchase', label: 'Taxable Purchases',        value: data.purchase_taxable },
    { side: 'Purchase', label: 'Input VAT (13%)',          value: data.input_vat },
    { side: 'Purchase', label: 'Less: Purchase Returns',   value: data.purchase_return_taxable },
    { side: 'Purchase', label: 'Less: Purchase Return VAT',value: data.purchase_return_vat },
    { side: 'Purchase', label: 'Net Input VAT',            value: data.net_input_vat },
  ]
  const netPayable = data.net_vat_payable as number
  return (
    <div className="divide-y divide-gray-100">
      {['Sales', 'Purchase'].map(side => (
        <RptSection key={side} title={`${side} Side`}>
          {rows.filter(r => r.side === side).map(r => (
            <RptRow key={r.label} name={r.label} amount={r.value as number}
              bold={r.label.startsWith('Net')} indent={!r.label.startsWith('Net')} />
          ))}
        </RptSection>
      ))}
      <RptGrandTotal
        label={netPayable >= 0 ? 'Net VAT Payable to IRD' : 'VAT Refund Due from IRD'}
        amount={Math.abs(netPayable)}
        note={data.is_refund ? '(Refund)' : undefined}
      />
    </div>
  )
}

export function _ReportsTab() {
  const today   = new Date().toISOString().slice(0, 10)
  const fy      = currentFiscalYear()
  const fyParams = fiscalYearAdParams(fy)

  const [category,    setCategory]    = useState<ReportCategory>('accounting')
  const [reportKey,   setReportKey]   = useState<ReportType>('pl')
  const [dateFrom,    setDateFrom]    = useState(fyParams.date_from)
  const [dateTo,      setDateTo]      = useState(today)
  const [customerId,  setCustomerId]  = useState<number | null>(null)
  const [supplierId,  setSupplierId]  = useState<number | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const report    = REPORTS.find(r => r.key === reportKey)!
  const catReports = REPORTS.filter(r => r.category === category)

  // When switching category, auto-select first report in that category
  function handleCategoryChange(cat: ReportCategory) {
    setCategory(cat)
    const first = REPORTS.find(r => r.category === cat)
    if (first) setReportKey(first.key)
  }

  // Build query params
  function buildParams(): string {
    const parts: string[] = []
    if (report.dateMode === 'range') {
      parts.push(`date_from=${dateFrom}`, `date_to=${dateTo}`)
    } else if (report.dateMode === 'asof') {
      parts.push(`as_of_date=${dateTo}`)
    } else if (report.dateMode === 'vat') {
      parts.push(`period_start=${dateFrom}`, `period_end=${dateTo}`)
    }
    if (report.needsCustomer && customerId) parts.push(`customer_id=${customerId}`)
    if (report.needsSupplier && supplierId) parts.push(`supplier_id=${supplierId}`)
    return parts.length ? `?${parts.join('&')}` : ''
  }

  // Customer list (for customer-statement)
  const { data: customersList } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['report-customers-dropdown'],
    queryFn:  () => apiClient.get(`${CUSTOMERS.LIST}?page_size=500`).then(r =>
      (r.data?.data?.results ?? r.data?.results ?? []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))
    ),
    enabled: report?.needsCustomer ?? false,
    staleTime: 60_000,
  })

  // Supplier list (for supplier-statement)
  const { data: suppliersList } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['report-suppliers-dropdown'],
    queryFn:  () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=500`).then(r =>
      (r.data?.data?.results ?? r.data?.results ?? []).map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }))
    ),
    enabled: report?.needsSupplier ?? false,
    staleTime: 60_000,
  })

  const { data: reportData, isLoading, isError, error, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['report', reportKey, dateFrom, dateTo, customerId, supplierId],
    queryFn:  () => apiClient.get(report.endpoint + buildParams()).then(r => r.data?.data ?? r.data),
    enabled:  false,
  })

  // Reset query when report changes
  useEffect(() => {
    // no-op — enabled:false ensures query doesn't auto-run
  }, [reportKey])

  const isAsOf       = report.dateMode === 'asof'
  const periodLabel  = isAsOf ? `As of ${fmt(dateTo)}` : `${fmt(dateFrom)} – ${fmt(dateTo)}`

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
  tfoot td{background:#1f2937;color:#fff;font-weight:700}
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

  function renderReport() {
    if (!reportData) return null
    const d = reportData

    // Existing detailed renderers
    switch (reportKey) {
      case 'pl':               return <PLReportView  data={d as unknown as PLReport} />
      case 'balance-sheet':    return <BSReportView  data={d as unknown as BSReport} />
      case 'trial-balance':    return <TBReportView  data={d as unknown as TBReport} />
      case 'aged-receivables': return <AgedReportView data={d as unknown as AgedReport} type="receivables" />
      case 'aged-payables':    return <AgedReportView data={d as unknown as AgedReport} type="payables"    />
      case 'vat':              return <VATReportView  data={d as unknown as VATReport} />
      case 'cash-flow':        return <CFReportView   data={d as unknown as CFReport}  />
      case 'gl-summary':       return <GLSummaryView  data={d as unknown as { groups: Record<string, GLSummaryGroup> }} />
      case 'annex-5':          return <Annex5View data={d} />
      case 'sales-summary':    return <SalesSummaryView data={d} />

      case 'customer-statement':
      case 'supplier-statement':
        return <StatementView data={d as Parameters<typeof StatementView>[0]['data']} />

      // Monthly pivot
      case 'sales-by-customer-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="customer" />
      case 'sales-by-item-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="item" />
      case 'purchase-by-supplier-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="supplier" />
      case 'purchase-by-item-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="item" />
    }

    // Generic table for all remaining `rows`-based reports
    const rows = (d.rows as Record<string, unknown>[]) ?? []
    const grandRow: Record<string, unknown> = {}

    if ('grand_total' in d)         grandRow.total    = d.grand_total as unknown
    if ('grand_invoiced' in d)      grandRow.total_invoiced  = d.grand_invoiced as unknown
    if ('grand_outstanding' in d)   grandRow.outstanding     = d.grand_outstanding as unknown
    if ('total_taxable' in d)       grandRow.taxable_amount  = d.total_taxable as unknown
    if ('total_vat' in d)           grandRow.vat_amount      = d.total_vat as unknown
    if ('total_amount' in d)        grandRow.total           = d.total_amount as unknown
    if ('total_tds' in d)           grandRow.tds_amount      = d.total_tds as unknown

    const hasTotalRow = Object.keys(grandRow).length > 0

    const summaryRows: { label: string; value: unknown }[] = []
    if ('invoice_count' in d || 'count' in d)
      summaryRows.push({ label: 'Count', value: String((d.invoice_count ?? d.count ?? 0)) })
    if ('grand_total' in d && typeof d.grand_total === 'number')
      summaryRows.push({ label: 'Grand Total', value: d.grand_total })
    if ('grand_invoiced' in d)
      summaryRows.push({ label: 'Total Invoiced', value: d.grand_invoiced })
    if ('grand_outstanding' in d)
      summaryRows.push({ label: 'Outstanding', value: d.grand_outstanding })
    if ('total_taxable' in d)
      summaryRows.push({ label: 'Total Taxable', value: d.total_taxable })
    if ('total_vat' in d)
      summaryRows.push({ label: 'Total VAT', value: d.total_vat })

    return (
      <GenericTableView
        rows={rows}
        totalRow={hasTotalRow ? grandRow : undefined}
        summary={summaryRows.length ? summaryRows : undefined}
      />
    )
  }

  return (
    <div className="space-y-4">

      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {REPORT_CATEGORIES.map(cat => {
          const Icon = cat.icon
          const isActive = category === cat.id
          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                isActive
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              <Icon size={15} />{cat.label}
            </button>
          )
        })}
      </div>

      {/* Report grid for active category */}
      <div className={`grid gap-2 ${catReports.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'}`}>
        {catReports.map(r => {
          const Icon = r.icon
          return (
            <button
              key={r.key}
              onClick={() => setReportKey(r.key)}
              className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-center transition-colors ${
                reportKey === r.key
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700 shadow-sm font-semibold'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              <Icon size={18} />
              <span className="text-xs leading-tight">{r.label}</span>
            </button>
          )
        })}
      </div>

      {/* Param controls */}
      <div className="flex flex-wrap items-end gap-4 bg-white border border-gray-200 rounded-xl px-5 py-4">
        {report.dateMode !== 'none' && !isAsOf && (
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              {report.dateMode === 'vat' ? 'Period Start' : 'Date From'}
            </label>
            <NepaliDatePicker value={dateFrom} onChange={v => setDateFrom(v)} />
          </div>
        )}
        {report.dateMode !== 'none' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">
              {isAsOf ? 'As Of Date' : report.dateMode === 'vat' ? 'Period End' : 'Date To'}
            </label>
            <NepaliDatePicker value={dateTo} onChange={v => setDateTo(v)} />
          </div>
        )}

        {/* Customer dropdown (customer-statement only) */}
        {report.needsCustomer && (
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Customer</label>
            <select
              value={customerId ?? ''}
              onChange={e => setCustomerId(e.target.value ? parseInt(e.target.value) : null)}
              className="h-9 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
            >
              <option value="">— Select customer —</option>
              {(customersList ?? []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Supplier dropdown (supplier-statement only) */}
        {report.needsSupplier && (
          <div>
            <label className="block text-xs text-gray-500 mb-1 font-medium">Supplier</label>
            <select
              value={supplierId ?? ''}
              onChange={e => setSupplierId(e.target.value ? parseInt(e.target.value) : null)}
              className="h-9 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
            >
              <option value="">— Select supplier —</option>
              {(suppliersList ?? []).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Fiscal year quick selects */}
        {report.dateMode === 'range' && (
          <div className="flex gap-2 pb-0.5">
            <button
              onClick={() => { const p = fiscalYearAdParams(fy); setDateFrom(p.date_from); setDateTo(today) }}
              className="px-3 py-2 text-xs font-semibold border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
            >
              This FY
            </button>
            <button
              onClick={() => {
                const { startAd } = fiscalYearDateRange(fy)
                const prevFyLastDay = new Date(startAd.getTime() - 86_400_000)
                const lastFy = fiscalYearOf(prevFyLastDay)
                const p = fiscalYearAdParams(lastFy)
                setDateFrom(p.date_from)
                setDateTo(p.date_to)
              }}
              className="px-3 py-2 text-xs font-semibold border border-gray-300 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              Last FY
            </button>
          </div>
        )}

        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-60"
        >
          <BarChart2 size={15} /> Run Report
        </button>
      </div>

      {isLoading && <div className="py-12"><Spinner /></div>}

      {isError && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-700">Failed to load report</p>
            <p className="text-xs text-red-500 mt-0.5">
              {(error as Error)?.message ?? 'An error occurred. Check your date range and try again.'}
            </p>
          </div>
        </div>
      )}

      {reportData && !isLoading && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-gray-50">
            <div className="text-center flex-1">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-0.5">Report</p>
              <h2 className="text-lg font-extrabold text-gray-900 uppercase tracking-wide">{report.label}</h2>
              <RptDateBadge label={periodLabel} />
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-4 mt-1">
              <button onClick={exportCSV} title="Export to CSV"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
                <FileSpreadsheet size={13} /> CSV
              </button>
              <button onClick={exportPDF} title="Print / Save as PDF"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
                <Printer size={13} /> PDF
              </button>
            </div>
          </div>
          <div ref={printRef}>{renderReport()}</div>
        </div>
      )}

      {!reportData && !isLoading && !isError && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl py-14 text-center">
          <BarChart2 size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 font-medium">Select a report above and click <strong>Run Report</strong></p>
          <p className="text-xs text-gray-400 mt-1">
            {catReports.map(r => r.label).join(' · ')}
          </p>
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
        .then(r => (Array.isArray(r.data) ? r.data : (r.data.data ?? r.data.results ?? []))),
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
              <span>Created: <strong className="text-gray-700"><DateDisplay adDate={inv.created_at} compact /></strong></span>
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

const PO_STATUS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  sent:     'bg-blue-100 text-blue-700',
  partial:  'bg-yellow-100 text-yellow-700',
  received: 'bg-emerald-100 text-emerald-700',
  cancelled:'bg-red-100 text-red-500',
}

function QuotationsTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null)
  const { fyYear } = useFY()

  const { data, isLoading } = useQuery<ApiPage<Quotation>>({
    queryKey: ['quotations', statusFilter, fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.QUOTATIONS + (statusFilter ? `?status=${statusFilter}` : ''), fyYear)).then(r => toPage<Quotation>(r.data)),
  })

  const mutateSend    = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_SEND(id)),    onSuccess: () => { toast.success('Quotation sent'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateAccept  = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_ACCEPT(id)),  onSuccess: () => { toast.success('Quotation accepted'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateDecline = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_DECLINE(id)), onSuccess: () => { toast.success('Quotation declined'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateConvert = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_CONVERT(id)), onSuccess: () => { toast.success('Converted to invoice'); qc.invalidateQueries({ queryKey: ['quotations'] }); qc.invalidateQueries({ queryKey: ['invoices'] }) }, onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Convert failed') })
  const mutateDelete  = useMutation({ mutationFn: (id: number) => apiClient.delete(ACCOUNTING.QUOTATION_DETAIL(id)), onSuccess: () => { toast.success('Quotation deleted'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Delete failed') })

  return (
    <div className="space-y-4">
      {showCreate && <QuotationCreateModal onClose={() => setShowCreate(false)} />}
      {editQuotation && <QuotationEditModal quo={editQuotation} onClose={() => setEditQuotation(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'sent', 'accepted', 'declined', 'expired'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} quotations</span>
          {can('can_manage_accounting') && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New Quotation
            </button>
          )}
        </div>
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
                          {q.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => setEditQuotation(q)} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} /></button>
                          )}
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
                          {(q.status === 'draft' || q.status === 'declined' || q.status === 'expired') && can('can_manage_accounting') && (
                            <button onClick={() => confirm({ title: 'Delete Quotation', message: `Delete ${q.quotation_number}?`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDelete.mutate(q.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
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

// ─── Quotation Create Modal ──────────────────────────────────────────────────

function QuotationCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [discount, setDiscount] = useState('0')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
  })

  const { data: quoCreateServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.QUOTATIONS, payload),
    onSuccess: () => { toast.success('Quotation created'); qc.invalidateQueries({ queryKey: ['quotations'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectQuoCreateService(lineIdx: number, serviceId: number) {
    const s = quoCreateServices.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    const gross = Number(l.qty) * Number(l.unit_price)
    return s + gross - gross * (Number(l.discount) / 100)
  }, 0)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!lines.some(l => l.description && l.unit_price)) { toast.error('Add at least one line item'); return }
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      valid_until: validUntil || null,
      discount,
      notes,
      terms,
      line_items: lines.filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title="New Quotation" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Valid Until">
            <NepaliDatePicker value={validUntil} onChange={setValidUntil} />
          </Field>
          <Field label="Discount (NPR)" hint="Flat discount on subtotal">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><Plus size={12} /> Add line</button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium w-24">Type</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Disc%</th>
                <th className="px-2 py-2 w-8" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'service' && quoCreateServices.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <select value={l.service_id?.toString() ?? ''} onChange={e => e.target.value ? selectQuoCreateService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))} className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full">
                            <option value="">From catalog…</option>
                            {quoCreateServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Or enter description" className="border-0 outline-none text-xs bg-transparent w-full" required />}
                        </div>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" required />
                      )}
                    </td>
                    <td className="px-2 py-1.5"><select value={l.line_type} onChange={e => {
                      const t = e.target.value as 'service' | 'product'
                      setLines(ls => ls.map((ln, j) => j === i ? { ...ln, line_type: t, service_id: undefined, description: '', unit_price: '' } : ln))
                    }} className="w-full border-0 outline-none text-xs bg-transparent"><option value="service">Service</option><option value="product">Product</option></select></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" required /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5 text-center">{lines.length > 1 && <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-2 text-sm text-gray-600">Subtotal: <span className="font-semibold ml-2">{npr(subtotal)}</span></div>
        </div>
        <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="Payment terms, validity conditions…" /></Field>
        <Field label="Terms"><textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} className={inputCls} placeholder="T&C, delivery conditions…" /></Field>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Quotation
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Quotation Edit Modal ─────────────────────────────────────────────────────

function QuotationEditModal({ quo, onClose }: { quo: Quotation; onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState(String(quo.customer ?? ''))
  const [validUntil, setValidUntil] = useState(quo.valid_until ?? '')
  const [notes, setNotes] = useState(quo.notes)
  const [terms, setTerms] = useState(quo.terms)
  const [discount, setDiscount] = useState(quo.discount)
  const [lines, setLines] = useState<LineItemDraft[]>(
    quo.line_items.length > 0
      ? quo.line_items.map(l => ({ description: l.description ?? '', qty: String(l.qty ?? 1), unit_price: String(l.unit_price ?? ''), discount: String(l.discount ?? '0'), line_type: (l.line_type as 'service' | 'product') ?? 'service' }))
      : [emptyLine()]
  )

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.QUOTATION_DETAIL(quo.id), payload),
    onSuccess: () => { toast.success('Quotation updated'); qc.invalidateQueries({ queryKey: ['quotations'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Update failed'),
  })

  const { data: quoEditServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectQuoEditService(lineIdx: number, serviceId: number) {
    const s = quoEditServices.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    const gross = Number(l.qty) * Number(l.unit_price)
    return s + gross - gross * (Number(l.discount) / 100)
  }, 0)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      valid_until: validUntil || null,
      discount,
      notes,
      terms,
      line_items: lines.filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title={`Edit ${quo.quotation_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Valid Until">
            <NepaliDatePicker value={validUntil} onChange={setValidUntil} />
          </Field>
          <Field label="Discount (NPR)">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><Plus size={12} /> Add line</button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium w-24">Type</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Disc%</th>
                <th className="px-2 py-2 w-8" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'service' && quoEditServices.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <select value={l.service_id?.toString() ?? ''} onChange={e => e.target.value ? selectQuoEditService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))} className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full">
                            <option value="">From catalog…</option>
                            {quoEditServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Or enter description" className="border-0 outline-none text-xs bg-transparent w-full" />}
                        </div>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                      )}
                    </td>
                    <td className="px-2 py-1.5"><select value={l.line_type} onChange={e => {
                      const t = e.target.value as 'service' | 'product'
                      setLines(ls => ls.map((ln, j) => j === i ? { ...ln, line_type: t, service_id: undefined, description: '', unit_price: '' } : ln))
                    }} className="w-full border-0 outline-none text-xs bg-transparent"><option value="service">Service</option><option value="product">Product</option></select></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5 text-center">{lines.length > 1 && <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-2 text-sm text-gray-600">Subtotal: <span className="font-semibold ml-2">{npr(subtotal)}</span></div>
        </div>
        <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
        <Field label="Terms"><textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} className={inputCls} /></Field>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Debit Note Create Modal ──────────────────────────────────────────────────

function DebitNoteCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [billId, setBillId] = useState('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: bills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills-mini'],
    queryFn: () => apiClient.get(`${ACCOUNTING.BILLS}?page_size=200&ordering=-created_at`).then(r => toPage<Bill>(r.data)),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.DEBIT_NOTES, payload),
    onSuccess: () => { toast.success('Debit note created'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create debit note'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!billId) { toast.error('Select a bill'); return }
    const validLines = lines.filter(l => l.description && l.unit_price)
    if (!validLines.length) { toast.error('Add at least one line item'); return }
    mutation.mutate({
      bill: Number(billId),
      reason,
      line_items: validLines.map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price })),
    })
  }

  return (
    <Modal title="New Debit Note" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bill *</label>
          <select value={billId} onChange={e => setBillId(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— Select bill —</option>
            {bills?.results?.map(b => (
              <option key={b.id} value={b.id}>{b.bill_number} — {b.supplier_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason for return</label>
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Defective goods returned to supplier" />
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
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {mutation.isPending ? 'Creating…' : 'Create Debit Note'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Debit Note Edit Modal ────────────────────────────────────────────────────

function DebitNoteEditModal({ dn, onClose }: { dn: DebitNote; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState(dn.reason ?? '')
  const [lines, setLines] = useState<LineItemDraft[]>(() =>
    dn.line_items.length > 0
      ? dn.line_items.map(l => ({
          description: String(l.description ?? ''),
          qty:         String(l.qty ?? 1),
          unit_price:  String(l.unit_price ?? ''),
          discount:    String(l.discount ?? '0'),
          line_type:   (l.line_type as 'service' | 'product') ?? 'service',
        }))
      : [emptyLine()]
  )

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.DEBIT_NOTE_DETAIL(dn.id), payload),
    onSuccess: () => { toast.success('Debit note updated'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      reason,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price })),
    })
  }

  return (
    <Modal title={`Edit ${dn.debit_note_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason">
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for return" className={inputCls} />
        </Field>
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
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Debit Notes Tab ──────────────────────────────────────────────────────────

const DN_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', issued: 'bg-blue-100 text-blue-700',
  applied: 'bg-emerald-100 text-emerald-700', void: 'bg-red-100 text-red-500',
}

function DebitNotesTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const { fyYear } = useFY()
  const [showCreate, setShowCreate] = useState(false)
  const [editDn, setEditDn] = useState<DebitNote | null>(null)
  const [focusedDebitNoteId, setFocusedDebitNoteId] = useState<number | null>(null)
  const focusDebitNoteId = Number(searchParams.get('focus_debit_note_id') ?? 0)

  const { data, isLoading } = useQuery<ApiPage<DebitNote>>({
    queryKey: ['debit-notes', statusFilter, fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.DEBIT_NOTES + (statusFilter ? `?status=${statusFilter}` : ''), fyYear)).then(r => toPage<DebitNote>(r.data)),
  })

  const mutateIssue = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.DEBIT_NOTE_ISSUE(id)), onSuccess: () => { toast.success('Debit note issued'); qc.invalidateQueries({ queryKey: ['debit-notes'] }) }, onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Failed') })
  const mutateVoid  = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.DEBIT_NOTE_VOID(id)),  onSuccess: () => { toast.success('Debit note voided');  qc.invalidateQueries({ queryKey: ['debit-notes'] }) }, onError: () => toast.error('Failed') })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.DEBIT_NOTE_DETAIL(id)),
    onSuccess: () => { toast.success('Debit note deleted'); qc.invalidateQueries({ queryKey: ['debit-notes'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed to delete'),
  })

  useEffect(() => {
    if (!focusDebitNoteId) return
    setFocusedDebitNoteId(focusDebitNoteId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`debit-note-row-${focusDebitNoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingTabUrl('debit-notes'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusDebitNoteId, navigate])

  return (
    <div className="space-y-4">
      {showCreate && <DebitNoteCreateModal onClose={() => setShowCreate(false)} />}
      {editDn && <DebitNoteEditModal dn={editDn} onClose={() => setEditDn(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'issued', 'applied', 'void'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} debit notes</span>
          {can('can_manage_accounting') && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <Plus size={15} /> New Debit Note
            </button>
          )}
        </div>
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
                    <tr
                      key={dn.id}
                      id={`debit-note-row-${dn.id}`}
                      className={`hover:bg-gray-50 transition-colors ${focusedDebitNoteId === dn.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                    >
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
                          {dn.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => setEditDn(dn)} title="Edit"
                              className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                              <Pencil size={13} />
                            </button>
                          )}
                          {dn.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => confirm({ title: 'Delete Debit Note', message: `Delete ${dn.debit_note_number}?`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(dn.id) })}
                              title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
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

// ─── TDS Edit Modal ───────────────────────────────────────────────────────────

function TDSEditModal({ entry, onClose }: { entry: TDSEntry; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    supplier_name: entry.supplier_name,
    supplier_pan: entry.supplier_pan,
    taxable_amount: entry.taxable_amount,
    tds_rate: String(Number(entry.tds_rate) * 100),  // stored as 0.10, display as 10
    period_month: String(entry.period_month),
    period_year: String(entry.period_year),
  })
  const mutation = useMutation({
    mutationFn: (d: typeof form) => apiClient.patch(ACCOUNTING.TDS_DETAIL(entry.id), {
      ...d,
      tds_rate: String(Number(d.tds_rate) / 100),  // convert back to 0-1 range
    }),
    onSuccess: () => { toast.success('TDS entry updated'); qc.invalidateQueries({ queryKey: ['tds'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Update failed'),
  })
  return (
    <Modal title="Edit TDS Entry" onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); mutation.mutate(form) }}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Supplier / Employee Name">
            <input data-lpignore="true" value={form.supplier_name} onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="PAN Number">
            <input data-lpignore="true" value={form.supplier_pan} onChange={e => setForm(f => ({ ...f, supplier_pan: e.target.value }))} className={inputCls} placeholder="9-digit PAN" />
          </Field>
          <Field label="Taxable Amount">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={form.taxable_amount} onChange={e => setForm(f => ({ ...f, taxable_amount: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="TDS Rate %" hint="e.g. 10 for 10%">
            <input data-lpignore="true" type="number" min="0" max="50" step="0.01" value={form.tds_rate} onChange={e => setForm(f => ({ ...f, tds_rate: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Nepali Month (1–12)">
            <input data-lpignore="true" type="number" min="1" max="12" value={form.period_month} onChange={e => setForm(f => ({ ...f, period_month: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Nepali Year">
            <input data-lpignore="true" type="number" min="2070" value={form.period_year} onChange={e => setForm(f => ({ ...f, period_year: e.target.value }))} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── TDS Tab ─────────────────────────────────────────────────────────────────

const NEPALI_MONTHS = ['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashoj','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra']

function TDSTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [editTds, setEditTds] = useState<TDSEntry | null>(null)
  const thisYear = currentFiscalYear().bsYear

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
  const mutateDeleteTds = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.TDS_DETAIL(id)),
    onSuccess: () => { toast.success('TDS entry deleted'); qc.invalidateQueries({ queryKey: ['tds'] }); qc.invalidateQueries({ queryKey: ['tds-summary'] }) },
    onError: () => toast.error('Delete failed'),
  })

  const summary = Array.isArray(summaryData) ? summaryData : []
  const totalPending   = summary.filter((r: {status: string; total_tds: string}) => r.status === 'pending').reduce((s: number, r: {total_tds: string}) => s + Number(r.total_tds), 0)
  const totalDeposited = summary.filter((r: {status: string; total_tds: string}) => r.status === 'deposited').reduce((s: number, r: {total_tds: string}) => s + Number(r.total_tds), 0)

  return (
    <div className="space-y-5">
      {editTds && <TDSEditModal entry={editTds} onClose={() => setEditTds(null)} />}
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
        <input data-lpignore="true" type="number" placeholder={`Year (e.g. ${thisYear})`} value={yearFilter} onChange={e => setYearFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
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
                          <input data-lpignore="true" value={depRef[t.id] ?? ''} onChange={e => setDepRef(p => ({ ...p, [t.id]: e.target.value }))} placeholder="IRD receipt #" className="border border-gray-200 rounded px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 items-center">
                          {t.status === 'pending' && can('can_manage_accounting') && (
                            <button onClick={() => setEditTds(t)} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={12} /></button>
                          )}
                          {t.status === 'pending' && (
                            <button onClick={() => mutateDeposit.mutate({ id: t.id, ref: depRef[t.id] ?? '' })} disabled={mutateDeposit.isPending}
                              className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap disabled:opacity-50">
                              Mark Deposited
                            </button>
                          )}
                          {t.status === 'pending' && can('can_manage_accounting') && (
                            <button onClick={() => confirm({ title: 'Delete TDS Entry', message: `Delete TDS entry for ${t.supplier_name}?`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeleteTds.mutate(t.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={12} /></button>
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

// ─── Bank Reconciliation Tab ──────────────────────────────────────────────────

function BankReconciliationTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [selected, setSelected] = useState<BankReconciliation | null>(null)
  const [newLine, setNewLine] = useState({ date: '', description: '', amount: '' })
  const [showNew, setShowNew] = useState(false)
  const [lineSearch, setLineSearch] = useState('')
  const [newRec, setNewRec] = useState({ bank_account: '', statement_date: '', opening_balance: '', closing_balance: '', notes: '' })
  const [showCreate, setShowCreate] = useState(false)

  const { data: banks } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => toPage<BankAccount>(r.data)),
  })

  const { data, isLoading } = useQuery<ApiPage<BankReconciliation>>({
    queryKey: ['bank-reconciliations'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_RECONCILIATIONS).then(r => toPage<BankReconciliation>(r.data)),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<BankReconciliation>({
    queryKey: ['bank-reconciliation', selected?.id],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_RECONCILIATION_DETAIL(selected!.id)).then(r => {
      const payload = r.data?.data ?? r.data
      return {
        ...payload,
        lines: Array.isArray(payload?.lines) ? payload.lines : [],
      } as BankReconciliation
    }),
    enabled: !!selected,
  })

  const detailLines = Array.isArray(detail?.lines) ? detail.lines : []
  const filteredDetailLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase()
    if (!q) return detailLines
    return detailLines.filter(line =>
      String(line.description ?? '').toLowerCase().includes(q) ||
      String(line.date ?? '').toLowerCase().includes(q) ||
      String(line.amount ?? '').toLowerCase().includes(q),
    )
  }, [detailLines, lineSearch])

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
  const mutateDeleteRec = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.BANK_RECONCILIATION_DETAIL(id)),
    onSuccess: () => { toast.success('Reconciliation deleted'); qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }); setSelected(null) },
    onError: () => toast.error('Delete failed'),
  })

  const bankList: Array<{id: number; name: string; bank_name: string}> = banks?.results ?? []

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
              <NepaliDatePicker value={newRec.statement_date} onChange={v => setNewRec(p => ({ ...p, statement_date: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opening Balance</label>
              <input data-lpignore="true" type="number" step="0.01" value={newRec.opening_balance} onChange={e => setNewRec(p => ({ ...p, opening_balance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Closing Balance</label>
              <input data-lpignore="true" type="number" step="0.01" value={newRec.closing_balance} onChange={e => setNewRec(p => ({ ...p, closing_balance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
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
              <div key={rec.id} className={`rounded-xl border transition-colors ${selected?.id === rec.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50'}`}>
                <button onClick={() => setSelected(rec)} className="w-full text-left p-4">
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
                {can('can_manage_accounting') && rec.status !== 'reconciled' && (
                  <div className="px-4 pb-3 flex justify-end border-t border-gray-100 pt-2">
                    <button onClick={() => confirm({ title: 'Delete Reconciliation', message: `Delete reconciliation for ${rec.bank_account_name} (${fmt(rec.statement_date)})? All statement lines will be removed.`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeleteRec.mutate(rec.id) })} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"><Trash2 size={11} /> Delete</button>
                  </div>
                )}
              </div>
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
                      <NepaliDatePicker value={newLine.date} onChange={v => setNewLine(p => ({ ...p, date: v }))} />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <input data-lpignore="true" value={newLine.description} onChange={e => setNewLine(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Customer payment" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                      <input data-lpignore="true" type="number" step="0.01" value={newLine.amount} onChange={e => setNewLine(p => ({ ...p, amount: e.target.value }))} placeholder="+ inflow, − outflow" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <button onClick={() => mutateAddLine.mutate()} disabled={mutateAddLine.isPending || !newLine.date || !newLine.description || !newLine.amount}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                      {mutateAddLine.isPending ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="relative max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input data-lpignore="true"
                      value={lineSearch}
                      onChange={e => setLineSearch(e.target.value)}
                      placeholder="Search line description, date, amount..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date', 'Description', 'Amount', 'Matched', 'Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredDetailLines.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">{detailLines.length === 0 ? 'No statement lines yet. Add lines above.' : 'No statement lines match your search.'}</td></tr>
                    ) : filteredDetailLines.map(line => (
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

// ─── Recurring Journal Edit Modal ─────────────────────────────────────────────

function RecurringJournalEditModal({ rj, onClose }: { rj: RecurringJournal; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: rj.name,
    description: rj.description ?? '',
    frequency: rj.frequency,
    end_date: rj.end_date ?? '',
  })
  const [templateLines, setTemplateLines] = useState(
    rj.template_lines.length > 0
      ? rj.template_lines.map(l => ({ account_code: l.account_code, debit: l.debit, credit: l.credit, description: l.description }))
      : [{ account_code: '', debit: '', credit: '', description: '' }]
  )

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.RECURRING_JOURNAL_DETAIL(rj.id), payload),
    onSuccess: () => { toast.success('Template updated'); qc.invalidateQueries({ queryKey: ['recurring-journals'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed to update'),
  })

  function addLine() { setTemplateLines(p => [...p, { account_code: '', debit: '', credit: '', description: '' }]) }
  function updateLine(i: number, field: string, value: string) {
    setTemplateLines(p => p.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) { toast.error('Name is required'); return }
    mutation.mutate({ ...form, template_lines: templateLines, end_date: form.end_date || null })
  }

  return (
    <Modal title={`Edit — ${rj.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input data-lpignore="true" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
            <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date (optional)</label>
            <NepaliDatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} label="End Date" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input data-lpignore="true" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Journal Lines</label>
            <button type="button" onClick={addLine} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"><Plus size={12} /> Add Line</button>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>{['Account Code', 'Description', 'Debit', 'Credit', ''].map(h => <th key={h} className="px-2 py-2 text-left font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {templateLines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1"><input data-lpignore="true" value={l.account_code} onChange={e => updateLine(i, 'account_code', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24" placeholder="1001" /></td>
                    <td className="px-2 py-1"><input data-lpignore="true" value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-36" placeholder="Description" /></td>
                    <td className="px-2 py-1"><input data-lpignore="true" type="number" step="0.01" value={l.debit} onChange={e => updateLine(i, 'debit', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24" placeholder="0.00" /></td>
                    <td className="px-2 py-1"><input data-lpignore="true" type="number" step="0.01" value={l.credit} onChange={e => updateLine(i, 'credit', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24" placeholder="0.00" /></td>
                    <td className="px-2 py-1">{templateLines.length > 1 && <button type="button" onClick={() => setTemplateLines(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={13} /></button>}</td>
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
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RecurringJournalsTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [expanded, setExpanded] = useState<number | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editRj, setEditRj] = useState<RecurringJournal | null>(null)
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
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.RECURRING_JOURNAL_DETAIL(id)),
    onSuccess: () => { toast.success('Template deleted'); qc.invalidateQueries({ queryKey: ['recurring-journals'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed to delete'),
  })

  function addTemplateLine() { setTemplateLines(p => [...p, { account_code: '', debit: '', credit: '', description: '' }]) }
  function updateTemplateLine(i: number, field: string, value: string) {
    setTemplateLines(p => p.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }
  function removeTemplateLine(i: number) { setTemplateLines(p => p.filter((_, idx) => idx !== i)) }

  return (
    <div className="space-y-4">
      {editRj && <RecurringJournalEditModal rj={editRj} onClose={() => setEditRj(null)} />}
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
              <input data-lpignore="true" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Monthly Office Rent" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date *</label>
              <NepaliDatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} label="Start Date" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">End Date (optional)</label>
              <NepaliDatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} label="End Date" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input data-lpignore="true" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Monthly office rent — payable on 1st of each month" />
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
                      <td className="px-2 py-1"><input data-lpignore="true" value={l.account_code} onChange={e => updateTemplateLine(i, 'account_code', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="1001" /></td>
                      <td className="px-2 py-1"><input data-lpignore="true" value={l.description} onChange={e => updateTemplateLine(i, 'description', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-40 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Description" /></td>
                      <td className="px-2 py-1"><input data-lpignore="true" type="number" step="0.01" value={l.debit} onChange={e => updateTemplateLine(i, 'debit', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="0.00" /></td>
                      <td className="px-2 py-1"><input data-lpignore="true" type="number" step="0.01" value={l.credit} onChange={e => updateTemplateLine(i, 'credit', e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" placeholder="0.00" /></td>
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
                    {can('can_manage_accounting') && (
                      <button onClick={() => setEditRj(rj)} title="Edit template"
                        className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                        <Pencil size={13} />
                      </button>
                    )}
                    {can('can_manage_accounting') && (
                      <button onClick={() => confirm({ title: 'Delete Template', message: `Delete recurring template "${rj.name}"? This will stop future auto-runs.`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(rj.id) })}
                        title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                        <Trash2 size={13} />
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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountCode = (searchParams.get('account_code') || '').trim()
  const initialDateFrom = searchParams.get('date_from') || fiscalYearAdParams(currentFiscalYear()).date_from
  const initialDateTo = searchParams.get('date_to') || new Date().toISOString().slice(0, 10)
  const initialAutoRun = searchParams.get('auto_run') === '1'
  const { data: accounts } = useQuery<ApiPage<Account>>({
    queryKey: ['accounts-ledger-select'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? { results: r.data as Account[], count: r.data.length }
        : Array.isArray(r.data?.data) ? { results: r.data.data as Account[], count: r.data.data.length }
        : toPage<Account>(r.data)
    ),
  })

  const [accountCode, setAccountCode] = useState(initialAccountCode)
  const [accountInput, setAccountInput] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo]     = useState(initialDateTo)
  const [txSearch, setTxSearch] = useState('')
  const [submitted, setSubmitted] = useState(() => initialAutoRun && !!initialAccountCode)
  const [selectedTxn, setSelectedTxn] = useState<LedgerRow | null>(null)

  const { data: ledger, isLoading, isFetching } = useQuery<LedgerReport>({
    queryKey: ['ledger', accountCode, dateFrom, dateTo],
    queryFn: () => apiClient.get(`${ACCOUNTING.REPORT_LEDGER}?account_code=${accountCode}&date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.data?.data ?? r.data),
    enabled: submitted && !!accountCode,
  })

  const accList = accounts?.results ?? []
  const selectedAccountLabel = useMemo(() => {
    const found = accList.find(a => a.code === accountCode)
    return found ? `${found.code} — ${found.name}` : ''
  }, [accList, accountCode])

  useEffect(() => {
    if (!accountCode || accountInput) return
    if (!selectedAccountLabel) return
    setAccountInput(selectedAccountLabel)
  }, [accountCode, accountInput, selectedAccountLabel])

  const resolveAccountCode = (inputValue: string) => {
    const v = inputValue.trim()
    if (!v) return ''

    const directCode = v.split('—')[0].trim()
    if (accList.some(a => a.code === directCode)) return directCode

    const exactLabel = accList.find(a => `${a.code} — ${a.name}`.toLowerCase() === v.toLowerCase())
    if (exactLabel) return exactLabel.code

    const exactName = accList.find(a => a.name.toLowerCase() === v.toLowerCase())
    if (exactName) return exactName.code

    return ''
  }

  const filteredAccounts = useMemo(() => {
    const q = accountInput.trim().toLowerCase()
    if (!q) return accList
    return accList.filter(a =>
      String(a.code ?? '').toLowerCase().includes(q) ||
      String(a.name ?? '').toLowerCase().includes(q) ||
      String(a.description ?? '').toLowerCase().includes(q),
    )
  }, [accList, accountInput])
  const filteredTransactions = useMemo(() => {
    const rows = ledger?.transactions ?? []
    const q = txSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      String(row.date ?? '').toLowerCase().includes(q) ||
      String(row.entry_number ?? '').toLowerCase().includes(q) ||
      String(row.description ?? '').toLowerCase().includes(q) ||
      String(row.debit ?? '').toLowerCase().includes(q) ||
      String(row.credit ?? '').toLowerCase().includes(q) ||
      String(row.balance ?? '').toLowerCase().includes(q),
    )
  }, [ledger, txSearch])

  const { data: drillJournal, isLoading: drillJournalLoading } = useQuery<JournalEntry | null>({
    queryKey: ['ledger-drill-journal', selectedTxn?.entry_id],
    queryFn: async () => {
      if (!selectedTxn?.entry_id) return null
      const r = await apiClient.get(`${ACCOUNTING.REPORT_DRILL}?node_type=journal_entry&node_id=${selectedTxn.entry_id}`)
      const data = (r.data?.data ?? r.data) as {
        node_id?: number
        entry_number?: string
        date?: string
        description?: string
        reference_type?: string
        reference_id?: number | null
        lines?: Array<{
          line_id?: number
          account_id?: number
          account_code?: string
          account_name?: string
          description?: string
          debit?: string
          credit?: string
        }>
      }

      return {
        id: Number(data.node_id ?? selectedTxn.entry_id),
        entry_number: data.entry_number ?? selectedTxn.entry_number,
        date: data.date ?? selectedTxn.date,
        description: data.description ?? selectedTxn.description,
        reference_type: data.reference_type ?? selectedTxn.reference_type ?? '',
        reference_id: data.reference_id ?? selectedTxn.reference_id ?? null,
        purpose: selectedTxn.purpose ?? '',
        is_posted: true,
        total_debit: '0',
        total_credit: '0',
        reversal_date: null,
        is_reversal: false,
        reversed_by_id: null,
        reversal_reason: '',
        reversed_by_user_name: '',
        reversal_timestamp: null,
        created_by_name: '',
        created_at: '',
        lines: (data.lines ?? []).map(line => ({
          id: Number(line.line_id ?? 0),
          account: Number(line.account_id ?? 0),
          account_code: String(line.account_code ?? ''),
          account_name: String(line.account_name ?? ''),
          description: String(line.description ?? ''),
          debit: String(line.debit ?? '0'),
          credit: String(line.credit ?? '0'),
        })),
      } as JournalEntry
    },
    enabled: !!selectedTxn?.entry_id,
  })

  const { data: drillSource, isLoading: drillSourceLoading } = useQuery<Invoice | Bill | Payment | CreditNote | DebitNote | null>({
    queryKey: ['ledger-drill-source', drillJournal?.reference_type, drillJournal?.reference_id],
    queryFn: async () => {
      if (!drillJournal?.reference_type || !drillJournal?.reference_id) return null
      const refType = drillJournal.reference_type
      const refId = drillJournal.reference_id

      if (refType === 'invoice') {
        const r = await apiClient.get(ACCOUNTING.INVOICE_DETAIL(refId))
        return (r.data?.data ?? r.data) as Invoice
      }
      if (refType === 'bill') {
        const r = await apiClient.get(ACCOUNTING.BILL_DETAIL(refId))
        return (r.data?.data ?? r.data) as Bill
      }
      if (refType === 'payment') {
        const r = await apiClient.get(ACCOUNTING.PAYMENT_DETAIL(refId))
        return (r.data?.data ?? r.data) as Payment
      }
      if (refType === 'credit_note') {
        const r = await apiClient.get(ACCOUNTING.CREDIT_NOTE_DETAIL(refId))
        return (r.data?.data ?? r.data) as CreditNote
      }
      if (refType === 'debit_note') {
        const r = await apiClient.get(ACCOUNTING.DEBIT_NOTE_DETAIL(refId))
        return (r.data?.data ?? r.data) as DebitNote
      }
      return null
    },
    enabled: !!drillJournal?.reference_type && !!drillJournal?.reference_id,
  })

  const sourceRoute = useMemo(
    () => resolveLedgerSourceRoute(drillJournal?.reference_type, drillJournal?.reference_id),
    [drillJournal?.reference_type, drillJournal?.reference_id],
  )

  const openSourceDocument = () => {
    if (!sourceRoute) return
    const extra: Record<string, string | number> = {
      [sourceRoute.key]: sourceRoute.id,
      from: 'ledger',
    }
    navigate(buildAccountingTabUrl(sourceRoute.tab, extra))
    setSelectedTxn(null)
  }

  return (
    <div className="space-y-5">
      {selectedTxn && (
        <Modal title="Ledger Drill-Down" onClose={() => setSelectedTxn(null)}>
          <div className="space-y-4 text-sm">
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <span>Ledger</span>
              <ChevronRight size={12} />
              <span>{selectedTxn.entry_number || 'Voucher'}</span>
              {sourceRoute && (
                <>
                  <ChevronRight size={12} />
                  <span className="capitalize">{String(drillJournal?.reference_type ?? '').replace(/_/g, ' ')}</span>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Voucher</p>
                <p className="font-semibold text-gray-800">{selectedTxn.entry_number}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Date</p>
                <p className="font-semibold text-gray-800">{fmt(selectedTxn.date)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Reference</p>
                <p className="font-medium text-gray-700">{selectedTxn.reference_type ?? '—'}{selectedTxn.reference_id ? ` #${selectedTxn.reference_id}` : ''}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Purpose</p>
                <p className="font-medium text-gray-700">{selectedTxn.purpose || '—'}</p>
              </div>
            </div>

            {drillJournalLoading ? (
              <div className="flex items-center gap-2 text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading voucher lines...</div>
            ) : drillJournal ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Voucher Lines</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wide">Account</th>
                        <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wide">Description</th>
                        <th className="px-3 py-2 text-right text-gray-500 uppercase tracking-wide">Debit</th>
                        <th className="px-3 py-2 text-right text-gray-500 uppercase tracking-wide">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(drillJournal.lines ?? []).map(line => (
                        <tr key={line.id}>
                          <td className="px-3 py-2"><span className="font-mono text-indigo-600 text-[11px] mr-2">{line.account_code}</span>{line.account_name}</td>
                          <td className="px-3 py-2 text-gray-500">{line.description || '—'}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{Number(line.debit) > 0 ? npr(line.debit) : '—'}</td>
                          <td className="px-3 py-2 text-right text-red-600">{Number(line.credit) > 0 ? npr(line.credit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Voucher details not available.</p>
            )}

            {drillJournal?.reference_type && (
              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source Document</p>
                  {sourceRoute && (
                    <button
                      onClick={openSourceDocument}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      Open Full Document <ChevronRight size={12} />
                    </button>
                  )}
                </div>
                {drillSourceLoading ? (
                  <div className="flex items-center gap-2 text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading source...</div>
                ) : drillSource ? (
                  <div className="space-y-1 text-gray-700">
                    {'invoice_number' in drillSource && <p>Invoice: <span className="font-semibold">{drillSource.invoice_number}</span></p>}
                    {'bill_number' in drillSource && <p>Bill: <span className="font-semibold">{drillSource.bill_number}</span></p>}
                    {'payment_number' in drillSource && <p>Payment: <span className="font-semibold">{drillSource.payment_number}</span></p>}
                    {'credit_note_number' in drillSource && <p>Credit Note: <span className="font-semibold">{drillSource.credit_note_number}</span></p>}
                    {'debit_note_number' in drillSource && <p>Debit Note: <span className="font-semibold">{drillSource.debit_note_number}</span></p>}
                    {'total' in drillSource && <p>Total: <span className="font-semibold">{npr((drillSource as Invoice | Bill | CreditNote | DebitNote).total)}</span></p>}
                    {'amount' in drillSource && <p>Amount: <span className="font-semibold">{npr((drillSource as Payment).amount)}</span></p>}
                    {'status' in drillSource && <p>Status: <span className="font-semibold capitalize">{String((drillSource as { status?: string }).status ?? '—')}</span></p>}
                  </div>
                ) : (
                  <p className="text-gray-500">No linked source document available.</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Account</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                data-lpignore="true"
                value={accountInput || selectedAccountLabel}
                onFocus={() => setAccountDropdownOpen(true)}
                onBlur={() => setTimeout(() => setAccountDropdownOpen(false), 120)}
                onChange={e => {
                  const v = e.target.value
                  setAccountInput(v)
                  setAccountCode(resolveAccountCode(v))
                  setSubmitted(false)
                  setAccountDropdownOpen(true)
                }}
                placeholder="Search and select account..."
                className="w-full border border-gray-200 rounded-lg pl-8 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />

              {accountDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">No matching accounts</div>
                  ) : (
                    filteredAccounts.slice(0, 120).map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          const label = `${a.code} — ${a.name}`
                          setAccountInput(label)
                          setAccountCode(a.code)
                          setSubmitted(false)
                          setAccountDropdownOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50"
                      >
                        <span className="font-mono text-xs text-indigo-600 mr-2">{a.code}</span>
                        <span>{a.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <NepaliDatePicker value={dateFrom} onChange={v => { setDateFrom(v); setSubmitted(false) }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <NepaliDatePicker value={dateTo} onChange={v => { setDateTo(v); setSubmitted(false) }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={() => { if (!accountCode) { toast.error('Select an account'); return } setSubmitted(true) }} disabled={!accountCode || isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Run Ledger
          </button>
          <button onClick={() => { const p = fiscalYearAdParams(currentFiscalYear()); setDateFrom(p.date_from); setDateTo(new Date().toISOString().slice(0, 10)); setSubmitted(false) }}
            className="px-3 py-2 text-xs font-semibold border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">
            This FY
          </button>
          <button onClick={() => {
            const fy = currentFiscalYear(); const { startAd } = fiscalYearDateRange(fy)
            const lastFy = fiscalYearOf(new Date(startAd.getTime() - 86_400_000))
            const p = fiscalYearAdParams(lastFy); setDateFrom(p.date_from); setDateTo(p.date_to); setSubmitted(false)
          }}
            className="px-3 py-2 text-xs font-semibold border border-gray-300 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            Last FY
          </button>
        </div>
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
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input data-lpignore="true"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="Search entry #, description, amount..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">{(ledger.transactions ?? []).length === 0 ? 'No transactions in this period' : 'No transactions match your search'}</div>
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
                  {filteredTransactions.map((row, i) => (
                    <tr
                      key={`${row.entry_id ?? row.entry_number}-${row.line_id ?? i}`}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                      onClick={() => {
                        if (!row.entry_id) {
                          toast.error('Voucher details are not linked for this row.')
                          return
                        }
                        setSelectedTxn(row)
                      }}
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(row.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700 underline underline-offset-2">{row.entry_number}</td>
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
  const tenantName = useTenantStore(s => s.tenantName)
  const tenantLogo = useTenantStore(s => s.logo)
  const currentUser = useAuthStore(s => s.user)
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [entrySearch, setEntrySearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [expandedEntry, setExpandedEntry] = useState<Set<string>>(new Set())

  const { data: dayBook, isLoading, isFetching } = useQuery<DayBookRangeReport>({
    queryKey: ['day-book', dateFrom, dateTo],
    queryFn: () => apiClient.get(`${ACCOUNTING.REPORT_DAY_BOOK}?date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.data?.data ?? r.data),
    enabled: submitted,
  })

  const filteredDays = useMemo(() => {
    const days = dayBook?.days ?? []
    const q = entrySearch.trim().toLowerCase()
    return days
      .map(day => {
        const entries = (day.entries ?? []).filter(entry => {
          if (!q) return true
          return (
            String(entry.entry_number ?? '').toLowerCase().includes(q)
            || String(entry.description ?? '').toLowerCase().includes(q)
            || String(entry.reference_type ?? '').toLowerCase().includes(q)
            || (entry.lines ?? []).some(line =>
              String(line.account_code ?? '').toLowerCase().includes(q)
              || String(line.account_name ?? '').toLowerCase().includes(q)
              || String(line.description ?? '').toLowerCase().includes(q),
            )
          )
        })
        const totalDebit = entries.reduce((sum, e) => sum + Number(e.total_debit || 0), 0)
        const totalCredit = entries.reduce((sum, e) => sum + Number(e.total_credit || 0), 0)
        return {
          ...day,
          entries,
          total_debit: String(totalDebit),
          total_credit: String(totalCredit),
          entry_count: entries.length,
        }
      })
      .filter(day => day.entries.length > 0 || !q)
  }, [dayBook, entrySearch])

  const flattenedEntries = useMemo(
    () => filteredDays.flatMap(day => (day.entries ?? []).map(entry => ({
      day,
      entry,
      key: `${day.date}::${entry.entry_number}`,
    }))),
    [filteredDays],
  )

  const filteredEntryCount = flattenedEntries.length

  const exportCsv = useCallback(() => {
    if (!dayBook) return
    const lines = ['Date,Entry Number,Reference Type,Entry Description,Account Code,Account Name,Line Description,Debit,Credit']
    ;(filteredDays ?? []).forEach(day => {
      (day.entries ?? []).forEach(entry => {
        (entry.lines ?? []).forEach(line => {
          const row = [
            day.date,
            entry.entry_number,
            entry.reference_type || '',
            entry.description || '',
            line.account_code || '',
            line.account_name || '',
            line.description || '',
            line.debit || '0',
            line.credit || '0',
          ]
            .map(v => `"${String(v).replace(/"/g, '""')}"`)
            .join(',')
          lines.push(row)
        })
      })
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `day_book_${dayBook.date_from}_to_${dayBook.date_to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [dayBook, filteredDays])

  const openPrintableReport = useCallback((mode: 'print' | 'pdf') => {
    if (!dayBook) return
    const esc = (v: string) => v
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

    const companyDisplay = esc(tenantName || 'Company')
    const preparedBy = esc(currentUser?.full_name || currentUser?.email || currentUser?.username || 'System User')
    const now = new Date()
    const preparedAt = now.toLocaleString('en-GB', {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })

    const logoHtml = tenantLogo
      ? `<img src="${esc(tenantLogo)}" alt="${companyDisplay} logo" style="height:40px;max-width:180px;object-fit:contain;display:block;margin-bottom:4px;" />`
      : ''

    const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Day Book ${dayBook.date_from} to ${dayBook.date_to}</title><style>
      body{font-family:Arial,sans-serif;padding:16px;color:#111827;font-size:12px}
      .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #d1d5db;padding-bottom:10px;margin-bottom:10px}
      .title{font-size:16px;font-weight:700;margin:0 0 3px}
      .meta{font-size:11px;color:#4b5563;line-height:1.5}
      .period{border:1px solid #e5e7eb;background:#f9fafb;padding:6px 10px;border-radius:3px;margin-bottom:10px;font-size:11px;color:#374151}
      table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px}
      th,td{border:1px solid #e5e7eb;padding:5px 6px;vertical-align:top}
      th{background:#f3f4f6;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;color:#4b5563}
      .right{text-align:right}
      .day{margin-top:12px;font-weight:700;color:#374151}
      .sign{display:flex;gap:12px;margin-top:14px}
      .sign-box{flex:1;border:1px solid #e5e7eb;border-radius:3px;padding:8px 10px}
      .sign-title{font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:#6b7280;font-weight:700;margin-bottom:16px}
      .sign-line{border-top:1px solid #9ca3af;padding-top:4px;display:flex;justify-content:space-between;color:#4b5563;font-size:10px}
      @media print { body{padding:8px} }
    </style></head><body>
      <div class="top">
        <div>
          ${logoHtml}
          <div class="title">${companyDisplay}</div>
          <div class="meta">Day Book Statement</div>
        </div>
        <div class="meta" style="text-align:right;">Entries: ${filteredEntryCount}<br/>Generated: ${esc(preparedAt)}</div>
      </div>
      <div class="period"><strong>Time Period:</strong> ${esc(dayBook.date_from)} to ${esc(dayBook.date_to)}</div>
      ${(filteredDays ?? []).map(day => `
        <div class="day">Date: ${esc(day.date)}</div>
        <table>
          <thead><tr><th>Entry</th><th>Description</th><th>Account</th><th>Line Description</th><th class="right">Debit</th><th class="right">Credit</th></tr></thead>
          <tbody>
            ${(day.entries ?? []).flatMap(entry =>
              (entry.lines ?? []).map(line => `
                <tr>
                  <td>${esc(entry.entry_number)}</td>
                  <td>${esc(entry.description || '-')}</td>
                  <td>${esc(`${line.account_code} ${line.account_name}`.trim())}</td>
                  <td>${esc(line.description || '-')}</td>
                  <td class="right">${Number(line.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td class="right">${Number(line.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              `),
            ).join('')}
          </tbody>
        </table>
      `).join('')}
      <div class="sign">
        <div class="sign-box">
          <div class="sign-title">Prepared By</div>
          <div class="sign-line"><span>${preparedBy}</span><span>${esc(preparedAt)}</span></div>
        </div>
        <div class="sign-box">
          <div class="sign-title">Approved By</div>
          <div class="sign-line"><span>Name: ____________________</span><span>Date: ____________________</span></div>
        </div>
      </div>
    </body></html>`

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)

    const cleanup = () => {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
      }, 800)
    }

    iframe.onload = () => {
      try {
        const win = iframe.contentWindow
        if (!win) {
          cleanup()
          toast.error('Unable to open print preview')
          return
        }
        if (mode === 'pdf') {
          toast('In the print dialog, choose Save as PDF')
        }
        win.focus()
        win.print()
      } finally {
        cleanup()
      }
    }

    iframe.srcdoc = html
  }, [dayBook, filteredDays, filteredEntryCount, tenantLogo, tenantName, currentUser])

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <NepaliDatePicker value={dateFrom} onChange={v => { setDateFrom(v); setSubmitted(false) }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <NepaliDatePicker value={dateTo} onChange={v => { setDateTo(v); setSubmitted(false) }} />
          </div>
          <button onClick={() => setSubmitted(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <CalendarDays size={14} />}
            Load Day Book
          </button>
          <div className="relative min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input data-lpignore="true"
              value={entrySearch}
              onChange={e => setEntrySearch(e.target.value)}
              placeholder="Search entry #, description, account..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
          {dayBook && !isLoading && filteredEntryCount > 0 && (
            expandedEntry.size === filteredEntryCount && filteredEntryCount > 0
              ? <button onClick={() => setExpandedEntry(new Set())}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsDownUp size={14} /> Collapse All
                </button>
              : <button onClick={() => setExpandedEntry(new Set(flattenedEntries.map(e => e.key)))}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsUpDown size={14} /> Expand All
                </button>
          )}
          {dayBook && !isLoading && (
            <>
              <button onClick={exportCsv}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button onClick={() => openPrintableReport('pdf')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Download size={14} /> PDF
              </button>
              <button onClick={() => openPrintableReport('print')}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <Printer size={14} /> Print
              </button>
            </>
          )}
        </div>
      </div>

      {submitted && (isLoading || isFetching) && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>}

      {dayBook && !isLoading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium">Period</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{fmt(dayBook.date_from)} to {fmt(dayBook.date_to)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
              <p className="text-xs text-emerald-700 font-medium">Total Debit</p>
              <p className="text-base font-bold text-emerald-800 mt-0.5">{npr(dayBook.total_debit)}</p>
            </div>
            <div className="bg-red-50 rounded-xl border border-red-100 p-4">
              <p className="text-xs text-red-700 font-medium">Total Credit</p>
              <p className="text-base font-bold text-red-800 mt-0.5">{npr(dayBook.total_credit)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-500 font-medium">Entries</p>
              <p className="text-base font-bold text-gray-800 mt-0.5">{filteredEntryCount}</p>
            </div>
          </div>

          {filteredEntryCount === 0 ? (
            <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              <CalendarDays size={36} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-500 font-medium">{(dayBook.entry_count ?? 0) === 0 ? `No journal entries from ${fmt(dayBook.date_from)} to ${fmt(dayBook.date_to)}` : 'No journal entries match your search'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDays.map(day => (
                <div key={day.date} className="space-y-2">
                  <div className="px-1 pt-2 text-xs font-semibold text-gray-600 uppercase tracking-wide">{fmt(day.date)}</div>
                  {(day.entries ?? []).map(entry => {
                    const entryKey = `${day.date}::${entry.entry_number}`
                    return (
                      <div key={entryKey} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <button className="w-full px-5 py-4 text-left flex items-center gap-4 hover:bg-gray-50 transition-colors"
                          onClick={() => setExpandedEntry(s => { const n = new Set(s); n.has(entryKey) ? n.delete(entryKey) : n.add(entryKey); return n })}>
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
                          <ChevronDown size={15} className={`shrink-0 text-gray-400 transition-transform ${expandedEntry.has(entryKey) ? '' : '-rotate-90'}`} />
                        </button>
                        {expandedEntry.has(entryKey) && (
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
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Expense Create/Edit Modal ───────────────────────────────────────────────

const EXPENSE_CATEGORIES = [
  { value: 'travel',          label: 'Travel' },
  { value: 'meals',           label: 'Meals & Entertainment' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'utilities',       label: 'Utilities' },
  { value: 'maintenance',     label: 'Maintenance & Repairs' },
  { value: 'marketing',       label: 'Marketing' },
  { value: 'training',        label: 'Training' },
  { value: 'other',           label: 'Other' },
  { value: 'custom',          label: 'Custom...' },
] as const

interface ExpenseModalProps {
  expense?: Expense | null
  onClose: () => void
}

function ExpenseCreateModal({ expense, onClose }: ExpenseModalProps) {
  const qc = useQueryClient()
  const isEdit = !!expense
  const [form, setForm] = useState({
    category: expense?.category ?? 'other',
    custom_category: expense?.custom_category ?? '',
    description: expense?.description ?? '',
    amount: expense?.amount ?? '',
    date: expense?.date ?? new Date().toISOString().slice(0, 10),
    account: expense?.account?.toString() ?? '',
    receipt_url: expense?.receipt_url ?? '',
    notes: expense?.notes ?? '',
    is_recurring: expense?.is_recurring ?? false,
    recur_interval: expense?.recur_interval?.toString() ?? '',
    next_recur_date: expense?.next_recur_date ?? '',
    service: expense?.service?.toString() ?? '',
  })

  const { data: coaData } = useQuery({
    queryKey: ['expense-coa'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?page_size=200&type=expense').then(r => r.data?.results ?? r.data?.data ?? []),
  })
  const { data: expenseServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  const mutate = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      isEdit
        ? apiClient.put(ACCOUNTING.EXPENSE_DETAIL(expense!.id), payload)
        : apiClient.post(ACCOUNTING.EXPENSES, payload),
    onSuccess: () => {
      toast.success(isEdit ? 'Expense updated' : 'Expense created')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Save failed'),
  })

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const payload: Record<string, unknown> = {
      category: form.category,
      custom_category: form.category === 'custom' ? form.custom_category : '',
      description: form.description,
      amount: form.amount,
      date: form.date,
      notes: form.notes,
      receipt_url: form.receipt_url,
      is_recurring: form.is_recurring,
    }
    if (form.account) payload.account = Number(form.account)
    if (form.service) payload.service = Number(form.service)
    else payload.service = null
    if (form.is_recurring) {
      if (form.recur_interval) payload.recur_interval = Number(form.recur_interval)
      if (form.next_recur_date) payload.next_recur_date = form.next_recur_date
    }
    mutate.mutate(payload)
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto max-h-[92vh]">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Expense' : 'New Expense'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
              <select value={form.category} onChange={set('category')} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Amount</label>
              <input data-lpignore="true" type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
            </div>
          </div>
          {form.category === 'custom' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Custom Category Name</label>
              <input data-lpignore="true" type="text" value={form.custom_category} onChange={set('custom_category')} required maxLength={100} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Team Event, Software License" />
            </div>
          )}
          {expenseServices.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Linked Service <span className="font-normal text-gray-400">(optional)</span></label>
              <select value={form.service} onChange={set('service')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">— No service link —</option>
                {expenseServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
            <input data-lpignore="true" type="text" value={form.description} onChange={set('description')} required maxLength={300} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="What was this expense for?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
              <NepaliDatePicker value={form.date} onChange={v => setForm(p => ({ ...p, date: v }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Expense Account (optional)</label>
              <select value={form.account} onChange={set('account')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Auto-select</option>
                {(coaData ?? []).map((a: Account) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Receipt URL (optional)</label>
            <input data-lpignore="true" type="url" value={form.receipt_url} onChange={set('receipt_url')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="https://..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes (optional)</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Additional notes..." />
          </div>
          <div className="flex items-center gap-2">
            <input data-lpignore="true" type="checkbox" id="is_recurring" checked={form.is_recurring} onChange={e => setForm(p => ({ ...p, is_recurring: e.target.checked }))} className="rounded border-gray-300 text-indigo-600" />
            <label htmlFor="is_recurring" className="text-sm text-gray-700">Recurring expense</label>
          </div>
          {form.is_recurring && (
            <div className="grid grid-cols-2 gap-4 pl-6 border-l-2 border-indigo-100">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Repeat every (days)</label>
                <input data-lpignore="true" type="number" min="1" value={form.recur_interval} onChange={set('recur_interval')} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">First recurrence date</label>
                <NepaliDatePicker value={form.next_recur_date} onChange={v => setForm(p => ({ ...p, next_recur_date: v }))} />
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button type="submit" disabled={mutate.isPending} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50">
              {mutate.isPending ? 'Saving...' : isEdit ? 'Update' : 'Create Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Expense Post Modal (Tally-style "Paid Via" selector) ────────────────────

interface ExpensePostModalProps {
  expense: Expense
  onClose: () => void
  onPosted: () => void
}

function ExpensePostModal({ expense, onClose, onPosted }: ExpensePostModalProps) {
  const qc = useQueryClient()

  // Load Bank Accounts (for friendly names) and Cash-in-Hand accounts
  // Only these two groups are valid "paid via" options for an expense.
  const { data: allPayAccounts } = useQuery<Account[]>({
    queryKey: ['expense-payment-accounts'],
    queryFn: () =>
      apiClient
        .get(ACCOUNTING.ACCOUNTS + '?page_size=300&type=asset,liability&no_page=1')
        .then(r => r.data?.data ?? r.data?.results ?? []),
  })

  // Filter to only bank_accounts and cash_in_hand groups so the dropdown
  // doesn't show AR, Inventory, AP, VAT Payable, TDS Payable etc.
  const payAccounts = useMemo(
    () => (allPayAccounts ?? []).filter(
      a => a.group_slug === 'bank_accounts' || a.group_slug === 'cash_in_hand'
    ),
    [allPayAccounts]
  )

  const [paymentAccountId, setPaymentAccountId] = useState<string>(
    expense.payment_account ? String(expense.payment_account) : ''
  )

  // Default to the first cash_in_hand account (seeded as 1100) once loaded
  useEffect(() => {
    if (!paymentAccountId && payAccounts.length) {
      const cash =
        payAccounts.find(a => a.group_slug === 'cash_in_hand') ??
        payAccounts.find(a => a.code === '1100') ??
        payAccounts[0]
      if (cash) setPaymentAccountId(String(cash.id))
    }
  }, [allPayAccounts, paymentAccountId])

  const selectedAccount = payAccounts?.find(a => String(a.id) === paymentAccountId)

  const mutate = useMutation({
    mutationFn: () =>
      apiClient.post(ACCOUNTING.EXPENSE_POST(expense.id), {
        payment_account: paymentAccountId ? Number(paymentAccountId) : undefined,
      }),
    onSuccess: () => {
      toast.success('Expense posted to ledger')
      qc.invalidateQueries({ queryKey: ['expenses'] })
      onPosted()
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string; errors?: string[] } } }) =>
      toast.error(
        e?.response?.data?.detail ??
        e?.response?.data?.errors?.[0] ??
        'Post failed'
      ),
  })

  const drAccount  = expense.account_name || 'Auto-select expense account'
  const crAccount  = selectedAccount ? `${selectedAccount.code} — ${selectedAccount.name}` : 'Select account below'
  const isLiability = selectedAccount?.type === 'liability'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Post to Ledger</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Expense summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Expense</p>
            <p className="text-sm font-semibold text-gray-900">{expense.description}</p>
            <p className="text-xs text-gray-500">{expense.category_display} · {expense.date}</p>
            <p className="text-lg font-bold text-gray-900 pt-1">{npr(expense.amount)}</p>
          </div>

          {/* Tally-style journal preview */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Journal Entry Preview</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                <span>Account</span><span>Dr</span><span>Cr</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-3 border-b border-gray-100 items-center">
                <span className="text-gray-800 font-medium">{drAccount}</span>
                <span className="font-semibold text-gray-900 tabular-nums">{npr(expense.amount)}</span>
                <span className="text-gray-300">—</span>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-4 py-3 items-center">
                <span className={`font-medium ${isLiability ? 'text-amber-700' : 'text-gray-800'}`}>
                  {crAccount}
                  {isLiability && <span className="ml-1.5 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Staff Payable</span>}
                </span>
                <span className="text-gray-300">—</span>
                <span className="font-semibold text-gray-900 tabular-nums">{npr(expense.amount)}</span>
              </div>
            </div>
            {isLiability && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                Recording as liability — the company owes this amount to the person who paid.
              </p>
            )}
          </div>

          {/* Paid Via selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Paid Via <span className="text-gray-400 font-normal">(credit account)</span>
            </label>
            <select
              value={paymentAccountId}
              onChange={e => setPaymentAccountId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Auto-select Cash (1010) —</option>
              {(payAccounts ?? []).map((a: Account) => (
                <option key={a.id} value={String(a.id)}>
                  {a.code} — {a.name} {a.type === 'liability' ? '(Payable)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-400">
              Cash = paid from petty cash · Bank = company account · Liability = employee paid, will reimburse
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutate.mutate()}
            disabled={mutate.isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {mutate.isPending ? 'Posting…' : 'Post to Ledger'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Expenses Tab ─────────────────────────────────────────────────────────────

const EXPENSE_STATUS_COLORS: Record<string, string> = {
  draft:    'bg-gray-100 text-gray-600',
  approved: 'bg-blue-100 text-blue-700',
  posted:   'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

function ExpensesTab() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [postTarget, setPostTarget] = useState<Expense | null>(null)
  const [rejectTarget, setRejectTarget] = useState<Expense | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data, isLoading } = useQuery<{ results: Expense[]; count: number }>({
    queryKey: ['expenses', statusFilter, categoryFilter, dateFrom, dateTo],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter)   params.set('status', statusFilter)
      if (categoryFilter) params.set('category', categoryFilter)
      if (dateFrom)       params.set('date_from', dateFrom)
      if (dateTo)         params.set('date_to', dateTo)
      const qs = params.toString()
      return apiClient.get(ACCOUNTING.EXPENSES + (qs ? `?${qs}` : '')).then(r => {
        // NexusCursorPagination returns { success, data: [...], meta: { pagination: {...} } }
        const raw = r.data?.data ?? r.data
        const list: Expense[] = Array.isArray(raw) ? raw : (raw?.results ?? [])
        const count: number = r.data?.meta?.pagination?.count ?? list.length
        return { results: list, count }
      })
    },
  })

  const mutateApprove = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.EXPENSE_APPROVE(id)),
    onSuccess: () => { toast.success('Expense approved'); qc.invalidateQueries({ queryKey: ['expenses'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })
  const mutateReject = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => apiClient.post(ACCOUNTING.EXPENSE_REJECT(id), { note }),
    onSuccess: () => { toast.success('Expense rejected'); qc.invalidateQueries({ queryKey: ['expenses'] }); setRejectTarget(null); setRejectNote('') },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.EXPENSE_DETAIL(id)),
    onSuccess: () => { toast.success('Expense deleted'); qc.invalidateQueries({ queryKey: ['expenses'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  const expenses = data?.results ?? []
  const totalDraft    = expenses.filter(e => e.status === 'draft').reduce((s, e) => s + Number(e.amount), 0)
  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0)
  const totalPosted   = expenses.filter(e => e.status === 'posted').reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="space-y-5">
      {showCreate && <ExpenseCreateModal onClose={() => setShowCreate(false)} />}
      {editExpense && <ExpenseCreateModal expense={editExpense} onClose={() => setEditExpense(null)} />}
      {postTarget && (
        <ExpensePostModal
          expense={postTarget}
          onClose={() => setPostTarget(null)}
          onPosted={() => setPostTarget(null)}
        />
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Reject Expense</h2>
            <p className="text-sm text-gray-600">Reason for rejecting <strong>{rejectTarget.description}</strong></p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="Rejection reason..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            <div className="flex gap-3">
              <button onClick={() => { setRejectTarget(null); setRejectNote('') }} className="flex-1 border border-gray-200 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={() => mutateReject.mutate({ id: rejectTarget.id, note: rejectNote })} disabled={mutateReject.isPending} className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Draft</p>
          <p className="text-2xl font-bold text-gray-700 mt-1">{npr(totalDraft)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Approved — Pending Post</p>
          <p className="text-2xl font-bold text-blue-800 mt-1">{npr(totalApproved)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Posted to Ledger</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">{npr(totalPosted)}</p>
        </div>
      </div>

      {/* Filter bar + action */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="posted">Posted</option>
          <option value="rejected">Rejected</option>
        </select>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <input data-lpignore="true" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} title="From date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <input data-lpignore="true" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} title="To date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <span className="text-sm text-gray-400 ml-auto">{data?.count ?? expenses.length} expenses</span>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /> New Expense
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
          <Receipt size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 font-medium">No expenses found</p>
          <p className="text-xs text-gray-400 mt-1">Record internal operating expenses here — travel, office supplies, utilities, etc.</p>
          <button onClick={() => setShowCreate(true)} className="mt-4 inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /> Add First Expense
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Category', 'Description', 'Amount', 'Date', 'Status', 'Submitted By', 'Dr Account', 'Paid Via', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {expenses.map(exp => (
                  <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{exp.category_display || exp.category}</span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="truncate font-medium text-gray-800">{exp.description}</p>
                      {exp.is_recurring && <p className="text-xs text-indigo-500 mt-0.5">Recurring every {exp.recur_interval}d</p>}
                      {exp.receipt_url && <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">Receipt</a>}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{npr(exp.amount)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{exp.date}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${EXPENSE_STATUS_COLORS[exp.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {exp.status_display || exp.status}
                      </span>
                      {exp.status === 'rejected' && exp.rejection_note && (
                        <p className="text-xs text-red-500 mt-0.5 max-w-xs truncate" title={exp.rejection_note}>{exp.rejection_note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{exp.submitted_by_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{exp.account_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {exp.status === 'posted' && exp.payment_account_name
                        ? <span title={`${exp.payment_account_code} — ${exp.payment_account_name}`}>{exp.payment_account_code} {exp.payment_account_name}</span>
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center flex-wrap">
                        {(exp.status === 'draft' || exp.status === 'rejected') && (
                          <button onClick={() => setEditExpense(exp)} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={12} /></button>
                        )}
                        {exp.status === 'draft' && can('can_manage_accounting') && (
                          <button onClick={() => mutateApprove.mutate(exp.id)} disabled={mutateApprove.isPending} title="Approve" className="p-1 text-gray-400 hover:text-emerald-600 rounded transition-colors"><CheckCircle size={14} /></button>
                        )}
                        {(exp.status === 'draft' || exp.status === 'approved') && can('can_manage_accounting') && (
                          <button onClick={() => setRejectTarget(exp)} title="Reject" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><XCircle size={14} /></button>
                        )}
                        {exp.status === 'approved' && can('can_manage_accounting') && (
                          <button onClick={() => setPostTarget(exp)} title="Post to Ledger" className="px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap">Post</button>
                        )}
                        {(exp.status === 'draft' || exp.status === 'rejected') && can('can_manage_accounting') && (
                          <button onClick={() => confirm({ title: 'Delete Expense', message: `Delete expense "${exp.description}"?`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDelete.mutate(exp.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Shared "Coming Soon" stub ─────────────────────────────────────────────

export function _ComingSoonTab({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-24 flex flex-col items-center gap-3 shadow-sm">
      <Clock size={40} className="text-gray-200" />
      <p className="text-base font-semibold text-gray-500">{title}</p>
      <p className="text-sm text-gray-400">{hint ?? 'This feature is coming in a future update.'}</p>
    </div>
  )
}

// ─── Sales Orders Tab (accepted quotations awaiting fulfilment) ────────────

function SalesOrdersTab() {
  const qc = useQueryClient()
  const { fyYear } = useFY()
  const { data, isLoading } = useQuery<ApiPage<Quotation>>({
    queryKey: ['quotations', 'accepted', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.QUOTATIONS}?status=accepted`, fyYear)).then(r => toPage<Quotation>(r.data)),
  })
  const orders = data?.results ?? []

  const mutateConvert = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_CONVERT(id)),
    onSuccess: () => { toast.success('Converted to invoice'); qc.invalidateQueries({ queryKey: ['quotations'] }); qc.invalidateQueries({ queryKey: ['invoices'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Convert failed'),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Accepted Orders', value: orders.length,                                         icon: ShoppingCart,  bg: 'bg-blue-50',    color: 'text-blue-600'   },
          { label: 'Total Value',      value: npr(orders.reduce((a, q) => a + Number(q.total), 0)), icon: TrendingUp,    bg: 'bg-green-50',   color: 'text-green-600'  },
          { label: 'Pending Convert',  value: orders.filter(q => !q.converted_invoice).length,      icon: ArrowRightLeft, bg: 'bg-yellow-50', color: 'text-yellow-600' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <c.icon size={20} className={c.color} />
            <div><p className="text-xs text-gray-500">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 justify-between">
        <p className="text-xs text-gray-400">Showing accepted quotations — create orders from the Quotations tab.</p>
        <span className="text-sm text-gray-400">{orders.length} orders</span>
      </div>
      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        orders.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <ShoppingCart size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No accepted orders</p>
            <p className="text-xs text-gray-400 mt-1">Accept a quotation to see it here as a sales order.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['Order #', 'Customer', 'Accepted', 'Total', 'Invoice', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">{q.quotation_number}</td>
                    <td className="px-4 py-3 text-gray-600">{q.customer_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{q.accepted_at ? fmt(q.accepted_at) : '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{npr(q.total)}</td>
                    <td className="px-4 py-3 text-xs">
                      {q.converted_invoice_number
                        ? <span className="text-emerald-700 font-medium">{q.converted_invoice_number}</span>
                        : <span className="text-gray-400">Not yet invoiced</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!q.converted_invoice && (
                        <button onClick={() => mutateConvert.mutate(q.id)} disabled={mutateConvert.isPending}
                          className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 whitespace-nowrap">
                          Convert → Invoice
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ─── Purchase Orders Tab ───────────────────────────────────────────────────

function PurchaseOrderReceiveModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(po.items.map(i => [i.id, String(i.pending_quantity > 0 ? i.pending_quantity : 0)]))
  )
  const [notes, setNotes] = useState('')

  const mutate = useMutation({
    mutationFn: () => apiClient.post(INVENTORY.PURCHASE_ORDER_RECEIVE(po.id), {
      lines: po.items.map(i => ({ item_id: i.id, quantity_received: Number(quantities[i.id] ?? 0) })),
      notes,
    }),
    onSuccess: () => { toast.success('Stock received'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); onClose() },
    onError: () => toast.error('Receive failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Receive Stock — {po.po_number}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 text-left">Product</th>
              <th className="pb-2 text-right">Ordered</th>
              <th className="pb-2 text-right">Received</th>
              <th className="pb-2 text-right">Pending</th>
              <th className="pb-2 text-right">Receive Now</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {po.items.map(item => (
                <tr key={item.id}>
                  <td className="py-2 text-gray-700">{item.product_name}</td>
                  <td className="py-2 text-right text-gray-500">{item.quantity_ordered}</td>
                  <td className="py-2 text-right text-gray-500">{item.quantity_received}</td>
                  <td className="py-2 text-right text-orange-600">{item.pending_quantity}</td>
                  <td className="py-2 text-right">
                    <input data-lpignore="true" type="number" min={0} max={item.pending_quantity}
                      value={quantities[item.id] ?? ''}
                      onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                      className="w-20 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input data-lpignore="true" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} Confirm Receipt
          </button>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrderCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: suppliers = [] } = useQuery<InventorySupplier[]>({
    queryKey: ['inventory-suppliers'],
    queryFn: () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=200`).then(r => toPage<InventorySupplier>(r.data).results),
  })
  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then(r => toPage<InventoryProduct>(r.data).results),
  })

  const [supplierId, setSupplierId] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ product: '', qty: '1', unit_cost: '' }])

  const addItem = () => setItems(prev => [...prev, { product: '', qty: '1', unit_cost: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const mutate = useMutation({
    mutationFn: () => apiClient.post(INVENTORY.PURCHASE_ORDERS, {
      supplier: Number(supplierId),
      expected_delivery: expectedDelivery || null,
      notes,
      items: items.filter(i => i.product).map(i => ({
        product: Number(i.product),
        quantity_ordered: Number(i.qty),
        unit_cost: i.unit_cost || '0',
      })),
    }),
    onSuccess: () => { toast.success('Purchase order created'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create purchase order'),
  })

  const subtotal = items.reduce((a, i) => a + (Number(i.qty) * Number(i.unit_cost || 0)), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-gray-900">New Purchase Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expected Delivery</label>
              <input data-lpignore="true" type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input data-lpignore="true" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</span>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors">
                <Plus size={12} /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select value={item.product} onChange={e => updateItem(i, 'product', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="">Select product…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input data-lpignore="true" type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} placeholder="Qty"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="col-span-3">
                    <input data-lpignore="true" type="number" min={0} step="0.01" value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} placeholder="Unit cost"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="col-span-1 text-right text-xs text-gray-500 tabular-nums">
                    {npr(Number(item.qty || 0) * Number(item.unit_cost || 0))}
                  </div>
                  <div className="col-span-1 text-right">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 text-right text-sm font-semibold text-gray-800">
              Total: {npr(subtotal)}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending || !supplierId}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create PO
          </button>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrderDetailModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const receivedValue = (po.items ?? []).reduce((sum, i) => sum + (Number(i.quantity_received) * Number(i.unit_cost || 0)), 0)
  const pendingValue = Math.max(0, Number(po.total_amount || 0) - receivedValue)

  return (
    <Modal title={`Purchase Order ${po.po_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Supplier</p>
            <p className="text-sm font-semibold text-gray-800">{po.supplier_name}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Status</p>
            <p className="text-sm font-semibold text-gray-800 capitalize">{po.status}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Expected Delivery</p>
            <p className="text-sm font-semibold text-gray-800">{po.expected_delivery ? fmt(po.expected_delivery) : '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm font-semibold text-gray-800">{fmt(po.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-600">Total PO Value</p>
            <p className="text-sm font-bold text-blue-800 tabular-nums">{npr(po.total_amount)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            <p className="text-xs text-emerald-600">Received Value</p>
            <p className="text-sm font-bold text-emerald-800 tabular-nums">{npr(receivedValue)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
            <p className="text-xs text-orange-600">Pending Value</p>
            <p className="text-sm font-bold text-orange-800 tabular-nums">{npr(pendingValue)}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</p>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Product', 'Ordered', 'Received', 'Pending', 'Unit Cost', 'Line Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(po.items ?? []).map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{item.product_name}</td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums">{item.quantity_ordered}</td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums">{item.quantity_received}</td>
                    <td className="px-3 py-2 text-orange-700 tabular-nums">{item.pending_quantity}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{npr(item.unit_cost)}</td>
                    <td className="px-3 py-2 text-gray-800 font-semibold tabular-nums">{npr(item.line_total)}</td>
                  </tr>
                ))}
                {(po.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">No line items found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {po.notes && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{po.notes}</p>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Close</button>
        </div>
      </div>
    </Modal>
  )
}

function PurchaseOrdersTab() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null)
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)

  const { data, isLoading } = useQuery<ApiPage<PurchaseOrder>>({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: () => apiClient.get(`${INVENTORY.PURCHASE_ORDERS}?page_size=200${statusFilter ? `&status=${statusFilter}` : ''}`).then(r => toPage<PurchaseOrder>(r.data)),
  })
  const orders = data?.results ?? []

  const mutateSend = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.PURCHASE_ORDER_SEND(id)),
    onSuccess: () => { toast.success('PO sent to supplier'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateCancel = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.PURCHASE_ORDER_CANCEL(id)),
    onSuccess: () => { toast.success('PO cancelled'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) },
    onError: () => toast.error('Action failed'),
  })

  return (
    <div className="space-y-4">
      {showCreate && <PurchaseOrderCreateModal onClose={() => setShowCreate(false)} />}
      {receiveFor && <PurchaseOrderReceiveModal po={receiveFor} onClose={() => setReceiveFor(null)} />}
      {detailPO && <PurchaseOrderDetailModal po={detailPO} onClose={() => setDetailPO(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'sent', 'partial', 'received', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} purchase orders</span>
          {can('can_manage_accounting') && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New PO
            </button>
          )}
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        orders.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Package size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No purchase orders</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['PO #', 'Supplier', 'Items', 'Total', 'Exp. Delivery', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(po => (
                  <tr
                    key={po.id}
                    onClick={() => setDetailPO(po)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    title="Click to view purchase order details"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700 whitespace-nowrap">{po.po_number}</td>
                    <td className="px-4 py-3 text-gray-600">{po.supplier_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-center">{po.items?.length ?? 0}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">{npr(po.total_amount)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{po.expected_delivery ? fmt(po.expected_delivery) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${PO_STATUS[po.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailPO(po) }}
                          className="px-2 py-1 text-xs bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          View
                        </button>
                        {po.status === 'draft' && can('can_manage_accounting') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); mutateSend.mutate(po.id) }}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                          >
                            Send
                          </button>
                        )}
                        {(po.status === 'sent' || po.status === 'partial') && can('can_manage_accounting') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setReceiveFor(po) }}
                            className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors"
                          >
                            Receive
                          </button>
                        )}
                        {(po.status === 'draft' || po.status === 'sent') && can('can_manage_accounting') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); mutateCancel.mutate(po.id) }}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ─── Quick Payment Tab ──────────────────────────────────────────────────────

function QuickPaymentTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]             = useState(today)
  const [method, setMethod]         = useState('cash')
  const [amount, setAmount]         = useState('')
  const [bankAccId, setBankAccId]   = useState('')
  const [billId, setBillId]         = useState('')
  const [reference, setReference]   = useState('')
  const [notes, setNotes]           = useState('')

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS).then(r => toPage<BankAccount>(r.data).results),
  })
  const { data: openBills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'unpaid-quick'],
    // No status filter — fetch all bills, then client-side exclude paid/void so both draft and approved show
    queryFn: () => apiClient.get(`${ACCOUNTING.BILLS}?page_size=200`).then(r => toPage<Bill>(r.data)),
  })
  const { data: recentPayments } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'outgoing-recent'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=outgoing&page_size=10`).then(r => toPage<Payment>(r.data)),
  })

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'outgoing', date, method, amount,
      bank_account: bankAccId ? Number(bankAccId) : null,
      bill: billId ? Number(billId) : null,
      reference, notes,
    }),
    onSuccess: () => {
      toast.success('Payment recorded')
      setAmount(''); setReference(''); setNotes(''); setBillId('')
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['bills'] })
    },
    onError: () => toast.error('Failed to record payment'),
  })

  const needsBank = method === 'bank_transfer' || method === 'cheque'

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ArrowDownLeft size={16} className="text-red-500" /> Record Outbound Payment</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input data-lpignore="true" type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Method *</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="esewa">eSewa</option>
              <option value="khalti">Khalti</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
          <input data-lpignore="true" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        {needsBank && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
            <select value={bankAccId} onChange={e => setBankAccId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Select bank account…</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Link to Bill (optional)</label>
          <select value={billId} onChange={e => setBillId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">— No bill —</option>
            {(openBills?.results ?? []).filter(b => b.status !== 'paid' && b.status !== 'void').map(b => <option key={b.id} value={b.id}>{b.bill_number} — {b.supplier_name} ({npr(b.amount_due)} due)</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reference</label>
          <input data-lpignore="true" value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque #, txn ref…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
        </div>
        <button onClick={() => mutate.mutate()} disabled={mutate.isPending || !amount || !date}
          className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {mutate.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Record Payment
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2"><Clock size={14} className="text-gray-400" /> Recent Outbound Payments</h3>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Date', 'Method', 'Bill', 'Amount'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(recentPayments?.results ?? []).length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">No recent payments</td></tr>
              ) : recentPayments?.results?.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                  <td className="px-3 py-2.5 capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-3 py-2.5 text-gray-400">{p.bill_number || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-red-600 tabular-nums">{npr(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Quick Receipt Tab ──────────────────────────────────────────────────────

function QuickReceiptTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]           = useState(today)
  const [method, setMethod]       = useState('cash')
  const [amount, setAmount]       = useState('')
  const [bankAccId, setBankAccId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [tdsRatePct, setTdsRatePct] = useState('0')
  const [tdsReference, setTdsReference] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes]         = useState('')

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS).then(r => toPage<BankAccount>(r.data).results),
  })
  const { data: openInvoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'open-quick'],
    // status=issued: the only open/unpaid state in the Invoice lifecycle (draft|issued|paid|void)
    queryFn: () => apiClient.get(`${ACCOUNTING.INVOICES}?status=issued&page_size=200`).then(r => toPage<Invoice>(r.data)),
  })
  const { data: recentPayments } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'incoming-recent'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=incoming&page_size=10`).then(r => toPage<Payment>(r.data)),
  })

  const selectedInvoice = (openInvoices?.results ?? []).find(inv => String(inv.id) === invoiceId)
  const tdsRate = Number(tdsRatePct || '0') / 100
  const grossInvoiceAmount = Number(selectedInvoice?.total || 0)
  const tdsWithheld = tdsRate > 0 && grossInvoiceAmount > 0 ? grossInvoiceAmount * tdsRate : 0
  const netReceipt = grossInvoiceAmount - tdsWithheld

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'incoming', date, method,
      amount: tdsRate > 0 && selectedInvoice ? netReceipt.toFixed(2) : amount,
      bank_account: bankAccId ? Number(bankAccId) : null,
      invoice: invoiceId ? Number(invoiceId) : null,
      tds_rate: tdsRate > 0 ? tdsRate.toFixed(4) : '0',
      tds_reference: tdsReference,
      reference, notes,
    }),
    onSuccess: () => {
      toast.success('Receipt recorded')
      setAmount(''); setReference(''); setNotes(''); setInvoiceId(''); setTdsRatePct('0'); setTdsReference('')
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: () => toast.error('Failed to record receipt'),
  })

  const needsBank = method === 'bank_transfer' || method === 'cheque'

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ArrowUpRight size={16} className="text-green-500" /> Record Inbound Receipt</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <input data-lpignore="true" type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Method *</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="esewa">eSewa</option>
              <option value="khalti">Khalti</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
          <input data-lpignore="true" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        {needsBank && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
            <select value={bankAccId} onChange={e => setBankAccId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="">Select bank account…</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Link to Invoice (optional)</label>
          <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">— No invoice —</option>
            {(openInvoices?.results ?? []).filter(inv => Number(inv.amount_due) > 0).map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.customer_name} ({npr(inv.amount_due)} due)</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer TDS %</label>
            <select value={tdsRatePct} onChange={e => setTdsRatePct(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="0">None (0%)</option>
              <option value="1.5">1.5%</option>
              <option value="10">10%</option>
              <option value="15">15%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">TDS Reference</label>
            <input data-lpignore="true" value={tdsReference} onChange={e => setTdsReference(e.target.value)} placeholder="Form/Certificate #"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
        </div>
        {tdsRate > 0 && selectedInvoice && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex items-center justify-between"><span className="text-gray-600">Gross Invoice</span><span className="font-medium tabular-nums">{npr(grossInvoiceAmount)}</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">TDS Withheld ({tdsRatePct}%)</span><span className="font-medium tabular-nums text-red-700">{npr(tdsWithheld)}</span></div>
            <div className="flex items-center justify-between border-t border-blue-200 pt-1"><span className="text-gray-700 font-semibold">Net Receipt (auto)</span><span className="font-bold tabular-nums text-green-700">{npr(netReceipt)}</span></div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reference</label>
          <input data-lpignore="true" value={reference} onChange={e => setReference(e.target.value)} placeholder="Cheque #, txn ref…"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400 resize-none" />
        </div>
        <button onClick={() => mutate.mutate()} disabled={mutate.isPending || !(tdsRate > 0 && selectedInvoice ? netReceipt > 0 : Number(amount) > 0) || !date}
          className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {mutate.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Record Receipt
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2"><Clock size={14} className="text-gray-400" /> Recent Inbound Receipts</h3>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Date', 'Method', 'Invoice', 'Amount'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(recentPayments?.results ?? []).length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">No recent receipts</td></tr>
              ) : recentPayments?.results?.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                  <td className="px-3 py-2.5 capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-3 py-2.5 text-gray-400">{p.invoice_number || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-green-600 tabular-nums">{npr(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Cash Transfers Tab ─────────────────────────────────────────────────────

function CashTransfersTab() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]         = useState(today)
  const [fromAcc, setFromAcc]   = useState('')
  const [toAcc, setToAcc]       = useState('')
  const [amount, setAmount]     = useState('')
  const [reference, setReference] = useState('')

  const { data: bankAccounts = [], isLoading: loadingBanks } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=200').then(r => toPage<BankAccount>(r.data).results),
  })

  // Load recent cash-transfer journals
  const { data: journalPage } = useQuery<ApiPage<JournalEntry>>({
    queryKey: ['journals', 'cash-transfer'],
    queryFn: () => apiClient.get(`${ACCOUNTING.JOURNALS}?description=Cash+Transfer&page_size=10`).then(r => toPage<JournalEntry>(r.data)),
  })
  const fromBank  = bankAccounts.find(b => String(b.id) === fromAcc)
  const toBank    = bankAccounts.find(b => String(b.id) === toAcc)

  const mutate = useMutation({
    mutationFn: () => {
      if (!fromBank?.linked_account || !toBank?.linked_account) throw new Error('Bank accounts must have linked CoA accounts')
      return apiClient.post(ACCOUNTING.JOURNALS, {
        date,
        description: `Cash Transfer: ${fromBank.name} → ${toBank.name}`,
        reference,
        lines: [
          { account: toBank.linked_account,   debit: amount, credit: '0',    description: `Transfer in from ${fromBank.name}` },
          { account: fromBank.linked_account, debit: '0',    credit: amount, description: `Transfer out to ${toBank.name}` },
        ],
      })
    },
    onSuccess: () => {
      toast.success('Cash transfer recorded')
      setAmount(''); setReference(''); setFromAcc(''); setToAcc('')
      qc.invalidateQueries({ queryKey: ['journals', 'cash-transfer'] })
      qc.invalidateQueries({ queryKey: ['bank-accounts'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Transfer failed'),
  })

  const fromOptions = bankAccounts.filter(b => String(b.id) !== toAcc)
  const toOptions   = bankAccounts.filter(b => String(b.id) !== fromAcc)
  const canSubmit   = fromAcc && toAcc && fromAcc !== toAcc && Number(amount) > 0

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ArrowRightLeft size={16} className="text-indigo-500" /> Internal Fund Transfer</h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
          <input data-lpignore="true" type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From Account *</label>
          <select value={fromAcc} onChange={e => setFromAcc(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">Select account…</option>
            {fromOptions.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To Account *</label>
          <select value={toAcc} onChange={e => setToAcc(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">Select account…</option>
            {toOptions.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
          <input data-lpignore="true" type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reference</label>
          <input data-lpignore="true" value={reference} onChange={e => setReference(e.target.value)} placeholder="Transfer reference"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
        </div>
        {fromBank && !fromBank.linked_account && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            "{fromBank.name}" has no linked CoA account. Link it in Bank Accounts settings before transferring.
          </p>
        )}
        {toBank && !toBank.linked_account && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
            "{toBank.name}" has no linked CoA account. Link it in Bank Accounts settings before transferring.
          </p>
        )}
        <button onClick={() => mutate.mutate()} disabled={mutate.isPending || !canSubmit || loadingBanks}
          className="w-full py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {mutate.isPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowRightLeft size={15} />} Record Transfer
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2"><Clock size={14} className="text-gray-400" /> Recent Transfers</h3>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Date', 'Description', 'Ref', 'Status'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(journalPage?.results ?? []).length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">No transfers yet</td></tr>
              ) : journalPage?.results?.map(j => (
                <tr key={j.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={j.date} /></td>
                  <td className="px-3 py-2.5 text-gray-600 max-w-[180px] truncate">{j.description}</td>
                  <td className="px-3 py-2.5 text-gray-400 font-mono">{j.entry_number}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${j.is_posted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      {j.is_posted ? 'Posted' : 'Draft'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Allocate Customer Payments Tab ────────────────────────────────────────

function AllocateCustomerPaymentsTab() {
  const qc = useQueryClient()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const { data: unallocated, isLoading: loadingPay } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'unallocated-incoming'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=incoming&invoice=null&page_size=100`).then(r => toPage<Payment>(r.data)),
  })
  const { data: openInvoices, isLoading: loadingInv } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'open-allocate'],
    queryFn: () => apiClient.get(`${ACCOUNTING.INVOICES}?status=sent&page_size=200`).then(r => toPage<Invoice>(r.data)),
  })

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENT_ALLOCATE(selectedPayment!.id), { invoice: selectedInvoice!.id }),
    onSuccess: () => {
      toast.success(`Payment ${selectedPayment?.payment_number} allocated to ${selectedInvoice?.invoice_number}`)
      setSelectedPayment(null); setSelectedInvoice(null)
      qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['invoices'] })
    },
    onError: () => toast.error('Allocation failed'),
  })

  const canAllocate = selectedPayment && selectedInvoice

  return (
    <div className="space-y-4">
      {canAllocate && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
          <div className="text-sm text-indigo-800">
            <span className="font-semibold">{selectedPayment.payment_number}</span> ({npr(selectedPayment.amount)})
            <span className="mx-2 text-indigo-400">→</span>
            <span className="font-semibold">{selectedInvoice.invoice_number}</span> ({selectedInvoice.customer_name}, {npr(selectedInvoice.amount_due)} due)
          </div>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Allocate
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
            <CircleDollarSign size={14} className="text-green-500" /> Unallocated Receipts
            <span className="text-xs text-gray-400 font-normal">(click to select)</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingPay ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Receipt #', 'Date', 'Amount'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(unallocated?.results ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No unallocated receipts</td></tr>
                  ) : unallocated?.results?.map(p => (
                    <tr key={p.id} onClick={() => setSelectedPayment(selectedPayment?.id === p.id ? null : p)}
                      className={`cursor-pointer transition-colors ${selectedPayment?.id === p.id ? 'bg-indigo-50 ring-1 ring-indigo-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                      <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                      <td className="px-3 py-2.5 font-semibold text-green-700 tabular-nums">{npr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
            <FileText size={14} className="text-blue-500" /> Open Invoices
            <span className="text-xs text-gray-400 font-normal">(click to select)</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingInv ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Invoice #', 'Customer', 'Due'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(openInvoices?.results ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No open invoices</td></tr>
                  ) : openInvoices?.results?.map(inv => (
                    <tr key={inv.id} onClick={() => setSelectedInvoice(selectedInvoice?.id === inv.id ? null : inv)}
                      className={`cursor-pointer transition-colors ${selectedInvoice?.id === inv.id ? 'bg-indigo-50 ring-1 ring-indigo-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{inv.invoice_number}</td>
                      <td className="px-3 py-2.5 text-gray-500 truncate max-w-[120px]">{inv.customer_name}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-700 tabular-nums">{npr(inv.amount_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {!canAllocate && (
        <p className="text-xs text-center text-gray-400 pt-2">Select one receipt and one invoice above, then click Allocate.</p>
      )}
    </div>
  )
}

// ─── Allocate Supplier Payments Tab ────────────────────────────────────────

function AllocateSupplierPaymentsTab() {
  const qc = useQueryClient()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedBill, setSelectedBill]       = useState<Bill | null>(null)

  const { data: unallocated, isLoading: loadingPay } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'unallocated-outgoing'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=outgoing&bill=null&page_size=100`).then(r => toPage<Payment>(r.data)),
  })
  const { data: openBills, isLoading: loadingBills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'open-allocate'],
    queryFn: () => apiClient.get(`${ACCOUNTING.BILLS}?status=approved&page_size=200`).then(r => toPage<Bill>(r.data)),
  })

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENT_ALLOCATE(selectedPayment!.id), { bill: selectedBill!.id }),
    onSuccess: () => {
      toast.success(`Payment ${selectedPayment?.payment_number} allocated to ${selectedBill?.bill_number}`)
      setSelectedPayment(null); setSelectedBill(null)
      qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['bills'] })
    },
    onError: () => toast.error('Allocation failed'),
  })

  const canAllocate = selectedPayment && selectedBill

  return (
    <div className="space-y-4">
      {canAllocate && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
          <div className="text-sm text-orange-800">
            <span className="font-semibold">{selectedPayment.payment_number}</span> ({npr(selectedPayment.amount)})
            <span className="mx-2 text-orange-400">→</span>
            <span className="font-semibold">{selectedBill.bill_number}</span> ({selectedBill.supplier_name}, {npr(selectedBill.amount_due)} due)
          </div>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending}
            className="px-4 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Allocate
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
            <CircleDollarSign size={14} className="text-orange-500" /> Unallocated Payments
            <span className="text-xs text-gray-400 font-normal">(click to select)</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingPay ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Payment #', 'Date', 'Amount'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(unallocated?.results ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No unallocated payments</td></tr>
                  ) : unallocated?.results?.map(p => (
                    <tr key={p.id} onClick={() => setSelectedPayment(selectedPayment?.id === p.id ? null : p)}
                      className={`cursor-pointer transition-colors ${selectedPayment?.id === p.id ? 'bg-orange-50 ring-1 ring-orange-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                      <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                      <td className="px-3 py-2.5 font-semibold text-red-700 tabular-nums">{npr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
            <FileText size={14} className="text-orange-500" /> Outstanding Bills
            <span className="text-xs text-gray-400 font-normal">(click to select)</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingBills ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Bill #', 'Supplier', 'Due'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(openBills?.results ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No outstanding bills</td></tr>
                  ) : openBills?.results?.map(bill => (
                    <tr key={bill.id} onClick={() => setSelectedBill(selectedBill?.id === bill.id ? null : bill)}
                      className={`cursor-pointer transition-colors ${selectedBill?.id === bill.id ? 'bg-orange-50 ring-1 ring-orange-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{bill.bill_number}</td>
                      <td className="px-3 py-2.5 text-gray-500 truncate max-w-[120px]">{bill.supplier_name}</td>
                      <td className="px-3 py-2.5 font-semibold text-orange-700 tabular-nums">{npr(bill.amount_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {!canAllocate && (
        <p className="text-xs text-center text-gray-400 pt-2">Select one payment and one bill above, then click Allocate.</p>
      )}
    </div>
  )
}

// ─── Supplier type (inventory) ─────────────────────────────────────────────

interface InventorySupplier {
  id: number; name: string; contact_person: string; email: string
  phone: string; address: string; city: string; country: string
  website: string; payment_terms: string; notes: string
  is_active: boolean; pan_number: string; po_count?: number
}

// ─── Supplier Create / Edit Modal ──────────────────────────────────────────

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

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => isEdit
      ? apiClient.patch(INVENTORY.SUPPLIER_DETAIL(initial!.id), form)
      : apiClient.post(INVENTORY.SUPPLIERS, form),
    onSuccess: () => {
      toast.success(isEdit ? 'Supplier updated' : 'Supplier added')
      qc.invalidateQueries({ queryKey: ['inventory-suppliers'] })
      qc.invalidateQueries({ queryKey: ['inventory-suppliers-select'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? (isEdit ? 'Failed to update supplier' : 'Failed to add supplier')),
  })

  return (
    <Modal title={isEdit ? 'Edit Supplier' : 'New Supplier'} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mutation.mutate() }} className="space-y-4">
        <Field label="Supplier Name *">
          <input data-lpignore="true" value={form.name} onChange={set('name')} className={inputCls} required placeholder="Supplier / vendor name" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Contact Person">
            <input data-lpignore="true" value={form.contact_person} onChange={set('contact_person')} className={inputCls} placeholder="Full name" autoComplete="off" />
          </Field>
          <Field label="Phone">
            <input data-lpignore="true" value={form.phone} onChange={set('phone')} className={inputCls} placeholder="Phone number" autoComplete="off" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="PAN / VAT Number">
            <input data-lpignore="true" value={form.pan_number} onChange={set('pan_number')} className={inputCls} placeholder="9-digit PAN" autoComplete="off" />
          </Field>
          <Field label="Email">
            <input data-lpignore="true" type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="email@example.com" autoComplete="off" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Website">
            <input data-lpignore="true" value={form.website} onChange={set('website')} className={inputCls} placeholder="https://" autoComplete="off" />
          </Field>
          <Field label="Payment Terms">
            <select value={form.payment_terms} onChange={set('payment_terms')} className={inputCls}>
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
            <input data-lpignore="true" value={form.city} onChange={set('city')} className={inputCls} placeholder="City" autoComplete="off" />
          </Field>
          <Field label="Country">
            <input data-lpignore="true" value={form.country} onChange={set('country')} className={inputCls} placeholder="Country" autoComplete="off" />
          </Field>
        </div>
        <Field label="Address">
          <input data-lpignore="true" value={form.address} onChange={set('address')} className={inputCls} placeholder="Street address" autoComplete="off" />
        </Field>
        <Field label="Notes">
          <textarea value={form.notes} onChange={set('notes')} className={inputCls + ' resize-none'} rows={2} placeholder="Internal notes" />
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

// ─── Suppliers Tab (Accounts Payable view) ──────────────────────────────────

function SuppliersTab() {
  const { fyYear } = useFY()
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

  // Aggregate bills per supplier
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Supplier', 'Contact', 'PAN', 'City', 'Bills', 'Total Billed', 'Outstanding', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {supplierStats.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No suppliers found.</td></tr>
              ) : supplierStats.map(s => (
                <tr key={s.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.contact_person || s.email || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs font-mono">{s.pan_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{s.city || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 tabular-nums">{s.billCount}</td>
                  <td className="px-4 py-3 font-medium text-gray-800 tabular-nums">{npr(s.total)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className={s.unpaidTotal > 0 ? 'text-orange-600 font-semibold' : 'text-gray-400'}>
                      {npr(s.unpaidTotal)}
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
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Cheque Register Tab ────────────────────────────────────────────────────

function ChequeRegisterTab() {
  const qc = useQueryClient()
  const { fyYear } = useFY()
  const today = new Date().toISOString().slice(0, 10)

  type ChequeView = 'register' | 'issue' | 'receive'
  const [view, setView] = useState<ChequeView>('register')
  const [filterType, setFilterType] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [updateTarget, setUpdateTarget] = useState<Payment | null>(null)
  const [newChequeStatus, setNewChequeStatus] = useState('')

  // ── Issue Cheque form state ───────────────────────────────────────────────
  const [issDate,     setIssDate]     = useState(today)
  const [issBank,     setIssBank]     = useState('')
  const [issPayee,    setIssPayee]    = useState('')
  const [issChqNum,   setIssChqNum]   = useState('')
  const [issAmount,   setIssAmount]   = useState('')
  const [issNotes,    setIssNotes]    = useState('')

  // ── Receive Cheque form state ─────────────────────────────────────────────
  const [rcvDate,     setRcvDate]     = useState(today)
  const [rcvBank,     setRcvBank]     = useState('')
  const [rcvPayer,    setRcvPayer]    = useState('')
  const [rcvChqNum,   setRcvChqNum]   = useState('')
  const [rcvAmount,   setRcvAmount]   = useState('')
  const [rcvNotes,    setRcvNotes]    = useState('')

  const { data: bankAccountsPage } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=200').then(r => toPage<BankAccount>(r.data)),
  })
  const bankAccounts = bankAccountsPage?.results ?? []

  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'cheque', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?method=cheque&page_size=200`, fyYear)).then(r => toPage<Payment>(r.data)),
  })

  const allCheques  = data?.results ?? []
  const payments    = filterType === 'all' ? allCheques : allCheques.filter(p => p.type === filterType)
  const totalIn     = allCheques.filter(p => p.type === 'incoming').reduce((a, p) => a + Number(p.amount), 0)
  const totalOut    = allCheques.filter(p => p.type === 'outgoing').reduce((a, p) => a + Number(p.amount), 0)

  const resetIssue   = () => { setIssDate(today); setIssBank(''); setIssPayee(''); setIssChqNum(''); setIssAmount(''); setIssNotes('') }
  const resetReceive = () => { setRcvDate(today); setRcvBank(''); setRcvPayer(''); setRcvChqNum(''); setRcvAmount(''); setRcvNotes('') }

  const issueMut = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'outgoing',
      method: 'cheque',
      date: issDate,
      bank_account: issBank || null,
      party_name: issPayee,
      reference: issChqNum,
      amount: issAmount,
      notes: issNotes,
      cheque_status: 'issued',
    }),
    onSuccess: () => {
      toast.success('Cheque issued and journal entry created')
      resetIssue(); setView('register')
      qc.invalidateQueries({ queryKey: ['payments', 'cheque'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Failed to issue cheque'),
  })

  const receiveMut = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'incoming',
      method: 'cheque',
      date: rcvDate,
      bank_account: rcvBank || null,
      party_name: rcvPayer,
      reference: rcvChqNum,
      amount: rcvAmount,
      notes: rcvNotes,
      cheque_status: 'issued',
    }),
    onSuccess: () => {
      toast.success('Cheque received and journal entry created')
      resetReceive(); setView('register')
      qc.invalidateQueries({ queryKey: ['payments', 'cheque'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Failed to record cheque'),
  })

  const statusMut = useMutation({
    mutationFn: (p: Payment) => apiClient.patch(ACCOUNTING.PAYMENT_CHEQUE_STATUS(p.id), { cheque_status: newChequeStatus }),
    onSuccess: () => {
      toast.success('Cheque status updated')
      setUpdateTarget(null); setNewChequeStatus('')
      qc.invalidateQueries({ queryKey: ['payments', 'cheque'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Failed to update status'),
  })

  const CHEQUE_STATUS_COLORS: Record<string, string> = {
    issued:    'bg-amber-100 text-amber-700',
    presented: 'bg-blue-100 text-blue-700',
    cleared:   'bg-green-100 text-green-700',
    bounced:   'bg-red-100 text-red-700',
  }

  const canIssue   = issDate && Number(issAmount) > 0 && issPayee
  const canReceive = rcvDate && Number(rcvAmount) > 0 && rcvPayer

  const tabBtn = (v: ChequeView, label: string) => (
    <button onClick={() => setView(v)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {label}
    </button>
  )

  const inputCls2 = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const selectCls2 = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Cheques', value: allCheques.length, icon: FileText,    bg: 'bg-indigo-50', color: 'text-indigo-600' },
          { label: 'Received',      value: npr(totalIn),       icon: TrendingUp,  bg: 'bg-green-50',  color: 'text-green-600'  },
          { label: 'Issued',        value: npr(totalOut),      icon: TrendingDown, bg: 'bg-red-50',   color: 'text-red-600'    },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <c.icon size={20} className={c.color} />
            <div><p className="text-xs text-gray-500">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-2">
        {tabBtn('register', 'Cheque Register')}
        {tabBtn('issue',    'Issue Cheque')}
        {tabBtn('receive',  'Receive Cheque')}
      </div>

      {/* ── Issue Cheque form ────────────────────────────────────────────── */}
      {view === 'issue' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <TrendingDown size={15} className="text-red-500" /> Issue Cheque (Outgoing Payment)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Date *</label>
              <input data-lpignore="true" type="date" value={issDate} onChange={e => setIssDate(e.target.value)} className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
              <select value={issBank} onChange={e => setIssBank(e.target.value)} className={selectCls2}>
                <option value="">Select bank…</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payee Name *</label>
            <input data-lpignore="true" value={issPayee} onChange={e => setIssPayee(e.target.value)} placeholder="Who the cheque is written to"
              className={inputCls2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Number</label>
              <input data-lpignore="true" value={issChqNum} onChange={e => setIssChqNum(e.target.value)} placeholder="e.g. 002341"
                className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
              <input data-lpignore="true" type="number" min={0} step="0.01" value={issAmount} onChange={e => setIssAmount(e.target.value)}
                placeholder="0.00" className={inputCls2} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Purpose</label>
            <input data-lpignore="true" value={issNotes} onChange={e => setIssNotes(e.target.value)} placeholder="What this payment is for"
              className={inputCls2} />
          </div>
          <p className="text-xs text-gray-400">A journal entry (Dr: AP/Expense, Cr: Bank) will be created automatically.</p>
          <div className="flex gap-2">
            <button onClick={() => issueMut.mutate()} disabled={!canIssue || issueMut.isPending}
              className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {issueMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <TrendingDown size={14} />} Issue Cheque
            </button>
            <button onClick={() => { resetIssue(); setView('register') }}
              className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Receive Cheque form ──────────────────────────────────────────── */}
      {view === 'receive' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp size={15} className="text-green-500" /> Receive Cheque (Incoming Payment)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Date *</label>
              <input data-lpignore="true" type="date" value={rcvDate} onChange={e => setRcvDate(e.target.value)} className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deposit to Bank</label>
              <select value={rcvBank} onChange={e => setRcvBank(e.target.value)} className={selectCls2}>
                <option value="">Select bank…</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payer / Drawer Name *</label>
            <input data-lpignore="true" value={rcvPayer} onChange={e => setRcvPayer(e.target.value)} placeholder="Who issued the cheque"
              className={inputCls2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Number</label>
              <input data-lpignore="true" value={rcvChqNum} onChange={e => setRcvChqNum(e.target.value)} placeholder="e.g. 100234"
                className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
              <input data-lpignore="true" type="number" min={0} step="0.01" value={rcvAmount} onChange={e => setRcvAmount(e.target.value)}
                placeholder="0.00" className={inputCls2} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Description</label>
            <input data-lpignore="true" value={rcvNotes} onChange={e => setRcvNotes(e.target.value)} placeholder="e.g. Payment for Invoice INV-00123"
              className={inputCls2} />
          </div>
          <p className="text-xs text-gray-400">A journal entry (Dr: Bank, Cr: AR/Income) will be created automatically.</p>
          <div className="flex gap-2">
            <button onClick={() => receiveMut.mutate()} disabled={!canReceive || receiveMut.isPending}
              className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {receiveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />} Record Receipt
            </button>
            <button onClick={() => { resetReceive(); setView('register') }}
              className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Register table ───────────────────────────────────────────────── */}
      {view === 'register' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
              <FileText size={14} className="text-indigo-500" /> Cheque Register
            </h3>
            <div className="flex items-center gap-2">
              {(['all', 'incoming', 'outgoing'] as const).map(f => (
                <button key={f} onClick={() => setFilterType(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? 'All' : f === 'incoming' ? 'Received' : 'Issued'}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? <div className="py-12"><Spinner /></div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Chq No.', 'Date', 'Party', 'Direction', 'Amount', 'Bank', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-400">No cheques found for this period.</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.reference || p.payment_number}</td>
                    <td className="px-4 py-3 text-gray-600"><DateDisplay adDate={p.date} /></td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700 max-w-[140px] truncate" title={paymentPartyName(p) !== '—' ? paymentPartyName(p) : (p.notes || '—')}>
                      {paymentPartyName(p) !== '—' ? paymentPartyName(p) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.type === 'incoming' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {p.type === 'incoming' ? 'Received' : 'Issued'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 tabular-nums">{npr(p.amount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.bank_account_name || '—'}</td>
                    <td className="px-4 py-3">
                      {p.cheque_status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHEQUE_STATUS_COLORS[p.cheque_status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {p.cheque_status.charAt(0).toUpperCase() + p.cheque_status.slice(1)}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.method === 'cheque' && (
                        <button onClick={() => { setUpdateTarget(p); setNewChequeStatus(p.cheque_status || 'issued') }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap">
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Update cheque status modal ───────────────────────────────────── */}
      {updateTarget && (
        <Modal title="Update Cheque Status" onClose={() => { setUpdateTarget(null); setNewChequeStatus('') }}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p><span className="font-medium">Cheque No:</span> {updateTarget.reference || updateTarget.payment_number}</p>
              <p><span className="font-medium">Party:</span> {paymentPartyName(updateTarget)}</p>
              <p><span className="font-medium">Amount:</span> {npr(updateTarget.amount)}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Status</label>
              <select value={newChequeStatus} onChange={e => setNewChequeStatus(e.target.value)} className={selectCls2}>
                <option value="issued">Issued</option>
                <option value="presented">Presented to Bank</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => statusMut.mutate(updateTarget)} disabled={statusMut.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {statusMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save Status
              </button>
              <button onClick={() => { setUpdateTarget(null); setNewChequeStatus('') }}
                className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Customer Payments Tab ─────────────────────────────────────────────────

function CustomerPaymentsTab() {
  const { fyYear } = useFY()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'incoming', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?type=incoming&page_size=200`, fyYear)).then(r => toPage<Payment>(r.data)),
  })
  const payments = data?.results ?? []
  const total = payments.reduce((a, p) => a + Number(p.amount), 0)

  return (
    <div className="space-y-4">
      {selectedPayment && (
        <Modal title={`Receipt ${selectedPayment.payment_number}`} onClose={() => setSelectedPayment(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Party</p>
                <p className="text-sm font-semibold text-gray-800">{paymentPartyName(selectedPayment)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-sm font-bold text-emerald-700 tabular-nums">{npr(selectedPayment.amount)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-semibold text-gray-800">{fmt(selectedPayment.date)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Method</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{(selectedPayment.method ?? '').replace('_', ' ') || '—'}</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Details</p>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Receipt Number</span>
                  <span className="font-mono text-indigo-600">{selectedPayment.payment_number}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Invoice</span>
                  <span className="text-gray-800">{selectedPayment.invoice_number || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Bank Account</span>
                  <span className="text-gray-800">{selectedPayment.bank_account_name || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Reference</span>
                  <span className="text-gray-800">{selectedPayment.reference || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created By</span>
                  <span className="text-gray-800">{selectedPayment.created_by_name || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created At</span>
                  <span className="text-gray-800">{selectedPayment.created_at ? fmt(selectedPayment.created_at) : '—'}</span>
                </div>
                {selectedPayment.cheque_status && (
                  <div className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Cheque Status</span>
                    <span className="text-gray-800 capitalize">{selectedPayment.cheque_status.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedPayment.notes && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedPayment.notes}</p>
              </div>
            )}
            {Number(selectedPayment.tds_rate || 0) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1 text-sm">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Customer TDS</p>
                <div className="flex items-center justify-between"><span className="text-gray-600">TDS Rate</span><span className="font-medium">{(Number(selectedPayment.tds_rate) * 100).toFixed(2)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">TDS Withheld</span><span className="font-medium tabular-nums">{npr(selectedPayment.tds_withheld_amount || 0)}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">Net Receipt</span><span className="font-medium tabular-nums">{npr(selectedPayment.net_receipt_amount || selectedPayment.amount)}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">Reference</span><span className="font-medium">{selectedPayment.tds_reference || '—'}</span></div>
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Receipts',  value: payments.length,   icon: Users,       bg: 'bg-blue-50',  color: 'text-blue-600'  },
          { label: 'Total Received',  value: npr(total),         icon: TrendingUp,  bg: 'bg-green-50', color: 'text-green-600' },
          { label: 'This FY',         value: `FY ${fyYear}`,     icon: CalendarDays, bg: 'bg-gray-50', color: 'text-gray-600'  },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <c.icon size={20} className={c.color} />
            <div><p className="text-xs text-gray-500">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            <Users size={14} className="text-blue-500" /> Customer Payments (Receipts)
          </h3>
        </div>
        {isLoading ? <div className="py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Receipt #', 'Date', 'Invoice', 'Method', 'Amount', 'Bank', 'Ref'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No customer payments found for this period.</td></tr>
              ) : payments.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="hover:bg-gray-50/60 cursor-pointer"
                  title="Click to view receipt details"
                >
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                  <td className="px-4 py-3 text-gray-600"><DateDisplay adDate={p.date} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-xs capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-semibold text-green-700 tabular-nums">{npr(p.amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.bank_account_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Supplier Payments Tab ─────────────────────────────────────────────────

function SupplierPaymentsTab() {
  const { fyYear } = useFY()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'outgoing', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?type=outgoing&page_size=200`, fyYear)).then(r => toPage<Payment>(r.data)),
  })
  const payments = data?.results ?? []
  const total = payments.reduce((a, p) => a + Number(p.amount), 0)

  return (
    <div className="space-y-4">
      {selectedPayment && (
        <Modal title={`Payment ${selectedPayment.payment_number}`} onClose={() => setSelectedPayment(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Party</p>
                <p className="text-sm font-semibold text-gray-800">{paymentPartyName(selectedPayment)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-sm font-bold text-red-700 tabular-nums">{npr(selectedPayment.amount)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-semibold text-gray-800">{fmt(selectedPayment.date)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Method</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{(selectedPayment.method ?? '').replace('_', ' ') || '—'}</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Details</p>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Payment Number</span>
                  <span className="font-mono text-indigo-600">{selectedPayment.payment_number}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Bill</span>
                  <span className="text-gray-800">{selectedPayment.bill_number || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Bank Account</span>
                  <span className="text-gray-800">{selectedPayment.bank_account_name || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Reference</span>
                  <span className="text-gray-800">{selectedPayment.reference || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created By</span>
                  <span className="text-gray-800">{selectedPayment.created_by_name || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created At</span>
                  <span className="text-gray-800">{selectedPayment.created_at ? fmt(selectedPayment.created_at) : '—'}</span>
                </div>
                {selectedPayment.cheque_status && (
                  <div className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Cheque Status</span>
                    <span className="text-gray-800 capitalize">{selectedPayment.cheque_status.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedPayment.notes && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedPayment.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Payments Made',  value: payments.length,    icon: Truck,       bg: 'bg-orange-50', color: 'text-orange-600' },
          { label: 'Total Paid Out', value: npr(total),          icon: TrendingDown, bg: 'bg-red-50',  color: 'text-red-600'    },
          { label: 'This FY',        value: `FY ${fyYear}`,      icon: CalendarDays, bg: 'bg-gray-50', color: 'text-gray-600'   },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <c.icon size={20} className={c.color} />
            <div><p className="text-xs text-gray-500">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
            <Truck size={14} className="text-orange-500" /> Supplier Payments
          </h3>
          <a href="?tab=quick-payment" className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={14} /> Record Payment
          </a>
        </div>
        {isLoading ? <div className="py-12"><Spinner /></div> : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Payment #', 'Date', 'Bill', 'Method', 'Amount', 'Bank', 'Ref'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No supplier payments found for this period.</td></tr>
              ) : payments.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="hover:bg-gray-50/60 cursor-pointer"
                  title="Click to view payment details"
                >
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                  <td className="px-4 py-3 text-gray-600"><DateDisplay adDate={p.date} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.bill_number || '—'}</td>
                  <td className="px-4 py-3 text-xs capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-semibold text-red-700 tabular-nums">{npr(p.amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.bank_account_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Service Ledger Tab ───────────────────────────────────────────────────────

interface ServiceLedgerRow {
  date: string; doc_type: string; doc_number: string; party: string
  description: string; revenue: string; cost: string
}
interface ServiceLedgerReport {
  service: { id: number; name: string }
  date_from: string; date_to: string
  rows: ServiceLedgerRow[]
  revenue_total: string; cost_total: string; net: string
}

function ServiceLedgerTab() {
  const { data: services = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })
  const [serviceId, setServiceId] = useState('')
  const [dateFrom, setDateFrom]   = useState(() => fiscalYearAdParams(currentFiscalYear()).date_from)
  const [dateTo, setDateTo]       = useState(() => new Date().toISOString().slice(0, 10))
  const [submitted, setSubmitted] = useState(false)

  const { data: report, isLoading, isFetching } = useQuery<ServiceLedgerReport>({
    queryKey: ['service-ledger', serviceId, dateFrom, dateTo],
    queryFn: () => apiClient.get(
      `${ACCOUNTING.REPORT_SERVICE_LEDGER}?service_id=${serviceId}&date_from=${dateFrom}&date_to=${dateTo}`
    ).then(r => r.data?.data ?? r.data),
    enabled: submitted && !!serviceId,
  })

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Service</label>
            <select value={serviceId} onChange={e => { setServiceId(e.target.value); setSubmitted(false) }}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">Select service…</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
            <NepaliDatePicker value={dateFrom} onChange={v => { setDateFrom(v); setSubmitted(false) }} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
            <NepaliDatePicker value={dateTo} onChange={v => { setDateTo(v); setSubmitted(false) }} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <button onClick={() => { if (!serviceId) { toast.error('Select a service'); return } setSubmitted(true) }}
            disabled={!serviceId || isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Run Ledger
          </button>
          <button onClick={() => { const p = fiscalYearAdParams(currentFiscalYear()); setDateFrom(p.date_from); setDateTo(new Date().toISOString().slice(0, 10)); setSubmitted(false) }}
            className="px-3 py-2 text-xs font-semibold border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100">
            This FY
          </button>
        </div>
      </div>

      {submitted && (isLoading || isFetching) && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>}

      {report && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Service Ledger</p>
              <h2 className="text-base font-bold text-gray-800">{report.service.name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{fmt(report.date_from)} → {fmt(report.date_to)}</p>
            </div>
            <div className="flex gap-6 text-right text-sm">
              <div><p className="text-xs text-gray-400">Revenue</p><p className="font-bold text-green-700">{npr(report.revenue_total)}</p></div>
              <div><p className="text-xs text-gray-400">Cost</p><p className="font-bold text-red-600">{npr(report.cost_total)}</p></div>
              <div><p className="text-xs text-gray-400">Net</p><p className={`font-bold ${Number(report.net) >= 0 ? 'text-gray-800' : 'text-red-700'}`}>{npr(report.net)}</p></div>
            </div>
          </div>
          {report.rows.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No transactions in this period</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Date', 'Type', 'Doc #', 'Party', 'Description', 'Revenue', 'Cost'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fmt(row.date)}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${row.doc_type === 'Invoice' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                          {row.doc_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-700">{row.doc_number}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">{row.party}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-700 max-w-xs truncate">{row.description}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-medium text-green-700">{Number(row.revenue) > 0 ? npr(row.revenue) : '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-right font-medium text-red-600">{Number(row.cost) > 0 ? npr(row.cost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-4 py-2.5 text-xs font-bold text-gray-700">Totals</td>
                    <td className="px-4 py-2.5 text-xs text-right font-bold text-green-700">{npr(report.revenue_total)}</td>
                    <td className="px-4 py-2.5 text-xs text-right font-bold text-red-600">{npr(report.cost_total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const [searchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') ?? ''
  const { fyYear: _fyYear, setFyYear: _setFyYear } = useFyStore()

  // Tabs with their own date-range controls don't need the global FY bar
  const HIDE_FY_BAR = new Set(['ledger', 'day-book', 'accounts', 'tds', 'bank-reconciliation', 'recurring-journals', 'service-ledger'])
  const showFyBar = !HIDE_FY_BAR.has(activeTab)

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
      case 'quotations':            return <QuotationsTab />
      case 'debit-notes':           return <DebitNotesTab />
      case 'tds':                   return <TDSTab />
      case 'bank-reconciliation':   return <BankReconciliationTab />
      case 'recurring-journals':    return <RecurringJournalsTab />
      case 'ledger':                return <LedgerTab />
      case 'day-book':              return <DayBookTab />
      case 'expenses':              return <ExpensesTab />
      // Services
      case 'service-ledger':        return <ServiceLedgerTab />
      // Sales
      case 'sales-orders':          return <SalesOrdersTab />
      case 'customer-payments':     return <CustomerPaymentsTab />
      case 'allocate-customer-payments': return <AllocateCustomerPaymentsTab />
      // Purchases
      case 'suppliers':             return <SuppliersTab />
      case 'purchase-orders':       return <PurchaseOrdersTab />
      case 'supplier-payments':     return <SupplierPaymentsTab />
      case 'allocate-supplier-payments': return <AllocateSupplierPaymentsTab />
      // Banking tools
      case 'cash-transfers':        return <CashTransfersTab />
      case 'quick-payment':         return <QuickPaymentTab />
      case 'quick-receipt':         return <QuickReceiptTab />
      case 'cheque-register':       return <ChequeRegisterTab />
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
          {showFyBar && <FiscalYearBar />}
          {renderTab()}
      </main>
    </div>
  )
}
