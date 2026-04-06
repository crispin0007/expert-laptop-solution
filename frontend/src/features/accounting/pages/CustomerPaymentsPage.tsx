import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import DateDisplay from '../../../components/DateDisplay'
import { Modal, SectionCard, Spinner, StatCard, StatsGrid, TableContainer, tableHeadClass, tableHeaderCellClass } from '../components/accountingShared'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatBsDate, formatNpr, toPage } from '../utils'
import { TrendingUp, Users, CalendarDays } from 'lucide-react'
import type { ApiPage, Payment } from '../types/accounting'

function paymentPartyName(p: Payment): string {
  return p.party_name || p.supplier_name || p.customer_name || '—'
}

const fmt = (value: string | null | undefined) => value ? formatBsDate(value) : '—'
const npr = formatNpr

export default function CustomerPaymentsPage() {
  const { fyYear } = useAccountingFy()
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const { data, isLoading } = useQuery<ApiPage<Payment>>({
    queryKey: ['payments', 'incoming', fyYear],
    queryFn: () => apiClient.get(addFyParam(`${ACCOUNTING.PAYMENTS}?type=incoming&page_size=200`, fyYear)).then(r => toPage<Payment>(r.data)),
  })
  const payments = data?.results ?? []
  const total = payments.reduce((a, p) => a + Number(p.amount), 0)

  return (
    <div className="space-y-4">
      {selectedPayment && (
        <Modal title={`Receipt ${selectedPayment.payment_number}`} onClose={() => setSelectedPayment(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Party</p>
                <p className="text-sm font-semibold text-gray-800">{paymentPartyName(selectedPayment)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Amount</p>
                <p className="text-sm font-bold text-emerald-700 tabular-nums">{npr(selectedPayment.amount)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs text-gray-500">Date</p>
                <p className="text-sm font-semibold text-gray-800">{fmt(selectedPayment.date)}</p>
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
                  <span className="text-gray-500">Receipt Number</span>
                  <span className="font-mono text-indigo-600">{selectedPayment.payment_number}</span>
                </div>
                <div className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Invoice</span>
                  <span className="text-gray-800">{selectedPayment.invoice_number || '—'}</span>
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
            {Number(selectedPayment.tds_rate || 0) > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1 text-sm">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Customer TDS</p>
                <div className="flex items-center justify-between"><span className="text-gray-600">TDS Rate</span><span className="font-medium">{(Number(selectedPayment.tds_rate) * 100).toFixed(2)}%</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">TDS Withheld</span><span className="font-medium tabular-nums">{npr(selectedPayment.tds_withheld_amount || 0)}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">Net Receipt</span><span className="font-medium tabular-nums">{npr(selectedPayment.net_receipt_amount || selectedPayment.amount)}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray-600">Reference</span><span className="font-medium">{selectedPayment.tds_reference || '—'}</span></div>
              </div>
            )}
          </div>
        </Modal>
      )}

      <StatsGrid>
        <StatCard label="Total Receipts" value={payments.length} icon={Users} bg="bg-blue-50" color="text-blue-600" />
        <StatCard label="Total Received" value={npr(total)} icon={TrendingUp} bg="bg-green-50" color="text-green-600" />
        <StatCard label="This FY" value={`FY ${fyYear}`} icon={CalendarDays} bg="bg-gray-50" color="text-gray-600" />
      </StatsGrid>
      <SectionCard title="Customer Payments (Receipts)">
        {isLoading ? <div className="py-12"><Spinner /></div> : (
          <TableContainer className="min-w-[720px]">
            <thead className={tableHeadClass}>
              <tr>{['Receipt #', 'Date', 'Invoice', 'Method', 'Amount', 'Bank', 'Ref'].map(h => (
                <th key={h} className={tableHeaderCellClass}>{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payments.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-400">No customer payments found for this period.</td></tr>
              ) : payments.map(p => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedPayment(p)}
                  className="hover:bg-gray-50/60 cursor-pointer"
                  title="Click to view receipt details"
                >
                  <td className="px-4 py-3 font-mono text-xs text-indigo-600">{p.payment_number}</td>
                  <td className="px-4 py-3 text-gray-600"><DateDisplay adDate={p.date} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.invoice_number || '—'}</td>
                  <td className="px-4 py-3 text-xs capitalize text-gray-500">{(p.method ?? '').replace('_', ' ')}</td>
                  <td className="px-4 py-3 font-semibold text-green-700 tabular-nums">{npr(p.amount)}</td>
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
