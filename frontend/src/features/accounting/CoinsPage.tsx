import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../api/client'
import { ACCOUNTING, STAFF } from '../../api/endpoints'
import Modal from '../../components/Modal'
import toast from 'react-hot-toast'
import {
  CheckCircle2, XCircle, Loader2, Coins, History, Plus,
} from 'lucide-react'
import { useAuthStore, isManager } from '../../store/authStore'

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

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
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
                      {fmt(c.created_at)}
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

export default function CoinsPage() {
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)
  const managerView = isManager(user)

  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | ''>('pending')
  const [showAwardCoins, setShowAwardCoins] = useState(false)

  const { data: coins = [], isLoading } = useQuery<CoinTxn[]>({
    queryKey: ['coins', statusFilter],
    queryFn: () => {
      const params = statusFilter ? `?status=${statusFilter}` : ''
      return apiClient.get(ACCOUNTING.COINS + params).then(r =>
        Array.isArray(r.data) ? r.data : r.data.results ?? []
      )
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_APPROVE(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coins'] }); toast.success('Coins approved') },
    onError: () => toast.error('Failed to approve'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_REJECT(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['coins'] }); toast.success('Coins rejected') },
    onError: () => toast.error('Failed to reject'),
  })

  const pendingCount = coins.filter(c => c.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Coins size={22} className="text-amber-500" /> Coins
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">Staff reward system — approve or reject coin transactions</p>
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

      {/* Coin Approval Queue */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-700 flex items-center gap-2">
            Coin Transactions
            {statusFilter === 'pending' && pendingCount > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">{pendingCount} pending</span>
            )}
          </h2>
          <div className="flex gap-1.5">
            {(['pending', 'approved', 'rejected', ''] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  statusFilter === s
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {s || 'All'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-gray-400 flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : coins.length === 0 ? (
          <div className="py-10 text-center">
            <Coins size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No {statusFilter || ''} coin transactions</p>
          </div>
        ) : (
          <div className="space-y-2">
            {coins.map(c => (
              <div key={c.id} className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                c.status === 'pending' ? 'bg-amber-50 border border-amber-100' :
                c.status === 'approved' ? 'bg-green-50 border border-green-100' :
                'bg-gray-50 border border-gray-100'
              }`}>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {c.staff_name || `Staff #${c.staff}`}
                    {' · '}
                    <span className={c.status === 'pending' ? 'text-amber-600' : 'text-gray-500'}>
                      {c.amount} coin{parseFloat(c.amount) !== 1 ? 's' : ''}
                    </span>
                  </p>
                  <p className="text-xs text-gray-400">
                    {c.source_type} #{c.source_id} · {fmt(c.created_at)}
                    {c.note && <span className="ml-2 italic">"{c.note}"</span>}
                  </p>
                </div>
                {c.status === 'pending' && managerView ? (
                  <div className="flex gap-2">
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
                  <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${
                    c.status === 'approved' ? 'bg-green-100 text-green-700' :
                    c.status === 'rejected' ? 'bg-red-100 text-red-600' :
                    'bg-gray-200 text-gray-500'
                  }`}>
                    {c.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
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
          }}
        />
      )}
    </div>
  )
}
