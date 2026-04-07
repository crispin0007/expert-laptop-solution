import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { Loader2, Link2, CircleDollarSign, FileText } from 'lucide-react'
import DateDisplay from '../../../components/DateDisplay'
import { toPage, formatNpr } from '../utils'
import type { ApiPage, Invoice, Payment } from '../types/accounting'

const npr = formatNpr

export default function AllocateCustomerPaymentsPage() {
  const qc = useQueryClient()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

  const { data: unallocated, isLoading: loadingPay } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'unallocated-incoming'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=incoming&invoice=null&page_size=100`).then(r => toPage<Payment>(r.data)),
  })
  const { data: openInvoices, isLoading: loadingInv } = useQuery<ApiPage<Invoice>>({
    queryKey: ['invoices', 'open-allocate'],
    queryFn: () => apiClient.get(`${ACCOUNTING.INVOICES}?status=sent&page_size=200`).then(r => toPage<Invoice>(r.data)),
  })

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENT_ALLOCATE(selectedPayment!.id), { invoice: selectedInvoice!.id }),
    onSuccess: () => {
      toast.success(`Payment ${selectedPayment?.payment_number} allocated to ${selectedInvoice?.invoice_number}`)
      setSelectedPayment(null); setSelectedInvoice(null)
      qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['invoices'] }); qc.invalidateQueries({ queryKey: ['report'] })
    },
    onError: () => toast.error('Allocation failed'),
  })

  const canAllocate = selectedPayment && selectedInvoice

  return (
    <div className="space-y-4">
      {canAllocate && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
          <div className="text-sm text-indigo-800">
            <span className="font-semibold">{selectedPayment.payment_number}</span> ({npr(selectedPayment.amount)})
            <span className="mx-2 text-indigo-400">→</span>
            <span className="font-semibold">{selectedInvoice.invoice_number}</span> ({selectedInvoice.customer_name}, {npr(selectedInvoice.amount_due)} due)
          </div>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Allocate
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
            <CircleDollarSign size={14} className="text-green-500" /> Unallocated Receipts
            <span className="text-xs text-gray-400 font-normal">(click to select)</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingPay ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Receipt #', 'Date', 'Amount'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(unallocated?.results ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No unallocated receipts</td></tr>
                  ) : unallocated?.results?.map(p => (
                    <tr key={p.id} onClick={() => setSelectedPayment(selectedPayment?.id === p.id ? null : p)}
                      className={`cursor-pointer transition-colors ${selectedPayment?.id === p.id ? 'bg-indigo-50 ring-1 ring-indigo-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                      <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                      <td className="px-3 py-2.5 font-semibold text-green-700 tabular-nums">{npr(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
            <FileText size={14} className="text-blue-500" /> Open Invoices
            <span className="text-xs text-gray-400 font-normal">(click to select)</span>
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {loadingInv ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>{['Invoice #', 'Customer', 'Due'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs text-gray-400 font-medium">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(openInvoices?.results ?? []).length === 0 ? (
                    <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No open invoices</td></tr>
                  ) : openInvoices?.results?.map(inv => (
                    <tr key={inv.id} onClick={() => setSelectedInvoice(selectedInvoice?.id === inv.id ? null : inv)}
                      className={`cursor-pointer transition-colors ${selectedInvoice?.id === inv.id ? 'bg-indigo-50 ring-1 ring-indigo-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{inv.invoice_number}</td>
                      <td className="px-3 py-2.5 text-gray-500 truncate max-w-[120px]">{inv.customer_name}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-700 tabular-nums">{npr(inv.amount_due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {!canAllocate && (
        <p className="text-xs text-center text-gray-400 pt-2">Select one receipt and one invoice above, then click Allocate.</p>
      )}
    </div>
  )
}
