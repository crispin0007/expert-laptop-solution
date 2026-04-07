import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import { Modal, Field, inputCls } from '../components/accountingShared'
import { addFyParam, toPage, formatNpr, formatBsDate, buildAccountingUrl, DN_STATUS } from '../utils'
import { useAccountingFy } from '../hooks'
import { Plus, Pencil, Trash2, AlertCircle, Percent, Loader2 } from 'lucide-react'
import type { ApiPage, Bill, DebitNote } from '../types/accounting'
import { emptyAccountingLineItem, type AccountingLineItemDraft } from '../components/AccountingLineItemsEditor'

const npr = formatNpr
const fmt = formatBsDate

type LineItemDraft = AccountingLineItemDraft
const emptyLine = emptyAccountingLineItem

export default function DebitNotesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const { fyYear } = useAccountingFy()
  const [showCreate, setShowCreate] = useState(false)
  const [detailDn, setDetailDn] = useState<DebitNote | null>(null)
  const [editDn, setEditDn] = useState<DebitNote | null>(null)
  const [focusedDebitNoteId, setFocusedDebitNoteId] = useState<number | null>(null)
  const focusDebitNoteId = Number(searchParams.get('focus_debit_note_id') ?? 0)

  const { data, isLoading } = useQuery<ApiPage<DebitNote>>({
    queryKey: ['debit-notes', statusFilter, fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.DEBIT_NOTES + (statusFilter ? `?status=${statusFilter}` : ''), fyYear)).then(r => toPage<DebitNote>(r.data)),
  })

  const mutateIssue = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.DEBIT_NOTE_ISSUE(id)), onSuccess: () => { toast.success('Debit note issued'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); qc.invalidateQueries({ queryKey: ['report'] }) }, onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Failed') })
  const mutateVoid  = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.DEBIT_NOTE_VOID(id)),  onSuccess: () => { toast.success('Debit note voided');  qc.invalidateQueries({ queryKey: ['debit-notes'] }); qc.invalidateQueries({ queryKey: ['report'] }) }, onError: () => toast.error('Failed') })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.DEBIT_NOTE_DETAIL(id)),
    onSuccess: () => { toast.success('Debit note deleted'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); qc.invalidateQueries({ queryKey: ['report'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed to delete'),
  })

  useEffect(() => {
    if (!focusDebitNoteId) return
    setFocusedDebitNoteId(focusDebitNoteId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`debit-note-row-${focusDebitNoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingUrl('debit-notes'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusDebitNoteId, navigate])

  return (
    <div className="space-y-4">
      {showCreate && <DebitNoteCreateModal onClose={() => setShowCreate(false)} />}
      {detailDn && <DebitNoteDetailModal dn={detailDn} onClose={() => setDetailDn(null)} />}
      {editDn && <DebitNoteEditModal dn={editDn} onClose={() => setEditDn(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'issued', 'applied', 'void'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} debit notes</span>
          {can('can_manage_accounting') && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
              <Plus size={15} /> New Debit Note
            </button>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-amber-700">
        <AlertCircle size={16} className="shrink-0 mt-0.5" />
        <span>Debit notes are raised against approved bills when goods or services are returned to a supplier.</span>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        data?.results?.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Percent size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No debit notes found</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['#', 'Bill', 'Total', 'Reason', 'Status', 'Issued', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.results?.map(dn => (
                    <tr
                      key={dn.id}
                      id={`debit-note-row-${dn.id}`}
                      onClick={() => setDetailDn(dn)}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${focusedDebitNoteId === dn.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-gray-700 whitespace-nowrap">{dn.debit_note_number}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{dn.bill_number}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{npr(dn.total)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{dn.reason || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${DN_STATUS[dn.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {dn.status.charAt(0).toUpperCase() + dn.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(dn.issued_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {dn.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={(e) => { e.stopPropagation(); setEditDn(dn) }} title="Edit"
                              className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                              <Pencil size={13} />
                            </button>
                          )}
                          {dn.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={(e) => { e.stopPropagation(); confirm({ title: 'Delete Debit Note', message: `Delete ${dn.debit_note_number}?`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(dn.id) }) }}
                              title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                          {dn.status === 'draft' && (
                            <button onClick={(e) => { e.stopPropagation(); mutateIssue.mutate(dn.id) }} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap">Issue</button>
                          )}
                          {dn.status !== 'void' && dn.status !== 'applied' && (
                            <button onClick={(e) => { e.stopPropagation(); mutateVoid.mutate(dn.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap">Void</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}

function DebitNoteCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [billId, setBillId] = useState('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: bills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills-mini'],
    queryFn: () => apiClient.get(`${ACCOUNTING.BILLS}?page_size=200&ordering=-created_at`).then(r => toPage<Bill>(r.data)),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.DEBIT_NOTES, payload),
    onSuccess: () => { toast.success('Debit note created'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create debit note'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!billId) { toast.error('Select a bill'); return }
    const validLines = lines.filter(l => l.description && l.unit_price)
    if (!validLines.length) { toast.error('Add at least one line item'); return }
    mutation.mutate({
      bill: Number(billId),
      reason,
      line_items: validLines.map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price })),
    })
  }

  return (
    <Modal title="New Debit Note" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bill *</label>
          <select value={billId} onChange={e => setBillId(e.target.value)} required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— Select bill —</option>
            {bills?.results?.map(b => (
              <option key={b.id} value={b.id}>{b.bill_number} — {b.supplier_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason for return</label>
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Defective goods returned to supplier" />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                        placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50">
            {mutation.isPending ? 'Creating…' : 'Create Debit Note'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DebitNoteDetailModal({ dn, onClose }: { dn: DebitNote; onClose: () => void }) {
  return (
    <Modal title={`Debit Note ${dn.debit_note_number}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Debit Note</p>
            <p className="font-semibold text-gray-800">{dn.debit_note_number}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Status</p>
            <p className="font-semibold text-gray-800 capitalize">{dn.status}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Bill</p>
            <p className="font-semibold text-gray-800">{dn.bill_number}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="font-semibold text-gray-800">{npr(dn.total)}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">Reason</div>
          <div className="px-4 py-3 text-sm text-gray-700">{dn.reason || '—'}</div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 text-left text-xs text-gray-500">Description</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">Qty</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">Unit Price</th>
                  <th className="px-3 py-2 text-right text-xs text-gray-500">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(dn.line_items ?? []).map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{item.description || item.name || '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{item.qty ?? item.quantity ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-600 tabular-nums">{npr(String(item.unit_price ?? item.unit_cost ?? '0'))}</td>
                    <td className="px-3 py-2 text-right text-gray-800 tabular-nums">{npr(String(item.total ?? item.line_total ?? Number(item.qty || 0) * Number(item.unit_price || item.unit_cost || 0)))}</td>
                  </tr>
                ))}
                {!(dn.line_items?.length) && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-gray-400">No line items available.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </Modal>
  )
}

function DebitNoteEditModal({ dn, onClose }: { dn: DebitNote; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState(dn.reason ?? '')
  const [lines, setLines] = useState<LineItemDraft[]>(() =>
    dn.line_items.length > 0
      ? dn.line_items.map(l => ({
          description: String(l.description ?? ''),
          qty: String(l.qty ?? 1),
          unit_price: String(l.unit_price ?? ''),
          discount: String(l.discount ?? '0'),
          line_type: (l.line_type as 'service' | 'product') ?? 'service',
        }))
      : [emptyLine()]
  )

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.DEBIT_NOTE_DETAIL(dn.id), payload),
    onSuccess: () => { toast.success('Debit note updated'); qc.invalidateQueries({ queryKey: ['debit-notes'] }); qc.invalidateQueries({ queryKey: ['report'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed to update'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      reason,
      line_items: lines
        .filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price })),
    })
  }

  return (
    <Modal title={`Edit ${dn.debit_note_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason">
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for return" className={inputCls} />
        </Field>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])}
              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                        placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)}
                        className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5">
                      <input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)}
                        placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {lines.length > 1 && (
                        <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                          className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending}
            className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}
