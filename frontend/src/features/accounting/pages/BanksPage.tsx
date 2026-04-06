import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { Badge, Modal, Field, inputCls, selectCls, Spinner, EmptyState } from '../components/accountingShared'
import { addFyParam, toPage, formatNpr, formatBsDate } from '../utils'
import { useAccountingFy } from '../hooks'
import { Building2, BookOpen, Coins, Search, Plus, Pencil, Trash2, TrendingUp, TrendingDown, Loader2 } from 'lucide-react'
import type { ApiPage, BankAccount, Payment } from '../types/accounting'

const npr = formatNpr
const fmt = formatBsDate

export default function BanksPage() {
// ─── Bank Account Create Modal ─────────────────────────────────────────────

function BankAccountCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [openingBalance, setOpeningBalance] = useState('0')
  const [currency, setCurrency] = useState('NPR')

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.BANK_ACCOUNTS, payload),
    onSuccess: () => {
      toast.success('Bank account created')
      qc.invalidateQueries({ queryKey: ['bank-accounts'] })
      qc.invalidateQueries({ queryKey: ['accounts'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create bank account'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ name, bank_name: bankName, account_number: accountNumber, opening_balance: openingBalance, currency })
  }

  return (
    <Modal title="New Bank Account" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account Label *">
            <input data-lpignore="true" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Main Operating Account" className={inputCls} required />
          </Field>
          <Field label="Bank Name *">
            <input data-lpignore="true" value={bankName} onChange={e => setBankName(e.target.value)}
              placeholder="e.g. Nabil Bank" className={inputCls} required />
          </Field>
          <Field label="Account Number *">
            <input data-lpignore="true" value={accountNumber} onChange={e => setAccountNumber(e.target.value)}
              placeholder="00100012345678" className={inputCls} required />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
              <option value="NPR">NPR — Nepali Rupee</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </Field>
          <Field label="Opening Balance" hint="Current balance at the time of adding this account">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={openingBalance}
              onChange={e => setOpeningBalance(e.target.value)} className={inputCls} />
          </Field>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Add Bank Account
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bank Account Edit Modal ────────────────────────────────────────────────

function BankAccountEditModal({ bank, onClose }: { bank: BankAccount; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name: bank.name,
    bank_name: bank.bank_name,
    account_number: bank.account_number,
    currency: bank.currency,
    opening_balance: bank.opening_balance,
  })
  const mutateSave = useMutation({
    mutationFn: (d: typeof form) => apiClient.patch(ACCOUNTING.BANK_ACCOUNT_DETAIL(bank.id), d),
    onSuccess: () => { toast.success('Bank account updated'); qc.invalidateQueries({ queryKey: ['bank-accounts'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); onClose() },
    onError: () => toast.error('Update failed'),
  })
  return (
    <Modal title="Edit Bank Account" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); mutateSave.mutate(form) }} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Account Label *">
            <input data-lpignore="true" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} required />
          </Field>
          <Field label="Bank Name *">
            <input data-lpignore="true" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className={inputCls} required />
          </Field>
          <Field label="Account Number">
            <input data-lpignore="true" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="Currency">
            <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className={selectCls}>
              <option value="NPR">NPR — Nepali Rupee</option>
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
            </select>
          </Field>
          <Field label="Opening Balance" hint="Balance when account was first created">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={form.opening_balance}
              onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutateSave.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutateSave.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CashPaymentCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [type, setType]           = useState<'incoming' | 'outgoing'>('incoming')
  const [amount, setAmount]       = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote]           = useState('')

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.PAYMENTS, payload),
    onSuccess: () => {
      toast.success('Cash transaction recorded')
      qc.invalidateQueries({ queryKey: ['cash-ledger'] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to record cash transaction'),
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ date, type, method: 'cash', amount, reference, note })
  }

  return (
    <Modal title="Record Cash Transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date *">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Type *">
            <select value={type} onChange={e => setType(e.target.value as 'incoming' | 'outgoing')} className={selectCls}>
              <option value="incoming">Cash In (Incoming)</option>
              <option value="outgoing">Cash Out (Outgoing)</option>
            </select>
          </Field>
          <Field label="Amount (NPR) *">
            <input data-lpignore="true" type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputCls} required />
          </Field>
          <Field label="Reference">
            <input data-lpignore="true" value={reference} onChange={e => setReference(e.target.value)}
              placeholder="e.g. Receipt #, Voucher #" className={inputCls} />
          </Field>
        </div>
        <Field label="Note">
          <input data-lpignore="true" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Optional description" className={inputCls} />
        </Field>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Record Transaction
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Bank Accounts + Cash Ledger Tab ─────────────────────────────────────

  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [subTab, setSubTab] = useState<'banks' | 'statement' | 'cash'>('banks')
  const [showCreateBank, setShowCreateBank] = useState(false)
  const [showCreateCash, setShowCreateCash] = useState(false)
  const [editBank, setEditBank] = useState<BankAccount | null>(null)
  const [selectedBankId, setSelectedBankId] = useState<string>('')
  const [statementSearch, setStatementSearch] = useState('')
  const [cashSearch, setCashSearch] = useState('')

  const mutateDeleteBank = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.BANK_ACCOUNT_DETAIL(id)),
    onSuccess: () => { toast.success('Bank account deleted'); qc.invalidateQueries({ queryKey: ['bank-accounts'] }); qc.invalidateQueries({ queryKey: ['accounts'] }) },
    onError: () => toast.error('Delete failed'),
  })

  const { data: bankData, isLoading: bankLoading } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=200').then(r => toPage<BankAccount>(r.data)),
  })

  const { fyYear } = useAccountingFy()
  // Cash ledger (method=cash, all entries)
  const { data: cashData, isLoading: cashLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['cash-ledger', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?method=cash&page_size=500&ordering=date`, fyYear)).then(r => toPage<Payment>(r.data)),
    enabled: subTab === 'cash',
  })

  // Bank statement — payments for the selected bank account, oldest first for running balance
  const { data: stmtData, isLoading: stmtLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['bank-statement', selectedBankId, fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?bank_account=${selectedBankId}&page_size=500&ordering=date`, fyYear)).then(r => toPage<Payment>(r.data)),
    enabled: subTab === 'statement' && !!selectedBankId,
  })

  const selectedBank = bankData?.results?.find(b => String(b.id) === selectedBankId)

  // Compute running balance from opening balance
  const stmtRows = (() => {
    if (!stmtData?.results || !selectedBank) return []
    let balance = parseFloat(selectedBank.opening_balance || '0')
    return stmtData.results.map(p => {
      const amt = parseFloat(p.amount || '0')
      if (p.type === 'incoming') balance += amt
      else balance -= amt
      return { ...p, runningBalance: balance }
    })
  })()

  const filteredStmtRows = useMemo(() => {
    const q = statementSearch.trim().toLowerCase()
    if (!q) return stmtRows
    return stmtRows.filter(p =>
      String(p.payment_number ?? '').toLowerCase().includes(q) ||
      String(p.reference ?? '').toLowerCase().includes(q) ||
      String(p.invoice_number ?? '').toLowerCase().includes(q) ||
      String(p.bill_number ?? '').toLowerCase().includes(q) ||
      String(p.method ?? '').toLowerCase().includes(q) ||
      String(p.type ?? '').toLowerCase().includes(q),
    )
  }, [stmtRows, statementSearch])

  const stmtIn  = stmtRows.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const stmtOut = stmtRows.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)

  // Cash summary (oldest-first for running balance)
  const cashRowsChron = cashData?.results ?? []
  const cashIn  = cashRowsChron.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashOut = cashRowsChron.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashNet = cashIn - cashOut
  const cashRows = (() => {
    let bal = 0
    return [...cashRowsChron].map(p => {
      const amt = parseFloat(p.amount || '0')
      if (p.type === 'incoming') bal += amt
      else bal -= amt
      return { ...p, runningBalance: bal }
    })
  })()

  const filteredCashRows = useMemo(() => {
    const q = cashSearch.trim().toLowerCase()
    if (!q) return cashRows
    return cashRows.filter(p =>
      String(p.payment_number ?? '').toLowerCase().includes(q) ||
      String(p.reference ?? '').toLowerCase().includes(q) ||
      String(p.invoice_number ?? '').toLowerCase().includes(q) ||
      String(p.bill_number ?? '').toLowerCase().includes(q) ||
      String(p.method ?? '').toLowerCase().includes(q) ||
      String(p.type ?? '').toLowerCase().includes(q),
    )
  }, [cashRows, cashSearch])

  const stmtInFiltered = filteredStmtRows.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const stmtOutFiltered = filteredStmtRows.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashInFiltered = filteredCashRows.filter(p => p.type === 'incoming').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashOutFiltered = filteredCashRows.filter(p => p.type === 'outgoing').reduce((s, p) => s + parseFloat(p.amount || '0'), 0)
  const cashNetFiltered = cashInFiltered - cashOutFiltered

  return (
    <div className="space-y-4">
      {showCreateBank && <BankAccountCreateModal onClose={() => setShowCreateBank(false)} />}
      {showCreateCash && <CashPaymentCreateModal onClose={() => setShowCreateCash(false)} />}
      {editBank && <BankAccountEditModal bank={editBank} onClose={() => setEditBank(null)} />}

      {/* Sub-tab switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          {([
            { key: 'banks',     label: 'Bank Accounts',   Icon: Building2     },
            { key: 'statement', label: 'Bank Statement',  Icon: BookOpen       },
            { key: 'cash',      label: 'Cash Ledger',     Icon: Coins          },
          ] as { key: 'banks' | 'statement' | 'cash'; label: string; Icon: React.ElementType }[]).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setSubTab(key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                subTab === key ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <span className="flex items-center gap-1.5"><Icon size={14} />{label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {subTab === 'banks' && (
            <button onClick={() => setShowCreateBank(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={15} /> Add Bank Account
            </button>
          )}
          {subTab === 'cash' && (
            <button onClick={() => setShowCreateCash(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={15} /> Record Cash
            </button>
          )}
        </div>
      </div>

      {/* ── Bank Accounts ── */}
      {subTab === 'banks' && (
        bankLoading ? <Spinner /> : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Name', 'Bank', 'Account No.', 'Currency', 'Opening Balance', 'Current Balance', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bankData?.results?.map(b => (
                  <tr key={b.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 font-medium text-gray-800">
                      <button onClick={() => { setSelectedBankId(String(b.id)); setSubTab('statement') }}
                        className="text-indigo-600 hover:underline font-medium">{b.name}</button>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{b.bank_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.account_number}</td>
                    <td className="px-4 py-3 text-gray-500">{b.currency}</td>
                    <td className="px-4 py-3">{npr(b.opening_balance)}</td>
                    <td className="px-4 py-3 font-semibold text-indigo-700">{npr(b.current_balance)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => { setSelectedBankId(String(b.id)); setSubTab('statement') }}
                          title="View Statement" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><BookOpen size={13} /></button>
                        {can('can_manage_accounting') && (
                          <>
                            <button onClick={() => setEditBank(b)} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} /></button>
                            {b.linked_account_is_system ? (
                              <button title="System-linked bank account cannot be deleted" className="p-1 text-gray-300 cursor-not-allowed rounded transition-colors" disabled><Trash2 size={13} /></button>
                            ) : (
                              <button onClick={() => confirm({ title: 'Delete Bank Account', message: `Delete "${b.name}"? Linked payments and reconciliations may be affected.`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeleteBank.mutate(b.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!bankData?.results?.length && <EmptyState message="No bank accounts configured." />}
          </div>
        )
      )}

      {/* ── Bank Statement ── */}
      {subTab === 'statement' && (
        <div className="space-y-4">
          {/* Bank picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-600">Bank Account:</label>
            <select
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[240px]"
            >
              <option value="">— Select a bank account —</option>
              {bankData?.results?.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>
              ))}
            </select>
          </div>

          {!selectedBankId ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Building2 size={36} className="mb-3 text-gray-300" />
              <p className="text-sm">Select a bank account to view its cash in / cash out statement</p>
            </div>
          ) : stmtLoading ? <Spinner /> : (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Opening Balance</p>
                  <p className="text-xl font-bold text-gray-700">{npr(selectedBank?.opening_balance ?? '0')}</p>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingUp size={13} /> Cash In</p>
                  <p className="text-xl font-bold text-green-700">{npr(stmtIn.toFixed(2))}</p>
                  <p className="text-xs text-green-600 mt-0.5">{stmtRows.filter(p => p.type === 'incoming').length} transaction(s)</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1 flex items-center gap-1"><TrendingDown size={13} /> Cash Out</p>
                  <p className="text-xl font-bold text-red-700">{npr(stmtOut.toFixed(2))}</p>
                  <p className="text-xs text-red-600 mt-0.5">{stmtRows.filter(p => p.type === 'outgoing').length} transaction(s)</p>
                </div>
                <div className={`border rounded-xl p-4 ${(stmtRows[stmtRows.length - 1]?.runningBalance ?? 0) >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-orange-50 border-orange-100'}`}>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Current Balance</p>
                  <p className={`text-xl font-bold ${(stmtRows[stmtRows.length - 1]?.runningBalance ?? 0) >= 0 ? 'text-indigo-700' : 'text-orange-600'}`}>
                    {npr((stmtRows[stmtRows.length - 1]?.runningBalance ?? parseFloat(selectedBank?.opening_balance ?? '0')).toFixed(2))}
                  </p>
                </div>
              </div>

              {/* Statement table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700">{selectedBank?.name} — {selectedBank?.bank_name}</h4>
                  <span className="text-xs text-gray-400">A/C: {selectedBank?.account_number}</span>
                </div>
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="relative max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input data-lpignore="true"
                      value={statementSearch}
                      onChange={e => setStatementSearch(e.target.value)}
                      placeholder="Search payment, reference, invoice, bill..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Date', 'Payment #', 'Method', 'Reference', 'Invoice', 'Bill', 'Cash In', 'Cash Out', 'Balance'].map(h => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {/* Opening balance row */}
                      <tr className="bg-gray-50/70">
                        <td colSpan={8} className="px-4 py-2 text-xs text-gray-500 italic">Opening Balance</td>
                        <td className="px-4 py-2 text-xs font-semibold text-gray-700">{npr(selectedBank?.opening_balance ?? '0')}</td>
                      </tr>
                      {filteredStmtRows.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">{stmtRows.length === 0 ? 'No transactions for this bank account yet.' : 'No transactions match your search.'}</td></tr>
                      ) : filteredStmtRows.map(p => (
                        <tr key={p.id} className={`hover:bg-gray-50/50 ${p.type === 'incoming' ? 'bg-green-50/20' : 'bg-red-50/20'}`}>
                          <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(p.date)}</td>
                          <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs capitalize">{p.method.replace('_', ' ')}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice_number ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{p.bill_number ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-green-700">
                            {p.type === 'incoming' ? npr(p.amount) : '—'}
                          </td>
                          <td className="px-4 py-3 font-medium text-red-600">
                            {p.type === 'outgoing' ? npr(p.amount) : '—'}
                          </td>
                          <td className={`px-4 py-3 font-semibold whitespace-nowrap ${p.runningBalance >= 0 ? 'text-gray-800' : 'text-orange-600'}`}>
                            {npr(p.runningBalance.toFixed(2))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {filteredStmtRows.length > 0 && (
                      <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                        <tr>
                          <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Totals</td>
                          <td className="px-4 py-3 font-bold text-green-700">{npr(stmtInFiltered.toFixed(2))}</td>
                          <td className="px-4 py-3 font-bold text-red-600">{npr(stmtOutFiltered.toFixed(2))}</td>
                          <td className="px-4 py-3 font-bold text-indigo-700">{npr((filteredStmtRows[filteredStmtRows.length - 1]?.runningBalance ?? 0).toFixed(2))}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Cash Ledger ── */}
      {subTab === 'cash' && (
        cashLoading ? <Spinner /> : (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-green-700 text-xs font-semibold uppercase tracking-wide mb-1">
                  <TrendingUp size={14} /> Cash In
                </div>
                <p className="text-2xl font-bold text-green-700">{npr(cashIn.toFixed(2))}</p>
                <p className="text-xs text-green-600 mt-0.5">
                  {cashRowsChron.filter(p => p.type === 'incoming').length} transaction(s)
                </p>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                <div className="flex items-center gap-2 text-red-700 text-xs font-semibold uppercase tracking-wide mb-1">
                  <TrendingDown size={14} /> Cash Out
                </div>
                <p className="text-2xl font-bold text-red-700">{npr(cashOut.toFixed(2))}</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {cashRowsChron.filter(p => p.type === 'outgoing').length} transaction(s)
                </p>
              </div>
              <div className={`${cashNet >= 0 ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-orange-50 border-orange-100 text-orange-700'} border rounded-xl p-4`}>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide mb-1">
                  <Coins size={14} /> Net Cash Balance
                </div>
                <p className="text-2xl font-bold">{npr(cashNet.toFixed(2))}</p>
                <p className="text-xs mt-0.5 opacity-70">Cash In minus Cash Out</p>
              </div>
            </div>

            {/* Cash statement table with running balance */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="relative max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input data-lpignore="true"
                    value={cashSearch}
                    onChange={e => setCashSearch(e.target.value)}
                    placeholder="Search payment, reference, invoice, bill..."
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date', 'Payment #', 'Type', 'Reference', 'Invoice', 'Bill', 'Cash In', 'Cash Out', 'Balance'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredCashRows.length === 0 ? (
                      <tr><td colSpan={9} className="text-center py-8 text-gray-400 text-sm">{cashRows.length === 0 ? 'No cash transactions recorded. Click \'Record Cash\' to add one.' : 'No transactions match your search.'}</td></tr>
                    ) : filteredCashRows.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-50/50 ${p.type === 'incoming' ? 'bg-green-50/20' : 'bg-red-50/20'}`}>
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmt(p.date)}</td>
                        <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                        <td className="px-4 py-3"><Badge status={p.type} /></td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.reference || '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.invoice_number ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.bill_number ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-green-700">
                          {p.type === 'incoming' ? npr(p.amount) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-red-600">
                          {p.type === 'outgoing' ? npr(p.amount) : '—'}
                        </td>
                        <td className={`px-4 py-3 font-semibold whitespace-nowrap ${p.runningBalance >= 0 ? 'text-gray-800' : 'text-orange-600'}`}>
                          {npr(p.runningBalance.toFixed(2))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {filteredCashRows.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td colSpan={6} className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">Totals</td>
                        <td className="px-4 py-3 font-bold text-green-700">{npr(cashInFiltered.toFixed(2))}</td>
                        <td className="px-4 py-3 font-bold text-red-600">{npr(cashOutFiltered.toFixed(2))}</td>
                        <td className="px-4 py-3 font-bold text-indigo-700">{npr(cashNetFiltered.toFixed(2))}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  )
}
