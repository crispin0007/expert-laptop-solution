import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import DateDisplay from '../../../components/DateDisplay'
import { Loader2, ShieldCheck, CheckCircle, XCircle } from 'lucide-react'
import type { Invoice } from '../types/accounting'

const FIN_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Pending Payment',  cls: 'bg-gray-100 text-gray-500'      },
  submitted: { label: 'Awaiting Review',  cls: 'bg-yellow-100 text-yellow-700'  },
  approved:  { label: 'Approved',         cls: 'bg-emerald-100 text-emerald-700'},
  rejected:  { label: 'Rejected',         cls: 'bg-red-100 text-red-600'        },
}

// ─── Finance Review Tab ──────────────────────────────────────────────────────

export default function FinanceReviewPage() {
  const qc = useQueryClient()
  const [finNotes, setFinNotes] = useState<Record<number, string>>({})
  const [reviewing, setReviewing] = useState<number | null>(null)

  const { data: submitted = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', 'finance-review'],
    queryFn: () =>
      apiClient
        .get(ACCOUNTING.INVOICES_PENDING_FINANCE)
        .then(r => (Array.isArray(r.data) ? r.data : (r.data.data ?? r.data.results ?? []))),
    refetchInterval: 30_000,
  })

  function handleReview(inv: Invoice, action: 'approve' | 'reject') {
    const notes = finNotes[inv.id] ?? ''
    if (action === 'reject' && !notes.trim()) {
      toast.error('Notes are required when rejecting')
      return
    }
    setReviewing(inv.id)
    apiClient
      .post(ACCOUNTING.INVOICE_FINANCE_REVIEW(inv.id), { action, notes })
      .then(() => {
        toast.success(action === 'approve'
          ? `Invoice ${inv.invoice_number} approved — ticket closed & coins queued`
          : `Invoice ${inv.invoice_number} rejected`)
        setReviewing(null)
        qc.invalidateQueries({ queryKey: ['invoices', 'finance-review'] })
      })
      .catch((err: any) => {
        toast.error(err?.response?.data?.detail || 'Review failed')
        setReviewing(null)
      })
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={28} className="animate-spin text-indigo-400" />
      </div>
    )
  }

  if (submitted.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <ShieldCheck size={36} className="mx-auto mb-3 text-emerald-400" />
        <p className="font-medium text-gray-500">No invoices pending finance review</p>
        <p className="text-sm mt-1">All submitted invoices have been processed.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ShieldCheck size={16} className="text-yellow-600" />
        <p className="text-sm text-gray-600 font-medium">
          {submitted.length} invoice{submitted.length !== 1 ? 's' : ''} awaiting finance review
        </p>
      </div>

      {submitted.map(inv => {
        const fsCfg = FIN_STATUS_CFG[inv.finance_status] ?? { label: inv.finance_status, cls: 'bg-gray-100 text-gray-500' }
        const isProcessing = reviewing === inv.id
        return (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-gray-800 text-sm font-mono">#{inv.invoice_number}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${fsCfg.cls}`}>
                    {fsCfg.label}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{inv.customer_name || '—'}</p>
                {inv.ticket && (
                  <p className="text-xs text-indigo-500 mt-0.5">Ticket #{inv.ticket}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xl font-bold text-gray-800">Rs. {parseFloat(inv.total).toFixed(2)}</p>
                <p className="text-xs text-gray-400">Paid: Rs. {parseFloat(inv.amount_paid).toFixed(2)}</p>
                {parseFloat(inv.amount_due) > 0 && (
                  <p className="text-xs text-red-500 font-medium">Due: Rs. {parseFloat(inv.amount_due).toFixed(2)}</p>
                )}
              </div>
            </div>

            {/* Line items summary */}
            <div className="bg-gray-50 rounded-lg p-3 divide-y divide-gray-100 text-sm">
              {inv.line_items.map((li, i) => (
                <div key={i} className="flex justify-between py-1.5">
                  <span className="text-gray-600">
                    {li.description ?? li.name}
                    {(li as any).line_type && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium
                        ${(li as any).line_type === 'service' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'}`}>
                        {(li as any).line_type}
                      </span>
                    )}
                  </span>
                  <span className="text-gray-700 font-medium">
                    {(li.amount ?? li.total) ? `Rs. ${parseFloat(String(li.amount ?? li.total)).toFixed(2)}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Totals row */}
            <div className="flex gap-6 text-sm text-gray-500">
              <span>Subtotal: <strong className="text-gray-700">Rs. {parseFloat(inv.subtotal).toFixed(2)}</strong></span>
              <span>VAT: <strong className="text-gray-700">Rs. {parseFloat(inv.vat_amount).toFixed(2)}</strong></span>
              <span>Created: <strong className="text-gray-700"><DateDisplay adDate={inv.created_at} compact /></strong></span>
            </div>

            {/* Notes input + approve/reject */}
            <div className="space-y-2 pt-1 border-t border-gray-100">
              <textarea
                rows={2}
                value={finNotes[inv.id] ?? ''}
                onChange={e => setFinNotes(prev => ({ ...prev, [inv.id]: e.target.value }))}
                placeholder="Finance notes (required when rejecting)…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview(inv, 'approve')}
                  disabled={isProcessing}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {isProcessing
                    ? <Loader2 size={13} className="animate-spin" />
                    : <CheckCircle size={13} />}
                  Approve — Close Ticket
                </button>
                <button
                  onClick={() => handleReview(inv, 'reject')}
                  disabled={isProcessing || !(finNotes[inv.id] ?? '').trim()}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 transition"
                >
                  {isProcessing
                    ? <Loader2 size={13} className="animate-spin" />
                    : <XCircle size={13} />}
                  Reject
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

