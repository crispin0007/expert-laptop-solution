import { currentFiscalYear, fiscalYearDateRange, fiscalYearOf } from '../../utils/nepaliDate'
import {
  LayoutDashboard,
  Receipt,
  FileText,
  CreditCard,
  RotateCcw,
  BookOpen,
  Layers,
  Building2,
  Coins,
  ShieldCheck,
  ArrowRightLeft,
  BookMarked,
  CalendarDays,
  Percent,
  Repeat2,
  FileQuestion,
  Wallet,
  ShoppingBag,
  Truck,
  Zap,
} from 'lucide-react'
import AccountingRoutes from './AccountingRoutes'
import { useAccountingFy, useAccountingRoute } from './hooks'

function FiscalYearBar() {
  const { fyYear, setFyYear } = useAccountingFy()
  const fy = currentFiscalYear()
  const { startAd } = fiscalYearDateRange(fy)
  const lastFy = fiscalYearOf(new Date(startAd.getTime() - 86_400_000))
  const { startAd: lastStart } = fiscalYearDateRange(lastFy)
  const prevFy = fiscalYearOf(new Date(lastStart.getTime() - 86_400_000))

  const options = [
    { year: fy.bsYear, label: fy.label, title: fy.labelFull },
    { year: lastFy.bsYear, label: lastFy.label, title: lastFy.labelFull },
    { year: prevFy.bsYear, label: prevFy.label, title: prevFy.labelFull },
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

const TABS = [
  { key: '', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'finance-review', label: 'Finance Review', icon: ShieldCheck },
  { key: 'bills', label: 'Bills', icon: FileText },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'credit-notes', label: 'Credit Notes', icon: RotateCcw },
  { key: 'journals', label: 'Journals', icon: BookOpen },
  { key: 'accounts', label: 'Chart of Accounts', icon: Layers },
  { key: 'banks', label: 'Bank Accounts', icon: Building2 },
  { key: 'payslips', label: 'Payslips & Coins', icon: Coins },
  { key: 'quotations', label: 'Quotations', icon: FileQuestion },
  { key: 'debit-notes', label: 'Debit Notes', icon: FileText },
  { key: 'tds', label: 'TDS', icon: Percent },
  { key: 'bank-reconciliation', label: 'Reconciliation', icon: ArrowRightLeft },
  { key: 'recurring-journals', label: 'Recurring Journals', icon: Repeat2 },
  { key: 'ledger', label: 'Ledger', icon: BookMarked },
  { key: 'day-book', label: 'Day Book', icon: CalendarDays },
  { key: 'expenses', label: 'Expenses', icon: Wallet },
  { key: 'sales-orders', label: 'Sales Orders', icon: ShoppingBag },
  { key: 'customer-payments', label: 'Customer Payments', icon: CreditCard },
  { key: 'allocate-customer-payments', label: 'Allocate Customer Payments', icon: ArrowRightLeft },
  { key: 'purchase-orders', label: 'Purchase Orders', icon: Truck },
  { key: 'suppliers', label: 'Suppliers', icon: Truck },
  { key: 'supplier-payments', label: 'Supplier Payments', icon: CreditCard },
  { key: 'allocate-supplier-payments', label: 'Allocate Supplier Payments', icon: ArrowRightLeft },
  { key: 'cash-transfers', label: 'Cash Transfers', icon: ArrowRightLeft },
  { key: 'quick-payment', label: 'Quick Payment', icon: Zap },
  { key: 'quick-receipt', label: 'Quick Receipt', icon: Zap },
  { key: 'cheque-register', label: 'Cheque Register', icon: FileText },
] as const

export default function AccountingPage() {
  const { activeTab } = useAccountingRoute()

  const HIDE_FY_BAR = new Set([
    'ledger',
    'day-book',
    'accounts',
    'tds',
    'bank-reconciliation',
    'recurring-journals',
    'service-ledger',
  ])

  const showFyBar = !HIDE_FY_BAR.has(activeTab)
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
        <AccountingRoutes activeTab={activeTab} />
      </main>
    </div>
  )
}
