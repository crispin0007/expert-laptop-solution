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
} from 'lucide-react'
import NepaliDatePicker from '../../components/NepaliDatePicker'
import DateDisplay from '../../components/DateDisplay'
import {
  adStringToBsDisplay, currentFiscalYear, fiscalYearAdParams,
  fiscalYearOf, fiscalYearDateRange,
} from '../../utils/nepaliDate'

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
  | 'sales-by-customer' | 'sales-by-item' | 'sales-by-customer-monthly' | 'sales-by-item-monthly' | 'sales-master' | 'sales-summary'
  | 'purchase-by-supplier' | 'purchase-by-item' | 'purchase-by-supplier-monthly' | 'purchase-by-item-monthly' | 'purchase-master'
  | 'sales-register' | 'sales-return-register' | 'purchase-register' | 'purchase-return-register' | 'vat' | 'tds-report' | 'annex-13' | 'annex-5'
  | 'inventory-position' | 'inventory-movement' | 'inventory-master' | 'product-profitability'
  | 'activity-log' | 'user-log'
  // inventory-ops (handled by dedicated panel)
  | 'inv-valuation' | 'inv-dead-stock' | 'inv-abc' | 'inv-forecast' | 'inv-top-selling'

interface ReportMeta {
  key: ReportType
  label: string
  endpoint: string
  icon: React.ElementType
  category: ReportCategory
  dateMode: ReportDateMode
  needsCustomer?: boolean
  needsSupplier?: boolean
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

interface RptAccount { code: string; name: string; balance: string | number }
interface PLReport   { date_from: string; date_to: string; revenue: RptAccount[]; total_revenue: string | number; expenses: RptAccount[]; total_expenses: string | number; net_profit: string | number }
interface BSReport   { as_of_date: string; assets: RptAccount[]; total_assets: string | number; liabilities: RptAccount[]; total_liabilities: string | number; equity: RptAccount[]; total_equity: string | number; balanced: boolean }
interface TBRow      { code: string; name: string; debit: string | number; credit: string | number }
interface TBReport   { date_from: string; date_to: string; accounts: TBRow[]; total_debit: string | number; total_credit: string | number; balanced: boolean }
interface AgedItem   { id: number; invoice_number?: string; bill_number?: string; customer?: string; supplier?: string; due_date: string; amount_due: number }
interface AgedBucket { items: AgedItem[]; total: number }
interface AgedReport { as_of_date: string; current: AgedBucket; '1_30': AgedBucket; '31_60': AgedBucket; '61_90': AgedBucket; '90_plus': AgedBucket; grand_total: number }
interface VATReport  { period_start: string; period_end: string; vat_collected: string | number; vat_reclaimable: string | number; vat_payable: string | number; invoice_count: number; bill_count: number }
interface CFMethod   { method: string; incoming: string | number; outgoing: string | number }
interface CFReport   { date_from: string; date_to: string; total_incoming: string | number; total_outgoing: string | number; net_cash_flow: string | number; by_method: CFMethod[] }

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

function PLReportView({ data }: { data: PLReport }) {
  const net = parseFloat(String(data.net_profit))
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

// ─── Balance Sheet ────────────────────────────────────────────────────────────

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

// ─── Trial Balance ────────────────────────────────────────────────────────────

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

// ─── Cash Flow ────────────────────────────────────────────────────────────────

function CFReportView({ data }: { data: CFReport }) {
  const net = parseFloat(String(data.net_cash_flow))
  const isPos = net >= 0
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

// ─── GL Summary ───────────────────────────────────────────────────────────────

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
}

function GenericTableView({ rows, totalRow, summary, hideCols = [] }: GenericTableProps) {
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
      d.revenue?.forEach(r => row('Revenue', r.code, r.name, r.balance))
      row('', '', 'Total Revenue', d.total_revenue)
      d.expenses?.forEach(r => row('Expenses', r.code, r.name, r.balance))
      row('', '', 'Total Expenses', d.total_expenses)
      row('', '', 'Net Profit/Loss', d.net_profit)
      break
    }
    case 'balance-sheet': {
      const d = data as unknown as BSReport
      row('Section', 'Code', 'Account', 'Amount')
      d.liabilities?.forEach(r => row('Liabilities', r.code, r.name, r.balance))
      row('', '', 'Total Liabilities', d.total_liabilities)
      d.equity?.forEach(r => row('Equity', r.code, r.name, r.balance))
      row('', '', 'Total Equity', d.total_equity)
      d.assets?.forEach(r => row('Assets', r.code, r.name, r.balance))
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
      const d = data as unknown as CFReport
      row('Method', 'Inflows', 'Outflows', 'Net')
      d.by_method?.forEach(m =>
        row(m.method, m.incoming, m.outgoing,
          (parseFloat(String(m.incoming)) - parseFloat(String(m.outgoing))).toFixed(2))
      )
      row('TOTAL', d.total_incoming, d.total_outgoing, d.net_cash_flow)
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
  const printRef = useRef<HTMLDivElement>(null)

  const report = REPORTS.find(r => r.key === reportKey)!
  const catReports = REPORTS.filter(r => r.category === category)
  const isInvOps = category === 'inventory-ops'

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

  const { data: reportData, isLoading, isError, error, refetch } = useQuery<Record<string, unknown>>({
    queryKey: ['report', reportKey, dateFrom, dateTo, customerId, supplierId],
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
      case 'pl':               return <PLReportView data={d as unknown as PLReport} />
      case 'balance-sheet':    return <BSReportView data={d as unknown as BSReport} />
      case 'trial-balance':    return <TBReportView data={d as unknown as TBReport} />
      case 'aged-receivables': return <AgedReportView data={d as unknown as AgedReport} type="receivables" />
      case 'aged-payables':    return <AgedReportView data={d as unknown as AgedReport} type="payables" />
      case 'vat':              return <VATReportView data={d as unknown as VATReport} />
      case 'cash-flow':        return <CFReportView data={d as unknown as CFReport} />
      case 'gl-summary':       return <GLSummaryView data={d as unknown as { groups: Record<string, GLSummaryGroup> }} />
      case 'annex-5':          return <Annex5View data={d} />
      case 'sales-summary':    return <SalesSummaryView data={d} />
      case 'customer-statement':
      case 'supplier-statement':
        return <StatementView data={d as Parameters<typeof StatementView>[0]['data']} />
      case 'sales-by-customer-monthly':
        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="customer" />
      case 'sales-by-item-monthly':
        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="item" />
      case 'purchase-by-supplier-monthly':
        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="supplier" />
      case 'purchase-by-item-monthly':
        return <MonthlyCrossTableView data={d as MonthlyCrossData} entityKey="item" />
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
    </div>
  )
}
