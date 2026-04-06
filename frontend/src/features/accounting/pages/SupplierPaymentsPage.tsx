import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import DateDisplay from '../../../components/DateDisplay'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatNpr, toPage } from '../utils'
import { Modal, SectionCard, Spinner, StatCard, StatsGrid, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import { Truck, Plus, TrendingDown, CalendarDays } from 'lucide-react'
import type { ApiPage, Payment } from '../types/accounting'

export default function SupplierPaymentsPage() {
  const { fyYear } = useAccountingFy()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)

  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'outgoing', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?type=outgoing&page_size=200`, fyYear)).then(r => toPage<Payment>(r.data)),
  })

  const payments = data?.results ?? []
  const total = payments.reduce((acc, p) => acc + Number(p.amount), 0)

  return (
    <div className="space-y-4">
      {selectedPayment && (
        <Modal title={`Payment ${selectedPayment.payment_number}`} onClose={() => setSelectedPayment(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Party</p>
                <p className="text-sm font-semibold text-gray-800">{selectedPayment.party_name || selectedPayment.supplier_name || '—'}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-sm font-bold text-red-700 tabular-nums">{formatNpr(selectedPayment.amount)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-semibold text-gray-800"><DateDisplay adDate={selectedPayment.date} /></p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Method</p>
                <p className="text-sm font-semibold text-gray-800 capitalize">{(selectedPayment.method ?? '').replace('_', ' ') || '—'}</p>
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
                  <span className="text-gray-500">Bill</span>
                  <span className="text-gray-800">{selectedPayment.bill_number || '—'}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Bank Account</span>
                  <span className="text-gray-800">{selectedPayment.bank_account_name || '—'}</span>
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
                  <span className="text-gray-800">{selectedPayment.created_at ? <DateDisplay adDate={selectedPayment.created_at} /> : '—'}</span>
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

      <StatsGrid>
        <StatCard label="Payments Made" value={payments.length} icon={Truck} bg="bg-orange-50" color="text-orange-600" />
        <StatCard label="Total Paid Out" value={formatNpr(total)} icon={TrendingDown} bg="bg-red-50" color="text-red-600" />
        <StatCard label="This FY" value={`FY ${fyYear}`} icon={CalendarDays} bg="bg-gray-50" color="text-gray-600" />
      </StatsGrid>
      <SectionCard
        title="Supplier Payments"
        actions={
          <Link to="/accounting/quick-payment" className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus size={14} /> Record Payment
          </Link>
        }
      >
        {isLoading ? <div className="py-12"><Spinner /></div> : (
          <TableContainer className="min-w-[720px]">
            <thead className={tableHeadClass}>
              <tr>{['Payment #', 'Date', 'Bill', 'Method', 'Amount', 'Bank', 'Ref'].map(h => (
                <th key={h} className={tableHeaderCellClass}>{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No supplier payments found for this period.</td></tr>
              ) : payments.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="hover:bg-gray-50/60 cursor-pointer"
                  title="Click to view payment details"
                >
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                  <td className="px-4 py-3 text-gray-600"><DateDisplay adDate={p.date} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.bill_number || '—'}</td>
                  <td className="px-4 py-3 text-xs capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-semibold text-red-700 tabular-nums">{formatNpr(p.amount)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.bank_account_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{p.reference || '—'}</td>
                </tr>
              ))}
            </tbody>
          </TableContainer>
        )}
      </SectionCard>
    </div>
  )
}
