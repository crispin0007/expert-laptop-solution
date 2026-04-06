import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { Loader2, Link2 } from 'lucide-react'
import DateDisplay from '../../../components/DateDisplay'
import { toPage, formatNpr } from '../utils'
import { SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import type { ApiPage, Bill, Payment } from '../types/accounting'

const npr = formatNpr

export default function AllocateSupplierPaymentsPage() {
  const qc = useQueryClient()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null)

  const { data: unallocated, isLoading: loadingPay } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'unallocated-outgoing'],
    queryFn: () => apiClient.get(`${ACCOUNTING.PAYMENTS}?type=outgoing&bill=null&page_size=100`).then(r => toPage<Payment>(r.data)),
  })
  const { data: openBills, isLoading: loadingBills } = useQuery<ApiPage<Bill>>({
    queryKey: ['bills', 'open-allocate'],
    queryFn: () => apiClient.get(`${ACCOUNTING.BILLS}?status=approved&page_size=200`).then(r => toPage<Bill>(r.data)),
  })

  const mutate = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.PAYMENT_ALLOCATE(selectedPayment!.id), { bill: selectedBill!.id }),
    onSuccess: () => {
      toast.success(`Payment ${selectedPayment?.payment_number} allocated to ${selectedBill?.bill_number}`)
      setSelectedPayment(null); setSelectedBill(null)
      qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['bills'] })
    },
    onError: () => toast.error('Allocation failed'),
  })

  const canAllocate = selectedPayment && selectedBill

  return (
    <div className="space-y-4">
      {canAllocate && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
          <div className="text-sm text-orange-800">
            <span className="font-semibold">{selectedPayment.payment_number}</span> ({npr(selectedPayment.amount)})
            <span className="mx-2 text-orange-400">→</span>
            <span className="font-semibold">{selectedBill.bill_number}</span> ({selectedBill.supplier_name}, {npr(selectedBill.amount_due)} due)
          </div>
          <button onClick={() => mutate.mutate()} disabled={mutate.isPending}
            className="px-4 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2">
            {mutate.isPending ? <Loader2 size={13} className="animate-spin" /> : <Link2 size={13} />} Allocate
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <SectionCard title="Unallocated Payments">
          {loadingPay ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
            <TableContainer className="min-w-[420px]">
              <thead className={tableHeadClass}>
                <tr>{['Payment #', 'Date', 'Amount'].map(h => (
                  <th key={h} className={tableHeaderCellClass}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(unallocated?.results ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No unallocated payments</td></tr>
                ) : unallocated?.results?.map(p => (
                  <tr key={p.id} onClick={() => setSelectedPayment(selectedPayment?.id === p.id ? null : p)}
                    className={`cursor-pointer transition-colors ${selectedPayment?.id === p.id ? 'bg-orange-50 ring-1 ring-orange-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                    <td className="px-3 py-2.5 text-gray-500"><DateDisplay adDate={p.date} /></td>
                    <td className="px-3 py-2.5 font-semibold text-red-700 tabular-nums">{npr(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </SectionCard>

        <SectionCard title="Outstanding Bills">
          {loadingBills ? <div className="py-8 flex justify-center"><Loader2 size={20} className="animate-spin text-indigo-400" /></div> : (
            <TableContainer className="min-w-[420px]">
              <thead className={tableHeadClass}>
                <tr>{['Bill #', 'Supplier', 'Due'].map(h => (
                  <th key={h} className={tableHeaderCellClass}>{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(openBills?.results ?? []).length === 0 ? (
                  <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No outstanding bills</td></tr>
                ) : openBills?.results?.map(bill => (
                  <tr key={bill.id} onClick={() => setSelectedBill(selectedBill?.id === bill.id ? null : bill)}
                    className={`cursor-pointer transition-colors ${selectedBill?.id === bill.id ? 'bg-orange-50 ring-1 ring-orange-300 ring-inset' : 'hover:bg-gray-50/60'}`}>
                    <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{bill.bill_number}</td>
                    <td className="px-3 py-2.5 text-gray-500 truncate max-w-[120px]">{bill.supplier_name}</td>
                    <td className="px-3 py-2.5 font-semibold text-orange-700 tabular-nums">{npr(bill.amount_due)}</td>
                  </tr>
                ))}
              </tbody>
            </TableContainer>
          )}
        </SectionCard>
      </div>
      {!canAllocate && (
        <p className="text-xs text-center text-gray-400 pt-2">Select one payment and one bill above, then click Allocate.</p>
      )}
    </div>
  )
}
