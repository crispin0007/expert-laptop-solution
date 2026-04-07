import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING, INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { Search, Loader2 } from 'lucide-react'
import { currentFiscalYear, fiscalYearAdParams } from '../../../utils/nepaliDate'
import { formatBsDate, formatNpr } from '../utils'
import type { ServiceItem, ServiceLedgerReport } from '../types/accounting'

const fmt = formatBsDate
const npr = formatNpr

export default function ServiceLedgerPage() {
  const { data: services = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  const [serviceId, setServiceId] = useState('')
  const [dateFrom, setDateFrom]   = useState(() => fiscalYearAdParams(currentFiscalYear()).date_from)
  const [dateTo, setDateTo]       = useState(() => new Date().toISOString().slice(0, 10))
  const [submitted, setSubmitted] = useState(false)

  const { data: report, isLoading, isFetching } = useQuery<ServiceLedgerReport, Error, ServiceLedgerReport>({
    queryKey: ['service-ledger', serviceId, dateFrom, dateTo],
    queryFn: async () => {
      try {
        const r = await apiClient.get(
          `${ACCOUNTING.REPORT_SERVICE_LEDGER}?service_id=${serviceId}&date_from=${dateFrom}&date_to=${dateTo}`
        )
        return r.data?.data ?? r.data
      } catch {
        toast.error('Failed to load service ledger. Please verify the selected service and date range.')
        throw new Error('Service ledger load failed')
      }
    },
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
