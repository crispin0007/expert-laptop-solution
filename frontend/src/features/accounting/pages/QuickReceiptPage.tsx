import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import DateDisplay from '../../../components/DateDisplay'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { ArrowUpRight, Loader2, Save, Clock } from 'lucide-react'
import type { ApiPage, BankAccount, Invoice, Payment } from '../types/accounting'
import { formatNpr, toPage } from '../utils'

const npr = formatNpr

// ─── Quick Receipt Tab ──────────────────────────────────────────────────────

export default function QuickReceiptPage() {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate]           = useState(today)
  const [method, setMethod]       = useState('cash')
  const [amount, setAmount]       = useState('')
  const [bankAccId, setBankAccId] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [tdsRatePct, setTdsRatePct] = useState('0')
  const [tdsReference, setTdsReference] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes]         = useState('')

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS).then(r => toPage<BankAccount>(r.data).results),
  })
  const { data: openInvoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'open-quick'],
    // status=issued: the only open/unpaid state in the Invoice lifecycle (draft|issued|paid|void)
    queryFn: () => apiClient.get(`${ACCOUNTING.INVOICES}?status=issued&page_size=200`).then(r => toPage<Invoice>(r.data)),
  })
  const { data: recentPayments } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'incoming-recent'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=incoming&page_size=10`).then(r => toPage<Payment>(r.data)),
  })

  const selectedInvoice = (openInvoices?.results ?? []).find(inv => String(inv.id) === invoiceId)
  const tdsRate = Number(tdsRatePct || '0') / 100
  const grossInvoiceAmount = Number(selectedInvoice?.total || 0)
  const tdsWithheld = tdsRate > 0 && grossInvoiceAmount > 0 ? grossInvoiceAmount * tdsRate : 0
  const netReceipt = grossInvoiceAmount - tdsWithheld

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'incoming', date, method,
      amount: tdsRate > 0 && selectedInvoice ? netReceipt.toFixed(2) : amount,
      bank_account: bankAccId ? Number(bankAccId) : null,
      invoice: invoiceId ? Number(invoiceId) : null,
      tds_rate: tdsRate > 0 ? tdsRate.toFixed(4) : '0',
      tds_reference: tdsReference,
      reference, notes,
    }),
    onSuccess: () => {
      toast.success('Receipt recorded')
      setAmount(''); setReference(''); setNotes(''); setInvoiceId(''); setTdsRatePct('0'); setTdsReference('')
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['invoices'] })
      qc.invalidateQueries({ queryKey: ['report'] })
    },
    onError: () => toast.error('Failed to record receipt'),
  })

  const needsBank = method === 'bank_transfer' || method === 'cheque'

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ArrowUpRight size={16} className="text-green-500" /> Record Inbound Receipt</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
            <NepaliDatePicker
              value={date}
              onChange={setDate}
              className="w-full"
            />
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Link to Invoice (optional)</label>
          <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
            <option value="">— No invoice —</option>
            {(openInvoices?.results ?? []).filter(inv => Number(inv.amount_due) > 0).map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.customer_name} ({npr(inv.amount_due)} due)</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer TDS %</label>
            <select value={tdsRatePct} onChange={e => setTdsRatePct(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
              <option value="0">None (0%)</option>
              <option value="1.5">1.5%</option>
              <option value="10">10%</option>
              <option value="15">15%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">TDS Reference</label>
            <input data-lpignore="true" value={tdsReference} onChange={e => setTdsReference(e.target.value)} placeholder="Form/Certificate #"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
        </div>
        {tdsRate > 0 && selectedInvoice && (
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex items-center justify-between"><span className="text-gray-600">Gross Invoice</span><span className="font-medium tabular-nums">{npr(grossInvoiceAmount)}</span></div>
            <div className="flex items-center justify-between"><span className="text-gray-600">TDS Withheld ({tdsRatePct}%)</span><span className="font-medium tabular-nums text-red-700">{npr(tdsWithheld)}</span></div>
            <div className="flex items-center justify-between border-t border-blue-200 pt-1"><span className="text-gray-700 font-semibold">Net Receipt (auto)</span><span className="font-bold tabular-nums text-green-700">{npr(netReceipt)}</span></div>
          </div>
        )}
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
        <button onClick={() => mutate.mutate()} disabled={mutate.isPending || !(tdsRate > 0 && selectedInvoice ? netReceipt > 0 : Number(amount) > 0) || !date}
          className="w-full py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {mutate.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Record Receipt
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2"><Clock size={14} className="text-gray-400" /> Recent Inbound Receipts</h3>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Date', 'Method', 'Invoice', 'Amount'].map(h => (
                <th key={h} className="px-3 py-2 text-left text-gray-400 font-medium">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(recentPayments?.results ?? []).length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400">No recent receipts</td></tr>
              ) : recentPayments?.results?.map(p => (
                <tr key={p.id} className="hover:bg-gray-50/60">
                  <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                  <td className="px-3 py-2.5 capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-3 py-2.5 text-gray-400">{p.invoice_number || '—'}</td>
                  <td className="px-3 py-2.5 font-semibold text-green-600 tabular-nums">{npr(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

