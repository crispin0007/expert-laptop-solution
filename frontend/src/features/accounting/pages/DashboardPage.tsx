import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ACCOUNTING } from '../../../api/endpoints'
import { useFyStore } from '../../../store/fyStore'
import { Receipt, FileQuestion, ShieldCheck, FileText, Wallet, CreditCard, ArrowRightLeft, BookOpen, BookMarked, CalendarDays, TrendingUp, BarChart2, Zap } from 'lucide-react'
import { fetchBills, fetchInvoices } from '../services'
import { addFyParam } from '../utils/accountingUtils'

interface Invoice {
  id: number
  invoice_number: string
  customer_name: string
  status: string
  total: string
}
interface Bill {
  id: number
  bill_number: string
  supplier_name: string
  status: string
  total: string
}
interface ApiPage<T> { results: T[]; count: number }

function npr(v: string | number) {
  return `NPR ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function Badge({ status }: { status: string }) {
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
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

const QUICK_LINKS = [
  { label: 'New Invoice', tab: 'invoices', icon: Receipt, color: 'text-blue-600', bg: 'bg-blue-50 hover:bg-blue-100', group: 'Sales' },
  { label: 'New Quotation', tab: 'quotations', icon: FileQuestion, color: 'text-sky-600', bg: 'bg-sky-50 hover:bg-sky-100', group: 'Sales' },
  { label: 'Finance Review', tab: 'finance-review', icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 hover:bg-emerald-100', group: 'Sales' },
  { label: 'New Bill', tab: 'bills', icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50 hover:bg-orange-100', group: 'Purchases' },
  { label: 'Record Expense', tab: 'expenses', icon: Wallet, color: 'text-red-600', bg: 'bg-red-50 hover:bg-red-100', group: 'Purchases' },
  { label: 'Record Payment', tab: 'payments', icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50 hover:bg-violet-100', group: 'Banking' },
  { label: 'Reconcile Bank', tab: 'bank-reconciliation', icon: ArrowRightLeft, color: 'text-teal-600', bg: 'bg-teal-50 hover:bg-teal-100', group: 'Banking' },
  { label: 'Journal Entry', tab: 'journals', icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-50 hover:bg-indigo-100', group: 'Ledger' },
  { label: 'Account Ledger', tab: 'ledger', icon: BookMarked, color: 'text-gray-700', bg: 'bg-gray-50 hover:bg-gray-100', group: 'Ledger' },
  { label: 'Day Book', tab: 'day-book', icon: CalendarDays, color: 'text-gray-700', bg: 'bg-gray-50 hover:bg-gray-100', group: 'Ledger' },
  { label: 'P&L Report', tab: 'pl', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50 hover:bg-green-100', group: 'Reports' },
  { label: 'Balance Sheet', tab: 'balance-sheet', icon: BarChart2, color: 'text-blue-700', bg: 'bg-blue-50 hover:bg-blue-100', group: 'Reports' },
] as const

export default function DashboardPage() {
  const { fyYear } = useFyStore()
  const navigate = useNavigate()
  const { data: invoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'recent', fyYear],
    queryFn: () => fetchInvoices(addFyParam(ACCOUNTING.INVOICES + '?page_size=10&ordering=-created_at', fyYear)),
  })
  const { data: bills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'recent', fyYear],
    queryFn: () => fetchBills(addFyParam(ACCOUNTING.BILLS + '?page_size=10&ordering=-created_at', fyYear)),
  })

  const cards = [
    { label: 'Total Invoices', value: invoices?.count ?? '—', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Bills', value: bills?.count ?? '—', icon: TrendingUp, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Unpaid Invoices', value: invoices?.results?.filter(i => i.status === 'issued').length ?? '—', icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50' },
    { label: 'Pending Bills', value: bills?.results?.filter(b => b.status === 'draft').length ?? '—', icon: CreditCard, color: 'text-orange-600', bg: 'bg-orange-50' },
  ]

  const quickGroups = ['Sales', 'Purchases', 'Banking', 'Ledger', 'Reports'] as const
  type GroupName = typeof quickGroups[number]
  const byGroup = quickGroups.reduce<Record<GroupName, typeof QUICK_LINKS[number][]>>((acc, group) => {
    acc[group] = QUICK_LINKS.filter(link => link.group === group) as typeof QUICK_LINKS[number][]
    return acc
  }, { Sales: [], Purchases: [], Banking: [], Ledger: [], Reports: [] })

  return (
    <div className="space-y-6">
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
                    type="button"
                    key={link.label}
                    onClick={() => navigate(['pl', 'balance-sheet'].includes(link.tab) ? `/reports?report=${link.tab}` : `/accounting/${link.tab}`)}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl p-5 flex items-center gap-4`}>
            <div className={`${card.color} shrink-0`}><card.icon size={28} /></div>
            <div>
              <p className="text-xs text-gray-500 font-medium">{card.label}</p>
              <p className="text-2xl font-bold text-gray-800 mt-0.5">{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-700">Recent Invoices</h3></div>
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
          <div className="px-5 py-4 border-b border-gray-100"><h3 className="font-semibold text-gray-700">Recent Bills</h3></div>
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
