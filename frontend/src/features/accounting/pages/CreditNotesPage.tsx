import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING, INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import { Modal, Field, inputCls, Spinner, Badge, EmptyState, SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import { addFyParam, toPage, formatNpr, formatBsDate, buildAccountingUrl } from '../utils'
import { useAccountingFy } from '../hooks'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import type { ApiPage, CreditNote, Invoice, InventoryProduct } from '../types/accounting'
import { emptyAccountingLineItem, type AccountingLineItemDraft } from '../components/AccountingLineItemsEditor'

const npr = formatNpr
const fmt = formatBsDate

type LineItemDraft = AccountingLineItemDraft
const emptyLine = emptyAccountingLineItem

export default function CreditNotesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useAccountingFy()
  const [editCn, setEditCn] = useState<CreditNote | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [focusedCreditNoteId, setFocusedCreditNoteId] = useState<number | null>(null)
  const focusCreditNoteId = Number(searchParams.get('focus_credit_note_id') ?? 0)

  const { data, isLoading } = useQuery<ApiPage<CreditNote>>({
    queryKey: ['credit-notes', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.CREDIT_NOTES, fyYear)).then(r => toPage<CreditNote>(r.data)),
  })

  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.CREDIT_NOTE_ISSUE(id)),
    onSuccess: () => { toast.success('Credit note issued'); qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateVoid = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.CREDIT_NOTE_VOID(id)),
    onSuccess: () => { toast.success('Credit note voided'); qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.CREDIT_NOTE_DETAIL(id)),
    onSuccess: () => { toast.success('Credit note deleted'); qc.invalidateQueries({ queryKey: ['credit-notes'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to delete credit note'),
  })

  useEffect(() => {
    if (!focusCreditNoteId) return
    setFocusedCreditNoteId(focusCreditNoteId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`credit-note-row-${focusCreditNoteId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingUrl('credit-notes'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusCreditNoteId, navigate])

  return (
    <div>
      {editCn && <CreditNoteEditModal cn={editCn} onClose={() => setEditCn(null)} />}
      {showCreate && <CreditNoteCreateModal onClose={() => setShowCreate(false)} />}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-400">{data?.count ?? 0} credit notes</span>
        {can('can_manage_accounting') && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors">
            <Plus size={15} /> New Credit Note
          </button>
        )}
      </div>
      {isLoading ? <Spinner /> : (
        <SectionCard>
          <TableContainer className="min-w-[560px]">
              <thead className={tableHeadClass}>
                <tr>
                  {['CN #','Invoice','Total','Status','Issued','Actions'].map(h => (
                    <th key={h} className={tableHeaderCellClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data?.results?.map(cn => (
                  <tr
                    key={cn.id}
                    id={`credit-note-row-${cn.id}`}
                    className={`hover:bg-gray-50/50 ${focusedCreditNoteId === cn.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{cn.credit_note_number}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{cn.invoice_number ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{npr(cn.total)}</td>
                    <td className="px-4 py-3"><Badge status={cn.status} /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(cn.issued_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center">
                        {cn.status === 'draft' && can('can_manage_accounting') && (
                          <button onClick={() => setEditCn(cn)} title="Edit Credit Note"
                            className="p-1.5 rounded hover:bg-indigo-50 text-indigo-400 transition-colors">
                            <Pencil size={14} />
                          </button>
                        )}
                        {cn.status === 'draft' && can('can_manage_accounting') && (
                          <button onClick={() => { confirm({ title: 'Delete Credit Note', message: `Delete ${cn.credit_note_number}? This cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' }).then(ok => { if (ok) mutateDelete.mutate(cn.id) }) }}
                            title="Delete" className="p-1.5 rounded hover:bg-red-50 text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        )}
                        {cn.status === 'draft' && (
                          <button onClick={() => mutateIssue.mutate(cn.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                        )}
                        {cn.status !== 'void' && (
                          <button onClick={() => { confirm({ title: 'Void Credit Note', message: 'Void this credit note?', variant: 'danger', confirmLabel: 'Void' }).then(ok => { if (ok) mutateVoid.mutate(cn.id) }) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Void</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
          </TableContainer>
          {!data?.results?.length && <EmptyState message="No credit notes yet." />}
        </SectionCard>
      )}
    </div>
  )
}

function CreditNoteCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [invoiceId, setInvoiceId] = useState<string>('')
  const [reason, setReason] = useState('')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: invoices } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices-mini'],
    queryFn: () => apiClient.get(ACCOUNTING.INVOICES + '?page_size=200&status=issued').then(r => toPage<Invoice>(r.data)),
  })
  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then(r => toPage<InventoryProduct>(r.data).results),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.CREDIT_NOTES, payload),
    onSuccess: () => { toast.success('Credit note created'); qc.invalidateQueries({ queryKey: ['credit-notes'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create credit note'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string | number | undefined) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectProduct(lineIdx: number, productId: number) {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, product_id: p.id, description: p.name, unit_price: p.unit_price, line_type: 'product' }
      : l
    ))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter(l => l.description && l.unit_price)
    if (!validLines.length) { toast.error('Add at least one line item'); return }
    mutation.mutate({
      invoice: invoiceId ? Number(invoiceId) : null,
      reason,
      line_items: validLines.map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title="New Credit Note" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Linked Invoice (optional)</label>
          <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— Standalone credit note —</option>
            {invoices?.results?.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.invoice_number} — {inv.customer_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason</label>
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="e.g. Returned goods, billing error…" />
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
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Description / Product</th>
                  <th className="px-2 py-2 text-left text-gray-500 font-medium w-20">Type</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-14">Qty</th>
                  <th className="px-2 py-2 text-right text-gray-500 font-medium w-24">Unit Price</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'product' ? (
                        <select
                          value={l.product_id ?? ''}
                          onChange={e => e.target.value
                            ? selectProduct(i, Number(e.target.value))
                            : setLine(i, 'product_id', undefined)
                          }
                          className="w-full border-0 outline-none text-xs bg-transparent"
                        >
                          <option value="">— Select product —</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>
                          ))}
                        </select>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)}
                          placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <select value={l.line_type} onChange={e => setLine(i, 'line_type', e.target.value as 'service' | 'product')}
                        className="w-full border-0 outline-none text-xs bg-transparent">
                        <option value="service">Service</option>
                        <option value="product">Product</option>
                      </select>
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
            Create Credit Note
          </button>
        </div>
      </form>
    </Modal>
  )
}

function CreditNoteEditModal({ cn, onClose }: { cn: CreditNote; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState(cn.reason ?? '')
  const [lines, setLines] = useState<LineItemDraft[]>(() =>
    (cn.line_items as Record<string, unknown>[]).length > 0
      ? (cn.line_items as Record<string, unknown>[]).map(l => ({
          description: String(l.description ?? ''),
          qty: String(l.qty ?? 1),
          unit_price: String(l.unit_price ?? ''),
          discount: String(l.discount ?? '0'),
          line_type: (l.line_type as 'service' | 'product') ?? 'service',
        }))
      : [emptyLine()]
  )

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.CREDIT_NOTE_DETAIL(cn.id), payload),
    onSuccess: () => {
      toast.success('Credit note updated')
      qc.invalidateQueries({ queryKey: ['credit-notes'] })
      onClose()
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to update credit note'),
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
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0' })),
    })
  }

  return (
    <Modal title={`Edit ${cn.credit_note_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Reason">
          <input data-lpignore="true" value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Reason for credit note" className={inputCls} />
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
