import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import DateDisplay from '../../../components/DateDisplay'
import { toPage } from '../utils'
import { ArrowRightLeft, Clock, Loader2 } from 'lucide-react'
import type { ApiPage, BankAccount, JournalEntry } from '../types/accounting'

export default function CashTransfersPage() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [fromAcc, setFromAcc] = useState('')
  const [toAcc, setToAcc] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')

  const { data: bankAccounts = [], isLoading: loadingBanks } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=200').then(r => toPage<BankAccount>(r.data).results),
  })

  const { data: journalPage } = useQuery<ApiPage<JournalEntry>>({
    queryKey: ['journals', 'cash-transfer'],
    queryFn: () => apiClient.get(`${ACCOUNTING.JOURNALS}?description=Cash+Transfer&page_size=10`).then(r => toPage<JournalEntry>(r.data)),
  })

  const fromBank = bankAccounts.find(b => String(b.id) === fromAcc)
  const toBank = bankAccounts.find(b => String(b.id) === toAcc)

  const mutate = useMutation({
    mutationFn: () => {
      if (!fromBank?.linked_account || !toBank?.linked_account) throw new Error('Bank accounts must have linked CoA accounts')
      return apiClient.post(ACCOUNTING.JOURNALS, {
        date,
        description: `Cash Transfer: ${fromBank.name} → ${toBank.name}`,
        reference,
        lines: [
          { account: toBank.linked_account, debit: amount, credit: '0', description: `Transfer in from ${fromBank.name}` },
          { account: fromBank.linked_account, debit: '0', credit: amount, description: `Transfer out to ${toBank.name}` },
        ],
      })
    },
    onSuccess: () => {
      toast.success('Cash transfer recorded')
      setAmount('')
      setReference('')
      setFromAcc('')
      setToAcc('')
      qc.invalidateQueries({ queryKey: ['journals', 'cash-transfer'] })
      qc.invalidateQueries({ queryKey: ['bank-accounts'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Transfer failed'),
  })

  const fromOptions = bankAccounts.filter(b => String(b.id) !== toAcc)
  const toOptions = bankAccounts.filter(b => String(b.id) !== fromAcc)
  const canSubmit = fromAcc && toAcc && fromAcc !== toAcc && Number(amount) > 0

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
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                      Posted
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
