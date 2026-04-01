import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { ACCOUNTING, STAFF } from '../../api/endpoints'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import { useFyStore } from '../../store/fyStore'
import {
  CheckCircle2, XCircle, Loader2, Coins, History, Plus,
  X, Ticket, Package, Wrench, User, ArrowUpRight,
} from 'lucide-react'
import { usePermissions } from '../../hooks/usePermissions'
import DateDisplay from '../../components/DateDisplay'
import { useNavigate } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CoinTxn {
  id: number
  staff: number
  staff_name: string
  amount: string
  source_type: string
  source_id: number
  status: string
  note: string
  created_at: string
}

interface TicketContext {
  type: 'ticket'
  id: number
  ticket_number: string
  title: string
  customer_name: string | null
  department_name: string | null
  ticket_type_name: string | null
  status: string
  priority: string
  service_charge: string
  product_total: string
  billing_total: string
  product_count: number
  products: { name: string; quantity: number; unit_price: string; discount: string; line_total: string }[]
  closed_at: string | null
  assigned_to_name: string | null
}

interface TaskContext {
  type: 'task'
  id: number
  title: string
  project_name: string | null
  status: string
}

interface CoinTxnDetail extends CoinTxn {
  approved_by: number | null
  approved_by_name: string
  source_context: TicketContext | TaskContext | null
}

interface StaffUser {
  id: number
  full_name: string
  email: string
}

interface StaffCoinHistory {
  transactions: CoinTxn[]
  total_earned: number
  total_approved: number
  currency_value: number
}



// ── Coin Detail Drawer ────────────────────────────────────────────────────────

export function CoinDetailDrawer({ coinId, onClose, onApprove, onReject, canManage }: {
  coinId: number
  onClose: () => void
  onApprove: (id: number) => void
  onReject: (id: number) => void
  canManage: boolean
}) {
  const navigate = useNavigate()

  const { data: raw, isLoading } = useQuery({
    queryKey: ['coin-detail', coinId],
    queryFn: () => apiClient.get(ACCOUNTING.COIN_DETAIL(coinId)).then(r => r.data?.data ?? r.data),
  })

  const coin = raw as CoinTxnDetail | undefined
  const ctx  = coin?.source_context ?? null

  const statusColor = (s: string) =>
    s === 'approved' ? 'bg-green-100 text-green-700' :
    s === 'pending'  ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-600'

  const priorityColor = (p: string) =>
    p === 'critical' ? 'text-red-600' :
    p === 'high'     ? 'text-orange-500' :
    p === 'medium'   ? 'text-yellow-600' :
    'text-gray-400'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-amber-500" />
            <span className="font-semibold text-gray-800">Coin Transaction</span>
            {coin && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(coin.status)}`}>
                {coin.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={18} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : !coin ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
            Failed to load transaction.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Summary banner */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-lg shrink-0">
                {coin.amount}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  {coin.amount} coin{parseFloat(coin.amount) !== 1 ? 's' : ''}
                  <span className="text-gray-400 font-normal"> awarded to </span>
                  {coin.staff_name || `Staff #${coin.staff}`}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  <DateDisplay adDate={coin.created_at} />
                </p>
              </div>
            </div>

            {/* Staff + Approval */}
            <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
              <Row icon={<User size={13} className="text-indigo-400" />} label="Staff" value={coin.staff_name} />
              <Row icon={<Coins size={13} className="text-amber-400" />} label="Source" value={`${coin.source_type.replace('_', ' ')}${coin.source_id ? ` #${coin.source_id}` : ''}`} />
              {coin.approved_by_name && (
                <Row icon={<CheckCircle2 size={13} className="text-green-400" />} label="Approved by" value={coin.approved_by_name} />
              )}
              {coin.note && (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">Note</p>
                  <p className="text-sm text-gray-700 italic">"{coin.note}"</p>
                </div>
              )}
            </div>

            {/* Ticket context */}
            {ctx?.type === 'ticket' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Ticket size={12} /> Ticket Context
                  </p>
                  <button
                    onClick={() => { navigate(`/tickets/${ctx.id}`); onClose() }}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 transition"
                  >
                    {ctx.ticket_number} <ArrowUpRight size={11} />
                  </button>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800">{ctx.title}</p>
                    {ctx.customer_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{ctx.customer_name}</p>
                    )}
                  </div>
                  {ctx.department_name && (
                    <Row label="Department" value={ctx.department_name} />
                  )}
                  {ctx.ticket_type_name && (
                    <Row label="Type" value={ctx.ticket_type_name} />
                  )}
                  <div className="px-4 py-3 flex gap-6">
                    <div>
                      <p className="text-xs text-gray-400">Status</p>
                      <p className="text-xs font-medium text-gray-700 capitalize mt-0.5">{ctx.status.replace('_', ' ')}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Priority</p>
                      <p className={`text-xs font-semibold capitalize mt-0.5 ${priorityColor(ctx.priority)}`}>{ctx.priority}</p>
                    </div>
                    {ctx.closed_at && (
                      <div>
                        <p className="text-xs text-gray-400">Closed</p>
                        <p className="text-xs text-gray-700 mt-0.5">
                          <DateDisplay adDate={ctx.closed_at} compact />
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Billing breakdown */}
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Wrench size={12} /> Billing Breakdown
                </p>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {/* Service charge row */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-600 flex items-center gap-1.5">
                      <Wrench size={12} className="text-blue-400" /> Service charge
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      {parseFloat(ctx.service_charge) > 0 ? `NPR ${parseFloat(ctx.service_charge).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>

                  {/* Products header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                    <span className="text-sm text-gray-600 flex items-center gap-1.5">
                      <Package size={12} className="text-purple-400" /> Products / parts
                      {ctx.product_count > 0 && (
                        <span className="text-xs text-gray-400">({ctx.product_count})</span>
                      )}
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      {parseFloat(ctx.product_total) > 0 ? `NPR ${parseFloat(ctx.product_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                    </span>
                  </div>

                  {/* Individual product lines */}
                  {ctx.products.map((p, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 bg-gray-50/60 border-b border-gray-50 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-700 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">
                          {p.quantity} × NPR {parseFloat(p.unit_price).toLocaleString('en-IN')}
                          {parseFloat(p.discount) > 0 && ` − ${p.discount}%`}
                        </p>
                      </div>
                      <span className="text-xs font-medium text-gray-700 shrink-0 ml-3">
                        NPR {parseFloat(p.line_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}

                  {/* Total */}
                  <div className="flex items-center justify-between px-4 py-3 bg-gray-50 font-semibold">
                    <span className="text-sm text-gray-700">Total billed</span>
                    <span className="text-sm text-indigo-700">
                      NPR {parseFloat(ctx.billing_total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Task context */}
            {ctx?.type === 'task' && (
              <div className="bg-white border border-gray-100 rounded-xl divide-y divide-gray-50">
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">Task</p>
                  <p className="text-sm font-medium text-gray-800">{ctx.title}</p>
                  {ctx.project_name && (
                    <p className="text-xs text-gray-400 mt-0.5">Project: {ctx.project_name}</p>
                  )}
                </div>
                <Row label="Status" value={ctx.status.replace('_', ' ')} />
              </div>
            )}
          </div>
        )}

        {/* Footer actions */}
        {coin && coin.status === 'pending' && canManage && (
          <div className="p-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={() => { onApprove(coin.id); onClose() }}
              className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition"
            >
              <CheckCircle2 size={14} /> Approve
            </button>
            <button
              onClick={() => { onReject(coin.id); onClose() }}
              className="flex-1 flex items-center justify-center gap-1.5 border border-red-200 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition"
            >
              <XCircle size={14} /> Reject
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-gray-400 flex items-center gap-1.5">{icon}{label}</span>
      <span className="text-sm text-gray-700 font-medium capitalize">{value || '—'}</span>
    </div>
  )
}

// ── Award Coins Modal ─────────────────────────────────────────────────────────

function AwardCoinsModal({ open, onClose, onDone }: {
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [staffId, setStaffId] = useState<number | ''>('')
  const [amount, setAmount] = useState<number | ''>('')
  const [note, setNote] = useState('')

  const { data: staffList = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff-list-coins'],
    queryFn: () =>
      apiClient.get(STAFF.LIST).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post(ACCOUNTING.COINS_AWARD, {
        staff: staffId,
        amount: Number(amount),
        note,
        source_type: 'manual',
        source_id: 0,
      }),
    onSuccess: () => {
      toast.success('Coins awarded!')
      setStaffId('')
      setAmount('')
      setNote('')
      onDone()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast.error(msg ?? 'Failed to award coins')
    },
  })

  return (
    <Modal open={open} onClose={onClose} title="Award Coins Manually">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Staff Member <span className="text-red-400">*</span>
          </label>
          <select
            value={staffId}
            onChange={e => setStaffId(e.target.value ? Number(e.target.value) : '')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— Select staff —</option>
            {staffList.map(s => (
              <option key={s.id} value={s.id}>{s.full_name} ({s.email})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Coin Amount <span className="text-red-400">*</span>
          </label>
          <input
            type="number"
            min={1}
            value={amount}
            onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder="e.g. 5"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Reason for manual award…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => mutation.mutate()}
            disabled={!staffId || !amount || Number(amount) < 1 || mutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60 transition"
          >
            {mutation.isPending && <Loader2 size={13} className="animate-spin" />}
            Award Coins
          </button>
          <button onClick={onClose} className="flex-1 border border-gray-300 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Staff Coin History Panel ───────────────────────────────────────────────────

function StaffCoinHistoryPanel() {
  const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('')

  const { data: staffList = [] } = useQuery<StaffUser[]>({
    queryKey: ['staff-list-history'],
    queryFn: () =>
      apiClient.get(STAFF.LIST).then(r =>
        Array.isArray(r.data) ? r.data : (r.data.results ?? r.data.data ?? [])
      ),
  })

  const { data: history, isLoading } = useQuery<StaffCoinHistory>({
    queryKey: ['staff-coin-history', selectedStaffId],
    queryFn: () =>
      apiClient.get(ACCOUNTING.COINS_STAFF_HISTORY(selectedStaffId as number)).then(r => r.data),
    enabled: !!selectedStaffId,
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-700 flex items-center gap-2">
          <History size={16} className="text-indigo-400" /> Staff Coin History
        </h2>
        <select
          value={selectedStaffId}
          onChange={e => setSelectedStaffId(e.target.value ? Number(e.target.value) : '')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Select staff —</option>
          {staffList.map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      {!selectedStaffId && (
        <p className="text-sm text-gray-400 text-center py-6">Select a staff member to view their coin history.</p>
      )}

      {selectedStaffId && isLoading && (
        <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {selectedStaffId && history && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Earned', value: `${history.total_earned} coins` },
              { label: 'Approved', value: `${history.total_approved} coins` },
              { label: 'Currency Value', value: `Rs. ${history.currency_value?.toFixed(2) ?? '0.00'}` },
            ].map(card => (
              <div key={card.label} className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-400 mb-1">{card.label}</p>
                <p className="text-sm font-semibold text-amber-700">{card.value}</p>
              </div>
            ))}
          </div>

          {history.transactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No coin transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {history.transactions.map(c => (
                <div key={c.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                  c.status === 'approved' ? 'bg-green-50 border border-green-100' :
                  c.status === 'pending' ? 'bg-amber-50 border border-amber-100' :
                  'bg-gray-50 border border-gray-100'
                }`}>
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {c.amount} coin{parseFloat(c.amount) !== 1 ? 's' : ''}
                      <span className="text-gray-400 font-normal ml-2 text-xs">via {c.source_type}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      <DateDisplay adDate={c.created_at} compact />
                      {c.note && <span className="ml-2 italic">"{c.note}"</span>}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    c.status === 'approved' ? 'bg-green-100 text-green-700' :
                    c.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

interface CoinSummary {
  pending_count: number
  pending_total_coins: string
  approved_count: number
  approved_total_coins: string
  coin_to_money_rate: string
  approved_total_npr: string
}

export default function CoinsPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const managerView = can('can_approve_coins')
  const { fyYear } = useFyStore()

  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending')
  const [showAwardCoins, setShowAwardCoins] = useState(false)
  const [selectedCoinId, setSelectedCoinId] = useState<number | null>(null)

  // Summary — drives tab badges + approved NPR total card
  const { data: summary } = useQuery<CoinSummary>({
    queryKey: ['coins-summary', fyYear],
    queryFn: () => {
      const params: Record<string, string | number> = {}
      if (fyYear) params.fiscal_year = fyYear
      return apiClient.get(ACCOUNTING.COINS_SUMMARY, { params }).then(r => r.data?.data ?? r.data)
    },
  })

  // Coin list filtered by active tab
  const { data: coins = [], isLoading } = useQuery<CoinTxn[]>({
    queryKey: ['coins', activeTab, fyYear],
    queryFn: () => {
      const params: Record<string, string | number> = { status: activeTab }
      if (fyYear) params.fiscal_year = fyYear
      return apiClient.get(ACCOUNTING.COINS, { params }).then(r =>
        Array.isArray(r.data) ? r.data : r.data.data ?? r.data.results ?? []
      )
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_APPROVE(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coins'] })
      qc.invalidateQueries({ queryKey: ['coins-summary'] })
      qc.invalidateQueries({ queryKey: ['coin-detail'] })
      toast.success('Coins approved')
    },
    onError: () => toast.error('Failed to approve'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_REJECT(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coins'] })
      qc.invalidateQueries({ queryKey: ['coins-summary'] })
      qc.invalidateQueries({ queryKey: ['coin-detail'] })
      toast.success('Coins rejected')
    },
    onError: () => toast.error('Failed to reject'),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Coins size={22} className="text-amber-500" /> Coins
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Staff reward system — approved coins are automatically included in payslip</p>
        </div>
        {managerView && (
          <button
            onClick={() => setShowAwardCoins(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition"
          >
            <Plus size={14} /> Award Coins
          </button>
        )}
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
            <p className="text-xs text-amber-600 font-medium uppercase tracking-wide mb-1">Pending Approval</p>
            <p className="text-2xl font-bold text-amber-700">{summary.pending_count}</p>
            <p className="text-xs text-amber-500 mt-0.5">{summary.pending_total_coins} coins awaiting</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
            <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Approved</p>
            <p className="text-2xl font-bold text-green-700">{summary.approved_count}</p>
            <p className="text-xs text-green-500 mt-0.5">
              {summary.approved_total_coins} coins · NPR {Number(summary.approved_total_npr).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
            <p className="text-xs text-indigo-600 font-medium uppercase tracking-wide mb-1">Coin Rate</p>
            <p className="text-xl font-bold text-indigo-700">NPR {summary.coin_to_money_rate}</p>
            <p className="text-xs text-indigo-400 mt-0.5">per coin · used when generating payslip</p>
          </div>
        </div>
      )}

      {/* Main transactions panel */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Tab headers */}
        <div className="flex border-b border-gray-100">
          {([
            { key: 'pending'  as const, label: 'Pending Approval', count: summary?.pending_count  },
            { key: 'approved' as const, label: 'Approved',          count: summary?.approved_count },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition ${
                activeTab === tab.key
                  ? tab.key === 'pending'
                    ? 'border-amber-500 text-amber-700 bg-amber-50/40'
                    : 'border-green-500 text-green-700 bg-green-50/40'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.key
                    ? tab.key === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Approved tab — payslip info banner */}
        {activeTab === 'approved' && summary && Number(summary.approved_total_coins) > 0 && (
          <div className="bg-green-50 border-b border-green-100 px-6 py-3 flex items-center justify-between">
            <span className="text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={14} />
              <strong>{summary.approved_total_coins} coins</strong> approved
              {' · '}
              NPR {Number(summary.approved_total_npr).toLocaleString('en-IN')} total value
            </span>
            <span className="text-xs text-green-600 bg-green-100 px-2.5 py-1 rounded-full">
              Auto-included when generating payslip
            </span>
          </div>
        )}

        {/* List */}
        <div className="p-6">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : coins.length === 0 ? (
            <div className="py-10 text-center">
              <Coins size={32} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">
                {activeTab === 'pending' ? 'No pending coin transactions' : 'No approved coins yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {coins.map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedCoinId(c.id)}
                  className={`flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer hover:shadow-sm transition ${
                    c.status === 'pending'
                      ? 'bg-amber-50 border border-amber-100 hover:border-amber-200'
                      : 'bg-green-50 border border-green-100 hover:border-green-200'
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {c.staff_name || `Staff #${c.staff}`}
                      {' · '}
                      <span className={c.status === 'pending' ? 'text-amber-600' : 'text-green-600'}>
                        {c.amount} coin{parseFloat(c.amount) !== 1 ? 's' : ''}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {c.source_type}{c.source_id ? ` #${c.source_id}` : ''} · <DateDisplay adDate={c.created_at} compact />
                      {c.note && <span className="ml-2 italic">"{c.note}"</span>}
                    </p>
                  </div>
                  {c.status === 'pending' && managerView ? (
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => approveMutation.mutate(c.id)}
                        disabled={approveMutation.isPending}
                        className="text-emerald-600 hover:text-emerald-800 transition"
                        title="Approve"
                      >
                        <CheckCircle2 size={22} />
                      </button>
                      <button
                        onClick={() => rejectMutation.mutate(c.id)}
                        disabled={rejectMutation.isPending}
                        className="text-red-400 hover:text-red-600 transition"
                        title="Reject"
                      >
                        <XCircle size={22} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                      approved
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Staff coin history — manager only */}
      {managerView && <StaffCoinHistoryPanel />}

      {/* Award coins modal */}
      {showAwardCoins && (
        <AwardCoinsModal
          open={showAwardCoins}
          onClose={() => setShowAwardCoins(false)}
          onDone={() => {
            setShowAwardCoins(false)
            qc.invalidateQueries({ queryKey: ['coins'] })
            qc.invalidateQueries({ queryKey: ['coins-summary'] })
          }}
        />
      )}

      {/* Coin detail drawer */}
      {selectedCoinId !== null && (
        <CoinDetailDrawer
          coinId={selectedCoinId}
          onClose={() => setSelectedCoinId(null)}
          onApprove={id => approveMutation.mutate(id)}
          onReject={id => rejectMutation.mutate(id)}
          canManage={managerView}
        />
      )}
    </div>
  )
}
