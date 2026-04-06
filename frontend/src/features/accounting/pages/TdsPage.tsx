import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import DateDisplay from '../../../components/DateDisplay'
import { useAccountingFy } from '../hooks'
import { formatNpr } from '../utils'
import { fetchTdsEntries, markTdsDeposited } from '../services'
import { Modal, Spinner, Badge } from '../components/accountingShared'
import { CalendarDays, Loader2 } from 'lucide-react'
import type { ApiPage, TDSEntry } from '../types/accounting'

const npr = formatNpr

function tdsPeriodLabel(entry: TDSEntry) {
  return `${String(entry.period_month).padStart(2, '0')}/${entry.period_year}`
}

export default function TdsPage() {
  const qc = useQueryClient()
  const { fyYear } = useAccountingFy()
  const [selectedEntry, setSelectedEntry] = useState<TDSEntry | null>(null)

  const { data, isLoading } = useQuery<ApiPage<TDSEntry>>({
    queryKey: ['tds', fyYear],
    queryFn: () => fetchTdsEntries(fyYear ? `page_size=200&fiscal_year=${fyYear}` : 'page_size=200'),
  })

  const entries = data?.results ?? []
  const totalTaxable = entries.reduce((sum, item) => sum + Number(item.taxable_amount), 0)
  const totalTds = entries.reduce((sum, item) => sum + Number(item.tds_amount), 0)
  const totalNet = entries.reduce((sum, item) => sum + Number(item.net_payable), 0)

  const markDeposited = useMutation({
    mutationFn: (id: number) => markTdsDeposited(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tds', fyYear] })
      setSelectedEntry(null)
    },
  })

  return (
    <div className="space-y-5">
      {selectedEntry && (
        <Modal title={`TDS Entry ${selectedEntry.id}`} onClose={() => setSelectedEntry(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Supplier</p>
                <p className="text-sm font-semibold text-gray-800">{selectedEntry.supplier_name || '—'}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">PAN</p>
                <p className="text-sm font-semibold text-gray-800">{selectedEntry.supplier_pan || '—'}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Bill #</p>
                <p className="text-sm font-semibold text-gray-800">{selectedEntry.bill_number || '—'}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Period</p>
                <p className="text-sm font-semibold text-gray-800">{tdsPeriodLabel(selectedEntry)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Taxable Amount</p>
                <p className="text-lg font-semibold text-gray-800 tabular-nums">{npr(selectedEntry.taxable_amount)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">TDS Rate</p>
                <p className="text-lg font-semibold text-gray-800">{(Number(selectedEntry.tds_rate) * 100).toFixed(2)}%</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">TDS Withheld</p>
                <p className="text-lg font-semibold text-red-700 tabular-nums">{npr(selectedEntry.tds_amount)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Net Payable</p>
                <p className="text-lg font-semibold text-gray-800 tabular-nums">{npr(selectedEntry.net_payable)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Created</p>
                <p className="font-medium text-gray-800"><DateDisplay adDate={selectedEntry.created_at} /></p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Deposited</p>
                <p className="font-medium text-gray-800">{selectedEntry.deposited_at ? <DateDisplay adDate={selectedEntry.deposited_at} /> : 'Not deposited'}</p>
              </div>
            </div>

            {selectedEntry.deposit_reference && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm text-gray-700">
                <p className="text-xs text-gray-500">Deposit Reference</p>
                <p className="font-medium">{selectedEntry.deposit_reference}</p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Badge status={selectedEntry.status} />
              {selectedEntry.status !== 'deposited' && (
                <button
                  onClick={() => selectedEntry.id && markDeposited.mutate(selectedEntry.id)}
                  disabled={markDeposited.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
                >
                  {markDeposited.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Mark Deposited'}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Entries</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{entries.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Taxable</p>
          <p className="mt-2 text-2xl font-bold text-green-700 tabular-nums">{npr(totalTaxable)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">TDS Withheld</p>
          <p className="mt-2 text-2xl font-bold text-red-700 tabular-nums">{npr(totalTds)}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Net Payable</p>
          <p className="mt-2 text-2xl font-bold text-gray-900 tabular-nums">{npr(totalNet)}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">TDS Register</h2>
            <p className="text-xs text-gray-500">Review TDS entries and mark deposited when payment is completed.</p>
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <CalendarDays size={14} /> FY {fyYear ?? 'All'}
          </div>
        </div>
        {isLoading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Period', 'Supplier', 'Bill #', 'Taxable', 'TDS', 'Net Payable', 'Status', 'Deposited'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-400">No TDS entries found.</td></tr>
                ) : entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedEntry(entry)}>
                    <td className="px-4 py-3 text-gray-600">{tdsPeriodLabel(entry)}</td>
                    <td className="px-4 py-3 text-gray-800">{entry.supplier_name || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 font-mono">{entry.bill_number || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{npr(entry.taxable_amount)}</td>
                    <td className="px-4 py-3 text-right text-red-700 tabular-nums">{npr(entry.tds_amount)}</td>
                    <td className="px-4 py-3 text-right text-gray-800 tabular-nums">{npr(entry.net_payable)}</td>
                    <td className="px-4 py-3"><Badge status={entry.status} /></td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{entry.deposited_at ? <DateDisplay adDate={entry.deposited_at} /> : 'Pending'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
