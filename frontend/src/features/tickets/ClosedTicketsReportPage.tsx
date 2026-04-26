import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText, Loader2, RefreshCcw } from 'lucide-react'
import apiClient from '../../api/client'
import { ACCOUNTING, STAFF } from '../../api/endpoints'
import NepaliDatePicker from '../../components/NepaliDatePicker'
import { BS_MONTH_NAMES_NP, currentFiscalYear, fiscalYearAdParams } from '../../utils/nepaliDate'

interface ClosedTicketRow {
  ticket_number: string
  ticket_title: string
  customer_name: string
  assigned_to: string
  closed_at: string
  invoice_number: string
  invoice_total: string
  coins_awarded: string
}

interface ClosedTicketsReport {
  date_from: string
  date_to: string
  total_ticket_count: number
  total_invoice_amount: string
  total_coin_amount: string
  rows: ClosedTicketRow[]
}

export default function ClosedTicketsReportPage() {
  const today = new Date().toISOString().slice(0, 10)
  const fy = currentFiscalYear()
  const fyParams = fiscalYearAdParams(fy)

  const [dateFrom, setDateFrom] = useState(fyParams.date_from)
  const [dateTo, setDateTo] = useState(today)
  const [staffId, setStaffId] = useState<number | null>(null)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const MONTH_NAMES = BS_MONTH_NAMES_NP.slice(1)
  const yearOptions = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 2 + i)

  function applyMonthRange() {
    const start = new Date(selectedYear, selectedMonth - 1, 1)
    const end = new Date(selectedYear, selectedMonth, 0)
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(end.toISOString().slice(0, 10))
  }

  const { data: staffList } = useQuery<{ id: number; full_name?: string; display_name?: string; email?: string }[]>({
    queryKey: ['closed-tickets-staff-list'],
    queryFn: () => apiClient.get(`${STAFF.LIST}?page_size=500`).then(r => {
      const payload = Array.isArray(r.data)
        ? r.data
        : r.data?.data ?? r.data?.results ?? []
      return payload.map((staff: { id: number; full_name?: string; display_name?: string; email?: string }) => ({
        id: staff.id,
        full_name: staff.full_name,
        display_name: staff.display_name,
        email: staff.email,
      }))
    }),
    staleTime: 60_000,
  })

  const { data, isLoading, isError, error, refetch } = useQuery<ClosedTicketsReport>({
    queryKey: ['closed-tickets-report', dateFrom, dateTo, staffId],
    queryFn: () => apiClient.get(ACCOUNTING.REPORT_CLOSED_TICKETS, {
      params: {
        date_from: dateFrom,
        date_to: dateTo,
        staff_id: staffId ?? undefined,
      },
    }).then(r => r.data?.data ?? r.data),
    keepPreviousData: true,
  })

  function formatMoney(value: string | number) {
    return `NPR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <FileText size={20} className="text-indigo-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Closed Tickets Report</h1>
            <p className="text-sm text-gray-500">Ticket closure details with invoice and approved coin totals.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-hidden p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-widest">Filters</div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Month</label>
                <div className="flex gap-2">
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(parseInt(e.target.value, 10))}
                    className="h-10 flex-1 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {MONTH_NAMES.map((name, index) => (
                      <option key={name} value={index + 1}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                    className="h-10 w-28 px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {yearOptions.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={applyMonthRange}
                  className="mt-2 inline-flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Apply Month
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Date From</label>
                <NepaliDatePicker value={dateFrom} onChange={setDateFrom} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Date To</label>
                <NepaliDatePicker value={dateTo} onChange={setDateTo} />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1 font-medium">Assigned Staff</label>
                <select
                  value={staffId ?? ''}
                  onChange={e => setStaffId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  className="h-10 w-full px-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"

                >
                  <option value="">— All staff —</option>
                  {(staffList ?? []).map(staff => (
                    <option key={staff.id} value={staff.id}>
                      {staff.display_name || staff.full_name || staff.email || `Staff #${staff.id}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4 col-span-2 xl:col-span-3">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="bg-indigo-50 rounded-2xl p-4">
                <p className="text-xs text-indigo-600 uppercase tracking-widest font-semibold">Closed Tickets</p>
                <p className="mt-3 text-2xl font-bold text-gray-900">{data?.total_ticket_count ?? '—'}</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4">
                <p className="text-xs text-emerald-600 uppercase tracking-widest font-semibold">Invoice Total</p>
                <p className="mt-3 text-2xl font-bold text-gray-900">{data ? formatMoney(data.total_invoice_amount) : '—'}</p>
              </div>
              <div className="bg-violet-50 rounded-2xl p-4">
                <p className="text-xs text-violet-600 uppercase tracking-widest font-semibold">Approved Coins</p>
                <p className="mt-3 text-2xl font-bold text-gray-900">{data ? formatMoney(data.total_coin_amount) : '—'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-20"><Loader2 size={28} className="animate-spin text-indigo-500" /></div>
          ) : isError ? (
            <div className="p-8 text-center text-sm text-red-600">{String(error)}</div>
          ) : !data?.rows.length ? (
            <div className="p-10 text-center text-sm text-gray-500">No closed tickets found for the selected period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Ticket #', 'Title', 'Customer', 'Assigned', 'Closed At', 'Invoice #', 'Invoice Total', 'Approved Coins'].map(header => (
                      <th key={header} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map(row => (
                    <tr key={row.ticket_number + row.invoice_number} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{row.ticket_number}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[250px] truncate">{row.ticket_title}</td>
                      <td className="px-4 py-3 text-gray-700">{row.customer_name}</td>
                      <td className="px-4 py-3 text-gray-700">{row.assigned_to}</td>
                      <td className="px-4 py-3 text-gray-700">{row.closed_at}</td>
                      <td className="px-4 py-3 text-gray-700">{row.invoice_number}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatMoney(row.invoice_total)}</td>
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">{formatMoney(row.coins_awarded)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
