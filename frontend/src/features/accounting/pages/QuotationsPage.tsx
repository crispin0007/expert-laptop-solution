import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING, INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatBsDate, formatNpr, toPage } from '../utils'
import { Modal, Field, inputCls, selectCls, SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import { Plus, Pencil, Trash2, Loader2, FileQuestion } from 'lucide-react'
import { emptyAccountingLineItem, type AccountingLineItemDraft } from '../components/AccountingLineItemsEditor'
import type { ApiPage, Customer, Quotation, ServiceItem } from '../types/accounting'

type LineItemDraft = AccountingLineItemDraft

const fmt = formatBsDate
const npr = formatNpr
const emptyLine = emptyAccountingLineItem

// ─── Quotations Tab ──────────────────────────────────────────────────────────

const QUO_STATUS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700', declined: 'bg-red-100 text-red-600',
  expired: 'bg-yellow-100 text-yellow-700',
}

export default function QuotationsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editQuotation, setEditQuotation] = useState<Quotation | null>(null)
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null)
  const { fyYear } = useAccountingFy()

  const { data, isLoading } = useQuery<ApiPage<Quotation>>({
    queryKey: ['quotations', statusFilter, fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.QUOTATIONS + (statusFilter ? `?status=${statusFilter}` : ''), fyYear)).then(r => toPage<Quotation>(r.data)),
  })

  const mutateSend    = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_SEND(id)),    onSuccess: () => { toast.success('Quotation sent'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateAccept  = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_ACCEPT(id)),  onSuccess: () => { toast.success('Quotation accepted'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateDecline = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_DECLINE(id)), onSuccess: () => { toast.success('Quotation declined'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Action failed') })
  const mutateConvert = useMutation({ mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_CONVERT(id)), onSuccess: () => { toast.success('Converted to invoice'); qc.invalidateQueries({ queryKey: ['quotations'] }); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['report'] }) }, onError: (e: {response?: {data?: {detail?: string}}}) => toast.error(e?.response?.data?.detail ?? 'Convert failed') })
  const mutateDelete  = useMutation({ mutationFn: (id: number) => apiClient.delete(ACCOUNTING.QUOTATION_DETAIL(id)), onSuccess: () => { toast.success('Quotation deleted'); qc.invalidateQueries({ queryKey: ['quotations'] }) }, onError: () => toast.error('Delete failed') })

  return (
    <div className="space-y-4">
      {showCreate && <QuotationCreateModal onClose={() => setShowCreate(false)} />}
      {editQuotation && <QuotationEditModal quo={editQuotation} onClose={() => setEditQuotation(null)} />}
      {selectedQuotation && <QuotationDetailModal quotation={selectedQuotation} onClose={() => setSelectedQuotation(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'sent', 'accepted', 'declined', 'expired'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} quotations</span>
          {can('can_manage_accounting') && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New Quotation
            </button>
          )}
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        data?.results?.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <FileQuestion size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No quotations yet</p>
            <p className="text-xs text-gray-400 mt-1">Quotations are created from tickets or projects.</p>
          </div>
        ) : (
          <SectionCard>
            <TableContainer>
              <thead className={tableHeadClass}>
                <tr>
                  {['#', 'Customer', 'Total', 'Valid Until', 'Status', 'Converted', 'Actions'].map(h => (
                    <th key={h} className={tableHeaderCellClass}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data?.results?.map(q => (
                    <tr key={q.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedQuotation(q)}>
                      <td className="px-4 py-3 font-mono font-semibold text-gray-700 whitespace-nowrap">{q.quotation_number}</td>
                      <td className="px-4 py-3 text-gray-600">{q.customer_name || <span className="text-gray-400">—</span>}</td>
                      <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{npr(q.total)}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{q.valid_until ? fmt(q.valid_until) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${QUO_STATUS[q.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {q.converted_invoice_number || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {q.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={(e) => { e.stopPropagation(); setEditQuotation(q) }} title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} /></button>
                          )}
                          {q.status === 'draft' && (
                            <button onClick={(e) => { e.stopPropagation(); mutateSend.mutate(q.id) }} className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors whitespace-nowrap">Send</button>
                          )}
                          {q.status === 'sent' && (
                            <>
                              <button onClick={(e) => { e.stopPropagation(); mutateAccept.mutate(q.id) }} className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap">Accept</button>
                              <button onClick={(e) => { e.stopPropagation(); mutateDecline.mutate(q.id) }} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors whitespace-nowrap">Decline</button>
                            </>
                          )}
                          {q.status === 'accepted' && !q.converted_invoice && (
                            <button onClick={(e) => { e.stopPropagation(); mutateConvert.mutate(q.id) }} disabled={mutateConvert.isPending} className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 transition-colors whitespace-nowrap disabled:opacity-50">
                              {mutateConvert.isPending ? 'Converting…' : 'Convert → Invoice'}
                            </button>
                          )}
                          {(q.status === 'draft' || q.status === 'declined' || q.status === 'expired') && can('can_manage_accounting') && (
                            <button onClick={(e) => { e.stopPropagation(); confirm({ title: 'Delete Quotation', message: `Delete ${q.quotation_number}?`, confirmLabel: 'Delete', variant: 'danger' as const }).then(ok => { if (ok) mutateDelete.mutate(q.id) }) }} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
            </TableContainer>
          </SectionCard>
        )
      )}
    </div>
  )
}

// ─── Quotation Create Modal ──────────────────────────────────────────────────

function QuotationDetailModal({ quotation, onClose }: { quotation: Quotation; onClose: () => void }) {
  return (
    <Modal title={`Quotation ${quotation.quotation_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Customer</p>
            <p className="text-sm font-semibold text-gray-800">{quotation.customer_name || '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Status</p>
            <p className="text-sm font-semibold text-gray-800 capitalize">{quotation.status}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Valid Until</p>
            <p className="text-sm font-semibold text-gray-800">{quotation.valid_until ? fmt(quotation.valid_until) : '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{npr(quotation.total)}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</p>
          </div>
          <div className="divide-y divide-gray-100">
            {(quotation.line_items ?? []).map((item, idx) => (
              <div key={idx} className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 text-sm text-gray-700">
                <p>{(item as any).description || 'Item'}</p>
                <p className="font-semibold">{(item as any).qty ?? 1}×</p>
                <p className="font-semibold tabular-nums">{npr(String((item as any).unit_price || '0'))}</p>
              </div>
            ))}
            {(quotation.line_items ?? []).length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500">No line items available.</div>
            )}
          </div>
        </div>

        {quotation.notes && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quotation.notes}</p>
          </div>
        )}

        {quotation.terms && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Terms</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{quotation.terms}</p>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Close</button>
        </div>
      </div>
    </Modal>
  )
}

function QuotationCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState('')
  const [discount, setDiscount] = useState('0')
  const [lines, setLines] = useState<LineItemDraft[]>([emptyLine()])

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
  })

  const { data: quoCreateServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.post(ACCOUNTING.QUOTATIONS, payload),
    onSuccess: () => { toast.success('Quotation created'); qc.invalidateQueries({ queryKey: ['quotations'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Failed'),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectQuoCreateService(lineIdx: number, serviceId: number) {
    const s = quoCreateServices.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    const gross = Number(l.qty) * Number(l.unit_price)
    return s + gross - gross * (Number(l.discount) / 100)
  }, 0)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!lines.some(l => l.description && l.unit_price)) { toast.error('Add at least one line item'); return }
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      valid_until: validUntil || null,
      discount,
      notes,
      terms,
      line_items: lines.filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title="New Quotation" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Valid Until">
            <NepaliDatePicker value={validUntil} onChange={setValidUntil} />
          </Field>
          <Field label="Discount (NPR)" hint="Flat discount on subtotal">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><Plus size={12} /> Add line</button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium w-24">Type</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Disc%</th>
                <th className="px-2 py-2 w-8" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'service' && quoCreateServices.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <select value={l.service_id?.toString() ?? ''} onChange={e => e.target.value ? selectQuoCreateService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))} className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full">
                            <option value="">From catalog…</option>
                            {quoCreateServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Or enter description" className="border-0 outline-none text-xs bg-transparent w-full" required />}
                        </div>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" required />
                      )}
                    </td>
                    <td className="px-2 py-1.5"><select value={l.line_type} onChange={e => {
                      const t = e.target.value as 'service' | 'product'
                      setLines(ls => ls.map((ln, j) => j === i ? { ...ln, line_type: t, service_id: undefined, description: '', unit_price: '' } : ln))
                    }} className="w-full border-0 outline-none text-xs bg-transparent"><option value="service">Service</option><option value="product">Product</option></select></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" required /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5 text-center">{lines.length > 1 && <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-2 text-sm text-gray-600">Subtotal: <span className="font-semibold ml-2">{npr(subtotal)}</span></div>
        </div>
        <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="Payment terms, validity conditions…" /></Field>
        <Field label="Terms"><textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} className={inputCls} placeholder="T&C, delivery conditions…" /></Field>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Create Quotation
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Quotation Edit Modal ─────────────────────────────────────────────────────

function QuotationEditModal({ quo, onClose }: { quo: Quotation; onClose: () => void }) {
  const qc = useQueryClient()
  const [customerId, setCustomerId] = useState(String(quo.customer ?? ''))
  const [validUntil, setValidUntil] = useState(quo.valid_until ?? '')
  const [notes, setNotes] = useState(quo.notes)
  const [terms, setTerms] = useState(quo.terms)
  const [discount, setDiscount] = useState(quo.discount)
  const [lines, setLines] = useState<LineItemDraft[]>(
    quo.line_items.length > 0
      ? quo.line_items.map(l => ({ description: l.description ?? '', qty: String(l.qty ?? 1), unit_price: String(l.unit_price ?? ''), discount: String(l.discount ?? '0'), line_type: (l.line_type as 'service' | 'product') ?? 'service' }))
      : [emptyLine()]
  )

  const { data: customers } = useQuery<ApiPage<Customer>>({
    queryKey: ['customers', 'all'],
    queryFn: () => apiClient.get('/customers/?page_size=200').then(r => toPage<Customer>(r.data)),
  })

  const mutation = useMutation({
    mutationFn: (payload: unknown) => apiClient.patch(ACCOUNTING.QUOTATION_DETAIL(quo.id), payload),
    onSuccess: () => { toast.success('Quotation updated'); qc.invalidateQueries({ queryKey: ['quotations'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Update failed'),
  })

  const { data: quoEditServices = [] } = useQuery<ServiceItem[]>({
    queryKey: ['services-all'],
    queryFn: () => apiClient.get(INVENTORY.SERVICES + '?all=true').then(r => r.data?.data ?? r.data?.results ?? r.data ?? []),
  })

  function setLine<K extends keyof LineItemDraft>(idx: number, key: K, val: string) {
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: val } : l))
  }

  function selectQuoEditService(lineIdx: number, serviceId: number) {
    const s = quoEditServices.find(x => x.id === serviceId)
    if (!s) return
    setLines(ls => ls.map((l, i) => i === lineIdx
      ? { ...l, service_id: s.id, description: s.name, unit_price: s.unit_price }
      : l
    ))
  }

  const subtotal = lines.reduce((s, l) => {
    if (!l.unit_price) return s
    const gross = Number(l.qty) * Number(l.unit_price)
    return s + gross - gross * (Number(l.discount) / 100)
  }, 0)

  function submit(e: FormEvent) {
    e.preventDefault()
    mutation.mutate({
      customer: customerId ? Number(customerId) : null,
      valid_until: validUntil || null,
      discount,
      notes,
      terms,
      line_items: lines.filter(l => l.description && l.unit_price)
        .map(l => ({ description: l.description, qty: Number(l.qty), unit_price: l.unit_price, discount: l.discount || '0', line_type: l.line_type || 'service' })),
    })
  }

  return (
    <Modal title={`Edit ${quo.quotation_number}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Customer">
            <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={selectCls}>
              <option value="">— No customer —</option>
              {customers?.results?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Valid Until">
            <NepaliDatePicker value={validUntil} onChange={setValidUntil} />
          </Field>
          <Field label="Discount (NPR)">
            <input data-lpignore="true" type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Line Items</label>
            <button type="button" onClick={() => setLines(ls => [...ls, emptyLine()])} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"><Plus size={12} /> Add line</button>
          </div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                <th className="px-2 py-2 text-left text-gray-500 font-medium w-24">Type</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Qty</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-28">Unit Price</th>
                <th className="px-2 py-2 text-right text-gray-500 font-medium w-16">Disc%</th>
                <th className="px-2 py-2 w-8" />
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      {l.line_type === 'service' && quoEditServices.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          <select value={l.service_id?.toString() ?? ''} onChange={e => e.target.value ? selectQuoEditService(i, Number(e.target.value)) : setLines(ls => ls.map((ln, j) => j === i ? { ...ln, service_id: undefined } : ln))} className="border-0 outline-none text-xs bg-transparent text-gray-400 w-full">
                            <option value="">From catalog…</option>
                            {quoEditServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          {l.service_id
                            ? <span className="text-xs text-gray-700 truncate">{l.description}</span>
                            : <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Or enter description" className="border-0 outline-none text-xs bg-transparent w-full" />}
                        </div>
                      ) : (
                        <input data-lpignore="true" value={l.description} onChange={e => setLine(i, 'description', e.target.value)} placeholder="Item description" className="w-full border-0 outline-none text-xs bg-transparent" />
                      )}
                    </td>
                    <td className="px-2 py-1.5"><select value={l.line_type} onChange={e => {
                      const t = e.target.value as 'service' | 'product'
                      setLines(ls => ls.map((ln, j) => j === i ? { ...ln, line_type: t, service_id: undefined, description: '', unit_price: '' } : ln))
                    }} className="w-full border-0 outline-none text-xs bg-transparent"><option value="service">Service</option><option value="product">Product</option></select></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="1" value={l.qty} onChange={e => setLine(i, 'qty', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setLine(i, 'unit_price', e.target.value)} placeholder="0.00" className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5"><input data-lpignore="true" type="number" min="0" max="100" step="0.01" value={l.discount} onChange={e => setLine(i, 'discount', e.target.value)} className="w-full border-0 outline-none text-xs text-right bg-transparent" /></td>
                    <td className="px-2 py-1.5 text-center">{lines.length > 1 && <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-2 text-sm text-gray-600">Subtotal: <span className="font-semibold ml-2">{npr(subtotal)}</span></div>
        </div>
        <Field label="Notes"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} /></Field>
        <Field label="Terms"><textarea value={terms} onChange={e => setTerms(e.target.value)} rows={2} className={inputCls} /></Field>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  )
}

