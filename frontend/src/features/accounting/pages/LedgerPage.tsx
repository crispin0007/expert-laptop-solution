import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { Loader2, ChevronRight, ChevronDown, Search } from 'lucide-react'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { currentFiscalYear, fiscalYearAdParams, fiscalYearDateRange, fiscalYearOf } from '../../../utils/nepaliDate'
import { buildAccountingUrl, formatBsDate, formatNpr, resolveLedgerSourceRoute, toPage } from '../utils'
import { Modal } from '../components/accountingShared'
import type { Account, Invoice, Bill, Payment, CreditNote, DebitNote, JournalEntry, LedgerRow, LedgerReport, ApiPage } from '../types/accounting'

export default function LedgerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const initialAccountCode = (searchParams.get('account_code') || '').trim()
  const initialDateFrom = searchParams.get('date_from') || fiscalYearAdParams(currentFiscalYear()).date_from
  const initialDateTo = searchParams.get('date_to') || new Date().toISOString().slice(0, 10)
  const initialAutoRun = searchParams.get('auto_run') === '1'

  const { data: accounts } = useQuery<ApiPage<Account>>({
    queryKey: ['accounts-ledger-select'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? { results: r.data as Account[], count: r.data.length }
        : Array.isArray(r.data?.data) ? { results: r.data.data as Account[], count: r.data.data.length }
        : toPage<Account>(r.data)
    ),
  })

  const [accountCode, setAccountCode] = useState(initialAccountCode)
  const [accountInput, setAccountInput] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [txSearch, setTxSearch] = useState('')
  const [submitted, setSubmitted] = useState(() => initialAutoRun && !!initialAccountCode)
  const [selectedTxn, setSelectedTxn] = useState<LedgerRow | null>(null)

  const { data: ledger, isLoading, isFetching } = useQuery<LedgerReport>({
    queryKey: ['ledger', accountCode, dateFrom, dateTo],
    queryFn: () => apiClient.get(`${ACCOUNTING.REPORT_LEDGER}?account_code=${accountCode}&date_from=${dateFrom}&date_to=${dateTo}`).then(r => r.data?.data ?? r.data),
    enabled: submitted && !!accountCode,
  })

  const accList = accounts?.results ?? []
  const selectedAccountLabel = useMemo(() => {
    const found = accList.find(a => a.code === accountCode)
    return found ? `${found.code} — ${found.name}` : ''
  }, [accList, accountCode])

  useEffect(() => {
    if (!accountCode || accountInput) return
    if (!selectedAccountLabel) return
    setAccountInput(selectedAccountLabel)
  }, [accountCode, accountInput, selectedAccountLabel])

  const resolveAccountCode = (inputValue: string) => {
    const v = inputValue.trim()
    if (!v) return ''
    const directCode = v.split('—')[0].trim()
    if (accList.some(a => a.code === directCode)) return directCode
    const exactLabel = accList.find(a => `${a.code} — ${a.name}`.toLowerCase() === v.toLowerCase())
    if (exactLabel) return exactLabel.code
    const exactName = accList.find(a => a.name.toLowerCase() === v.toLowerCase())
    if (exactName) return exactName.code
    return ''
  }

  const filteredAccounts = useMemo(() => {
    const q = accountInput.trim().toLowerCase()
    if (!q) return accList
    return accList.filter(a =>
      String(a.code ?? '').toLowerCase().includes(q) ||
      String(a.name ?? '').toLowerCase().includes(q) ||
      String(a.description ?? '').toLowerCase().includes(q),
    )
  }, [accList, accountInput])

  const filteredTransactions = useMemo(() => {
    const rows = ledger?.transactions ?? []
    const q = txSearch.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(row =>
      String(row.date ?? '').toLowerCase().includes(q) ||
      String(row.entry_number ?? '').toLowerCase().includes(q) ||
      String(row.description ?? '').toLowerCase().includes(q) ||
      String(row.debit ?? '').toLowerCase().includes(q) ||
      String(row.credit ?? '').toLowerCase().includes(q) ||
      String(row.balance ?? '').toLowerCase().includes(q),
    )
  }, [ledger, txSearch])

  const { data: drillJournal, isLoading: drillJournalLoading } = useQuery<JournalEntry | null>({
    queryKey: ['ledger-drill-journal', selectedTxn?.entry_id],
    queryFn: async () => {
      if (!selectedTxn?.entry_id) return null
      const r = await apiClient.get(`${ACCOUNTING.REPORT_DRILL}?node_type=journal_entry&node_id=${selectedTxn.entry_id}`)
      const data = (r.data?.data ?? r.data) as {
        node_id?: number
        entry_number?: string
        date?: string
        description?: string
        reference_type?: string
        reference_id?: number | null
        lines?: Array<{
          line_id?: number
          account_id?: number
          account_code?: string
          account_name?: string
          description?: string
          debit?: string
          credit?: string
        }>
      }

      return {
        id: Number(data.node_id ?? selectedTxn.entry_id),
        entry_number: data.entry_number ?? selectedTxn.entry_number,
        date: data.date ?? selectedTxn.date,
        description: data.description ?? selectedTxn.description,
        reference_type: data.reference_type ?? selectedTxn.reference_type ?? '',
        reference_id: data.reference_id ?? selectedTxn.reference_id ?? null,
        purpose: selectedTxn.purpose ?? '',
        is_posted: true,
        total_debit: '0',
        total_credit: '0',
        reversal_date: null,
        is_reversal: false,
        reversed_by_id: null,
        reversal_reason: '',
        reversed_by_user_name: '',
        reversal_timestamp: null,
        created_by_name: '',
        created_at: '',
        lines: (data.lines ?? []).map(line => ({
          id: Number(line.line_id ?? 0),
          account: Number(line.account_id ?? 0),
          account_code: String(line.account_code ?? ''),
          account_name: String(line.account_name ?? ''),
          description: String(line.description ?? ''),
          debit: String(line.debit ?? '0'),
          credit: String(line.credit ?? '0'),
        })),
      } as JournalEntry
    },
    enabled: !!selectedTxn?.entry_id,
  })

  const { data: drillSource, isLoading: drillSourceLoading } = useQuery<Invoice | Bill | Payment | CreditNote | DebitNote | null>({
    queryKey: ['ledger-drill-source', drillJournal?.reference_type, drillJournal?.reference_id],
    queryFn: async () => {
      if (!drillJournal?.reference_type || !drillJournal?.reference_id) return null
      const refType = drillJournal.reference_type
      const refId = drillJournal.reference_id
      if (refType === 'invoice') {
        const r = await apiClient.get(ACCOUNTING.INVOICE_DETAIL(refId))
        return (r.data?.data ?? r.data) as Invoice
      }
      if (refType === 'bill') {
        const r = await apiClient.get(ACCOUNTING.BILL_DETAIL(refId))
        return (r.data?.data ?? r.data) as Bill
      }
      if (refType === 'payment') {
        const r = await apiClient.get(ACCOUNTING.PAYMENT_DETAIL(refId))
        return (r.data?.data ?? r.data) as Payment
      }
      if (refType === 'credit_note') {
        const r = await apiClient.get(ACCOUNTING.CREDIT_NOTE_DETAIL(refId))
        return (r.data?.data ?? r.data) as CreditNote
      }
      if (refType === 'debit_note') {
        const r = await apiClient.get(ACCOUNTING.DEBIT_NOTE_DETAIL(refId))
        return (r.data?.data ?? r.data) as DebitNote
      }
      return null
    },
    enabled: !!drillJournal?.reference_type && !!drillJournal?.reference_id,
  })

  const sourceRoute = useMemo(
    () => resolveLedgerSourceRoute(drillJournal?.reference_type, drillJournal?.reference_id),
    [drillJournal?.reference_type, drillJournal?.reference_id],
  )

  const openSourceDocument = () => {
    if (!sourceRoute) return
    const extra: Record<string, string | number> = {
      [sourceRoute.key]: sourceRoute.id,
      from: 'ledger',
    }
    navigate(buildAccountingUrl(sourceRoute.tab, extra))
    setSelectedTxn(null)
  }

  return (
    <div className="space-y-5">
      {selectedTxn && (
        <Modal title="Ledger Drill-Down" onClose={() => setSelectedTxn(null)}>
          <div className="space-y-4 text-sm">
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <span>Ledger</span>
              <ChevronRight size={12} />
              <span>{selectedTxn.entry_number || 'Voucher'}</span>
              {sourceRoute && (
                <>
                  <ChevronRight size={12} />
                  <span className="capitalize">{String(drillJournal?.reference_type ?? '').replace(/_/g, ' ')}</span>
                </>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Voucher</p>
                <p className="font-semibold text-gray-800">{selectedTxn.entry_number}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Date</p>
                <p className="font-semibold text-gray-800">{formatBsDate(selectedTxn.date)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Reference</p>
                <p className="font-medium text-gray-700">{selectedTxn.reference_type ?? '—'}{selectedTxn.reference_id ? ` #${selectedTxn.reference_id}` : ''}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Purpose</p>
                <p className="font-medium text-gray-700">{selectedTxn.purpose || '—'}</p>
              </div>
            </div>

            {drillJournalLoading ? (
              <div className="flex items-center gap-2 text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading voucher lines...</div>
            ) : drillJournal ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Voucher Lines</p>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wide">Account</th>
                        <th className="px-3 py-2 text-left text-gray-500 uppercase tracking-wide">Description</th>
                        <th className="px-3 py-2 text-right text-gray-500 uppercase tracking-wide">Debit</th>
                        <th className="px-3 py-2 text-right text-gray-500 uppercase tracking-wide">Credit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(drillJournal.lines ?? []).map(line => (
                        <tr key={line.id}>
                          <td className="px-3 py-2"><span className="font-mono text-indigo-600 text-[11px] mr-2">{line.account_code}</span>{line.account_name}</td>
                          <td className="px-3 py-2 text-gray-500">{line.description || '—'}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{Number(line.debit) > 0 ? formatNpr(line.debit) : '—'}</td>
                          <td className="px-3 py-2 text-right text-red-600">{Number(line.credit) > 0 ? formatNpr(line.credit) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">Voucher details not available.</p>
            )}

            {drillJournal?.reference_type && (
              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Source Document</p>
                  {sourceRoute && (
                    <button
                      onClick={openSourceDocument}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors"
                    >
                      Open Full Document <ChevronRight size={12} />
                    </button>
                  )}
                </div>
                {drillSourceLoading ? (
                  <div className="flex items-center gap-2 text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading source...</div>
                ) : drillSource ? (
                  <div className="space-y-1 text-gray-700">
                    {'invoice_number' in drillSource && <p>Invoice: <span className="font-semibold">{drillSource.invoice_number}</span></p>}
                    {'bill_number' in drillSource && <p>Bill: <span className="font-semibold">{drillSource.bill_number}</span></p>}
                    {'payment_number' in drillSource && <p>Payment: <span className="font-semibold">{drillSource.payment_number}</span></p>}
                    {'credit_note_number' in drillSource && <p>Credit Note: <span className="font-semibold">{drillSource.credit_note_number}</span></p>}
                    {'debit_note_number' in drillSource && <p>Debit Note: <span className="font-semibold">{drillSource.debit_note_number}</span></p>}
                    {'total' in drillSource && <p>Total: <span className="font-semibold">{formatNpr((drillSource as Invoice | Bill | CreditNote | DebitNote).total)}</span></p>}
                    {'amount' in drillSource && <p>Amount: <span className="font-semibold">{formatNpr((drillSource as Payment).amount)}</span></p>}
                    {'status' in drillSource && <p>Status: <span className="font-semibold capitalize">{String((drillSource as { status?: string }).status ?? '—')}</span></p>}
                  </div>
                ) : (
                  <p className="text-gray-500">No linked source document available.</p>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Account</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                data-lpignore="true"
                value={accountInput || selectedAccountLabel}
                onFocus={() => setAccountDropdownOpen(true)}
                onBlur={() => setTimeout(() => setAccountDropdownOpen(false), 120)}
                onChange={e => {
                  const v = e.target.value
                  setAccountInput(v)
                  setAccountCode(resolveAccountCode(v))
                  setSubmitted(false)
                  setAccountDropdownOpen(true)
                }}
                placeholder="Search and select account..."
                className="w-full border border-gray-200 rounded-lg pl-8 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <ChevronDown size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${accountDropdownOpen ? 'rotate-180' : ''}`} />

              {accountDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
                  {filteredAccounts.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">No matching accounts</div>
                  ) : (
                    filteredAccounts.slice(0, 120).map(a => (
                      <button
                        key={a.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          const label = `${a.code} — ${a.name}`
                          setAccountInput(label)
                          setAccountCode(a.code)
                          setSubmitted(false)
                          setAccountDropdownOpen(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50"
                      >
                        <span className="font-mono text-xs text-indigo-600 mr-2">{a.code}</span>
                        <span>{a.name}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
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
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button onClick={() => { if (!accountCode) { toast.error('Select an account'); return } setSubmitted(true) }} disabled={!accountCode || isFetching}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {(isLoading || isFetching) ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Run Ledger
          </button>
          <button onClick={() => { const p = fiscalYearAdParams(currentFiscalYear()); setDateFrom(p.date_from); setDateTo(new Date().toISOString().slice(0, 10)); setSubmitted(false) }}
            className="px-3 py-2 text-xs font-semibold border border-indigo-300 text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition">
            This FY
          </button>
          <button onClick={() => {
            const fy = currentFiscalYear(); const { startAd } = fiscalYearDateRange(fy)
            const lastFy = fiscalYearOf(new Date(startAd.getTime() - 86_400_000))
            const p = fiscalYearAdParams(lastFy); setDateFrom(p.date_from); setDateTo(p.date_to); setSubmitted(false)
          }}
            className="px-3 py-2 text-xs font-semibold border border-gray-300 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
            Last FY
          </button>
        </div>
      </div>

      {submitted && (isLoading || isFetching) && <div className="flex justify-center py-10"><Loader2 size={28} className="animate-spin text-indigo-400" /></div>}

      {ledger && !isLoading && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-start justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold">Account Ledger</p>
              <h2 className="text-base font-bold text-gray-800">{ledger.account_code} — {ledger.account_name}</h2>
              <p className="text-xs text-gray-500 mt-0.5">{formatBsDate(ledger.date_from)} → {formatBsDate(ledger.date_to)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Opening: <strong className="text-gray-800">{formatNpr(ledger.opening_balance)}</strong></p>
              <p className="text-xs text-gray-500">Closing: <strong className="text-gray-800">{formatNpr(ledger.closing_balance)}</strong></p>
            </div>
          </div>
          <div className="px-6 py-3 border-b border-gray-100 bg-gray-50">
            <div className="relative max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input data-lpignore="true"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
                placeholder="Search entry #, description, amount..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
          </div>
          {filteredTransactions.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">{(ledger.transactions ?? []).length === 0 ? 'No transactions in this period' : 'No transactions match your search'}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Date', 'Entry #', 'Description', 'Debit', 'Credit', 'Balance'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTransactions.map((row, i) => (
                    <tr
                      key={`${row.entry_id ?? row.entry_number}-${row.line_id ?? i}`}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer"
                      onClick={() => {
                        if (!row.entry_id) {
                          toast.error('Voucher details are not linked for this row.')
                          return
                        }
                        setSelectedTxn(row)
                      }}
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatBsDate(row.date)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-indigo-700 underline underline-offset-2">{row.entry_number}</td>
                      <td className="px-4 py-3 text-gray-700">{row.description || '—'}</td>
                      <td className="px-4 py-3 text-emerald-700 font-medium whitespace-nowrap">{Number(row.debit) > 0 ? formatNpr(row.debit) : '—'}</td>
                      <td className="px-4 py-3 text-red-600 font-medium whitespace-nowrap">{Number(row.credit) > 0 ? formatNpr(row.credit) : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{formatNpr(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
