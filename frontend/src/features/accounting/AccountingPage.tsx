import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { ACCOUNTING, CUSTOMERS } from '../../api/endpoints'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { FileText, Loader2, CreditCard, XCircle, Plus } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LineItem {
  name: string
  qty: number
  unit_price: string
  discount?: string
}

interface Invoice {
  id: number
  invoice_number: string
  customer: number | null
  customer_name: string
  ticket: number | null
  ticket_number: string
  project: number | null
  project_name: string
  line_items: LineItem[]
  subtotal: string
  discount: string
  vat_rate: string
  vat_amount: string
  total: string
  status: string
  due_date: string | null
  paid_at: string | null
  notes: string
  created_at: string
}

interface Customer {
  id: number
  name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft:  'bg-gray-100 text-gray-500',
  issued: 'bg-blue-100 text-blue-700',
  paid:   'bg-green-100 text-green-700',
  void:   'bg-red-100 text-red-500',
}

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Invoice Detail Modal ──────────────────────────────────────────────────────

function InvoiceDetailModal({
  invoice, onClose, onUpdated,
}: {
  invoice: Invoice
  onClose: () => void
  onUpdated: () => void
}) {
  const markPaidMutation = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.INVOICE_MARK_PAID(invoice.id)),
    onSuccess: () => { toast.success('Invoice marked as paid'); onUpdated() },
    onError: () => toast.error('Failed to mark as paid'),
  })

  const voidMutation = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.INVOICE_VOID(invoice.id)),
    onSuccess: () => { toast.success('Invoice voided'); onUpdated() },
    onError: () => toast.error('Failed to void invoice'),
  })

  const subtotal  = parseFloat(invoice.subtotal   || '0')
  const discount  = parseFloat(invoice.discount   || '0')
  const vatAmount = parseFloat(invoice.vat_amount || '0')
  const vatRate   = parseFloat(invoice.vat_rate   || '0')
  const total     = parseFloat(invoice.total      || '0')

  return (
    <Modal open onClose={onClose} title={`Invoice ${invoice.invoice_number || `#${invoice.id}`}`} width="max-w-xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { label: 'Customer', value: invoice.customer_name || '—' },
            { label: 'Status',   value: (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[invoice.status]}`}>
                {invoice.status}
              </span>
            )},
            { label: 'Ticket',   value: invoice.ticket_number || '—' },
            { label: 'Due Date', value: invoice.due_date ? fmt(invoice.due_date) : '—' },
            { label: 'Created',  value: fmt(invoice.created_at) },
            { label: 'Paid At',  value: invoice.paid_at ? fmt(invoice.paid_at) : '—' },
          ].map(item => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-2.5">
              <p className="text-xs text-gray-400 mb-0.5">{item.label}</p>
              <p className="text-gray-800 font-medium text-xs">{item.value}</p>
            </div>
          ))}
        </div>

        {invoice.line_items && invoice.line_items.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-1.5">Item</th>
                  <th className="text-center pb-1.5">Qty</th>
                  <th className="text-right pb-1.5">Unit Price</th>
                  <th className="text-right pb-1.5">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.line_items.map((item, i) => {
                  const lineTotal = parseFloat(item.unit_price) * item.qty - parseFloat(item.discount || '0')
                  return (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-800">{item.name}</td>
                      <td className="py-1.5 text-center text-gray-500">{item.qty}</td>
                      <td className="py-1.5 text-right text-gray-600">Rs. {parseFloat(item.unit_price).toFixed(2)}</td>
                      <td className="py-1.5 text-right font-medium text-gray-800">Rs. {lineTotal.toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span><span>Rs. {subtotal.toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Discount</span><span>− Rs. {discount.toFixed(2)}</span>
            </div>
          )}
          {vatAmount > 0 && (
            <div className="flex justify-between text-gray-500">
              <span>VAT ({(vatRate * 100).toFixed(0)}%)</span><span>Rs. {vatAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-gray-900 text-base pt-1 border-t border-gray-100">
            <span>Total</span><span>Rs. {total.toFixed(2)}</span>
          </div>
        </div>

        {invoice.notes && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">{invoice.notes}</p>
        )}

        <div className="flex gap-2 pt-1">
          {['draft', 'issued'].includes(invoice.status) && (
            <button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60"
            >
              {markPaidMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
              Mark as Paid
            </button>
          )}
          {invoice.status !== 'void' && (
            <button
              onClick={() => voidMutation.mutate()}
              disabled={voidMutation.isPending}
              className="flex items-center justify-center gap-1.5 border border-red-300 text-red-600 px-4 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-60"
            >
              {voidMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
              Void
            </button>
          )}
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────

function CreateInvoiceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [notes, setNotes]          = useState('')
  const [dueDate, setDueDate]      = useState('')
  const [lineItems, setLineItems]  = useState([{ name: '', qty: 1, unit_price: '', discount: '0' }])

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-list'],
    queryFn: () => apiClient.get(CUSTOMERS.LIST).then(r =>
      Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
    ),
  })

  const mutation = useMutation({
    mutationFn: () => apiClient.post(ACCOUNTING.INVOICE_GENERATE, {
      customer: customerId || null,
      line_items: lineItems.filter(l => l.name && l.unit_price),
      notes,
      due_date: dueDate || null,
    }),
    onSuccess: () => { toast.success('Invoice created and issued'); onCreated() },
    onError: () => toast.error('Failed to create invoice'),
  })

  const updateLine = (i: number, k: keyof typeof lineItems[0], v: string | number) => {
    setLineItems(ls => ls.map((l, idx) => idx === i ? { ...l, [k]: v } : l))
  }

  return (
    <Modal open onClose={onClose} title="Create Invoice" width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Customer</label>
            <select
              value={customerId}
              onChange={e => setCustomerId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— No customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Line Items</h3>
          <div className="space-y-2">
            {lineItems.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input
                  className="col-span-5 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Item name"
                  value={line.name}
                  onChange={e => updateLine(i, 'name', e.target.value)}
                />
                <input
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Qty"
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={e => updateLine(i, 'qty', Number(e.target.value))}
                />
                <input
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Price"
                  type="number"
                  step="0.01"
                  value={line.unit_price}
                  onChange={e => updateLine(i, 'unit_price', e.target.value)}
                />
                <input
                  className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Disc"
                  type="number"
                  step="0.01"
                  value={line.discount}
                  onChange={e => updateLine(i, 'discount', e.target.value)}
                />
                <button
                  onClick={() => setLineItems(ls => ls.filter((_, idx) => idx !== i))}
                  disabled={lineItems.length === 1}
                  className="col-span-1 text-red-400 hover:text-red-600 disabled:opacity-30 text-center"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setLineItems(ls => [...ls, { name: '', qty: 1, unit_price: '', discount: '0' }])}
            className="mt-2 flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
          >
            <Plus size={12} /> Add line
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Optional notes"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={lineItems.filter(l => l.name && l.unit_price).length === 0 || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Generate Invoice
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page (Invoices only) ─────────────────────────────────────────────────

export default function AccountingPage() {
  const qc = useQueryClient()

  const [statusFilter, setStatusFilter]           = useState('')
  const [selectedInvoice, setSelectedInvoice]     = useState<Invoice | null>(null)
  const [showCreateInvoice, setShowCreateInvoice] = useState(false)

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', statusFilter],
    queryFn: () => {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      return apiClient.get(ACCOUNTING.INVOICES + params).then(r =>
        Array.isArray(r.data) ? r.data : r.data.results ?? []
      )
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FileText size={22} className="text-indigo-400" /> Accounting
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Invoices and billing</p>
        </div>
        <button
          onClick={() => setShowCreateInvoice(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
        >
          <Plus size={15} /> New Invoice
        </button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 mb-5">
        {(['all', 'draft', 'issued', 'paid', 'void'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === 'all' ? '' : s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${
              (s === 'all' ? statusFilter === '' : statusFilter === s)
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Invoice table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="text-center py-10 text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-14 text-center">
            <FileText size={36} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No invoices yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-3 text-left">Invoice #</th>
                <th className="px-5 py-3 text-left">Customer</th>
                <th className="px-5 py-3 text-left">Reference</th>
                <th className="px-5 py-3 text-right">Total</th>
                <th className="px-5 py-3 text-left">Status</th>
                <th className="px-5 py-3 text-left">Due</th>
                <th className="px-5 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map(inv => (
                <tr
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className="hover:bg-indigo-50 transition cursor-pointer"
                >
                  <td className="px-5 py-3 font-mono text-indigo-600 text-xs font-semibold">
                    {inv.invoice_number || `#${inv.id}`}
                  </td>
                  <td className="px-5 py-3 text-gray-700">{inv.customer_name || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {inv.ticket_number
                      ? `TKT: ${inv.ticket_number}`
                      : inv.project_name
                      ? `PRJ: ${inv.project_name}`
                      : '—'}
                  </td>
                  <td className="px-5 py-3 text-right font-semibold text-gray-800">
                    Rs. {parseFloat(inv.total).toFixed(2)}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[inv.status]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {inv.due_date ? fmt(inv.due_date) : '—'}
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {fmt(inv.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
          onUpdated={() => {
            setSelectedInvoice(null)
            qc.invalidateQueries({ queryKey: ['invoices'] })
          }}
        />
      )}

      {showCreateInvoice && (
        <CreateInvoiceModal
          onClose={() => setShowCreateInvoice(false)}
          onCreated={() => {
            setShowCreateInvoice(false)
            qc.invalidateQueries({ queryKey: ['invoices'] })
          }}
        />
      )}
    </div>
  )
}

