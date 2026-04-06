import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccountingFy } from '../hooks'
import { formatBsDate, formatNpr } from '../utils'
import { fetchRecurringJournals, runRecurringJournal } from '../services'
import { Modal, Spinner, Badge } from '../components/accountingShared'
import { Repeat2, Loader2, Play } from 'lucide-react'
import type { ApiPage, RecurringJournal } from '../types/accounting'

const fmt = (value: string | null | undefined) => value ? formatBsDate(value) : '—'
const npr = formatNpr

function frequencyLabel(freq: string) {
  return freq.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function RecurringJournalsPage() {
  const qc = useQueryClient()
  const { fyYear } = useAccountingFy()
  const [selectedJournal, setSelectedJournal] = useState<RecurringJournal | null>(null)

  const { data, isLoading } = useQuery<ApiPage<RecurringJournal>>({
    queryKey: ['recurring-journals', fyYear],
    queryFn: () => fetchRecurringJournals(fyYear ? `page_size=200&fiscal_year=${fyYear}` : 'page_size=200'),
  })

  const journals = data?.results ?? []
  const totalActive = journals.filter(j => j.is_active).length
  const totalInactive = journals.length - totalActive

  const runMutation = useMutation({
    mutationFn: (id: number) => runRecurringJournal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-journals', fyYear] })
      setSelectedJournal(null)
    },
  })

  return (
    <div className="space-y-5">
      {selectedJournal && (
        <Modal title={`Recurring Journal — ${selectedJournal.name}`} onClose={() => setSelectedJournal(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Frequency</p>
                <p className="mt-2 text-sm font-semibold text-gray-800">{frequencyLabel(selectedJournal.frequency)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Active</p>
                <p className="mt-2"><Badge status={selectedJournal.is_active ? 'posted' : 'void'} /></p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Start Date</p>
                <p className="mt-2 text-sm font-semibold text-gray-800">{fmt(selectedJournal.start_date)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Next Run</p>
                <p className="mt-2 text-sm font-semibold text-gray-800">{fmt(selectedJournal.next_date)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Last Run</p>
                <p className="mt-2 text-sm font-semibold text-gray-800">{fmt(selectedJournal.last_run_at)}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <p className="text-xs text-gray-500">Template Lines</p>
                <p className="mt-2 text-sm text-gray-600">{selectedJournal.template_lines.length} line{selectedJournal.template_lines.length === 1 ? '' : 's'}</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
              <p className="text-xs text-gray-500">Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedJournal.description || 'No description provided.'}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    {['Account Code', 'Debit', 'Credit', 'Description'].map(h => (
                      <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedJournal.template_lines.map((line, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700">{line.account_code}</td>
                      <td className="px-3 py-2 text-gray-700 tabular-nums">{npr(line.debit)}</td>
                      <td className="px-3 py-2 text-gray-700 tabular-nums">{npr(line.credit)}</td>
                      <td className="px-3 py-2 text-gray-600">{line.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setSelectedJournal(null)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Close</button>
              <button
                onClick={() => selectedJournal.id && runMutation.mutate(selectedJournal.id)}
                disabled={runMutation.isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {runMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                Run Now
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Recurring Journals</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{journals.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Active</p>
          <p className="mt-2 text-2xl font-bold text-green-700">{totalActive}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Inactive</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalInactive}</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Recurring journal schedules</h2>
            <p className="text-xs text-gray-500">Click an entry to inspect details and run it immediately.</p>
          </div>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            <Repeat2 size={14} /> FY {fyYear ?? 'All'}
          </div>
        </div>
        {isLoading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Frequency', 'Next Run', 'Last Run', 'Active', 'Created'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {journals.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-gray-400">No recurring journals found.</td></tr>
                ) : journals.map(journal => (
                  <tr
                    key={journal.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setSelectedJournal(journal)}
                  >
                    <td className="px-4 py-3 text-gray-800 font-medium">{journal.name}</td>
                    <td className="px-4 py-3 text-gray-600">{frequencyLabel(journal.frequency)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(journal.next_date)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(journal.last_run_at)}</td>
                    <td className="px-4 py-3"><Badge status={journal.is_active ? 'posted' : 'void'} /></td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmt(journal.created_at)}</td>
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
