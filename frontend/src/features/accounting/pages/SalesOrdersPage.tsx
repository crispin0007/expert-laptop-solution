import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatBsDate, formatNpr, toPage } from '../utils'
import { Modal } from '../components/accountingShared'
import { ShoppingCart, TrendingUp, ArrowRightLeft, Loader2 } from 'lucide-react'
import type { ApiPage, Quotation } from '../types/accounting'

const fmt = formatBsDate
const npr = formatNpr

export default function SalesOrdersPage() {
  const qc = useQueryClient()
  const [selectedOrder, setSelectedOrder] = useState<Quotation | null>(null)
  const { fyYear } = useAccountingFy()
  const { data, isLoading } = useQuery<ApiPage<Quotation>>({
    queryKey: ['quotations', 'accepted', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.QUOTATIONS}?status=accepted`, fyYear)).then(r => toPage<Quotation>(r.data)),
  })
  const orders = data?.results ?? []

  const mutateConvert = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.QUOTATION_CONVERT(id)),
    onSuccess: () => { toast.success('Converted to invoice'); qc.invalidateQueries({ queryKey: ['quotations'] }); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['report'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Convert failed'),
  })

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Accepted Orders', value: orders.length,                                         icon: ShoppingCart,  bg: 'bg-blue-50',    color: 'text-blue-600'   },
          { label: 'Total Value',      value: npr(orders.reduce((a, q) => a + Number(q.total), 0)), icon: TrendingUp,    bg: 'bg-green-50',   color: 'text-green-600'  },
          { label: 'Pending Convert',  value: orders.filter(q => !q.converted_invoice).length,      icon: ArrowRightLeft, bg: 'bg-yellow-50', color: 'text-yellow-600' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl p-4 flex items-center gap-3 border border-white`}>
            <c.icon size={20} className={c.color} />
            <div><p className="text-xs text-gray-500">{c.label}</p><p className={`text-lg font-bold ${c.color}`}>{c.value}</p></div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 justify-between">
        <p className="text-xs text-gray-400">Showing accepted quotations — create orders from the Quotations tab.</p>
        <span className="text-sm text-gray-400">{orders.length} orders</span>
      </div>
      {isLoading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-indigo-400" /></div> : (
        orders.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <ShoppingCart size={36} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500 font-medium">No accepted orders</p>
            <p className="text-xs text-gray-400 mt-1">Accept a quotation to see it here as a sales order.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['Order #', 'Customer', 'Accepted', 'Total', 'Invoice', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(q => (
                  <tr key={q.id} className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(q)}>
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">{q.quotation_number}</td>
                    <td className="px-4 py-3 text-gray-600">{q.customer_name || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{q.accepted_at ? fmt(q.accepted_at) : '—'}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{npr(q.total)}</td>
                    <td className="px-4 py-3 text-xs">
                      {q.converted_invoice_number
                        ? <span className="text-emerald-700 font-medium">{q.converted_invoice_number}</span>
                        : <span className="text-gray-400">Not yet invoiced</span>}
                    </td>
                    <td className="px-4 py-3">
                      {!q.converted_invoice && (
                        <button onClick={(e) => { e.stopPropagation(); mutateConvert.mutate(q.id) }} disabled={mutateConvert.isPending}
                          className="px-3 py-1.5 text-xs bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 whitespace-nowrap">
                          Convert → Invoice
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      {selectedOrder && <SalesOrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} onConvert={mutateConvert.mutate} converting={mutateConvert.isPending} />}
    </div>
  )
}

function SalesOrderDetailModal({ order, onClose, onConvert, converting }: { order: Quotation; onClose: () => void; onConvert: (id: number) => void; converting: boolean }) {
  return (
    <Modal title={`Order ${order.quotation_number}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Customer</p>
            <p className="text-sm font-semibold text-gray-800">{order.customer_name || '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Accepted</p>
            <p className="text-sm font-semibold text-gray-800">{order.accepted_at ? fmt(order.accepted_at) : '—'}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-sm font-semibold text-gray-800 tabular-nums">{npr(order.total)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Invoice</p>
            <p className="text-sm font-semibold text-gray-800">{order.converted_invoice_number || 'Not yet invoiced'}</p>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Line Items</p>
          </div>
          <div className="divide-y divide-gray-100">
            {(order.line_items ?? []).map((item, idx) => (
              <div key={idx} className="px-4 py-3 grid grid-cols-[1fr_auto_auto] gap-3 text-sm text-gray-700">
                <p>{(item as any).description || 'Item'}</p>
                <p className="font-semibold">{(item as any).qty ?? 1}×</p>
                <p className="font-semibold tabular-nums">{npr(String((item as any).unit_price || '0'))}</p>
              </div>
            ))}
            {(order.line_items ?? []).length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-500">No line items available.</div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">Close</button>
          {!order.converted_invoice && (
            <button onClick={() => onConvert(order.id)} disabled={converting}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {converting ? 'Converting…' : 'Convert to Invoice'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

