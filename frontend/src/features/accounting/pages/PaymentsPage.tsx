import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import { useAccountingFy } from '../hooks'
import { addFyParam, buildAccountingUrl, formatBsDate, formatNpr, toPage } from '../utils'
import { Badge, Modal, SectionCard, Spinner, TableContainer, EmptyState, tableHeadClass, tableHeaderCellClass, tableCellClass, tableNumericCellClass } from '../components/accountingShared'
import { Trash2 } from 'lucide-react'
import type { ApiPage, Payment } from '../types/accounting'

const fmt = (value: string | null | undefined) => value ? formatBsDate(value) : '—'

export default function PaymentsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { can } = usePermissions()
  const { fyYear } = useAccountingFy()
  const [focusedPaymentId, setFocusedPaymentId] = useState<number | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const focusPaymentId = Number(searchParams.get('focus_payment_id') ?? 0)

  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.PAYMENTS, fyYear)).then(r => toPage<Payment>(r.data)),
  })

  const mutateDeletePayment = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.PAYMENT_DETAIL(id)),
    onSuccess: () => { toast.success('Payment deleted'); qc.invalidateQueries({ queryKey: ['payments'] }); qc.invalidateQueries({ queryKey: ['report'] }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Delete failed'),
  })

  useEffect(() => {
    if (!focusPaymentId) return
    setFocusedPaymentId(focusPaymentId)
    const raf = requestAnimationFrame(() => {
      document.getElementById(`payment-row-${focusPaymentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
    navigate(buildAccountingUrl('payments'), { replace: true })
    return () => cancelAnimationFrame(raf)
  }, [focusPaymentId, navigate])

  return (
    <div className="space-y-4">
      {selectedPayment && (
        <Modal title={`Payment ${selectedPayment.payment_number}`} onClose={() => setSelectedPayment(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Party</p>
                <p className="text-sm font-semibold text-gray-800">{selectedPayment.party_name || selectedPayment.supplier_name || selectedPayment.customer_name || '—'}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-sm font-bold text-red-700 tabular-nums">{formatNpr(selectedPayment.amount)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-semibold text-gray-800">{fmt(selectedPayment.date)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Method</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{selectedPayment.method.replace('_', ' ')}</p>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Payment Details</p>
              </div>
              <div className="divide-y divide-gray-100">
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Payment Number</span>
                  <span className="font-mono text-indigo-600">{selectedPayment.payment_number}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Invoice</span>
                  <span className="text-gray-800">{selectedPayment.invoice_number || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Bill</span>
                  <span className="text-gray-800">{selectedPayment.bill_number || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Reference</span>
                  <span className="text-gray-800">{selectedPayment.reference || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created By</span>
                  <span className="text-gray-800">{selectedPayment.created_by_name || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Created At</span>
                  <span className="text-gray-800">{selectedPayment.created_at ? fmt(selectedPayment.created_at) : '—'}</span>
                </div>
                {selectedPayment.cheque_status && (
                  <div className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-gray-500">Cheque Status</span>
                    <span className="text-gray-800 capitalize">{selectedPayment.cheque_status.replace('_', ' ')}</span>
                  </div>
                )}
              </div>
            </div>

            {selectedPayment.notes && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedPayment.notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-400">Payments are auto-created when invoices/bills are marked as paid. Admins can delete — linked journal entries are <strong>not</strong> auto-reversed.</p>
        <span className="text-sm text-gray-400">{data?.count ?? 0} payment{data?.count !== 1 ? 's' : ''}</span>
      </div>
      {isLoading ? <Spinner /> : (
        <SectionCard>
          <TableContainer className="min-w-[600px]">
              <thead className={tableHeadClass}>
                <tr>
                  {['Payment #','Date','Type','Method','Amount','Invoice','Bill',''].map(h => (
                    <th key={h} className={tableHeaderCellClass}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.results?.map(p => (
                  <tr
                    key={p.id}
                    id={`payment-row-${p.id}`}
                    className={`hover:bg-gray-50/50 cursor-pointer ${focusedPaymentId === p.id ? 'bg-indigo-50 ring-1 ring-indigo-200' : ''}`}
                    onClick={() => setSelectedPayment(p)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-indigo-600">{p.payment_number}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmt(p.date)}</td>
                    <td className={tableCellClass}><Badge status={p.type} /></td>
                    <td className="px-4 py-3 text-xs text-gray-600 capitalize">{p.method.replace('_', ' ')}</td>
                    <td className={tableNumericCellClass}>{formatNpr(p.amount)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.invoice_number ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.bill_number ?? '—'}</td>
                    <td className="px-4 py-3">
                      {can('can_manage_accounting') && (
                        <button onClick={(e) => { e.stopPropagation(); confirm({ title: 'Delete Payment', message: `Delete payment ${p.payment_number}? The linked journal entry will NOT be auto-reversed — post a manual reversing entry if needed.`, confirmLabel: 'Delete', variant: 'danger' }).then(ok => { if (ok) mutateDeletePayment.mutate(p.id) }) }} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
          </TableContainer>
          {!data?.results?.length && <EmptyState message="No payments recorded yet." />}
        </SectionCard>
      )}
    </div>
  )
}
