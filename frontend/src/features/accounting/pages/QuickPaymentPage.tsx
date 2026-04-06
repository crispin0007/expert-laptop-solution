import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import DateDisplay from '../../../components/DateDisplay'
import { ArrowDownLeft, Loader2, Save, Clock } from 'lucide-react'
import type { ApiPage, BankAccount, Bill, Payment } from '../types/accounting'
import { formatNpr, toPage } from '../utils'

const npr = formatNpr

// ─── Quick Payment Tab ──────────────────────────────────────────────────────

export default function QuickPaymentPage() {
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

