import { useState, type FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useConfirm } from '../../../components/ConfirmDialog'
import NepaliDatePicker from '../../../components/NepaliDatePicker'
import toast from 'react-hot-toast'
import { Search, Plus, CheckCircle2, XCircle, ArrowRightCircle } from 'lucide-react'
import { useAccountingFy } from '../hooks'
import { formatBsDate, formatNpr } from '../utils'
import { fetchExpenses, createExpense, approveExpense, rejectExpense, postExpense } from '../services'
import { Badge, Spinner, EmptyState, Modal, Field, inputCls, SectionCard, TableContainer, tableHeadClass, tableHeaderCellClass, tableCellClass, tableNumericCellClass } from '../components/accountingShared'
import type { ApiPage, Expense } from '../types/accounting'

const STATUS_OPTIONS = ['all', 'draft', 'submitted', 'approved', 'rejected', 'posted'] as const
const EXPENSE_CATEGORIES = [
  { value: 'travel', label: 'Travel' },
  { value: 'meals', label: 'Meals & Entertainment' },
  { value: 'office_supplies', label: 'Office Supplies' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'maintenance', label: 'Maintenance & Repairs' },
  { value: 'marketing', label: 'Marketing & Advertising' },
  { value: 'training', label: 'Training & Development' },
  { value: 'other', label: 'Other' },
  { value: 'custom', label: 'Custom' },
] as const

function ExpenseDetailModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  return (
    <Modal title={`Expense ${expense.id}`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Category</p>
            <p className="font-semibold text-gray-800">{expense.category_display || expense.category}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Status</p>
            <p className="font-semibold text-gray-800 capitalize">{expense.status_display || expense.status}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Date</p>
            <p className="font-semibold text-gray-800">{formatBsDate(expense.date)}</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-xs text-gray-500">Amount</p>
            <p className="font-semibold text-gray-800">{formatNpr(expense.amount)}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-gray-700">{expense.description || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700">{expense.notes || '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500">Account</p>
              <p className="text-sm text-gray-700">{expense.account_name || '—'}</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500">Payment Account</p>
              <p className="text-sm text-gray-700">{expense.payment_account_name || '—'}</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Close</button>
        </div>
      </div>
    </Modal>
  )
}

export default function ExpensesPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { fyYear } = useAccountingFy()
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null)
  const [newExpense, setNewExpense] = useState({
    category: 'other',
    custom_category: '',
    description: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  const create = useMutation({
    mutationFn: (payload: unknown) => createExpense(payload),
    onSuccess: () => {
      toast.success('Expense created')
      setShowCreate(false)
      setNewExpense({
        category: 'other',
        custom_category: '',
        description: '',
        amount: '',
        date: new Date().toISOString().slice(0, 10),
        notes: '',
      })
      qc.invalidateQueries({ queryKey: ['expenses'] })
      qc.invalidateQueries({ queryKey: ['report'] })
    },
    onError: () => toast.error('Failed to create expense'),
  })

  const { data, isLoading } = useQuery<ApiPage<Expense>>({
    queryKey: ['expenses', statusFilter, search, fyYear],
    queryFn: () => {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
      if (fyYear) params.set('fiscal_year', String(fyYear))
      if (search) params.set('search', search)
      params.set('page_size', '100')
      return fetchExpenses(params.toString())
    },
  })

  const approve = useMutation({
    mutationFn: (id: number) => approveExpense(id),
    onSuccess: () => { toast('Expense approved', { icon: '✅' }); qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['report'] }) },
    onError: () => toast.error('Action failed'),
  })
  const reject = useMutation({
    mutationFn: (id: number) => rejectExpense(id),
    onSuccess: () => { toast('Expense rejected', { icon: '✅' }); qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['report'] }) },
    onError: () => toast.error('Action failed'),
  })
  const post = useMutation({
    mutationFn: (id: number) => postExpense(id),
    onSuccess: () => { toast('Expense posted', { icon: '✅' }); qc.invalidateQueries({ queryKey: ['expenses'] }); qc.invalidateQueries({ queryKey: ['report'] }) },
    onError: () => toast.error('Action failed'),
  })

  const canSubmit = newExpense.description.trim().length > 0 && Number(newExpense.amount) > 0

  const handleCreateExpense = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    create.mutate({
      category: newExpense.category,
      custom_category: newExpense.category === 'custom' ? newExpense.custom_category : '',
      description: newExpense.description,
      amount: newExpense.amount,
      date: newExpense.date,
      notes: newExpense.notes,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Plus size={14} /> New Expense
          </button>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map(status => (
              <option key={status} value={status}>{status === 'all' ? 'All statuses' : status.charAt(0).toUpperCase() + status.slice(1)}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              data-lpignore="true"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search expense description…"
              className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
        </div>
        <span className="text-sm text-gray-400">{data?.count ?? 0} expense{data?.count === 1 ? '' : 's'}</span>
      </div>

      {showCreate && (
        <Modal title="New Expense" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreateExpense} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Category">
                <select
                  value={newExpense.category}
                  onChange={e => setNewExpense(prev => ({ ...prev, category: e.target.value as string }))}
                  className={inputCls}
                >
                  {EXPENSE_CATEGORIES.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </Field>
              {newExpense.category === 'custom' ? (
                <Field label="Custom Category">
                  <input
                    data-lpignore="true"
                    value={newExpense.custom_category}
                    onChange={e => setNewExpense(prev => ({ ...prev, custom_category: e.target.value }))}
                    className={inputCls}
                    placeholder="Custom category"
                  />
                </Field>
              ) : null}
            </div>
            <Field label="Description">
              <input
                data-lpignore="true"
                value={newExpense.description}
                onChange={e => setNewExpense(prev => ({ ...prev, description: e.target.value }))}
                className={inputCls}
                placeholder="Expense description"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Amount">
                <input
                  data-lpignore="true"
                  type="number"
                  min="0"
                  step="0.01"
                  value={newExpense.amount}
                  onChange={e => setNewExpense(prev => ({ ...prev, amount: e.target.value }))}
                  className={inputCls}
                  placeholder="0.00"
                  required
                />
              </Field>
              <Field label="Date">
                <NepaliDatePicker
                  value={newExpense.date}
                  onChange={value => setNewExpense(prev => ({ ...prev, date: value }))}
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={newExpense.notes}
                onChange={e => setNewExpense(prev => ({ ...prev, notes: e.target.value }))}
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="Optional notes"
              />
            </Field>
            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button type="submit" disabled={!canSubmit || create.isPending}
                className="px-5 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
                {create.isPending ? 'Saving...' : 'Save Expense'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {detailExpense && <ExpenseDetailModal expense={detailExpense} onClose={() => setDetailExpense(null)} />}
      {isLoading ? <Spinner /> : (
        <SectionCard>
          <TableContainer className="min-w-[900px]">
              <thead className={tableHeadClass}>
              <tr>
                {['Category','Description','Date','Account','Payment','Amount','Status','Submitted By','Actions'].map(h => (
                  <th key={h} className={tableHeaderCellClass}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.results?.length ? data.results.map(expense => (
                <tr key={expense.id} onClick={() => setDetailExpense(expense)} className="hover:bg-gray-50/50 cursor-pointer">
                  <td className="px-4 py-3 text-sm text-gray-700">{expense.category_display || expense.category || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 max-w-[240px] truncate">{expense.description || expense.notes || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{formatBsDate(expense.date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{expense.account_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{expense.payment_account_name || '—'}</td>
                  <td className={tableNumericCellClass}>{formatNpr(expense.amount)}</td>
                  <td className={tableCellClass}><Badge status={expense.status_display || expense.status} /></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{expense.submitted_by_name || '—'}</td>
                  <td className="px-4 py-3 space-x-1 text-right">
                    {expense.status === 'draft' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); approve.mutate(expense.id) }}
                        className="px-2 py-1 text-xs bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100"
                        title="Approve expense"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    )}
                    {expense.status === 'submitted' && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); confirm({ title: 'Reject Expense', message: `Reject ${expense.category_display || 'expense'}?`, variant: 'danger', confirmLabel: 'Reject' }).then(ok => { if (ok) reject.mutate(expense.id) }) }}
                          className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100"
                          title="Reject expense"
                        >
                          <XCircle size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); approve.mutate(expense.id) }}
                          className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100"
                          title="Approve expense"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      </>
                    )}
                    {expense.status === 'approved' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); post.mutate(expense.id) }}
                        className="px-2 py-1 text-xs bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100"
                        title="Post expense"
                      >
                        <ArrowRightCircle size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-sm text-gray-400">No expenses found.</td>
                </tr>
              )}
            </tbody>
          </TableContainer>
          {!data?.results?.length && <EmptyState message="No expenses found." />}
        </SectionCard>
      )}
    </div>
  )
}
