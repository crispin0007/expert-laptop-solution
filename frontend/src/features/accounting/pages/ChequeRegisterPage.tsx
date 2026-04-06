import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import DateDisplay from '../../../components/DateDisplay'
import { Modal, Spinner } from '../components/accountingShared'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatNpr, toPage, CHEQUE_STATUS_COLORS } from '../utils'
import { FileText, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import type { ApiPage, BankAccount, Payment, ChequeView } from '../types/accounting'

const npr = formatNpr

function paymentPartyName(p: Payment): string {
  return p.party_name || p.supplier_name || p.customer_name || '—'
}

export default function ChequeRegisterPage() {
  const qc = useQueryClient()
  const { fyYear } = useAccountingFy()
  const today = new Date().toISOString().slice(0, 10)

  const [view, setView] = useState<ChequeView>('register')
  const [filterType, setFilterType] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [updateTarget, setUpdateTarget] = useState<Payment | null>(null)
  const [newChequeStatus, setNewChequeStatus] = useState('')

  const [issDate, setIssDate] = useState(today)
  const [issBank, setIssBank] = useState('')
  const [issPayee, setIssPayee] = useState('')
  const [issChqNum, setIssChqNum] = useState('')
  const [issAmount, setIssAmount] = useState('')
  const [issNotes, setIssNotes] = useState('')

  const [rcvDate, setRcvDate] = useState(today)
  const [rcvBank, setRcvBank] = useState('')
  const [rcvPayer, setRcvPayer] = useState('')
  const [rcvChqNum, setRcvChqNum] = useState('')
  const [rcvAmount, setRcvAmount] = useState('')
  const [rcvNotes, setRcvNotes] = useState('')

  const { data: bankAccountsPage } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=200').then(r => toPage<BankAccount>(r.data)),
  })
  const bankAccounts = bankAccountsPage?.results ?? []

  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'cheque', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?method=cheque&page_size=200`, fyYear)).then(r => toPage<Payment>(r.data)),
  })

  const allCheques = data?.results ?? []
  const payments = filterType === 'all' ? allCheques : allCheques.filter(p => p.type === filterType)
  const totalIn = allCheques.filter(p => p.type === 'incoming').reduce((a, p) => a + Number(p.amount), 0)
  const totalOut = allCheques.filter(p => p.type === 'outgoing').reduce((a, p) => a + Number(p.amount), 0)

  const resetIssue = () => { setIssDate(today); setIssBank(''); setIssPayee(''); setIssChqNum(''); setIssAmount(''); setIssNotes('') }
  const resetReceive = () => { setRcvDate(today); setRcvBank(''); setRcvPayer(''); setRcvChqNum(''); setRcvAmount(''); setRcvNotes('') }

  const issueMut = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'outgoing',
      method: 'cheque',
      date: issDate,
      bank_account: issBank || null,
      party_name: issPayee,
      reference: issChqNum,
      amount: issAmount,
      notes: issNotes,
      cheque_status: 'issued',
    }),
    onSuccess: () => {
      toast.success('Cheque issued and journal entry created')
      resetIssue(); setView('register')
      qc.invalidateQueries({ queryKey: ['payments', 'cheque'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Failed to issue cheque'),
  })

  const receiveMut = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENTS, {
      type: 'incoming',
      method: 'cheque',
      date: rcvDate,
      bank_account: rcvBank || null,
      party_name: rcvPayer,
      reference: rcvChqNum,
      amount: rcvAmount,
      notes: rcvNotes,
      cheque_status: 'issued',
    }),
    onSuccess: () => {
      toast.success('Cheque received and journal entry created')
      resetReceive(); setView('register')
      qc.invalidateQueries({ queryKey: ['payments', 'cheque'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Failed to record cheque'),
  })

  const statusMut = useMutation({
    mutationFn: (p: Payment) => apiClient.patch(ACCOUNTING.PAYMENT_CHEQUE_STATUS(p.id), { cheque_status: newChequeStatus }),
    onSuccess: () => {
      toast.success('Cheque status updated')
      setUpdateTarget(null); setNewChequeStatus('')
      qc.invalidateQueries({ queryKey: ['payments', 'cheque'] })
    },
    onError: (e: { message?: string }) => toast.error(e?.message ?? 'Failed to update status'),
  })

  const canIssue = issDate && Number(issAmount) > 0 && issPayee
  const canReceive = rcvDate && Number(rcvAmount) > 0 && rcvPayer

  const tabBtn = (v: ChequeView, label: string) => (
    <button onClick={() => setView(v)}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${view === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {label}
    </button>
  )

  const inputCls2 = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'
  const selectCls2 = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Cheques', value: allCheques.length, icon: FileText, bg: 'bg-indigo-50', color: 'text-indigo-600' },
          { label: 'Received', value: npr(totalIn), icon: TrendingUp, bg: 'bg-green-50', color: 'text-green-600' },
          { label: 'Issued', value: npr(totalOut), icon: TrendingDown, bg: 'bg-red-50', color: 'text-red-600' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <c.icon size={20} className={c.color} />
            <div><p className="text-xs text-gray-500">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {tabBtn('register', 'Cheque Register')}
        {tabBtn('issue', 'Issue Cheque')}
        {tabBtn('receive', 'Receive Cheque')}
      </div>

      {view === 'issue' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <TrendingDown size={15} className="text-red-500" /> Issue Cheque (Outgoing Payment)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Date *</label>
              <input data-lpignore="true" type="date" value={issDate} onChange={e => setIssDate(e.target.value)} className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
              <select value={issBank} onChange={e => setIssBank(e.target.value)} className={selectCls2}>
                <option value="">Select bank…</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payee Name *</label>
            <input data-lpignore="true" value={issPayee} onChange={e => setIssPayee(e.target.value)} placeholder="Who the cheque is written to"
              className={inputCls2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Number</label>
              <input data-lpignore="true" value={issChqNum} onChange={e => setIssChqNum(e.target.value)} placeholder="e.g. 002341"
                className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
              <input data-lpignore="true" type="number" min={0} step="0.01" value={issAmount} onChange={e => setIssAmount(e.target.value)}
                placeholder="0.00" className={inputCls2} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Purpose</label>
            <input data-lpignore="true" value={issNotes} onChange={e => setIssNotes(e.target.value)} placeholder="What this payment is for"
              className={inputCls2} />
          </div>
          <p className="text-xs text-gray-400">A journal entry (Dr: AP/Expense, Cr: Bank) will be created automatically.</p>
          <div className="flex gap-2">
            <button onClick={() => issueMut.mutate()} disabled={!canIssue || issueMut.isPending}
              className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {issueMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <TrendingDown size={14} />} Issue Cheque
            </button>
            <button onClick={() => { resetIssue(); setView('register') }}
              className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'receive' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 max-w-lg space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp size={15} className="text-green-500" /> Receive Cheque (Incoming Payment)
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Date *</label>
              <input data-lpignore="true" type="date" value={rcvDate} onChange={e => setRcvDate(e.target.value)} className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Deposit to Bank</label>
              <select value={rcvBank} onChange={e => setRcvBank(e.target.value)} className={selectCls2}>
                <option value="">Select bank…</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Payer / Drawer Name *</label>
            <input data-lpignore="true" value={rcvPayer} onChange={e => setRcvPayer(e.target.value)} placeholder="Who issued the cheque"
              className={inputCls2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cheque Number</label>
              <input data-lpignore="true" value={rcvChqNum} onChange={e => setRcvChqNum(e.target.value)} placeholder="e.g. 100234"
                className={inputCls2} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount *</label>
              <input data-lpignore="true" type="number" min={0} step="0.01" value={rcvAmount} onChange={e => setRcvAmount(e.target.value)}
                placeholder="0.00" className={inputCls2} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes / Description</label>
            <input data-lpignore="true" value={rcvNotes} onChange={e => setRcvNotes(e.target.value)} placeholder="e.g. Payment for Invoice INV-00123"
              className={inputCls2} />
          </div>
          <p className="text-xs text-gray-400">A journal entry (Dr: Bank, Cr: AR/Income) will be created automatically.</p>
          <div className="flex gap-2">
            <button onClick={() => receiveMut.mutate()} disabled={!canReceive || receiveMut.isPending}
              className="flex-1 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {receiveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />} Record Receipt
            </button>
            <button onClick={() => { resetReceive(); setView('register') }}
              className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {view === 'register' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-sm text-gray-800 flex items-center gap-2">
              <FileText size={14} className="text-indigo-500" /> Cheque Register
            </h3>
            <div className="flex items-center gap-2">
              {(['all', 'incoming', 'outgoing'] as const).map(f => (
                <button key={f} onClick={() => setFilterType(f)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${filterType === f ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {f === 'all' ? 'All' : f === 'incoming' ? 'Received' : 'Issued'}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? <div className="py-12"><Spinner /></div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Chq No.', 'Date', 'Party', 'Direction', 'Amount', 'Bank', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-medium">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-400">No cheques found for this period.</td></tr>
                ) : payments.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.reference || p.payment_number}</td>
                    <td className="px-4 py-3 text-gray-600"><DateDisplay adDate={p.date} /></td>
                    <td className="px-4 py-3 text-xs font-medium text-gray-700 max-w-[140px] truncate" title={paymentPartyName(p) !== '—' ? paymentPartyName(p) : (p.notes || '—')}>
                      {paymentPartyName(p) !== '—' ? paymentPartyName(p) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.type === 'incoming' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {p.type === 'incoming' ? 'Received' : 'Issued'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800 tabular-nums">{npr(p.amount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.bank_account_name || '—'}</td>
                    <td className="px-4 py-3">
                      {p.cheque_status ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHEQUE_STATUS_COLORS[p.cheque_status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {p.cheque_status.charAt(0).toUpperCase() + p.cheque_status.slice(1)}
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.method === 'cheque' && (
                        <button onClick={() => { setUpdateTarget(p); setNewChequeStatus(p.cheque_status || 'issued') }}
                          className="text-xs text-indigo-600 hover:text-indigo-800 underline whitespace-nowrap">
                          Update
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {updateTarget && (
        <Modal title="Update Cheque Status" onClose={() => { setUpdateTarget(null); setNewChequeStatus('') }}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-1">
              <p><span className="font-medium">Cheque No:</span> {updateTarget.reference || updateTarget.payment_number}</p>
              <p><span className="font-medium">Party:</span> {paymentPartyName(updateTarget)}</p>
              <p><span className="font-medium">Amount:</span> {npr(updateTarget.amount)}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Status</label>
              <select value={newChequeStatus} onChange={e => setNewChequeStatus(e.target.value)} className={selectCls2}>
                <option value="issued">Issued</option>
                <option value="presented">Presented to Bank</option>
                <option value="cleared">Cleared</option>
                <option value="bounced">Bounced</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => statusMut.mutate(updateTarget)} disabled={statusMut.isPending}
                className="flex-1 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {statusMut.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save Status
              </button>
              <button onClick={() => { setUpdateTarget(null); setNewChequeStatus('') }}
                className="px-4 py-2.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
