import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { INVENTORY } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { usePermissions } from '../../../hooks/usePermissions'
import { formatBsDate, formatNpr, PO_STATUS, toPage } from '../utils'
import { Modal, SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import { Plus, Loader2, PackageCheck, Trash2, X, Package } from 'lucide-react'
import type { ApiPage, PurchaseOrder, InventorySupplier, InventoryProduct } from '../types/accounting'

const fmt = formatBsDate
const npr = formatNpr

function PurchaseOrderReceiveModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const qc = useQueryClient()
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(po.items.map(i => [i.id, String(i.pending_quantity > 0 ? i.pending_quantity : 0)]))
  )
  const [notes, setNotes] = useState('')

  const mutate = useMutation({
    mutationFn: () => apiClient.post(INVENTORY.PURCHASE_ORDER_RECEIVE(po.id), {
      lines: po.items.map(i => ({ item_id: i.id, quantity_received: Number(quantities[i.id] ?? 0) })),
      notes,
    }),
    onSuccess: () => { toast.success('Stock received'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); onClose() },
    onError: () => toast.error('Receive failed'),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Receive Stock — {po.po_number}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 text-left">Product</th>
              <th className="pb-2 text-right">Ordered</th>
              <th className="pb-2 text-right">Received</th>
              <th className="pb-2 text-right">Pending</th>
              <th className="pb-2 text-right">Receive Now</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {po.items.map(item => (
                <tr key={item.id}>
                  <td className="py-2 text-gray-700">{item.product_name}</td>
                  <td className="py-2 text-right text-gray-500">{item.quantity_ordered}</td>
                  <td className="py-2 text-right text-gray-500">{item.quantity_received}</td>
                  <td className="py-2 text-right text-orange-600">{item.pending_quantity}</td>
                  <td className="py-2 text-right">
                    <input data-lpignore="true" type="number" min={0} max={item.pending_quantity}
                      value={quantities[item.id] ?? ''}
                      onChange={e => setQuantities(q => ({ ...q, [item.id]: e.target.value }))}
                      className="w-20 text-right border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-indigo-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input data-lpignore="true" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />} Confirm Receipt
          </button>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrderCreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: suppliers = [] } = useQuery<InventorySupplier[]>({
    queryKey: ['inventory-suppliers'],
    queryFn: () => apiClient.get(`${INVENTORY.SUPPLIERS}?page_size=200`).then(r => toPage<InventorySupplier>(r.data).results),
  })
  const { data: products = [] } = useQuery<InventoryProduct[]>({
    queryKey: ['inventory-products'],
    queryFn: () => apiClient.get(`${INVENTORY.PRODUCTS}?page_size=500`).then(r => toPage<InventoryProduct>(r.data).results),
  })

  const [supplierId, setSupplierId] = useState('')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState([{ product: '', qty: '1', unit_cost: '' }])

  const addItem = () => setItems(prev => [...prev, { product: '', qty: '1', unit_cost: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string) =>
    setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  const mutate = useMutation({
    mutationFn: () => apiClient.post(INVENTORY.PURCHASE_ORDERS, {
      supplier: Number(supplierId),
      expected_delivery: expectedDelivery || null,
      notes,
      items: items.filter(i => i.product).map(i => ({
        product: Number(i.product),
        quantity_ordered: Number(i.qty),
        unit_cost: i.unit_cost || '0',
      })),
    }),
    onSuccess: () => { toast.success('Purchase order created'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }); onClose() },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to create purchase order'),
  })

  const subtotal = items.reduce((a, i) => a + (Number(i.qty) * Number(i.unit_cost || 0)), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h2 className="font-semibold text-gray-900">New Purchase Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400">
                <option value="">Select supplier…</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Expected Delivery</label>
              <input data-lpignore="true" type="date" value={expectedDelivery} onChange={e => setExpectedDelivery(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <input data-lpignore="true" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</span>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 transition-colors">
                <Plus size={12} /> Add line
              </button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <select value={item.product} onChange={e => updateItem(i, 'product', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-400">
                      <option value="">Select product…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input data-lpignore="true" type="number" min={1} value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} placeholder="Qty"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="col-span-3">
                    <input data-lpignore="true" type="number" min={0} step="0.01" value={item.unit_cost} onChange={e => updateItem(i, 'unit_cost', e.target.value)} placeholder="Unit cost"
                      className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right focus:outline-none focus:border-indigo-400" />
                  </div>
                  <div className="col-span-1 text-right text-xs text-gray-500 tabular-nums">
                    {npr(Number(item.qty || 0) * Number(item.unit_cost || 0))}
                  </div>
                  <div className="col-span-1 text-right">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 text-right text-sm font-semibold text-gray-800">
              Total: {npr(subtotal)}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending || !supplierId}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create PO
          </button>
        </div>
      </div>
    </div>
  )
}

function PurchaseOrderDetailModal({ po, onClose }: { po: PurchaseOrder; onClose: () => void }) {
  const receivedValue = (po.items ?? []).reduce((sum, i) => sum + (Number(i.quantity_received) * Number(i.unit_cost || 0)), 0)
  const pendingValue = Math.max(0, Number(po.total_amount || 0) - receivedValue)

  return (
    <Modal title={`Purchase Order ${po.po_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Supplier</p>
            <p className="text-sm font-semibold text-gray-800">{po.supplier_name}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Status</p>
            <p className="text-sm font-semibold text-gray-800 capitalize">{po.status}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Expected Delivery</p>
            <p className="text-sm font-semibold text-gray-800">{po.expected_delivery ? fmt(po.expected_delivery) : '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm font-semibold text-gray-800">{fmt(po.created_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-600">Total PO Value</p>
            <p className="text-sm font-bold text-blue-800 tabular-nums">{npr(po.total_amount)}</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
            <p className="text-xs text-emerald-600">Received Value</p>
            <p className="text-sm font-bold text-emerald-800 tabular-nums">{npr(receivedValue)}</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-3">
            <p className="text-xs text-orange-600">Pending Value</p>
            <p className="text-sm font-bold text-orange-800 tabular-nums">{npr(pendingValue)}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</p>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Product', 'Ordered', 'Received', 'Pending', 'Unit Cost', 'Line Total'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(po.items ?? []).map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{item.product_name}</td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums">{item.quantity_ordered}</td>
                    <td className="px-3 py-2 text-gray-600 tabular-nums">{item.quantity_received}</td>
                    <td className="px-3 py-2 text-orange-700 tabular-nums">{item.pending_quantity}</td>
                    <td className="px-3 py-2 text-gray-700 tabular-nums">{npr(item.unit_cost)}</td>
                    <td className="px-3 py-2 text-gray-800 font-semibold tabular-nums">{npr(item.line_total)}</td>
                  </tr>
                ))}
                {(po.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-400">No line items found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {po.notes && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{po.notes}</p>
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Close</button>
        </div>
      </div>
    </Modal>
  )
}

export default function PurchaseOrdersPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [receiveFor, setReceiveFor] = useState<PurchaseOrder | null>(null)
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null)

  const { data, isLoading } = useQuery<ApiPage<PurchaseOrder>>({
    queryKey: ['purchase-orders', statusFilter],
    queryFn: () => apiClient.get(`${INVENTORY.PURCHASE_ORDERS}?page_size=200${statusFilter ? `&status=${statusFilter}` : ''}`).then(r => toPage<PurchaseOrder>(r.data)),
  })
  const orders = data?.results ?? []

  const mutateSend = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.PURCHASE_ORDER_SEND(id)),
    onSuccess: () => { toast.success('PO sent to supplier'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateCancel = useMutation({
    mutationFn: (id: number) => apiClient.post(INVENTORY.PURCHASE_ORDER_CANCEL(id)),
    onSuccess: () => { toast.success('PO cancelled'); qc.invalidateQueries({ queryKey: ['purchase-orders'] }) },
    onError: () => toast.error('Action failed'),
  })

  return (
    <div className="space-y-4">
      {showCreate && <PurchaseOrderCreateModal onClose={() => setShowCreate(false)} />}
      {receiveFor && <PurchaseOrderReceiveModal po={receiveFor} onClose={() => setReceiveFor(null)} />}
      {detailPO && <PurchaseOrderDetailModal po={detailPO} onClose={() => setDetailPO(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {['', 'draft', 'sent', 'partial', 'received', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'}`}>
              {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{data?.count ?? 0} purchase orders</span>
          {can('can_manage_accounting') && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus size={14} /> New PO
            </button>
          )}
        </div>
      </div>

      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        orders.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Package size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No purchase orders</p>
          </div>
        ) : (
          <SectionCard>
            <TableContainer className="min-w-[600px]">
              <thead className={tableHeadClass}>
                <tr>{['PO #', 'Supplier', 'Items', 'Total', 'Exp. Delivery', 'Status', 'Actions'].map(h => (
                  <th key={h} className={tableHeaderCellClass}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(po => (
                  <tr
                    key={po.id}
                    onClick={() => setDetailPO(po)}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    title="Click to view purchase order details"
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700 whitespace-nowrap">{po.po_number}</td>
                    <td className="px-4 py-3 text-gray-600">{po.supplier_name}</td>
                    <td className="px-4 py-3 text-gray-500 text-center">{po.items?.length ?? 0}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800 tabular-nums">{npr(po.total_amount)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{po.expected_delivery ? fmt(po.expected_delivery) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${PO_STATUS[po.status] ?? 'bg-gray-100 text-gray-500'}`}>
                        {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailPO(po) }}
                          className="px-2 py-1 text-xs bg-gray-50 text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
                        >
                          View
                        </button>
                        {po.status === 'draft' && can('can_manage_accounting') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); mutateSend.mutate(po.id) }}
                            className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100 transition-colors"
                          >
                            Send
                          </button>
                        )}
                        {(po.status === 'sent' || po.status === 'partial') && can('can_manage_accounting') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setReceiveFor(po) }}
                            className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded-md hover:bg-emerald-100 transition-colors"
                          >
                            Receive
                          </button>
                        )}
                        {(po.status === 'draft' || po.status === 'sent') && can('can_manage_accounting') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); mutateCancel.mutate(po.id) }}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                          >
                            Cancel
                          </button>
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

