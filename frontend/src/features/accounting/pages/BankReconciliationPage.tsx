import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { toPage, formatNpr, formatBsDate } from '../utils'
import { Search, Plus, Trash2, CheckCircle, ArrowRightLeft, Loader2, CheckSquare2 } from 'lucide-react'
import type { ApiPage, BankAccount, BankReconciliation } from '../types/accounting'

const npr = formatNpr
const fmt = formatBsDate

export default function BankReconciliationPage() {
// ─── Bank Reconciliation Tab ──────────────────────────────────────────────────

  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [selected, setSelected] = useState<BankReconciliation | null>(null)
  const [newLine, setNewLine] = useState({ date: '', description: '', amount: '' })
  const [showNew, setShowNew] = useState(false)
  const [lineSearch, setLineSearch] = useState('')
  const [newRec, setNewRec] = useState({ bank_account: '', statement_date: '', opening_balance: '', closing_balance: '', notes: '' })
  const [showCreate, setShowCreate] = useState(false)

  const { data: banks } = useQuery<ApiPage<BankAccount>>({
    queryKey: ['bank-accounts'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => toPage<BankAccount>(r.data)),
  })

  const { data, isLoading } = useQuery<ApiPage<BankReconciliation>>({
    queryKey: ['bank-reconciliations'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_RECONCILIATIONS).then(r => toPage<BankReconciliation>(r.data)),
  })

  const { data: detail, isLoading: detailLoading } = useQuery<BankReconciliation>({
    queryKey: ['bank-reconciliation', selected?.id],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_RECONCILIATION_DETAIL(selected!.id)).then(r => {
      const payload = r.data?.data ?? r.data
      return {
        ...payload,
        lines: Array.isArray(payload?.lines) ? payload.lines : [],
      } as BankReconciliation
    }),
    enabled: !!selected,
  })

  const detailLines = Array.isArray(detail?.lines) ? detail.lines : []
  const filteredDetailLines = useMemo(() => {
    const q = lineSearch.trim().toLowerCase()
    if (!q) return detailLines
    return detailLines.filter(line =>
      String(line.description ?? '').toLowerCase().includes(q) ||
      String(line.date ?? '').toLowerCase().includes(q) ||
      String(line.amount ?? '').toLowerCase().includes(q),
    )
  }, [detailLines, lineSearch])

  const mutateCreate = useMutation({
    mutationFn: (d: typeof newRec) => apiClient.post(ACCOUNTING.BANK_RECONCILIATIONS, d),
    onSuccess: () => { toast.success('Reconciliation created'); qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }); setShowCreate(false); setNewRec({ bank_account: '', statement_date: '', opening_balance: '', closing_balance: '', notes: '' }) },
    onError: () => toast.error('Failed to create'),
  })
  const mutateAddLine = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_ADD_LINE(selected!.id), newLine),
    onSuccess: () => { toast.success('Line added'); qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }); setNewLine({ date: '', description: '', amount: '' }); setShowNew(false) },
    onError: () => toast.error('Failed'),
  })
  const mutateMatch = useMutation({
    mutationFn: (lineId: number) => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_MATCH_LINE(detail!.id), { line_id: lineId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }) },
    onError: () => toast.error('Match failed'),
  })
  const mutateUnmatch = useMutation({
    mutationFn: (lineId: number) => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_UNMATCH_LINE(detail!.id), { line_id: lineId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }) },
    onError: () => toast.error('Unmatch failed'),
  })
  const mutateReconcile = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.BANK_RECONCILIATION_RECONCILE(detail!.id)),
    onSuccess: () => { toast.success('Reconciliation locked ✓'); qc.invalidateQueries({ queryKey: ['bank-reconciliation', selected?.id] }); qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }) },
    onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })
  const mutateDeleteRec = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.BANK_RECONCILIATION_DETAIL(id)),
    onSuccess: () => { toast.success('Reconciliation deleted'); qc.invalidateQueries({ queryKey: ['bank-reconciliations'] }); setSelected(null) },
    onError: () => toast.error('Delete failed'),
  })

  const bankList: Array<{id: number; name: string; bank_name: string}> = banks?.results ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Bank Reconciliation</h3>
          <p className="text-xs text-gray-400 mt-0.5">Match system payments to your bank statement lines.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
          <Plus size={15} /> New Reconciliation
        </button>
      </div>

      {showCreate && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h4 className="text-sm font-semibold text-gray-800 mb-4">Create Reconciliation</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Bank Account</label>
              <select value={newRec.bank_account} onChange={e => setNewRec(p => ({ ...p, bank_account: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="">Select…</option>
                {bankList.map(b => <option key={b.id} value={b.id}>{b.name} — {b.bank_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Statement Date</label>
              <NepaliDatePicker value={newRec.statement_date} onChange={v => setNewRec(p => ({ ...p, statement_date: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opening Balance</label>
              <input data-lpignore="true" type="number" step="0.01" value={newRec.opening_balance} onChange={e => setNewRec(p => ({ ...p, opening_balance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Closing Balance</label>
              <input data-lpignore="true" type="number" step="0.01" value={newRec.closing_balance} onChange={e => setNewRec(p => ({ ...p, closing_balance: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea rows={2} value={newRec.notes} onChange={e => setNewRec(p => ({ ...p, notes: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => mutateCreate.mutate(newRec)} disabled={mutateCreate.isPending || !newRec.bank_account || !newRec.statement_date} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {mutateCreate.isPending ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="space-y-2">
          {isLoading ? <div className="flex justify-center py-8"><Loader2 size={22} className="animate-spin text-indigo-400" /></div> :
            data?.results?.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">No reconciliations yet</div>
            ) : data?.results?.map(rec => (
              <div key={rec.id} className={`rounded-xl border transition-colors ${selected?.id === rec.id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-gray-50'}`}>
                <button onClick={() => setSelected(rec)} className="w-full text-left p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{rec.bank_account_name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{fmt(rec.statement_date)}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${rec.status === 'reconciled' ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                      {rec.status === 'reconciled' ? 'Reconciled' : 'Draft'}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-xs text-gray-500">
                    <span>Open: {npr(rec.opening_balance)}</span>
                    <span>Close: {npr(rec.closing_balance)}</span>
                  </div>
                </button>
                {can('can_manage_accounting') && rec.status !== 'reconciled' && (
                  <div className="px-4 pb-3 flex justify-end border-t border-gray-100 pt-2">
                    <button onClick={() => confirm({ title: 'Delete Reconciliation', message: `Delete reconciliation for ${rec.bank_account_name} (${fmt(rec.statement_date)})? All statement lines will be removed.`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDeleteRec.mutate(rec.id) })} className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"><Trash2 size={11} /> Delete</button>
                  </div>
                )}
              </div>
            ))
          }
        </div>

        {/* Detail pane */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="h-full flex flex-col items-center justify-center py-16 text-gray-400">
              <ArrowRightLeft size={36} className="mb-3 text-gray-300" />
              <p className="text-sm">Select a reconciliation to view lines</p>
            </div>
          ) : detailLoading ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
          ) : detail && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-800">{detail.bank_account_name}</p>
                  <p className="text-xs text-gray-500">{fmt(detail.statement_date)}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${Number(detail.difference) === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    Difference: {npr(detail.difference)}
                  </span>
                  {detail.status === 'draft' && (
                    <>
                      <button onClick={() => setShowNew(n => !n)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                        <Plus size={14} /> Add Line
                      </button>
                      <button onClick={() => mutateReconcile.mutate()} disabled={Number(detail.difference) !== 0 || mutateReconcile.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                        <CheckSquare2 size={14} /> Reconcile
                      </button>
                    </>
                  )}
                </div>
              </div>

              {showNew && (
                <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
                      <NepaliDatePicker value={newLine.date} onChange={v => setNewLine(p => ({ ...p, date: v }))} />
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <input data-lpignore="true" value={newLine.description} onChange={e => setNewLine(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Customer payment" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                      <input data-lpignore="true" type="number" step="0.01" value={newLine.amount} onChange={e => setNewLine(p => ({ ...p, amount: e.target.value }))} placeholder="+ inflow, − outflow" className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <button onClick={() => mutateAddLine.mutate()} disabled={mutateAddLine.isPending || !newLine.date || !newLine.description || !newLine.amount}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
                      {mutateAddLine.isPending ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <div className="relative max-w-sm">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input data-lpignore="true"
                      value={lineSearch}
                      onChange={e => setLineSearch(e.target.value)}
                      placeholder="Search line description, date, amount..."
                      className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Date', 'Description', 'Amount', 'Matched', 'Action'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredDetailLines.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">{detailLines.length === 0 ? 'No statement lines yet. Add lines above.' : 'No statement lines match your search.'}</td></tr>
                    ) : filteredDetailLines.map(line => (
                      <tr key={line.id} className={`transition-colors ${line.is_matched ? 'bg-emerald-50/40' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(line.date)}</td>
                        <td className="px-4 py-3 text-gray-700">{line.description}</td>
                        <td className={`px-4 py-3 font-semibold whitespace-nowrap ${Number(line.amount) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {Number(line.amount) >= 0 ? '+' : ''}{npr(line.amount)}
                        </td>
                        <td className="px-4 py-3">
                          {line.is_matched
                            ? <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle size={13} /> Matched</span>
                            : <span className="text-gray-400 text-xs">Unmatched</span>}
                        </td>
                        <td className="px-4 py-3">
                          {detail.status === 'draft' && (
                            line.is_matched
                              ? <button onClick={() => mutateUnmatch.mutate(line.id)} className="text-xs text-gray-500 hover:text-red-500 transition-colors">Unmatch</button>
                              : <button onClick={() => mutateMatch.mutate(line.id)} className="text-xs text-indigo-600 hover:text-indigo-800 transition-colors">Match</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
