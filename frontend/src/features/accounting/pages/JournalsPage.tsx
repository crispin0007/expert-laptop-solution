import { useState, Fragment, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Plus, Printer, Pencil, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatBsDate, formatNpr, toPage, openPrintWindow, PURPOSE_BADGE } from '../utils'
import { Badge, Spinner, EmptyState, Modal, Field, inputCls, selectCls } from '../components/accountingShared'
import type { JournalEntry, Account, JournalLineDraft, ApiPage } from '../types/accounting'

function PurposeBadge({ purpose }: { purpose: string }) {
  const clazz = PURPOSE_BADGE[purpose] ?? 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${clazz}`}>
      {purpose.replace(/_/g, ' ')}
    </span>
  )
}

const emptyJLine = (): JournalLineDraft => ({ account: '', debit: '', credit: '', description: '' })

function JournalEditModal({ je, onClose }: { je: JournalEntry; onClose: () => void }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(je.date)
  const [description, setDescription] = useState(je.description)
  const [jLines, setJLines] = useState<JournalLineDraft[]>(
    je.lines.length >= 2
      ? je.lines.map(l => ({ account: String(l.account), debit: l.debit, credit: l.credit, description: l.description }))
      : [emptyJLine(), emptyJLine()]
  )

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-flat'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.JOURNAL_DETAIL(je.id), payload),
    onSuccess: () => {
      toast.success('Journal entry updated')
      qc.invalidateQueries({ queryKey: ['journals'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update entry'),
  })

  function setJLine<K extends keyof JournalLineDraft>(idx: number, key: K, val: string) {
    setJLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  const totalDebit = jLines.reduce((s, l) => s + Number(l.debit || 0), 0)
  const totalCredit = jLines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!balanced) { toast.error('Debits must equal credits'); return }
    if (!description.trim()) { toast.error('Description is required'); return }
    const validLines = jLines.filter(l => l.account && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { toast.error('At least 2 journal lines required'); return }
    mutation.mutate({
      date,
      description,
      lines: validLines.map(l => ({
        account: Number(l.account),
        debit:   l.debit  || '0',
        credit:  l.credit || '0',
        description: l.description,
      })),
    })
  }

  return (
    <Modal title={`Edit Journal Entry — ${je.entry_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle size={14} className="text-amber-500 mt-0.5 shrink-0" />
          <span className="text-xs text-amber-800"><strong>Admin edit:</strong> Saving will replace all journal lines. Related auto-generated journal entries from invoices/bills are not affected.</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date *">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Description *">
            <input data-lpignore="true" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Adjustment, accrual…" className={inputCls} required />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Journal Lines</label>
            <button type="button" onClick={() => setJLines(ls => [...ls, emptyJLine()])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Account</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Debit</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Credit</th>
                  <th className="px-2 py-2 text-left text-gray-500 font-medium">Note</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jLines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <select value={l.account} onChange={e => setJLine(i, 'account', e.target.value)}
                        className={selectCls}>
                        <option value="">— Select account —</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.debit}
                        onChange={e => setJLine(i, 'debit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.credit}
                        onChange={e => setJLine(i, 'credit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setJLine(i, 'description', e.target.value)}
                        placeholder="Optional note" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {jLines.length > 2 && (
                        <button type="button" onClick={() => setJLines(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-3 py-2 text-xs font-medium text-gray-500">Totals</td>
                  <td className={`px-2 py-2 text-xs text-right font-semibold ${balanced ? 'text-green-700' : 'text-red-600'}`}>
                    {formatNpr(totalDebit)}
                  </td>
                  <td className={`px-2 py-2 text-xs text-right font-semibold ${balanced ? 'text-red-700' : 'text-red-600'}`}>
                    {formatNpr(totalCredit)}
                  </td>
                  <td colSpan={2} className="px-2 py-2 text-xs">
                    {!balanced && <span className="text-red-500 font-medium">⚠ Not balanced (diff: {formatNpr(Math.abs(totalDebit - totalCredit))})</span>}
                    {balanced && totalDebit > 0 && <span className="text-green-600 font-medium">✓ Balanced</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending || !balanced}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

function JournalCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [jLines, setJLines] = useState<JournalLineDraft[]>([emptyJLine(), emptyJLine()])

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts-flat'],
    queryFn: () => apiClient.get(ACCOUNTING.ACCOUNTS + '?no_page=1').then(r =>
      Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])
    ),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.JOURNALS, payload),
    onSuccess: () => {
      toast.success('Journal entry created')
      qc.invalidateQueries({ queryKey: ['journals'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create entry'),
  })

  function setJLine<K extends keyof JournalLineDraft>(idx: number, key: K, val: string) {
    setJLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  const totalDebit = jLines.reduce((s, l) => s + Number(l.debit || 0), 0)
  const totalCredit = jLines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const balanced = Math.abs(totalDebit - totalCredit) < 0.001

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!balanced) { toast.error('Debits must equal credits'); return }
    if (!description.trim()) { toast.error('Description is required'); return }
    const validLines = jLines.filter(l => l.account && (Number(l.debit) > 0 || Number(l.credit) > 0))
    if (validLines.length < 2) { toast.error('At least 2 journal lines required'); return }
    mutation.mutate({
      date,
      description,
      reference_type: 'manual',
      lines: validLines.map(l => ({
        account: Number(l.account),
        debit:   l.debit  || '0',
        credit:  l.credit || '0',
        description: l.description,
      })),
    })
  }

  return (
    <Modal title="New Journal Entry" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Date *">
            <NepaliDatePicker value={date} onChange={setDate} />
          </Field>
          <Field label="Description *">
            <input data-lpignore="true" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Journal description" className={inputCls} required />
          </Field>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Journal Lines</label>
            <button type="button" onClick={() => setJLines(ls => [...ls, emptyJLine()])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Account</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Debit</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Credit</th>
                  <th className="px-2 py-2 text-left text-gray-500 font-medium">Note</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jLines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <select value={l.account} onChange={e => setJLine(i, 'account', e.target.value)}
                        className={selectCls}>
                        <option value="">— Select account —</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.debit}
                        onChange={e => setJLine(i, 'debit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.credit}
                        onChange={e => setJLine(i, 'credit', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setJLine(i, 'description', e.target.value)}
                        placeholder="Optional note" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {jLines.length > 2 && (
                        <button type="button" onClick={() => setJLines(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td className="px-3 py-2 text-xs font-medium text-gray-500">Totals</td>
                  <td className={`px-2 py-2 text-xs text-right font-semibold ${balanced ? 'text-green-700' : 'text-red-600'}`}>
                    {formatNpr(totalDebit)}
                  </td>
                  <td className={`px-2 py-2 text-xs text-right font-semibold ${balanced ? 'text-red-700' : 'text-red-600'}`}>
                    {formatNpr(totalCredit)}
                  </td>
                  <td colSpan={2} className="px-2 py-2 text-xs">
                    {!balanced && <span className="text-red-500 font-medium">⚠ Not balanced (diff: {formatNpr(Math.abs(totalDebit - totalCredit))})</span>}
                    {balanced && totalDebit > 0 && <span className="text-green-600 font-medium">✓ Balanced</span>}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending || !balanced}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Entry
          </button>
        </div>
      </form>
    </Modal>
  )
}

function printJournalVoucher(je: JournalEntry) {
  const rows = (je.lines ?? []).map(line => `
    <tr>
      <td>${line.account_code} — ${line.account_name}</td>
      <td>${line.description || ''}</td>
      <td class="num">${Number(line.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="num">${Number(line.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    </tr>
  `).join('')

  const total = Number(je.total_debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Journal Voucher ${je.entry_number}</title><style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }
    h2 { font-size: 16px; margin: 0 0 8px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin: 12px 0; font-size: 11px; }
    .meta span { color: #555; } .meta strong { color: #111; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; padding: 6px 8px; text-align: left; border: 1px solid #e5e7eb; }
    td { padding: 5px 8px; border: 1px solid #e5e7eb; vertical-align: top; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td { font-weight: 700; background: #f9fafb; }
    .footer { margin-top: 32px; display: flex; justify-content: space-between; font-size: 11px; color: #555; }
    .sig-line { border-top: 1px solid #999; width: 160px; text-align: center; padding-top: 4px; margin-top: 40px; }
    @media print { body { margin: 12px; } }
  </style></head><body>
    <h2>Journal Voucher — ${je.entry_number}</h2>
    <div class="meta">
      <div><span>Date:</span> <strong>${je.date}</strong></div>
      <div><span>Purpose:</span> <strong>${(je.purpose ?? '').replace(/_/g, ' ')}</strong></div>
      <div><span>Ref Type:</span> <strong>${(je.reference_type ?? '').replace(/_/g, ' ')}</strong></div>
      <div><span>Description:</span> <strong>${je.description ?? ''}</strong></div>
      ${je.created_by_name ? `<div><span>Created by:</span> <strong>${je.created_by_name}</strong></div>` : ''}
    </div>
    <table>
      <thead><tr><th>Account</th><th>Narration</th><th class="num">Debit (NPR)</th><th class="num">Credit (NPR)</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="total-row"><td colspan="2" style="text-align:right;">Total</td><td class="num">${total}</td><td class="num">${total}</td></tr></tfoot>
    </table>
    <div class="footer">
      <div><div class="sig-line">Prepared By</div></div>
      <div><div class="sig-line">Checked By</div></div>
      <div><div class="sig-line">Approved By</div></div>
    </div>
  </body></html>`

  const styles = `body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #111; }` // fallback style injection is handled by openPrintWindow
  if (!openPrintWindow(`Journal Voucher — ${je.entry_number}`, html, `<style>${styles}</style>`, 400)) {
    toast.error('Pop-up blocked — allow pop-ups and try again')
  }
}

export default function JournalsPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [purposeFilter, setPurposeFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editJournal, setEditJournal] = useState<JournalEntry | null>(null)
  const { fyYear } = useAccountingFy()
  const { data, isLoading } = useQuery<ApiPage<JournalEntry>>({
    queryKey: ['journals', fyYear, purposeFilter],
    queryFn: () => {
      let url = addFyParam(ACCOUNTING.JOURNALS, fyYear)
      if (purposeFilter) url += (url.includes('?') ? '&' : '?') + `purpose=${purposeFilter}`
      return apiClient.get(url).then(r => toPage<JournalEntry>(r.data))
    },
  })
  const mutatePost = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.JOURNAL_POST(id)),
    onSuccess: () => { toast.success('Entry posted'); qc.invalidateQueries({ queryKey: ['journals'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Post failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.JOURNAL_DETAIL(id)),
    onSuccess: () => { toast.success('Journal entry deleted'); qc.invalidateQueries({ queryKey: ['journals'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Delete failed'),
  })

  return (
    <div className="space-y-4">
      {editJournal && <JournalEditModal je={editJournal} onClose={() => setEditJournal(null)} />}
      {showCreate && <JournalCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-xs text-gray-400">Journal entries are auto-created from invoices, bills, and payments. Manual entries for adjustments.</p>
        <div className="flex items-center gap-2">
          <select
            value={purposeFilter}
            onChange={e => setPurposeFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            <option value="">All types</option>
            {Object.keys(PURPOSE_BADGE).map(p => (
              <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
            ))}
          </select>
          {(data?.results?.length ?? 0) > 0 && (
            expanded.size === (data?.results?.length ?? 0)
              ? <button onClick={() => setExpanded(new Set())}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsDownUp size={14} /> Collapse All
                </button>
              : <button onClick={() => setExpanded(new Set(data?.results?.map(je => je.id) ?? []))}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronsUpDown size={14} /> Expand All
                </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> Manual Entry
          </button>
        </div>
      </div>
      {isLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['','Entry #','Date','Description','Ref','Purpose','Debit','Credit','Status',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data?.results?.map(je => (
                <Fragment key={je.id}>
                  <tr className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setExpanded(s => { const n = new Set(s); n.has(je.id) ? n.delete(je.id) : n.add(je.id); return n })}>
                    <td className="px-3 py-3">
                      <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded.has(je.id) ? 'rotate-90' : ''}`} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">
                      {je.entry_number}
                      {je.is_reversal && <span className="ml-1 text-red-500" title="This is a reversing entry">R</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{formatBsDate(je.date)}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{je.description}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs capitalize">{je.reference_type.replace('_', ' ')}</td>
                    <td className="px-4 py-3"><PurposeBadge purpose={je.purpose} /></td>
                    <td className="px-4 py-3 text-green-700">{formatNpr(je.total_debit)}</td>
                    <td className="px-4 py-3 text-red-700">{formatNpr(je.total_credit)}</td>
                    <td className="px-4 py-3">
                      {je.is_posted
                        ? <Badge status="posted" />
                        : <button onClick={e => { e.stopPropagation(); mutatePost.mutate(je.id) }} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Post</button>
                      }
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => printJournalVoucher(je)}
                          className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Print Voucher">
                          <Printer size={13} />
                        </button>
                        {!je.is_posted && can('can_manage_accounting') && (
                          <>
                            <button onClick={() => setEditJournal(je)}
                              className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title="Edit entry">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => confirm({ title: 'Delete Journal Entry', message: `Delete ${je.entry_number}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' }).then(ok => { if (ok) mutateDelete.mutate(je.id) })}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete entry">
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded.has(je.id) && (
                    <tr>
                      <td colSpan={10} className="px-8 py-3 bg-gray-50">
                        <table className="w-full text-xs mb-2">
                          <thead>
                            <tr className="text-gray-400">
                              <th className="text-left pb-1">Account</th>
                              <th className="text-left pb-1">Description</th>
                              <th className="text-right pb-1">Debit</th>
                              <th className="text-right pb-1">Credit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {je.lines?.map(l => (
                              <tr key={l.id} className="border-t border-gray-100">
                                <td className="py-1 text-gray-600">{l.account_code} — {l.account_name}</td>
                                <td className="py-1 text-gray-400">{l.description}</td>
                                <td className="py-1 text-right text-green-700">{Number(l.debit) > 0 ? formatNpr(l.debit) : ''}</td>
                                <td className="py-1 text-right text-red-700">{Number(l.credit) > 0 ? formatNpr(l.credit) : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(je.reversal_timestamp || je.reversal_reason || je.reversed_by_id) && (
                          <div className="mt-2 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
                            <p className="font-semibold">Reversal Audit Trail</p>
                            {je.reversed_by_user_name && <p>Reversed by: <span className="font-medium">{je.reversed_by_user_name}</span></p>}
                            {je.reversal_timestamp && <p>When: {new Date(je.reversal_timestamp).toLocaleString()}</p>}
                            {je.reversal_reason && <p>Reason: {je.reversal_reason}</p>}
                          </div>
                        )}
                        {je.created_by_name && (
                          <p className="text-xs text-gray-400 mt-1.5">Created by {je.created_by_name}</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {!data?.results?.length && <EmptyState message="No journal entries yet. They are created automatically from invoices, bills, and payments." />}
        </div>
      )}
    </div>
  )
}
