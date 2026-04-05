/**
 * ReportsPage.tsx — Standalone reports hub combining all accounting and
 * inventory-operations reports in one place.
 *
 * Layout: left category sidebar + right content panel (report grid ▶ params ▶ output).
 */
import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { ACCOUNTING, INVENTORY, CUSTOMERS } from '../../api/endpoints'
import toast from 'react-hot-toast'
import {
  BarChart2, BookOpen, TrendingUp, TrendingDown, ShoppingBag, ShoppingCart,
  Percent, Package, ShieldCheck, AlertCircle, Layers, BookMarked,
  CalendarDays, ArrowLeftRight, FileText, Receipt, RotateCcw, Clock,
  Users, Truck, UserCheck, FileSpreadsheet, Printer, Loader2,
  PackageCheck, Archive, DollarSign, FileDown, CheckCircle2,
  ChevronRight,
} from 'lucide-react'
import NepaliDatePicker from '../../components/NepaliDatePicker'
import DateDisplay from '../../components/DateDisplay'
import {
  adStringToBsDisplay, currentFiscalYear, fiscalYearAdParams,
  fiscalYearOf, fiscalYearDateRange,
} from '../../utils/nepaliDate'
import { resolveReportRowDrill, type DrillNodeType, type DrillSeed } from './drillResolver'

const SUPPORTED_DRILL_NODE_TYPES: DrillNodeType[] = [
  'account',
  'journal_entry',
  'invoice',
  'bill',
  'payment',
  'credit_note',
  'debit_note',
  'customer',
  'supplier',
]

function asSupportedDrillNodeType(value: unknown): DrillNodeType | null {
  const candidate = String(value || '') as DrillNodeType
  return SUPPORTED_DRILL_NODE_TYPES.includes(candidate) ? candidate : null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return '—'
  const bs = adStringToBsDisplay(d)
  return bs?.bs ?? '—'
}

function npr(v: string | number) {
  return `NPR ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportCategory = 'accounting' | 'receivables' | 'payables' | 'sales' | 'purchases' | 'tax' | 'inventory' | 'inventory-ops' | 'system'
type ReportDateMode = 'range' | 'asof' | 'vat' | 'none'
type ReportType =
  | 'pl' | 'balance-sheet' | 'trial-balance' | 'gl-summary' | 'gl-master' | 'cash-flow'
  | 'aged-receivables' | 'customer-receivable-summary' | 'invoice-age' | 'customer-statement'
  | 'aged-payables' | 'supplier-payable-summary' | 'bill-age' | 'supplier-statement'
  | 'sales-by-customer' | 'sales-by-item' | 'sales-by-customer-monthly' | 'sales-by-item-monthly' | 'sales-master' | 'sales-summary' | 'service-report'
  | 'purchase-by-supplier' | 'purchase-by-item' | 'purchase-by-supplier-monthly' | 'purchase-by-item-monthly' | 'purchase-master'
  | 'sales-register' | 'sales-return-register' | 'purchase-register' | 'purchase-return-register' | 'vat' | 'tds-report' | 'annex-13' | 'annex-5'
  | 'inventory-position' | 'inventory-movement' | 'inventory-master' | 'product-profitability'
  | 'activity-log' | 'user-log'
  // inventory-ops (handled by dedicated panel)
  | 'inv-valuation' | 'inv-dead-stock' | 'inv-abc' | 'inv-forecast' | 'inv-top-selling'
  // Tally-parity additions
  | 'ratio-analysis' | 'cost-centre-pl' | 'cash-book'

interface ReportMeta {
  key: ReportType
  label: string
  endpoint: string
  icon: React.ElementType
  category: ReportCategory
  dateMode: ReportDateMode
  needsCustomer?: boolean
  needsSupplier?: boolean
  needsCostCentre?: boolean
}

// ─── Category registry ────────────────────────────────────────────────────────

const REPORT_CATEGORIES: { id: ReportCategory; label: string; icon: React.ElementType }[] = [
  { id: 'accounting',    label: 'Accounting',    icon: BookOpen     },
  { id: 'receivables',   label: 'Receivables',   icon: TrendingUp   },
  { id: 'payables',      label: 'Payables',      icon: TrendingDown },
  { id: 'sales',         label: 'Sales',         icon: ShoppingBag  },
  { id: 'purchases',     label: 'Purchases',     icon: ShoppingCart },
  { id: 'tax',           label: 'Tax / IRD',     icon: Percent      },
  { id: 'inventory',     label: 'Inventory',     icon: Package      },
  { id: 'inventory-ops', label: 'Stock Ops',     icon: PackageCheck },
  { id: 'system',        label: 'System',        icon: ShieldCheck  },
]

// ─── Reports registry ─────────────────────────────────────────────────────────

const REPORTS: ReportMeta[] = [
  // ── Accounting ────────────────────────────────────────────────────────────
  { key: 'pl',               label: 'Profit & Loss',      endpoint: ACCOUNTING.REPORT_PL,               icon: TrendingUp,        category: 'accounting',  dateMode: 'range' },
  { key: 'balance-sheet',    label: 'Balance Sheet',      endpoint: ACCOUNTING.REPORT_BALANCE_SHEET,    icon: Layers,            category: 'accounting',  dateMode: 'asof'  },
  { key: 'trial-balance',    label: 'Trial Balance',      endpoint: ACCOUNTING.REPORT_TRIAL_BALANCE,    icon: BookMarked,        category: 'accounting',  dateMode: 'range' },
  { key: 'gl-summary',       label: 'GL Summary',         endpoint: ACCOUNTING.REPORT_GL_SUMMARY,       icon: BookOpen,          category: 'accounting',  dateMode: 'range' },
  { key: 'gl-master',        label: 'GL Master',          endpoint: ACCOUNTING.REPORT_GL_MASTER,        icon: Layers,            category: 'accounting',  dateMode: 'range' },
  { key: 'cash-flow',        label: 'Cash Flow',          endpoint: ACCOUNTING.REPORT_CASH_FLOW,        icon: ArrowLeftRight,    category: 'accounting',  dateMode: 'range' },
  { key: 'ratio-analysis',   label: 'Ratio Analysis',     endpoint: ACCOUNTING.REPORT_RATIO_ANALYSIS,   icon: BarChart2,         category: 'accounting',  dateMode: 'range' },
  { key: 'cost-centre-pl',   label: 'Cost Centre P&L',    endpoint: ACCOUNTING.REPORT_COST_CENTRE_PL,   icon: Layers,            category: 'accounting',  dateMode: 'range', needsCostCentre: true },
  { key: 'cash-book',        label: 'Cash / Bank Book',   endpoint: ACCOUNTING.REPORT_CASH_BOOK,         icon: BookOpen,          category: 'accounting',  dateMode: 'range' },
  // ── Receivables ──────────────────────────────────────────────────────────
  { key: 'aged-receivables',            label: 'Aged Receivables',   endpoint: ACCOUNTING.REPORT_AGED_RECEIVABLES,            icon: AlertCircle, category: 'receivables', dateMode: 'asof'  },
  { key: 'customer-receivable-summary', label: 'Receivable Summary', endpoint: ACCOUNTING.REPORT_CUSTOMER_RECEIVABLE_SUMMARY, icon: Users,       category: 'receivables', dateMode: 'asof'  },
  { key: 'invoice-age',                 label: 'Invoice Age Detail', endpoint: ACCOUNTING.REPORT_INVOICE_AGE,                 icon: Clock,       category: 'receivables', dateMode: 'asof'  },
  { key: 'customer-statement',          label: 'Customer Statement', endpoint: ACCOUNTING.REPORT_CUSTOMER_STATEMENT,          icon: FileText,    category: 'receivables', dateMode: 'range', needsCustomer: true },
  // ── Payables ─────────────────────────────────────────────────────────────
  { key: 'aged-payables',           label: 'Aged Payables',      endpoint: ACCOUNTING.REPORT_AGED_PAYABLES,           icon: AlertCircle, category: 'payables', dateMode: 'asof'  },
  { key: 'supplier-payable-summary', label: 'Payable Summary',   endpoint: ACCOUNTING.REPORT_SUPPLIER_PAYABLE_SUMMARY, icon: Truck,       category: 'payables', dateMode: 'asof'  },
  { key: 'bill-age',                label: 'Bill Age Detail',    endpoint: ACCOUNTING.REPORT_BILL_AGE,                icon: Clock,       category: 'payables', dateMode: 'asof'  },
  { key: 'supplier-statement',      label: 'Supplier Statement', endpoint: ACCOUNTING.REPORT_SUPPLIER_STATEMENT,      icon: FileText,    category: 'payables', dateMode: 'range', needsSupplier: true },
  // ── Sales ─────────────────────────────────────────────────────────────────
  { key: 'sales-summary',             label: 'Sales Summary',       endpoint: ACCOUNTING.REPORT_SALES_SUMMARY,             icon: BarChart2,    category: 'sales', dateMode: 'range' },
  { key: 'sales-master',              label: 'Sales Master',        endpoint: ACCOUNTING.REPORT_SALES_MASTER,              icon: FileText,     category: 'sales', dateMode: 'range' },
  { key: 'sales-by-customer',         label: 'By Customer',         endpoint: ACCOUNTING.REPORT_SALES_BY_CUSTOMER,         icon: Users,        category: 'sales', dateMode: 'range' },
  { key: 'sales-by-item',             label: 'By Item',             endpoint: ACCOUNTING.REPORT_SALES_BY_ITEM,             icon: ShoppingBag,  category: 'sales', dateMode: 'range' },
  { key: 'sales-by-customer-monthly', label: 'By Customer Monthly', endpoint: ACCOUNTING.REPORT_SALES_BY_CUSTOMER_MONTHLY, icon: CalendarDays, category: 'sales', dateMode: 'range' },
  { key: 'sales-by-item-monthly',     label: 'By Item Monthly',     endpoint: ACCOUNTING.REPORT_SALES_BY_ITEM_MONTHLY,     icon: CalendarDays, category: 'sales', dateMode: 'range' },
  { key: 'service-report',             label: 'Service Report',      endpoint: ACCOUNTING.REPORT_SERVICE_REPORT,            icon: BarChart2,    category: 'sales', dateMode: 'range' },
  // ── Purchases ─────────────────────────────────────────────────────────────
  { key: 'purchase-master',              label: 'Purchase Master',       endpoint: ACCOUNTING.REPORT_PURCHASE_MASTER,              icon: FileText,     category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-supplier',         label: 'By Supplier',           endpoint: ACCOUNTING.REPORT_PURCHASE_BY_SUPPLIER,         icon: Truck,        category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-item',             label: 'By Item',               endpoint: ACCOUNTING.REPORT_PURCHASE_BY_ITEM,             icon: Package,      category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-supplier-monthly', label: 'By Supplier Monthly',   endpoint: ACCOUNTING.REPORT_PURCHASE_BY_SUPPLIER_MONTHLY, icon: CalendarDays, category: 'purchases', dateMode: 'range' },
  { key: 'purchase-by-item-monthly',     label: 'By Item Monthly',       endpoint: ACCOUNTING.REPORT_PURCHASE_BY_ITEM_MONTHLY,     icon: CalendarDays, category: 'purchases', dateMode: 'range' },
  // ── Tax / IRD ─────────────────────────────────────────────────────────────
  { key: 'vat',                    label: 'VAT Report',            endpoint: ACCOUNTING.REPORT_VAT,                    icon: Receipt,         category: 'tax', dateMode: 'vat'   },
  { key: 'sales-register',         label: 'Sales Register',        endpoint: ACCOUNTING.REPORT_SALES_REGISTER,         icon: BookOpen,        category: 'tax', dateMode: 'range' },
  { key: 'sales-return-register',  label: 'Sales Return Register', endpoint: ACCOUNTING.REPORT_SALES_RETURN_REGISTER,  icon: RotateCcw,       category: 'tax', dateMode: 'range' },
  { key: 'purchase-register',      label: 'Purchase Register',     endpoint: ACCOUNTING.REPORT_PURCHASE_REGISTER,      icon: BookMarked,      category: 'tax', dateMode: 'range' },
  { key: 'purchase-return-register', label: 'Purchase Return Reg.', endpoint: ACCOUNTING.REPORT_PURCHASE_RETURN_REGISTER, icon: RotateCcw,    category: 'tax', dateMode: 'range' },
  { key: 'tds-report',             label: 'TDS Report',            endpoint: ACCOUNTING.REPORT_TDS,                    icon: Percent,         category: 'tax', dateMode: 'range' },
  { key: 'annex-13',               label: 'Annex 13 (VAT Sales)',  endpoint: ACCOUNTING.REPORT_ANNEX_13,               icon: FileSpreadsheet, category: 'tax', dateMode: 'range' },
  { key: 'annex-5',                label: 'Annex 5 (VAT Summary)', endpoint: ACCOUNTING.REPORT_ANNEX_5,                icon: FileSpreadsheet, category: 'tax', dateMode: 'range' },
  // ── Inventory (accounting-side) ───────────────────────────────────────────
  { key: 'inventory-position',    label: 'Stock Position',         endpoint: ACCOUNTING.REPORT_INVENTORY_POSITION,    icon: PackageCheck,   category: 'inventory', dateMode: 'asof'  },
  { key: 'inventory-movement',    label: 'Stock Movement',         endpoint: ACCOUNTING.REPORT_INVENTORY_MOVEMENT,    icon: ArrowLeftRight, category: 'inventory', dateMode: 'range' },
  { key: 'inventory-master',      label: 'Inventory Master',       endpoint: ACCOUNTING.REPORT_INVENTORY_MASTER,      icon: Package,        category: 'inventory', dateMode: 'none'  },
  { key: 'product-profitability', label: 'Product Profitability',  endpoint: ACCOUNTING.REPORT_PRODUCT_PROFITABILITY, icon: TrendingUp,     category: 'inventory', dateMode: 'range' },
  // ── Stock Ops (inventory-native) ──────────────────────────────────────────
  { key: 'inv-valuation',   label: 'Stock Valuation',   endpoint: INVENTORY.REPORT_VALUATION,   icon: DollarSign,  category: 'inventory-ops', dateMode: 'none' },
  { key: 'inv-dead-stock',  label: 'Dead Stock',        endpoint: INVENTORY.REPORT_DEAD_STOCK,  icon: Archive,     category: 'inventory-ops', dateMode: 'none' },
  { key: 'inv-abc',         label: 'ABC Analysis',      endpoint: INVENTORY.REPORT_ABC,         icon: BarChart2,   category: 'inventory-ops', dateMode: 'none' },
  { key: 'inv-forecast',    label: 'Demand Forecast',   endpoint: INVENTORY.REPORT_FORECAST,    icon: TrendingUp,  category: 'inventory-ops', dateMode: 'none' },
  { key: 'inv-top-selling', label: 'Top Selling',       endpoint: INVENTORY.REPORT_TOP_SELLING, icon: TrendingUp,  category: 'inventory-ops', dateMode: 'none' },
  // ── System ────────────────────────────────────────────────────────────────
  { key: 'activity-log', label: 'Activity Log', endpoint: ACCOUNTING.REPORT_ACTIVITY_LOG, icon: Clock,     category: 'system', dateMode: 'range' },
  { key: 'user-log',     label: 'User Log',     endpoint: ACCOUNTING.REPORT_USER_LOG,     icon: UserCheck, category: 'system', dateMode: 'range' },
]

// ─── Typed data shapes ────────────────────────────────────────────────────────

interface RptAccount { id?: number; code: string; name: string; balance: string | number }
// New Tally-style P&L with Gross Profit section
interface PLReport {
  date_from: string; date_to: string
  // Gross section
  sales: RptAccount[]; direct_income: RptAccount[]
  gross_revenue: string | number
  purchases: RptAccount[]; direct_expenses: RptAccount[]
  total_direct_cost: string | number
  gross_profit: string | number
  // Net section
  indirect_expenses: RptAccount[]; indirect_income: RptAccount[]
  total_indirect_exp: string | number; total_indirect_inc: string | number
  net_profit: string | number
}
// New Tally-style Balance Sheet with sections
interface BSReport {
  as_of_date: string; as_of_date_bs?: string
  // Assets
  fixed_assets: RptAccount[]; total_fixed_assets: string | number
  investments: RptAccount[]; total_investments: string | number
  current_assets: RptAccount[]; total_current_assets: string | number
  total_assets: string | number
  // Capital
  capital: RptAccount[]; total_capital: string | number
  // Loans
  bank_od: RptAccount[]; loans: RptAccount[]; total_loans: string | number
  // Current Liabilities
  current_liabilities: RptAccount[]; total_current_liabilities: string | number
  total_liabilities: string | number
  total_equity_and_liabilities: string | number
  balanced: boolean
}
interface TBRow      {
  id?: number; code: string; name: string; type: string; group_name: string
  opening_dr: string|number; opening_cr: string|number
  period_dr: string|number;  period_cr: string|number
  closing_dr: string|number; closing_cr: string|number
}
interface TBReport   {
  date_from: string; date_to: string; accounts: TBRow[]
  total_opening_dr: string|number; total_opening_cr: string|number
  total_period_dr:  string|number; total_period_cr:  string|number
  total_closing_dr: string|number; total_closing_cr: string|number
  balanced: boolean
}
interface AgedItem   { id: number; invoice_number?: string; bill_number?: string; customer?: string; supplier?: string; due_date: string; amount_due: number }
interface AgedBucket { items: AgedItem[]; total: number }
interface AgedReport { as_of_date: string; current: AgedBucket; '1_30': AgedBucket; '31_60': AgedBucket; '61_90': AgedBucket; '90_plus': AgedBucket; grand_total: number }
interface VATReport  { period_start: string; period_end: string; vat_collected: string | number; vat_reclaimable: string | number; vat_payable: string | number; invoice_count: number; bill_count: number }
interface CFMethod   { method: string; incoming: string | number; outgoing: string | number }
// Indirect method cash flow (new backend structure)
interface CFReportIndirect {
  date_from: string; date_to: string; period?: string
  operating: {
    net_profit: number|string; depreciation: number|string
    working_capital_changes: { label: string; amount: number|string }[]
    working_capital_total: number|string
    total: number|string
  }
  investing:  { items: { label: string; amount: number|string }[]; total: number|string }
  financing:  { items: { label: string; amount: number|string }[]; total: number|string }
  net_change: number|string; opening_cash: number|string; closing_cash: number|string
  expected_closing: number|string; difference: number|string; balanced: boolean
  // legacy aliases (kept for CSV export)
  total_incoming: string | number; total_outgoing: string | number; net_cash_flow: string | number; by_method: CFMethod[]
}
// Legacy direct-method shape (fallback)
interface CFReport   { date_from: string; date_to: string; total_incoming: string | number; total_outgoing: string | number; net_cash_flow: string | number; by_method: CFMethod[] }

// Ratio Analysis
interface RatioReport {
  as_of_date: string; period?: { label: string } | null
  current_ratio: number|null; quick_ratio: number|null; cash_ratio: number|null
  working_capital: string
  debt_to_equity: number|null; debt_to_assets: number|null; interest_coverage: number|null
  gross_margin_pct: number|null; net_margin_pct: number|null; roe_pct: number|null; roa_pct: number|null
  days_sales_outstanding: number|null; days_payable_outstanding: number|null
}

// ─── Report sub-components ────────────────────────────────────────────────────

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

/** Tally-style collapsible group header with a total line. */
function CollapsibleGroup({
  title, total, children, defaultOpen = true,
}: {
  title: string; total: string|number; children: React.ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 border-y border-gray-200 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} style={{ display: 'inline-block' }}>
            &#9654;
          </span>
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">{title}</span>
        </div>
        <span className="text-sm font-semibold tabular-nums text-gray-700">{npr(total)}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  )
}

function ReportDrillModal({ seed, onClose }: { seed: DrillSeed; onClose: () => void }) {
  const [stack, setStack] = useState<DrillSeed[]>([seed])
  const current = stack[stack.length - 1]

  const { data, isLoading, error } = useQuery<Record<string, unknown>>({
    queryKey: ['report-drill', current.nodeType, current.nodeId, seed.dateFrom, seed.dateTo],
    queryFn: async () => {
      const r = await apiClient.get(ACCOUNTING.REPORT_DRILL, {
        params: {
          node_type: current.nodeType,
          node_id: current.nodeId,
          date_from: seed.dateFrom,
          date_to: seed.dateTo,
        },
      })
      return r.data?.data ?? r.data
    },
    staleTime: 15_000,
  })

  const openNext = (next: DrillSeed) => setStack(prev => [...prev, next])
  const canGoBack = stack.length > 1

  const rows = (data?.rows as Array<Record<string, unknown>>) ?? []
  const lines = (data?.lines as Array<Record<string, unknown>>) ?? []
  const nextRefs = (data?.next_refs as Array<Record<string, unknown>>) ?? []
  const sourceRef = data?.source_ref as Record<string, unknown> | undefined
  const sourceRefNodeType = asSupportedDrillNodeType(sourceRef?.node_type)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[84vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{String(data?.node_label ?? current.nodeLabel)}</p>
            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 flex-wrap">
              {stack.map((item, i) => (
                <span key={`${item.nodeType}-${item.nodeId}-${i}`} className="inline-flex items-center gap-1">
                  <span className="capitalize">{item.nodeType.replace('_', ' ')}</span>
                  {i < stack.length - 1 && <ChevronRight size={11} />}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStack(prev => prev.slice(0, -1))}
              disabled={!canGoBack}
              className={`px-2.5 py-1 text-xs rounded-md border ${canGoBack ? 'border-gray-300 text-gray-700 hover:bg-gray-50' : 'border-gray-200 text-gray-300 cursor-not-allowed'}`}
            >
              Back
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="overflow-auto flex-1">
          {isLoading && <Spinner />}
          {error && <div className="p-4 text-sm text-red-600">Failed to load drill data.</div>}

          {data?.node_type === 'account' && (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <span>Opening Balance</span>
                <span className="tabular-nums font-medium text-gray-700">{npr(data.opening_balance as string | number)}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ref</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Dr</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Cr</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr
                      key={`${String(row.entry_number ?? i)}-${String(row.node_id ?? i)}`}
                      className="hover:bg-indigo-50 cursor-pointer"
                      onClick={() => {
                        const entryId = Number(row.node_id ?? 0)
                        if (!entryId) return
                        openNext({
                          nodeType: 'journal_entry',
                          nodeId: entryId,
                          nodeLabel: String(row.entry_number ?? `Journal ${entryId}`),
                          dateFrom: seed.dateFrom,
                          dateTo: seed.dateTo,
                        })
                      }}
                    >
                      <td className="px-4 py-2 text-gray-500">{fmt(String(row.date ?? ''))}</td>
                      <td className="px-4 py-2 font-mono text-xs text-indigo-700">{String(row.entry_number ?? '—')}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{String(row.description ?? '')}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{Number.parseFloat(String(row.debit ?? 0)) ? npr(row.debit as string | number) : <span className="text-gray-200">—</span>}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{Number.parseFloat(String(row.credit ?? 0)) ? npr(row.credit as string | number) : <span className="text-gray-200">—</span>}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{npr(row.balance as string | number)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-xs italic">No transactions in this period.</td></tr>}
                </tbody>
              </table>
            </>
          )}

          {data?.node_type === 'journal_entry' && (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                <div><span className="text-gray-500">Date: </span><span className="font-medium text-gray-800">{fmt(String(data.date ?? ''))}</span></div>
                <div><span className="text-gray-500">Reference: </span><span className="font-medium text-gray-800">{String(data.reference_type ?? '—')}</span></div>
              </div>
              <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wide">Account</th>
                    <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2 text-right text-gray-500 uppercase tracking-wide">Debit</th>
                    <th className="px-3 py-2 text-right text-gray-500 uppercase tracking-wide">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((line, i) => (
                    <tr key={`${String(line.line_id ?? i)}-${i}`}>
                      <td className="px-3 py-2"><span className="font-mono text-indigo-600 mr-2">{String(line.account_code ?? '')}</span>{String(line.account_name ?? '')}</td>
                      <td className="px-3 py-2 text-gray-500">{String(line.description ?? '') || '—'}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{Number.parseFloat(String(line.debit ?? 0)) ? npr(line.debit as string | number) : '—'}</td>
                      <td className="px-3 py-2 text-right text-red-600">{Number.parseFloat(String(line.credit ?? 0)) ? npr(line.credit as string | number) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sourceRef && sourceRefNodeType && (
                <div className="flex items-center justify-end">
                  <button
                    onClick={() => openNext({
                      nodeType: sourceRefNodeType,
                      nodeId: Number(sourceRef.node_id),
                      nodeLabel: String(sourceRef.label ?? ''),
                      dateFrom: seed.dateFrom,
                      dateTo: seed.dateTo,
                    })}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                  >
                    Open Source <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>
          )}

          {['invoice', 'bill', 'payment', 'credit_note', 'debit_note'].includes(String(data?.node_type ?? '')) && (
            <div className="p-4 space-y-3 text-sm">
              <div className="border border-gray-200 rounded-lg p-3 bg-white space-y-1 text-gray-700">
                {'invoice_number' in (data ?? {}) && <p>Invoice: <span className="font-semibold">{String(data.invoice_number)}</span></p>}
                {'bill_number' in (data ?? {}) && <p>Bill: <span className="font-semibold">{String(data.bill_number)}</span></p>}
                {'payment_number' in (data ?? {}) && <p>Payment: <span className="font-semibold">{String(data.payment_number)}</span></p>}
                {'credit_note_number' in (data ?? {}) && <p>Credit Note: <span className="font-semibold">{String(data.credit_note_number)}</span></p>}
                {'debit_note_number' in (data ?? {}) && <p>Debit Note: <span className="font-semibold">{String(data.debit_note_number)}</span></p>}
                {'status' in (data ?? {}) && <p>Status: <span className="font-semibold capitalize">{String(data.status ?? '—')}</span></p>}
                {'total' in (data ?? {}) && <p>Total: <span className="font-semibold">{npr(data.total as string | number)}</span></p>}
                {'amount' in (data ?? {}) && <p>Amount: <span className="font-semibold">{npr(data.amount as string | number)}</span></p>}
              </div>
              {nextRefs.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {nextRefs.map((ref, i) => (
                    <button
                      key={`${String(ref.node_type)}-${String(ref.node_id)}-${i}`}
                      onClick={() => openNext({
                        nodeType: String(ref.node_type) as DrillNodeType,
                        nodeId: Number(ref.node_id),
                        nodeLabel: String(ref.label ?? `${String(ref.node_type)} #${String(ref.node_id)}`),
                        dateFrom: seed.dateFrom,
                        dateTo: seed.dateTo,
                      })}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      Open {String(ref.node_type).replace('_', ' ')} <ChevronRight size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {['customer', 'supplier'].includes(String(data?.node_type ?? '')) && (
            <>
              <div className="flex items-center justify-between px-5 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                <span>Opening Balance</span>
                <span className="tabular-nums font-medium text-gray-700">{npr(data.opening_balance as string | number)}</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Dr</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Cr</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row, i) => (
                    <tr key={`${String(row.reference ?? i)}-${i}`} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{fmt(String(row.date ?? ''))}</td>
                      <td className="px-4 py-2 text-xs capitalize text-gray-600">{String(row.type ?? '').replace(/_/g, ' ')}</td>
                      <td className="px-4 py-2 font-mono text-xs text-indigo-700">{String(row.reference ?? '—')}</td>
                      <td className="px-4 py-2 text-gray-700 max-w-xs truncate">{String(row.description ?? '')}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{Number.parseFloat(String(row.debit ?? 0)) ? npr(row.debit as string | number) : <span className="text-gray-200">—</span>}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-700">{Number.parseFloat(String(row.credit ?? 0)) ? npr(row.credit as string | number) : <span className="text-gray-200">—</span>}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{npr(row.balance as string | number)}</td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-xs italic">No statement transactions in this period.</td></tr>}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

    </div>
  )
}

/** A single clickable account row with optional drill-down. */
function DrillableRow({
  account, indent = false, dateFrom, dateTo, onDrill,
}: {
  account: RptAccount; indent?: boolean; dateFrom?: string; dateTo?: string
  onDrill?: (seed: DrillSeed) => void
}) {
  const canDrill = !!account.id && !!dateFrom && !!dateTo && !!onDrill

  const rowContent = (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center gap-3 min-w-0">
        <span className="font-mono text-xs text-gray-400 w-14 shrink-0">{account.code}</span>
        <span className="text-sm truncate text-gray-700 group-hover:text-indigo-700">{account.name}</span>
        {canDrill && <span className="text-gray-300 group-hover:text-indigo-400 text-xs shrink-0">&#8599;</span>}
      </div>
      <span className="text-sm tabular-nums shrink-0 ml-4 text-gray-700">{npr(account.balance)}</span>
    </div>
  )

  return (
    <>
      {canDrill ? (
        <button
          type="button"
          className={`w-full flex items-center justify-between px-4 py-1.5 border-b border-gray-100 last:border-0 text-left group cursor-pointer hover:bg-indigo-50 ${indent ? 'pl-8' : ''}`}
          onClick={() => onDrill?.({
            nodeType: 'account',
            nodeId: Number(account.id),
            nodeLabel: `${account.code} — ${account.name}`,
            dateFrom,
            dateTo,
          })}
          title="Click to view vouchers"
        >
          {rowContent}
        </button>
      ) : (
        <div className={`flex items-center justify-between px-4 py-1.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${indent ? 'pl-8' : ''}`}>
          {rowContent}
        </div>
      )}
    </>
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

// ─── Profit & Loss ───────────────────────────────────────────────────────────

function PLReportView({ data, dateFrom, dateTo, onDrill }: { data: PLReport; dateFrom?: string; dateTo?: string; onDrill?: (seed: DrillSeed) => void }) {
  const gp  = Number.parseFloat(String(data.gross_profit))
  const net = Number.parseFloat(String(data.net_profit))
  const isProfit = net >= 0

  function emptyNote(msg: string) {
    return <p className="px-8 py-2 text-xs text-gray-400 italic">{msg}</p>
  }
  function accounts(list: RptAccount[]) {
    return list?.map(r => <DrillableRow key={r.code} account={r} indent dateFrom={dateFrom} dateTo={dateTo} onDrill={onDrill} />)
  }

  return (
    <div className="divide-y divide-gray-100">
      {/* ── Gross Revenue ───────────────────────────────────────────── */}
      <CollapsibleGroup title="Sales / Revenue" total={data.gross_revenue}>
        {data.sales?.length ? accounts(data.sales) : emptyNote('No sales accounts with activity.')}
        {data.direct_income?.length > 0 && (
          <>
            <div className="bg-gray-50 px-4 py-1 border-b border-gray-100">
              <span className="text-xs text-gray-500">Direct Income</span>
            </div>
            {accounts(data.direct_income)}
          </>
        )}
      </CollapsibleGroup>

      {/* ── Direct Costs ────────────────────────────────────────────── */}
      {(data.purchases?.length > 0 || data.direct_expenses?.length > 0) && (
        <CollapsibleGroup title="Direct Costs (COGS)" total={data.total_direct_cost}>
          {data.purchases?.length > 0 && (
            <>
              <div className="bg-gray-50 px-4 py-1 border-b border-gray-100">
                <span className="text-xs text-gray-500">Purchases / COGS</span>
              </div>
              {accounts(data.purchases)}
            </>
          )}
          {data.direct_expenses?.length > 0 && (
            <>
              <div className="bg-gray-50 px-4 py-1 border-b border-gray-100">
                <span className="text-xs text-gray-500">Direct Expenses</span>
              </div>
              {accounts(data.direct_expenses)}
            </>
          )}
        </CollapsibleGroup>
      )}

      {/* ── Gross Profit ────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-4 py-2.5 border-t-2 ${gp >= 0 ? 'border-emerald-400 bg-emerald-50' : 'border-red-400 bg-red-50'}`}>
        <span className={`text-sm font-bold uppercase tracking-wide ${gp >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {gp >= 0 ? 'Gross Profit' : 'Gross Loss'}
        </span>
        <span className={`text-sm font-bold tabular-nums ${gp >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {npr(Math.abs(gp).toFixed(2))}
        </span>
      </div>

      {/* ── Indirect Expenses ───────────────────────────────────────── */}
      {data.indirect_expenses?.length > 0 && (
        <CollapsibleGroup title="Indirect Expenses (Overhead)" total={data.total_indirect_exp}>
          {accounts(data.indirect_expenses)}
        </CollapsibleGroup>
      )}

      {/* ── Indirect / Other Income ─────────────────────────────────── */}
      {data.indirect_income?.length > 0 && (
        <CollapsibleGroup title="Other Income" total={data.total_indirect_inc}>
          {accounts(data.indirect_income)}
        </CollapsibleGroup>
      )}

      {/* ── Net Profit ──────────────────────────────────────────────── */}
      <RptGrandTotal
        label={isProfit ? 'Net Profit' : 'Net Loss'}
        amount={Math.abs(net).toFixed(2)}
        note={isProfit ? undefined : '(Expenditure exceeds income)'}
      />
    </div>
  )
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BSReportView({ data, asOf, onDrill }: { data: BSReport; asOf?: string; onDrill?: (seed: DrillSeed) => void }) {
  function emptyNote(msg: string) {
    return <p className="px-8 py-2 text-xs text-gray-400 italic">{msg}</p>
  }
  function accountRows(items: RptAccount[]) {
    // Balance sheet accounts use as_of_date as both from and to for the ledger drill-down.
    return items?.map(r => <DrillableRow key={r.code} account={r} indent dateFrom={asOf} dateTo={asOf} onDrill={onDrill} />)
  }

  return (
    <div>
      {data.balanced === false && (
        <div className="mx-4 mt-4 px-4 py-2 bg-gray-50 border border-gray-300 rounded flex items-center gap-2 text-sm text-gray-700">
          <AlertCircle size={14} className="shrink-0" /> Out of balance — Assets ≠ Capital + Liabilities. Check posted journal entries.
        </div>
      )}
      <div className="grid grid-cols-2 divide-x divide-gray-200 mt-4">

        {/* ── LEFT — Capital & Liabilities ─────────────────────────── */}
        <div className="space-y-2">
          <CollapsibleGroup title="Capital Account" total={data.total_capital}>
            {data.capital?.length ? accountRows(data.capital) : emptyNote('None')}
          </CollapsibleGroup>

          {((data.bank_od?.length ?? 0) + (data.loans?.length ?? 0)) > 0 && (
            <CollapsibleGroup title="Loans &amp; Borrowings" total={data.total_loans}>
              {accountRows(data.bank_od)}
              {accountRows(data.loans)}
            </CollapsibleGroup>
          )}

          <CollapsibleGroup title="Current Liabilities" total={data.total_current_liabilities}>
            {data.current_liabilities?.length ? accountRows(data.current_liabilities) : emptyNote('None')}
          </CollapsibleGroup>

          <RptGrandTotal
            label="Total Capital + Liabilities"
            amount={data.total_equity_and_liabilities}
            note={data.balanced ? '(Balanced ✓)' : undefined}
          />
        </div>

        {/* ── RIGHT — Assets ───────────────────────────────────────── */}
        <div className="space-y-2">
          {data.fixed_assets?.length > 0 && (
            <CollapsibleGroup title="Fixed Assets" total={data.total_fixed_assets}>
              {accountRows(data.fixed_assets)}
            </CollapsibleGroup>
          )}
          {data.investments?.length > 0 && (
            <CollapsibleGroup title="Investments" total={data.total_investments}>
              {accountRows(data.investments)}
            </CollapsibleGroup>
          )}
          <CollapsibleGroup title="Current Assets" total={data.total_current_assets}>
            {data.current_assets?.length ? accountRows(data.current_assets) : emptyNote('None')}
          </CollapsibleGroup>

          <RptGrandTotal label="Total Assets" amount={data.total_assets} />
        </div>

      </div>
    </div>
  )
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TBReportView({ data, dateFrom, dateTo, onDrill }: { data: TBReport; dateFrom?: string; dateTo?: string; onDrill?: (seed: DrillSeed) => void }) {
  const n = (v: string|number) => Number.parseFloat(String(v))
  const dash = <span className="text-gray-200">—</span>

  // Group accounts by group_name for collapsible sections
  const groups = data.accounts?.reduce<Record<string, TBRow[]>>((acc, row) => {
    const g = row.group_name || row.type || 'Other'
    if (!acc[g]) acc[g] = []
    acc[g].push(row)
    return acc
  }, {})

  function TBAccountRow({ row }: { row: TBRow }) {
    return (
      <tr
        key={row.code}
        className={`border-b border-gray-100 ${row.id && dateFrom ? 'cursor-pointer hover:bg-indigo-50 group' : 'hover:bg-gray-50'}`}
        onClick={row.id && dateFrom && dateTo ? () => onDrill?.({
          nodeType: 'account',
          nodeId: Number(row.id),
          nodeLabel: `${row.code} — ${row.name}`,
          dateFrom,
          dateTo,
        }) : undefined}
        title={row.id && dateFrom ? 'Click to view vouchers' : undefined}
      >
        <td className="px-4 py-2 font-mono text-xs text-gray-400">{row.code}</td>
        <td className="px-4 py-2 text-gray-700 group-hover:text-indigo-700">
          {row.name}
          {(row.id != null) && dateFrom && <span className="ml-1 text-gray-300 group-hover:text-indigo-400 text-xs">&#8599;</span>}
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-gray-600">{n(row.opening_dr) ? npr(row.opening_dr) : dash}</td>
        <td className="px-4 py-2 text-right tabular-nums text-gray-600">{n(row.opening_cr) ? npr(row.opening_cr) : dash}</td>
        <td className="px-4 py-2 text-right tabular-nums text-blue-700">{n(row.period_dr) ? npr(row.period_dr) : dash}</td>
        <td className="px-4 py-2 text-right tabular-nums text-blue-700">{n(row.period_cr) ? npr(row.period_cr) : dash}</td>
        <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{n(row.closing_dr) ? npr(row.closing_dr) : dash}</td>
        <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">{n(row.closing_cr) ? npr(row.closing_cr) : dash}</td>
      </tr>
    )
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
          <tr>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">Code</th>
            <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Account Name</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wide w-28" colSpan={2}>Opening Balance</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-blue-500 uppercase tracking-wide w-28" colSpan={2}>Period Movement</th>
            <th className="px-4 py-2 text-right text-xs font-semibold text-gray-700 uppercase tracking-wide w-28" colSpan={2}>Closing Balance</th>
          </tr>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th colSpan={2} />
            <th className="px-4 py-1 text-right text-xs text-gray-400 font-medium">Dr</th>
            <th className="px-4 py-1 text-right text-xs text-gray-400 font-medium">Cr</th>
            <th className="px-4 py-1 text-right text-xs text-blue-400 font-medium">Dr</th>
            <th className="px-4 py-1 text-right text-xs text-blue-400 font-medium">Cr</th>
            <th className="px-4 py-1 text-right text-xs text-gray-600 font-medium">Dr</th>
            <th className="px-4 py-1 text-right text-xs text-gray-600 font-medium">Cr</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groups ?? {}).map(([groupName, rows]) => (
            <>
              <tr key={`g-${groupName}`} className="bg-gray-100">
                <td colSpan={8} className="px-4 py-1.5">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{groupName}</span>
                </td>
              </tr>
              {rows.map(row => <TBAccountRow key={row.code} row={row} />)}
            </>
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
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_opening_dr)}</td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_opening_cr)}</td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_period_dr)}</td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_period_cr)}</td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_closing_dr)}</td>
            <td className="px-4 py-2.5 text-right font-bold tabular-nums">{npr(data.total_closing_cr)}</td>
          </tr>
        </tfoot>
      </table>
      {!data.accounts?.length && <EmptyState message="No accounts with activity in this period." />}
    </div>
  )
}

// ─── Aged Receivables / Payables ──────────────────────────────────────────────

const AGED_BUCKETS: { key: keyof Omit<AgedReport, 'as_of_date' | 'grand_total'>; label: string }[] = [
  { key: 'current', label: 'Current'    },
  { key: '1_30',    label: '1–30 days'  },
  { key: '31_60',   label: '31–60 days' },
  { key: '61_90',   label: '61–90 days' },
  { key: '90_plus', label: '90+ days'   },
]

function AgedReportView({ data, type }: { data: AgedReport; type: 'receivables' | 'payables' }) {
  const isRec = type === 'receivables'
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
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{isRec ? 'Customer' : 'Supplier'}</th>
            {AGED_BUCKETS.map(b => <th key={b.key} className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">{b.label}</th>)}
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

// ─── VAT Report ───────────────────────────────────────────────────────────────

function VATReportView({ data }: { data: VATReport }) {
  const payable = parseFloat(String(data.vat_payable))
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

// ─── Cash Flow (Indirect Method) ─────────────────────────────────────────────

function CFReportView({ data }: { data: CFReportIndirect }) {
  // New indirect structure has `operating` / `investing` / `financing` keys.
  // Fall back to legacy direct-method display when those keys are absent.
  const isIndirect = 'operating' in data && data.operating != null

  const n    = (v: number | string | null | undefined) => parseFloat(String(v ?? 0))
  const fmt  = (v: number | string) => {
    const x = n(v)
    return x < 0 ? `(${npr(Math.abs(x))})` : npr(x)
  }

  if (!isIndirect) {
    // Legacy fallback
    const ld = data as unknown as CFReport
    const net = n(ld.net_cash_flow)
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
            <tr><td className="px-4 py-3 text-gray-700">Total Cash Inflows</td><td className="px-4 py-3 text-right tabular-nums">{npr(ld.total_incoming)}</td></tr>
            <tr><td className="px-4 py-3 text-gray-700">Total Cash Outflows</td><td className="px-4 py-3 text-right tabular-nums">({npr(ld.total_outgoing)})</td></tr>
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
  function Section({ title, children, total }: { title: string; children: React.ReactNode; total: number|string }) {
    return (
      <div className="mb-1">
        <div className="bg-indigo-50 px-4 py-2 border-y border-indigo-100">
          <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest">{title}</span>
        </div>
        {children}
        <div className="flex justify-between px-4 py-2 bg-gray-50 border-b border-gray-200 font-semibold text-sm">
          <span className="text-gray-700">Net {title} Activities</span>
          <span className={`tabular-nums ${n(total) < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(total)}</span>
        </div>
      </div>
    )
  }

  function ItemRow({ label, amount }: { label: string; amount: number|string }) {
    return (
      <div className="flex justify-between px-6 py-2 hover:bg-gray-50 border-b border-gray-100 text-sm">
        <span className="text-gray-700">{label}</span>
        <span className="tabular-nums text-gray-800">{fmt(amount)}</span>
      </div>
    )
  }

  const op  = data.operating
  const inv = data.investing
  const fin = data.financing
  const netChange   = n(data.net_change)
  const opening     = n(data.opening_cash)
  const closing     = n(data.closing_cash)

  return (
    <div>
      <Section title="Operating" total={op.total}>
        <ItemRow label="Net Profit / (Loss)" amount={op.net_profit} />
        {n(op.depreciation) !== 0 && <ItemRow label="Add: Depreciation & Amortisation" amount={op.depreciation} />}
        {op.working_capital_changes?.length > 0 && (
          <div className="bg-gray-50 px-4 py-1.5 border-b border-gray-200">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-widest">Working Capital Changes</span>
          </div>
        )}
        {op.working_capital_changes?.map(wc => <ItemRow key={wc.label} label={wc.label} amount={wc.amount} />)}
        {op.working_capital_changes?.length > 0 && (
          <div className="flex justify-between px-6 py-1.5 border-b border-gray-100 text-xs font-semibold">
            <span className="text-gray-600">Net Working Capital Changes</span>
            <span className={`tabular-nums ${n(op.working_capital_total) < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(op.working_capital_total ?? 0)}</span>
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
      {/* Reconciliation */}
      <div className="mt-2 mx-4 mb-4 border border-gray-200 rounded text-sm">
        <div className="flex justify-between px-4 py-2 border-b border-gray-100">
          <span className="text-gray-600">Opening Cash &amp; Bank Balance</span>
          <span className="tabular-nums font-medium">{npr(opening)}</span>
        </div>
        <div className="flex justify-between px-4 py-2 border-b border-gray-100">
          <span className="text-gray-600">Net Change in Cash</span>
          <span className={`tabular-nums font-medium ${netChange < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(netChange)}</span>
        </div>
        {'expected_closing' in data && (
          <div className="flex justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-gray-500 text-xs">Expected Closing (Opening + Net Change)</span>
            <span className="tabular-nums text-xs font-medium text-gray-700">{npr(n(data.expected_closing))}</span>
          </div>
        )}
        <div className="flex justify-between px-4 py-2.5 bg-gray-800 text-white rounded-b font-bold">
          <span>Closing Cash &amp; Bank Balance</span>
          <span className="tabular-nums">{npr(closing)}</span>
        </div>
        {'balanced' in data && (
          <div className={`flex items-center justify-between px-4 py-2 rounded-b border-t ${data.balanced ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
            <span className={`text-xs font-semibold ${data.balanced ? 'text-green-700' : 'text-red-700'}`}>
              {data.balanced ? 'Statement balanced' : 'Out of balance'}
            </span>
            {!data.balanced && (
              <span className="text-xs text-red-600 tabular-nums">Difference: {fmt(n(data.difference))}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Ratio Analysis ───────────────────────────────────────────────────────────

function RatioAnalysisView({ data }: { data: RatioReport }) {
  function RatioRow({ label, value, suffix = '', description }: { label: string; value: number|null; suffix?: string; description: string }) {
    return (
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-sm">
        <div>
          <span className="font-medium text-gray-800">{label}</span>
          <p className="text-xs text-gray-400 mt-0.5">{description}</p>
        </div>
        <span className="tabular-nums font-semibold text-gray-900 ml-4">
          {value == null ? <span className="text-gray-400 font-normal">—</span> : `${value.toFixed(2)}${suffix}`}
        </span>
      </div>
    )
  }

  const wc = parseFloat(data.working_capital ?? '0')

  return (
    <div className="divide-y divide-gray-200">
      <RptSection title="Liquidity">
        <RatioRow label="Current Ratio"  value={data.current_ratio}  description="Current Assets / Current Liabilities — should be > 2" />
        <RatioRow label="Quick Ratio"    value={data.quick_ratio}    description="(Current Assets − Inventory) / Current Liabilities — should be > 1" />
        <RatioRow label="Cash Ratio"     value={data.cash_ratio}     description="(Cash + Bank) / Current Liabilities" />
        <div className="flex justify-between px-4 py-3 border-b border-gray-100 text-sm">
          <div>
            <span className="font-medium text-gray-800">Working Capital</span>
            <p className="text-xs text-gray-400 mt-0.5">Current Assets − Current Liabilities</p>
          </div>
          <span className={`tabular-nums font-semibold ${wc < 0 ? 'text-red-600' : 'text-gray-900'}`}>{npr(wc)}</span>
        </div>
      </RptSection>
      <RptSection title="Leverage">
        <RatioRow label="Debt to Equity"     value={data.debt_to_equity}     description="Total Liabilities / Total Capital" />
        <RatioRow label="Debt to Assets"     value={data.debt_to_assets}     description="Total Liabilities / Total Assets" />
        <RatioRow label="Interest Coverage"  value={data.interest_coverage}  description="EBIT / Interest Expense — should be > 3" />
      </RptSection>
      {(data.gross_margin_pct != null || data.net_margin_pct != null) && (
        <RptSection title="Profitability">
          <RatioRow label="Gross Margin"  value={data.gross_margin_pct} suffix="%" description="Gross Profit / Revenue × 100" />
          <RatioRow label="Net Margin"    value={data.net_margin_pct}   suffix="%" description="Net Profit / Revenue × 100" />
          <RatioRow label="Return on Equity (ROE)" value={data.roe_pct} suffix="%" description="Net Profit / Total Capital × 100" />
          <RatioRow label="Return on Assets (ROA)" value={data.roa_pct} suffix="%" description="Net Profit / Total Assets × 100" />
        </RptSection>
      )}
      {(data.days_sales_outstanding != null || data.days_payable_outstanding != null) && (
        <RptSection title="Activity">
          <RatioRow label="Days Sales Outstanding (DSO)"   value={data.days_sales_outstanding}  suffix=" days" description="(Debtors / Revenue) × Period Days" />
          <RatioRow label="Days Payable Outstanding (DPO)" value={data.days_payable_outstanding} suffix=" days" description="(Creditors / Purchases) × Period Days" />
        </RptSection>
      )}
    </div>
  )
}

// ─── Cash Book / Bank Book ─────────────────────────────────────────────────────

interface CashBookTx {
  date: string; entry_number: string; description: string; narration: string
  reference_type: string; reference_id: number | null; voucher_number: string
  debit: string; credit: string; balance: string
}
interface CashBookReport {
  bank_account: { id: number; name: string } | null
  date_from: string; date_to: string
  opening_balance: string; closing_balance: string
  transactions: CashBookTx[]
}

function CashBookView({ data, dateFrom, dateTo, onDrill }: { data: CashBookReport; dateFrom?: string; dateTo?: string; onDrill?: (seed: DrillSeed) => void }) {
  const opening  = parseFloat(data.opening_balance  ?? '0')
  const closing  = parseFloat(data.closing_balance  ?? '0')
  const txs      = data.transactions ?? []
  const totalDr  = txs.reduce((s, r) => s + parseFloat(r.debit  ?? '0'), 0)
  const totalCr  = txs.reduce((s, r) => s + parseFloat(r.credit ?? '0'), 0)
  const isBank   = !!data.bank_account

  return (
    <div>
      {/* ── Summary strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-4 divide-x divide-gray-200 border-b border-gray-200 bg-gray-50">
        {[
          { label: 'Opening Balance', value: opening  },
          { label: 'Total Receipts',  value: totalDr  },
          { label: 'Total Payments',  value: totalCr  },
          { label: 'Closing Balance', value: closing  },
        ].map(s => (
          <div key={s.label} className="px-4 py-3 text-center">
            <p className="text-xs text-gray-500 font-medium mb-0.5">{s.label}</p>
            <p className={`text-sm font-bold tabular-nums ${
              s.label === 'Closing Balance' && closing < 0 ? 'text-red-600' : 'text-gray-900'
            }`}>{npr(s.value.toFixed(2))}</p>
          </div>
        ))}
      </div>

      {isBank && (
        <p className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
          Showing Bank Book for: <span className="font-medium text-gray-800">{data.bank_account!.name}</span>
        </p>
      )}

      {/* ── Transaction table ───────────────────────────────────── */}
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Date</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Voucher #</th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Particulars</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Receipt (Dr)</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Payment (Cr)</th>
            <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {/* Opening balance row */}
          <tr className="bg-amber-50">
            <td className="px-3 py-2 text-gray-400 text-xs font-medium">{fmt(data.date_from)}</td>
            <td className="px-3 py-2 text-gray-400 text-xs">—</td>
            <td className="px-3 py-2 text-gray-600 font-medium">Opening Balance B/F</td>
            <td className="px-3 py-2" />
            <td className="px-3 py-2" />
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-gray-800">{npr(opening.toFixed(2))}</td>
          </tr>
          {txs.map((tx, i) => {
            const bal = parseFloat(tx.balance)
            const drillSeed = resolveReportRowDrill({
              reportKey: 'cash-book',
              row: tx as unknown as Record<string, unknown>,
              dateFrom,
              dateTo,
            })
            const canDrill = Boolean(drillSeed && onDrill)
            return (
              <tr
                key={i}
                className={canDrill ? 'hover:bg-indigo-50 cursor-pointer' : 'hover:bg-gray-50'}
                onClick={canDrill ? () => onDrill?.(drillSeed as DrillSeed) : undefined}
                title={canDrill ? 'Click to drill down' : undefined}
              >
                <td className="px-3 py-1.5 text-xs text-gray-500">{fmt(tx.date)}</td>
                <td className="px-3 py-1.5 text-xs font-mono text-indigo-600">
                  {tx.voucher_number || tx.entry_number || '—'}
                </td>
                <td className="px-3 py-1.5 text-gray-700">
                  {tx.narration || tx.description}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">
                  {parseFloat(tx.debit) ? npr(tx.debit) : <span className="text-gray-200">—</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-red-600">
                  {parseFloat(tx.credit) ? npr(tx.credit) : <span className="text-gray-200">—</span>}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                  bal < 0 ? 'text-red-600' : 'text-gray-800'
                }`}>{npr(bal.toFixed(2))}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot className="bg-gray-800 text-white">
          <tr>
            <td colSpan={3} className="px-3 py-2.5 text-sm font-bold uppercase tracking-wide">Closing Balance C/F</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(totalDr.toFixed(2))}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(totalCr.toFixed(2))}</td>
            <td className="px-3 py-2.5 text-right font-bold tabular-nums">{npr(closing.toFixed(2))}</td>
          </tr>
        </tfoot>
      </table>
      {!txs.length && <EmptyState message="No cash/bank movements in this period." />}
    </div>
  )
}

// ─── GL Summary ───────────────────────────────────────────────────────────────

interface GLSummaryGroup { label: string; rows: { id?: number; code: string; name: string; balance: number }[]; total: number }

function GLSummaryView({ data, dateFrom, dateTo, onDrill }: { data: { groups: Record<string, GLSummaryGroup> }; dateFrom?: string; dateTo?: string; onDrill?: (seed: DrillSeed) => void }) {
  const order = ['asset', 'liability', 'equity', 'revenue', 'expense']
  return (
    <div className="divide-y divide-gray-100">
      {order.map(k => {
        const g = data.groups?.[k]
        if (!g) return null
        return (
          <RptSection key={k} title={g.label}>
            {g.rows.map(r => <DrillableRow key={r.code} account={r} indent dateFrom={dateFrom} dateTo={dateTo} onDrill={onDrill} />)}
            {!g.rows.length && <p className="px-8 py-2 text-xs text-gray-400 italic">No activity.</p>}
            <RptTotal label={`Total ${g.label}`} amount={g.total} />
          </RptSection>
        )
      })}
    </div>
  )
}

// ─── Sales Summary ────────────────────────────────────────────────────────────

function SalesSummaryView({ data }: { data: Record<string, unknown> }) {
  const stats = [
    { label: 'Total Invoiced',  value: data.total_invoiced    },
    { label: 'Total Collected', value: data.total_collected   },
    { label: 'Outstanding',     value: data.total_outstanding },
    { label: 'VAT Collected',   value: data.total_vat         },
    { label: 'Invoice Count',   value: String(data.invoice_count) },
    { label: 'Avg Invoice',     value: data.avg_invoice_value },
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

// ─── Annex 5 ──────────────────────────────────────────────────────────────────

function Annex5View({ data }: { data: Record<string, unknown> }) {
  const rows = [
    { side: 'Sales',    label: 'Taxable Sales',            value: data.sales_taxable },
    { side: 'Sales',    label: 'Output VAT (13%)',          value: data.output_vat },
    { side: 'Sales',    label: 'Less: Sales Returns Tax',   value: data.sales_return_taxable },
    { side: 'Sales',    label: 'Less: Sales Return VAT',    value: data.sales_return_vat },
    { side: 'Sales',    label: 'Net Output VAT',            value: data.net_output_vat },
    { side: 'Purchase', label: 'Taxable Purchases',         value: data.purchase_taxable },
    { side: 'Purchase', label: 'Input VAT (13%)',           value: data.input_vat },
    { side: 'Purchase', label: 'Less: Purchase Returns',    value: data.purchase_return_taxable },
    { side: 'Purchase', label: 'Less: Purchase Return VAT', value: data.purchase_return_vat },
    { side: 'Purchase', label: 'Net Input VAT',             value: data.net_input_vat },
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

// ─── Statement (running balance ledger) ──────────────────────────────────────

interface StatementTxn {
  date: string; type: string; reference: string; description: string
  debit: number | string; credit: number | string; balance: number | string
}

function StatementView({ data }: { data: { opening_balance: number; closing_balance: number; transactions: StatementTxn[] } }) {
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

// ─── Generic table ────────────────────────────────────────────────────────────

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
  resolveRowDrill?: (row: Record<string, unknown>) => DrillSeed | null
  onDrill?: (seed: DrillSeed) => void
}

function GenericTableView({ rows, totalRow, summary, hideCols = [], resolveRowDrill, onDrill }: GenericTableProps) {
  if (!rows?.length) return <p className="px-6 py-10 text-sm text-gray-400 text-center italic">No data for this period.</p>
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
            {rows.map((row, i) => {
              const drillSeed = resolveRowDrill?.(row) ?? null
              const canDrill = Boolean(drillSeed && onDrill)
              return (
              <tr
                key={i}
                className={`border-b border-gray-100 ${canDrill ? 'hover:bg-indigo-50 cursor-pointer' : 'hover:bg-gray-50'}`}
                onClick={canDrill ? () => onDrill?.(drillSeed as DrillSeed) : undefined}
                title={canDrill ? 'Click to drill down' : undefined}
              >
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
              )
            })}
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

// ─── Monthly pivot ────────────────────────────────────────────────────────────

interface MonthlyCrossData { months: string[]; rows: Record<string, unknown>[]; grand_total: unknown }

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
            {months.map(m => <th key={m} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right whitespace-nowrap">{m}</th>)}
            <th className="px-4 py-2.5 text-xs font-semibold text-gray-700 uppercase tracking-wide text-right bg-gray-100">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-1.5 text-xs text-gray-400">{i + 1}</td>
              <td className="px-4 py-1.5 font-medium text-gray-800 max-w-[200px] truncate">{String(row[entityKey] ?? '')}</td>
              {months.map(m => <td key={m} className="px-4 py-1.5 text-right tabular-nums text-gray-600">{row[m] ? npr(row[m] as number) : '—'}</td>)}
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

// ─── CSV export ───────────────────────────────────────────────────────────────

function toCSV(key: ReportType, data: Record<string, unknown>): string {
  const rows: string[][] = []
  const esc = (v: string | number | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const row = (...cells: (string | number | undefined)[]) => rows.push(cells.map(esc))

  switch (key) {
    case 'pl': {
      const d = data as unknown as PLReport
      row('Section', 'Code', 'Account', 'Amount')
      d.sales?.forEach(r => row('Sales', r.code, r.name, r.balance))
      d.direct_income?.forEach(r => row('Direct Income', r.code, r.name, r.balance))
      row('', '', 'Gross Revenue', d.gross_revenue)
      d.purchases?.forEach(r => row('Purchases', r.code, r.name, r.balance))
      d.direct_expenses?.forEach(r => row('Direct Expenses', r.code, r.name, r.balance))
      row('', '', 'Total Direct Costs', d.total_direct_cost)
      row('', '', 'Gross Profit', d.gross_profit)
      d.indirect_expenses?.forEach(r => row('Indirect Expenses', r.code, r.name, r.balance))
      d.indirect_income?.forEach(r => row('Other Income', r.code, r.name, r.balance))
      row('', '', 'Net Profit/Loss', d.net_profit)
      break
    }
    case 'balance-sheet': {
      const d = data as unknown as BSReport
      row('Section', 'Code', 'Account', 'Amount')
      d.capital?.forEach(r => row('Capital', r.code, r.name, r.balance))
      row('', '', 'Total Capital', d.total_capital)
      d.bank_od?.forEach(r => row('Bank OD', r.code, r.name, r.balance))
      d.loans?.forEach(r => row('Loans', r.code, r.name, r.balance))
      row('', '', 'Total Loans', d.total_loans)
      d.current_liabilities?.forEach(r => row('Current Liabilities', r.code, r.name, r.balance))
      row('', '', 'Total Liabilities', d.total_liabilities)
      d.fixed_assets?.forEach(r => row('Fixed Assets', r.code, r.name, r.balance))
      d.investments?.forEach(r => row('Investments', r.code, r.name, r.balance))
      d.current_assets?.forEach(r => row('Current Assets', r.code, r.name, r.balance))
      row('', '', 'Total Assets', d.total_assets)
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
      const d = data as unknown as AgedReport
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
      row('B', `Input VAT  — reclaimable on bills  (${d.bill_count})`, d.vat_reclaimable)
      row('C', 'Net VAT Payable / (Refund Due)', d.vat_payable)
      break
    }
    case 'cash-flow': {
      const d = data as unknown as CFReportIndirect
      const isIndirect = 'operating' in d && d.operating != null
      if (isIndirect) {
        row('Section', 'Line', 'Amount')
        row('Operating', 'Net Profit / (Loss)', d.operating.net_profit)
        if (Number(d.operating.depreciation) !== 0) row('Operating', 'Add: Depreciation & Amortisation', d.operating.depreciation)
        d.operating.working_capital_changes?.forEach(wc => row('Operating', wc.label, wc.amount))
        if (d.operating.working_capital_total != null) row('Operating', 'Net Working Capital Changes', d.operating.working_capital_total)
        row('Operating', 'Net Operating Activities', d.operating.total)
        d.investing.items?.forEach(it => row('Investing', it.label, it.amount))
        row('Investing', 'Net Investing Activities', d.investing.total)
        d.financing.items?.forEach(it => row('Financing', it.label, it.amount))
        row('Financing', 'Net Financing Activities', d.financing.total)
        row('', 'Net Change in Cash', d.net_change)
        row('', 'Opening Cash & Bank', d.opening_cash)
        row('', 'Closing Cash & Bank', d.closing_cash)
        if (d.expected_closing != null) row('', 'Expected Closing', d.expected_closing)
        if (d.difference != null) row('', 'Difference (Out of Balance)', d.difference)
        row('', 'Balanced', d.balanced ? 'Yes' : 'No')
      } else {
        const ld = data as unknown as CFReport
        row('Method', 'Inflows', 'Outflows', 'Net')
        ld.by_method?.forEach(m =>
          row(m.method, m.incoming, m.outgoing,
            (parseFloat(String(m.incoming)) - parseFloat(String(m.outgoing))).toFixed(2))
        )
        row('TOTAL', ld.total_incoming, ld.total_outgoing, ld.net_cash_flow)
      }
      break
    }
    case 'service-report': {
      const sd = data as unknown as { rows: { name: string; invoice_count: number; revenue: string; expense_count: number; cost: string; net: string }[]; total_revenue: string; total_cost: string; total_net: string }
      row('Service', 'Invoices', 'Revenue', 'Expenses', 'Cost', 'Net')
      sd.rows.forEach(r => row(r.name, r.invoice_count, r.revenue, r.expense_count, r.cost, r.net))
      row('Total', '', sd.total_revenue, '', sd.total_cost, sd.total_net)
      break
    }
    default: {
      const rowsArr = (data.rows as Record<string, unknown>[] | undefined) ?? []
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

// ─── Inventory Ops panel (dedicated panel for inventory-native reports) ───────

type InvOpsKey = 'inv-valuation' | 'inv-dead-stock' | 'inv-abc' | 'inv-forecast' | 'inv-top-selling'

const ABC_STYLE: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-yellow-100 text-yellow-700',
  C: 'bg-red-100 text-red-600',
}

function InventoryOpsPanel({ reportKey }: { reportKey: InvOpsKey }) {
  const [deadStockDays, setDeadStockDays] = useState(60)
  const [forecastDays, setForecastDays] = useState(30)
  const [topSellingDays, setTopSellingDays] = useState(90)

  const { data: valuation, isLoading: loadingVal } = useQuery({
    queryKey: ['report-valuation'],
    queryFn: () => apiClient.get(INVENTORY.REPORT_VALUATION).then(r => r.data?.data ?? r.data),
    enabled: reportKey === 'inv-valuation',
  })
  const { data: deadStock, isLoading: loadingDead } = useQuery({
    queryKey: ['report-dead-stock', deadStockDays],
    queryFn: () => apiClient.get(`${INVENTORY.REPORT_DEAD_STOCK}?days=${deadStockDays}`).then(r => r.data?.data ?? r.data),
    enabled: reportKey === 'inv-dead-stock',
  })
  const { data: abc, isLoading: loadingAbc } = useQuery({
    queryKey: ['report-abc'],
    queryFn: () => apiClient.get(INVENTORY.REPORT_ABC).then(r => r.data?.data ?? r.data),
    enabled: reportKey === 'inv-abc',
  })
  const { data: forecast, isLoading: loadingForecast } = useQuery({
    queryKey: ['report-forecast', forecastDays],
    queryFn: () => apiClient.get(`${INVENTORY.REPORT_FORECAST}?days=${forecastDays}`).then(r => r.data?.data ?? r.data),
    enabled: reportKey === 'inv-forecast',
  })
  const { data: topSelling, isLoading: loadingTopSelling } = useQuery({
    queryKey: ['report-top-selling', topSellingDays],
    queryFn: () => apiClient.get(`${INVENTORY.REPORT_TOP_SELLING}?days=${topSellingDays}`).then(r => r.data?.data ?? r.data),
    enabled: reportKey === 'inv-top-selling',
  })

  const handleExportCsv = async () => {
    try {
      const res = await apiClient.get(INVENTORY.REPORT_EXPORT_CSV, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = 'products_export.csv'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <div className="space-y-4">
      {/* Export button */}
      <div className="flex justify-end">
        <button onClick={handleExportCsv}
          className="flex items-center gap-1.5 px-4 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
          <FileDown size={14} /> Export Products CSV
        </button>
      </div>

      {/* Valuation */}
      {reportKey === 'inv-valuation' && (
        loadingVal ? <Spinner /> : valuation ? (
          <>
            <div className="bg-indigo-50 rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm text-indigo-600 font-medium">Total Inventory Value</span>
              <span className="text-xl font-bold text-indigo-700">
                Rs. {parseFloat(valuation.total_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Product</th>
                    <th className="px-5 py-3 text-left">SKU</th>
                    <th className="px-5 py-3 text-left">Category</th>
                    <th className="px-5 py-3 text-center">Qty</th>
                    <th className="px-5 py-3 text-right">Cost</th>
                    <th className="px-5 py-3 text-right">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {valuation.rows.map((r: { id: number; name: string; sku: string; category: string | null; quantity_on_hand: number; cost_price: number; total_value: number }) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{r.category ?? '—'}</td>
                      <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                      <td className="px-5 py-3 text-right text-gray-500">Rs. {Number(r.cost_price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-800">Rs. {Number(r.total_value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null
      )}

      {/* Dead Stock */}
      {reportKey === 'inv-dead-stock' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-5 py-4">
            <span className="text-sm text-gray-600">No movement in the last</span>
            <input type="number" value={deadStockDays} onChange={e => setDeadStockDays(Number(e.target.value))} min={7} max={365}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-600">days</span>
          </div>
          {loadingDead ? <Spinner /> : deadStock ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {deadStock.count === 0 ? (
                <div className="p-10 text-center">
                  <CheckCircle2 size={32} className="text-green-300 mx-auto mb-2" />
                  <p className="text-gray-400 text-sm">No dead stock — all products have recent movement</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-left">Product</th>
                      <th className="px-5 py-3 text-left">SKU</th>
                      <th className="px-5 py-3 text-center">Qty on Hand</th>
                      <th className="px-5 py-3 text-left">Last Movement</th>
                      <th className="px-5 py-3 text-center">Days Inactive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deadStock.rows.map((r: { id: number; name: string; sku: string; quantity_on_hand: number; last_movement: string | null; days_inactive: number }) => (
                      <tr key={r.id}>
                        <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                        <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                        <td className="px-5 py-3 text-gray-500 text-xs">{r.last_movement ? <DateDisplay adDate={r.last_movement} compact /> : 'Never'}</td>
                        <td className="px-5 py-3 text-center"><span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">{r.days_inactive}d</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* ABC Analysis */}
      {reportKey === 'inv-abc' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            {['A', 'B', 'C'].map(cls => (
              <div key={cls} className={`px-3 py-2 rounded-xl text-xs ${ABC_STYLE[cls]}`}>
                <strong>Class {cls}:</strong> {cls === 'A' ? 'Top 70% of value' : cls === 'B' ? 'Next 20%' : 'Bottom 10%'}
              </div>
            ))}
          </div>
          {loadingAbc ? <Spinner /> : abc ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Product</th>
                    <th className="px-5 py-3 text-left">SKU</th>
                    <th className="px-5 py-3 text-center">Qty</th>
                    <th className="px-5 py-3 text-right">Stock Value</th>
                    <th className="px-5 py-3 text-center">Cumulative %</th>
                    <th className="px-5 py-3 text-center">Class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {abc.rows.map((r: { id: number; name: string; sku: string; quantity_on_hand: number; stock_value: number; cumulative_pct: number; class: string }) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                      <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-800">Rs. {Number(r.stock_value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-5 py-3 text-center text-gray-500 text-xs">{r.cumulative_pct}%</td>
                      <td className="px-5 py-3 text-center"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${ABC_STYLE[r.class]}`}>{r.class}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* Demand Forecast */}
      {reportKey === 'inv-forecast' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-5 py-4">
            <span className="text-sm text-gray-600">Based on consumption over last</span>
            <input type="number" value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))} min={7} max={365}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-600">days</span>
          </div>
          {loadingForecast ? <Spinner /> : forecast ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="px-5 py-3 text-left">Product</th>
                    <th className="px-5 py-3 text-left">Category</th>
                    <th className="px-5 py-3 text-center">On Hand</th>
                    <th className="px-5 py-3 text-center">Reorder At</th>
                    <th className="px-5 py-3 text-center">Avg Daily Use</th>
                    <th className="px-5 py-3 text-center">Days of Stock</th>
                    <th className="px-5 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {forecast.rows.map((r: { id: number; name: string; category: string | null; quantity_on_hand: number; reorder_level: number; avg_daily_consumption: number; days_of_stock: number | null; needs_reorder: boolean }) => (
                    <tr key={r.id} className={r.needs_reorder ? 'bg-red-50' : ''}>
                      <td className="px-5 py-3 font-medium text-gray-800">{r.name}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{r.category ?? '—'}</td>
                      <td className="px-5 py-3 text-center text-gray-600">{r.quantity_on_hand}</td>
                      <td className="px-5 py-3 text-center text-gray-500">{r.reorder_level}</td>
                      <td className="px-5 py-3 text-center text-gray-500">{r.avg_daily_consumption}</td>
                      <td className="px-5 py-3 text-center">
                        {r.days_of_stock === null
                          ? <span className="text-gray-300 text-xs">No consumption</span>
                          : <span className={`font-medium ${r.days_of_stock < 7 ? 'text-red-600' : r.days_of_stock < 14 ? 'text-amber-600' : 'text-green-600'}`}>{r.days_of_stock}d</span>
                        }
                      </td>
                      <td className="px-5 py-3 text-center">
                        {r.needs_reorder
                          ? <span className="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-medium">Reorder Now</span>
                          : <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs font-medium">OK</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      )}

      {/* Top Selling */}
      {reportKey === 'inv-top-selling' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-5 py-4">
            <span className="text-sm text-gray-600">Based on ticket usage over last</span>
            <input type="number" value={topSellingDays} onChange={e => setTopSellingDays(Number(e.target.value))} min={7} max={365}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <span className="text-sm text-gray-600">days</span>
          </div>
          {loadingTopSelling ? <Spinner /> : topSelling ? (
            topSelling.rows.length === 0 ? (
              <div className="p-10 text-center">
                <Package size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No ticket product usage found in this period</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-5 py-3 text-left">#</th>
                      <th className="px-5 py-3 text-left">Product</th>
                      <th className="px-5 py-3 text-left">SKU</th>
                      <th className="px-5 py-3 text-center">Units Used</th>
                      <th className="px-5 py-3 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {topSelling.rows.map((r: { product_id: number; product_name: string; sku: string; total_quantity: number; total_revenue: number }, i: number) => (
                      <tr key={r.product_id}>
                        <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-5 py-3 font-medium text-gray-800">{r.product_name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-400">{r.sku}</td>
                        <td className="px-5 py-3 text-center text-gray-700 font-semibold">{r.total_quantity}</td>
                        <td className="px-5 py-3 text-right font-bold text-gray-900">Rs. {Number(r.total_revenue ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  )
}

// ─── Main Reports Page ────────────────────────────────────────────────────────

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const fy = currentFiscalYear()
  const fyParams = fiscalYearAdParams(fy)

  const [category, setCategory] = useState<ReportCategory>('accounting')
  const [reportKey, setReportKey] = useState<ReportType>('pl')
  const [dateFrom, setDateFrom] = useState(fyParams.date_from)
  const [dateTo, setDateTo] = useState(today)
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [supplierId, setSupplierId] = useState<number | null>(null)
  const [costCentreId, setCostCentreId] = useState<number | null>(null)
  // Compare period — optional, used by P&L and Balance Sheet
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareFrom, setCompareFrom] = useState('')
  const [compareTo, setCompareTo]     = useState('')
  const [drillSeed, setDrillSeed] = useState<DrillSeed | null>(null)
  const printRef = useRef<HTMLDivElement>(null)

  const report = REPORTS.find(r => r.key === reportKey)!
  const catReports = REPORTS.filter(r => r.category === category)
  const isInvOps = category === 'inventory-ops'
  const supportsCompare = reportKey === 'pl' || reportKey === 'balance-sheet'

  function handleCategoryChange(cat: ReportCategory) {
    setCategory(cat)
    const first = REPORTS.find(r => r.category === cat)
    if (first) setReportKey(first.key)
  }

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
    if (report.needsCostCentre && costCentreId) parts.push(`cost_centre_id=${costCentreId}`)
    if (supportsCompare && compareEnabled) {
      if (reportKey === 'pl' && compareFrom && compareTo) {
        parts.push(`compare_from=${compareFrom}`, `compare_to=${compareTo}`)
      } else if (reportKey === 'balance-sheet' && compareTo) {
        parts.push(`compare_as_of=${compareTo}`)
      }
    }
    return parts.length ? `?${parts.join('&')}` : ''
  }

  const { data: customersList } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['report-customers-dropdown'],
    queryFn: () => apiClient.get(`${CUSTOMERS.LIST}?page_size=500`).then(r =>
      (r.data?.data?.results ?? r.data?.results ?? []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))
    ),
    enabled: report?.needsCustomer ?? false,
    staleTime: 60_000,
  })

  const { data: suppliersList } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['report-suppliers-dropdown'],
    queryFn: () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=500`).then(r =>
      (r.data?.data?.results ?? r.data?.results ?? []).map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }))
    ),
    enabled: report?.needsSupplier ?? false,
    staleTime: 60_000,
  })

  const { data: costCentreList } = useQuery<{ id: number; name: string; code: string }[]>({
    queryKey: ['report-cost-centres-dropdown'],
    queryFn: () => apiClient.get(`${ACCOUNTING.COST_CENTRES}?page_size=500`).then(r => {
      const list = Array.isArray(r.data?.data) ? r.data.data
                 : Array.isArray(r.data?.data?.results) ? r.data.data.results
                 : Array.isArray(r.data?.results) ? r.data.results
                 : []
      return list.map((c: { id: number; name: string; code: string }) => ({ id: c.id, name: c.name, code: c.code }))
    }),
    enabled: report?.needsCostCentre ?? false,
    staleTime: 60_000,
  })

  const { data: reportData, isLoading, isError, error, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['report', reportKey, dateFrom, dateTo, customerId, supplierId, costCentreId, compareEnabled, compareFrom, compareTo],
    queryFn: () => apiClient.get(report.endpoint + buildParams()).then(r => r.data?.data ?? r.data),
    enabled: false,
  })

  // Reset output when switching reports
  useEffect(() => { /* enabled:false prevents auto-run */ }, [reportKey])

  const isAsOf = report.dateMode === 'asof'
  const periodLabel = isAsOf ? `As of ${fmt(dateTo)}` : `${fmt(dateFrom)} – ${fmt(dateTo)}`

  function exportCSV() {
    if (!reportData) return
    const csv = toCSV(reportKey, reportData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
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

    switch (reportKey) {
      case 'pl':               return <PLReportView data={d as unknown as PLReport} dateFrom={dateFrom} dateTo={dateTo} onDrill={setDrillSeed} />
      case 'balance-sheet':    return <BSReportView data={d as unknown as BSReport} asOf={dateTo} onDrill={setDrillSeed} />
      case 'trial-balance':    return <TBReportView data={d as unknown as TBReport} dateFrom={dateFrom} dateTo={dateTo} onDrill={setDrillSeed} />
      case 'aged-receivables': return <AgedReportView data={d as unknown as AgedReport} type="receivables" />
      case 'aged-payables':    return <AgedReportView data={d as unknown as AgedReport} type="payables" />
      case 'vat':              return <VATReportView data={d as unknown as VATReport} />
      case 'cash-flow':        return <CFReportView data={d as unknown as CFReportIndirect} />
      case 'ratio-analysis':   return <RatioAnalysisView data={d as unknown as RatioReport} />
      case 'cost-centre-pl': {
        const cc = (d as Record<string, unknown>).cost_centre as { name: string; code: string } | null
        return (
          <div>
            {cc && (
              <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2">
                <Layers size={14} className="text-indigo-500 shrink-0" />
                <span className="text-sm font-semibold text-indigo-800">
                  {cc.code ? `[${cc.code}] ` : ''}{cc.name}
                </span>
                <span className="text-xs text-indigo-500 ml-1">— Cost Centre P&L</span>
              </div>
            )}
            <PLReportView data={d as unknown as PLReport} dateFrom={dateFrom} dateTo={dateTo} onDrill={setDrillSeed} />
          </div>
        )
      }
      case 'cash-book':         return <CashBookView data={d as unknown as CashBookReport} dateFrom={dateFrom} dateTo={dateTo} onDrill={setDrillSeed} />
      case 'gl-summary':       return <GLSummaryView data={d as unknown as { groups: Record<string, GLSummaryGroup> }} dateFrom={dateFrom} dateTo={dateTo} onDrill={setDrillSeed} />
      case 'annex-5':          return <Annex5View data={d} />
      case 'sales-summary':    return <SalesSummaryView data={d} />
      case 'customer-statement':
      case 'supplier-statement':
        return <StatementView data={d as Parameters<typeof StatementView>[0]['data']} />
      case 'sales-by-customer-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="customer" />
      case 'sales-by-item-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="item" />
      case 'purchase-by-supplier-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="supplier" />
      case 'purchase-by-item-monthly':
        return <MonthlyCrossTableView data={d as unknown as MonthlyCrossData} entityKey="item" />
      case 'service-report': {
        const sd = d as unknown as { date_from: string; date_to: string; rows: { id: number; name: string; invoice_count: number; revenue: string; expense_count: number; cost: string; net: string }[]; total_revenue: string; total_cost: string; total_net: string }
        return (
          <div className="overflow-x-auto">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between flex-wrap gap-3">
              <div className="flex gap-6 text-right text-sm">
                <div><p className="text-xs text-gray-400">Total Revenue</p><p className="font-bold text-green-700">{npr(sd.total_revenue)}</p></div>
                <div><p className="text-xs text-gray-400">Total Cost</p><p className="font-bold text-red-600">{npr(sd.total_cost)}</p></div>
                <div><p className="text-xs text-gray-400">Net</p><p className={`font-bold ${Number(sd.total_net) >= 0 ? 'text-gray-800' : 'text-red-700'}`}>{npr(sd.total_net)}</p></div>
              </div>
            </div>
            {sd.rows.length === 0 ? (
              <EmptyState message="No service data in this period" />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Service','Invoices','Revenue','Expenses','Cost','Net'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sd.rows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.name}</td>
                      <td className="px-4 py-3 text-xs text-center text-gray-500">{row.invoice_count}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-green-700">{npr(row.revenue)}</td>
                      <td className="px-4 py-3 text-xs text-center text-gray-500">{row.expense_count}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-red-600">{npr(row.cost)}</td>
                      <td className="px-4 py-3 text-sm text-right font-bold" style={{ color: Number(row.net) >= 0 ? '#166534' : '#b91c1c' }}>{npr(row.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-700">Total</td>
                    <td />
                    <td className="px-4 py-2.5 text-sm text-right font-bold text-green-700">{npr(sd.total_revenue)}</td>
                    <td />
                    <td className="px-4 py-2.5 text-sm text-right font-bold text-red-600">{npr(sd.total_cost)}</td>
                    <td className="px-4 py-2.5 text-sm text-right font-bold" style={{ color: Number(sd.total_net) >= 0 ? '#166534' : '#b91c1c' }}>{npr(sd.total_net)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        )
      }
    }

    // Generic table
    const rows = (d.rows as Record<string, unknown>[]) ?? []
    const grandRow: Record<string, unknown> = {}
    if ('grand_total' in d)       grandRow.total           = d.grand_total
    if ('grand_invoiced' in d)    grandRow.total_invoiced  = d.grand_invoiced
    if ('grand_outstanding' in d) grandRow.outstanding     = d.grand_outstanding
    if ('total_taxable' in d)     grandRow.taxable_amount  = d.total_taxable
    if ('total_vat' in d)         grandRow.vat_amount      = d.total_vat
    if ('total_amount' in d)      grandRow.total           = d.total_amount
    if ('total_tds' in d)         grandRow.tds_amount      = d.total_tds
    const hasTotalRow = Object.keys(grandRow).length > 0

    const summaryRows: { label: string; value: unknown }[] = []
    if ('invoice_count' in d || 'count' in d)
      summaryRows.push({ label: 'Count', value: String((d.invoice_count ?? d.count ?? 0)) })
    if ('grand_total' in d && typeof d.grand_total === 'number')
      summaryRows.push({ label: 'Grand Total', value: d.grand_total })
    if ('grand_invoiced' in d)    summaryRows.push({ label: 'Total Invoiced',  value: d.grand_invoiced })
    if ('grand_outstanding' in d) summaryRows.push({ label: 'Outstanding',     value: d.grand_outstanding })
    if ('total_taxable' in d)     summaryRows.push({ label: 'Total Taxable',   value: d.total_taxable })
    if ('total_vat' in d)         summaryRows.push({ label: 'Total VAT',       value: d.total_vat })

    return (
      <GenericTableView
        rows={rows}
        totalRow={hasTotalRow ? grandRow : undefined}
        summary={summaryRows.length ? summaryRows : undefined}
        resolveRowDrill={(row) => resolveReportRowDrill({ reportKey, row, dateFrom, dateTo })}
        onDrill={setDrillSeed}
      />
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <BarChart2 size={20} className="text-indigo-600 shrink-0" />
          <h1 className="text-lg font-bold text-gray-900">Reports</h1>
        </div>
      </div>

      {/* Body: left nav + right content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left category sidebar */}
        <aside className="w-48 shrink-0 border-r border-gray-200 bg-gray-50 overflow-y-auto py-3">
          <p className="px-4 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-widest">Categories</p>
          {REPORT_CATEGORIES.map(cat => {
            const Icon = cat.icon
            const isActive = category === cat.id
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="truncate">{cat.label}</span>
              </button>
            )
          })}
        </aside>

        {/* Right content panel */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <div className="p-6 space-y-5">

            {/* Report selection grid */}
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

            {/* Inventory Ops panel — bypasses date params + run button */}
            {isInvOps && (
              <InventoryOpsPanel reportKey={reportKey as InvOpsKey} />
            )}

            {/* Param controls + Run Report — accounting-style reports only */}
            {!isInvOps && (
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

                {report.needsCustomer && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-medium">Customer</label>
                    <select
                      value={customerId ?? ''}
                      onChange={e => setCustomerId(e.target.value ? parseInt(e.target.value) : null)}
                      className="h-9 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                    >
                      <option value="">— Select customer —</option>
                      {(customersList ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                {report.needsSupplier && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-medium">Supplier</label>
                    <select
                      value={supplierId ?? ''}
                      onChange={e => setSupplierId(e.target.value ? parseInt(e.target.value) : null)}
                      className="h-9 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                    >
                      <option value="">— Select supplier —</option>
                      {(suppliersList ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {report.needsCostCentre && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1 font-medium">Cost Centre</label>
                    <select
                      value={costCentreId ?? ''}
                      onChange={e => setCostCentreId(e.target.value ? parseInt(e.target.value) : null)}
                      className="h-9 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                    >
                      <option value="">— Select cost centre —</option>
                      {(costCentreList ?? []).map(c => (
                        <option key={c.id} value={c.id}>{c.code ? `[${c.code}] ` : ''}{c.name}</option>
                      ))}
                    </select>
                    {report.needsCostCentre && !costCentreId && (
                      <p className="mt-1 text-xs text-amber-600">Select a cost centre to generate this report.</p>
                    )}
                  </div>
                )}

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

                {/* Compare period — P&L and Balance Sheet only */}
                {supportsCompare && (
                  <div className="flex flex-wrap items-end gap-3 w-full pt-1 border-t border-gray-100">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600 font-medium">
                      <input
                        type="checkbox"
                        checked={compareEnabled}
                        onChange={e => setCompareEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      Compare Period
                    </label>
                    {compareEnabled && reportKey === 'pl' && (
                      <>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 font-medium">Compare From</label>
                          <NepaliDatePicker value={compareFrom} onChange={v => setCompareFrom(v)} />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 font-medium">Compare To</label>
                          <NepaliDatePicker value={compareTo} onChange={v => setCompareTo(v)} />
                        </div>
                      </>
                    )}
                    {compareEnabled && reportKey === 'balance-sheet' && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1 font-medium">Compare As Of</label>
                        <NepaliDatePicker value={compareTo} onChange={v => setCompareTo(v)} />
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={() => refetch()}
                  disabled={isLoading || (report.needsCostCentre && !costCentreId)}
                  className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  <BarChart2 size={15} /> Run Report
                </button>
              </div>
            )}

            {/* Loading / error states */}
            {!isInvOps && isLoading && <Spinner />}

            {!isInvOps && isError && !isLoading && (
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

            {/* Report output */}
            {!isInvOps && reportData && !isLoading && (
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

            {/* Empty prompt */}
            {!isInvOps && !reportData && !isLoading && !isError && (
              <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl py-14 text-center">
                <BarChart2 size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm text-gray-500 font-medium">Select a report above and click <strong>Run Report</strong></p>
                <p className="text-xs text-gray-400 mt-1">
                  {catReports.map(r => r.label).join(' · ')}
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {drillSeed && (
        <ReportDrillModal
          seed={drillSeed}
          onClose={() => setDrillSeed(null)}
        />
      )}
    </div>
  )
}
