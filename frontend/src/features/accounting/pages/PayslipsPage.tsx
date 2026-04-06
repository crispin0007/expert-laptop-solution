import { useState, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '../../../api/client'
import { ACCOUNTING, STAFF } from '../../../api/endpoints'
import toast from 'react-hot-toast'
import { useConfirm } from '../../../components/ConfirmDialog'
import { usePermissions } from '../../../hooks/usePermissions'
import { useAccountingFy } from '../hooks'
import { addFyParam, formatNpr, toPage } from '../utils'
import { adStringToBsDisplay, currentFiscalYear, fiscalYearAdParams } from '../../../utils/nepaliDate'
import { Modal, Spinner, EmptyState, Badge, Field, inputCls } from '../components/accountingShared'
import { Plus, Pencil, Trash2, ChevronRight, CheckCircle } from 'lucide-react'
import { CoinDetailDrawer } from '../CoinsPage'
import type { ApiPage, Payslip, CoinTx, StaffSalaryProfile, BankAccount, Payment } from '../types/accounting'

const npr = formatNpr
const fmt = (d: string) => d ? (adStringToBsDisplay(d)?.bs ?? '—') : '—'

function PayslipEditModal({ ps, onClose }: { ps: Payslip; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    base_salary: ps.base_salary,
    bonus: ps.bonus,
    deductions: ps.deductions,
    period_start: ps.period_start,
    period_end: ps.period_end,
  })
  const mutateSave = useMutation({
    mutationFn: (d: typeof form) => apiClient.patch(ACCOUNTING.PAYSLIP_DETAIL(ps.id), d),
    onSuccess: () => { toast.success('Payslip updated'); qc.invalidateQueries({ queryKey: ['payslips'] }); onClose() },
    onError: () => toast.error('Update failed'),
  })
  return (
    <Modal title={`Edit Payslip — ${ps.staff_name}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); mutateSave.mutate(form) }}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Period Start">
            <input data-lpignore="true" type="date" className={inputCls} value={form.period_start}
              onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
          </Field>
          <Field label="Period End">
            <input data-lpignore="true" type="date" className={inputCls} value={form.period_end}
              onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Base Salary">
            <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={form.base_salary}
              onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} />
          </Field>
          <Field label="Bonus">
            <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={form.bonus}
              onChange={e => setForm(f => ({ ...f, bonus: e.target.value }))} />
          </Field>
          <Field label="Deductions">
            <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={form.deductions}
              onChange={e => setForm(f => ({ ...f, deductions: e.target.value }))} />
          </Field>
        </div>
        <p className="text-xs text-gray-400">Net Pay = Base + Bonus + (Coins × Rate) − Deductions, recalculated on save.</p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={mutateSave.isPending} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
            {mutateSave.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function PaymentPickerModal({
  title, amount, description, bankAccounts, onClose, onSubmit, isPending,
}: {
  title: string
  amount: string
  description?: string
  bankAccounts: BankAccount[]
  onClose: () => void
  onSubmit: (method: string, bankId: number | null) => void
  isPending: boolean
}) {
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash')
  const [bankId, setBankId] = useState<number | null>(null)

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={e => {
          e.preventDefault()
          if (method !== 'cash' && !bankId) { toast.error('Please select a bank account'); return }
          onSubmit(method, method === 'cash' ? null : bankId)
        }}
      >
        <p className="text-sm text-gray-600">
          Amount: <span className="font-semibold text-indigo-700">{new Intl.NumberFormat('ne-NP', { style: 'currency', currency: 'NPR' }).format(parseFloat(amount))}</span>
        </p>
        <Field label="Payment Method *">
          <div className="flex gap-3">
            {[
              { value: 'cash', label: 'Cash' },
              { value: 'bank_transfer', label: 'Bank Transfer' },
              { value: 'cheque', label: 'Cheque' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer">
                <input data-lpignore="true"
                  type="radio"
                  name="payment_method"
                  value={opt.value}
                  checked={method === opt.value}
                  onChange={() => { setMethod(opt.value as typeof method); if (opt.value === 'cash') setBankId(null) }}
                  className="accent-indigo-600"
                />
                <span className="text-sm text-gray-700">{opt.label}</span>
              </label>
            ))}
          </div>
        </Field>
        {method !== 'cash' && (
          <Field label="Bank Account *">
            <select className={inputCls} value={bankId ?? ''} onChange={e => setBankId(Number(e.target.value) || null)} required>
              <option value="">— Select bank account —</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>{b.name} — {b.bank_name} ({b.account_number})</option>
              ))}
            </select>
          </Field>
        )}
        {description && <p className="text-xs text-gray-400">{description}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-60">
            {isPending ? 'Processing…' : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function MarkPaidModal({
  payslip, bankAccounts, onClose, onSubmit, isPending,
}: {
  payslip: Payslip
  bankAccounts: BankAccount[]
  onClose: () => void
  onSubmit: (method: string, bankId: number | null) => void
  isPending: boolean
}) {
  return (
    <PaymentPickerModal
      title={`Mark Paid — ${payslip.staff_name}`}
      amount={payslip.net_pay}
      description="This will record a salary outflow in the cash / bank ledger and mark the payslip as Paid."
      bankAccounts={bankAccounts}
      onClose={onClose}
      onSubmit={onSubmit}
      isPending={isPending}
    />
  )
}

function TransactionReceiptModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const npr = (v: string | number) => new Intl.NumberFormat('ne-NP', { style: 'currency', currency: 'NPR' }).format(Number(v))
  const fmt = (d: string) => d ? (adStringToBsDisplay(d)?.bs ?? '—') : '—'
  const methodLabel: Record<string, string> = {
    cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque', esewa: 'eSewa', khalti: 'Khalti',
  }
  const isIncoming = payment.type === 'incoming'

  return (
    <Modal title="Transaction Receipt" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-100">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <CheckCircle size={18} className="text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">Payment Recorded</p>
            <p className="text-xs text-green-600">Journal entry posted to ledger</p>
          </div>
          <span className="ml-auto font-mono text-xs font-semibold text-green-700 bg-green-100 px-2 py-1 rounded">
            {payment.payment_number}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Amount</p>
            <p className="font-semibold text-gray-900 text-base">{npr(payment.amount)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Direction</p>
            <p className={`font-medium ${isIncoming ? 'text-green-700' : 'text-red-700'}`}>
              {isIncoming ? '↑ Incoming' : '↓ Outgoing'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Method</p>
            <p className="text-gray-800">{methodLabel[payment.method] ?? payment.method}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Date</p>
            <p className="text-gray-800">{fmt(payment.date)}</p>
          </div>
          {payment.reference && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Reference</p>
              <p className="font-mono text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded inline-block">{payment.reference}</p>
            </div>
          )}
          {payment.invoice_number && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Invoice</p>
              <p className="font-mono text-xs text-indigo-700">{payment.invoice_number}</p>
            </div>
          )}
          {payment.bill_number && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Bill</p>
              <p className="font-mono text-xs text-indigo-700">{payment.bill_number}</p>
            </div>
          )}
          {payment.bank_account_name && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Bank Account</p>
              <p className="text-gray-800">{payment.bank_account_name}</p>
            </div>
          )}
          {payment.notes && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-gray-700 text-xs">{payment.notes}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 text-center pt-1">
          This transaction now appears in the {payment.bank_account_name ? 'bank statement' : 'cash ledger'}.
        </p>
        <div className="flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}

export default function PayslipsPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { can } = usePermissions()
  const [subTab, setSubTab] = useState<'payslips' | 'coins' | 'salaries'>('payslips')
  const [showGenerate, setShowGenerate] = useState(false)
  const [editPayslip, setEditPayslip] = useState<Payslip | null>(null)
  const [markPaidPayslip, setMarkPaidPayslip] = useState<Payslip | null>(null)
  const [payslipReceiptPayment, setPayslipReceiptPayment] = useState<Payment | null>(null)
  const [expandedPs, setExpandedPs] = useState<number | null>(null)
  const [showSalaryForm, setShowSalaryForm] = useState(false)
  const [editSalary, setEditSalary] = useState<StaffSalaryProfile | null>(null)
  const [salaryForm, setSalaryForm] = useState({ staff: '', base_salary: '0', tds_rate: '10', bonus_default: '0', effective_from: new Date().toISOString().slice(0, 10), notes: '' })
  const [selectedCoinId, setSelectedCoinId] = useState<number | null>(null)

  const { fyYear } = useAccountingFy()
  const { data: payslips, isLoading: psLoading } = useQuery<ApiPage<Payslip>>({
    queryKey: ['payslips', fyYear],
    queryFn: () => apiClient.get(addFyParam(ACCOUNTING.PAYSLIPS, fyYear)).then(r => toPage<Payslip>(r.data)),
  })
  const [coinStatusFilter, setCoinStatusFilter] = useState<'' | 'pending' | 'approved'>('pending')
  const [coinSourceFilter, setCoinSourceFilter] = useState<'' | 'ticket'>('')
  const { data: coins, isLoading: coinsLoading } = useQuery<ApiPage<CoinTx>>({
    queryKey: ['coins', coinStatusFilter, coinSourceFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (coinStatusFilter) params.set('status', coinStatusFilter)
      if (coinSourceFilter) params.set('source_type', coinSourceFilter)
      const qs = params.toString()
      return apiClient.get(qs ? `${ACCOUNTING.COINS}?${qs}` : ACCOUNTING.COINS).then(r => toPage<CoinTx>(r.data))
    },
  })
  const { data: staffList = [] } = useQuery<{ id: number; full_name: string; display_name: string; email: string }[]>({
    queryKey: ['staff-list'],
    queryFn: () => apiClient.get(STAFF.LIST + '?page_size=500').then(r => Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.results ?? [])),
    enabled: showGenerate || showSalaryForm,
  })
  const { data: salaryProfiles, isLoading: salaryLoading } = useQuery<ApiPage<StaffSalaryProfile>>({
    queryKey: ['salary-profiles'],
    queryFn: () => apiClient.get(ACCOUNTING.SALARY_PROFILES + '?page_size=200').then(r => toPage<StaffSalaryProfile>(r.data)),
  })
  const { data: bankAccountsList = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts-payslip'],
    queryFn: () => apiClient.get(ACCOUNTING.BANK_ACCOUNTS + '?page_size=100').then(r => r.data?.data ?? r.data?.results ?? []),
    enabled: !!markPaidPayslip,
  })

  const mutateIssue = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.PAYSLIP_ISSUE(id)),
    onSuccess: () => { toast.success('Payslip issued'); qc.invalidateQueries({ queryKey: ['payslips'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutatePay = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { payment_method: string; bank_account?: number | null } }) =>
      apiClient.post(ACCOUNTING.PAYSLIP_MARK_PAID(id), payload),
    onSuccess: (res) => {
      toast.success('Payslip marked as paid')
      setMarkPaidPayslip(null)
      if (res.data?.payment) setPayslipReceiptPayment(res.data.payment)
      qc.invalidateQueries({ queryKey: ['payslips'] })
    },
    onError: () => toast.error('Action failed'),
  })
  const mutateApprove = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_APPROVE(id)),
    onSuccess: () => { toast.success('Coin approved'); qc.invalidateQueries({ queryKey: ['coins'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateReject = useMutation({
    mutationFn: (id: number) => apiClient.post(ACCOUNTING.COIN_REJECT(id)),
    onSuccess: () => { toast.success('Coin rejected'); qc.invalidateQueries({ queryKey: ['coins'] }) },
    onError: () => toast.error('Action failed'),
  })
  const mutateDeletePayslip = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.PAYSLIP_DETAIL(id)),
    onSuccess: () => { toast.success('Payslip deleted'); qc.invalidateQueries({ queryKey: ['payslips'] }) },
    onError: () => toast.error('Delete failed'),
  })
  const mutateSalaryCreate = useMutation({
    mutationFn: (d: typeof salaryForm) => apiClient.post(ACCOUNTING.SALARY_PROFILES, { ...d, tds_rate: (parseFloat(d.tds_rate) / 100).toFixed(4) }),
    onSuccess: () => { toast.success('Salary profile saved'); qc.invalidateQueries({ queryKey: ['salary-profiles'] }); setShowSalaryForm(false); setSalaryForm({ staff: '', base_salary: '0', tds_rate: '10', bonus_default: '0', effective_from: new Date().toISOString().slice(0, 10), notes: '' }) },
    onError: (e: { response?: { data?: { detail?: string } } }) => toast.error(e?.response?.data?.detail ?? 'Save failed'),
  })
  const mutateSalaryUpdate = useMutation({
    mutationFn: ({ id, d }: { id: number; d: typeof salaryForm }) => apiClient.patch(ACCOUNTING.SALARY_PROFILE_DETAIL(id), { ...d, tds_rate: (parseFloat(d.tds_rate) / 100).toFixed(4) }),
    onSuccess: () => { toast.success('Salary profile updated'); qc.invalidateQueries({ queryKey: ['salary-profiles'] }); setEditSalary(null) },
    onError: () => toast.error('Update failed'),
  })
  const mutateSalaryDelete = useMutation({
    mutationFn: (id: number) => apiClient.delete(ACCOUNTING.SALARY_PROFILE_DETAIL(id)),
    onSuccess: () => { toast.success('Salary profile deleted'); qc.invalidateQueries({ queryKey: ['salary-profiles'] }) },
    onError: () => toast.error('Delete failed'),
  })

  const today = new Date().toISOString().slice(0, 10)
  const fyrStart = fiscalYearAdParams(currentFiscalYear()).date_from
  const [genForm, setGenForm] = useState({
    staff: '', period_start: fyrStart, period_end: today,
    base_salary: '0', bonus: '0', deductions: '0', tds_rate: '0', employee_pan: '',
  })
  const selectedStaffId = genForm.staff ? parseInt(genForm.staff) : null
  const matchedProfile = salaryProfiles?.results?.find(p => p.staff === selectedStaffId)
  useEffect(() => {
    if (matchedProfile) {
      setGenForm(f => ({
        ...f,
        base_salary: matchedProfile.base_salary,
        bonus: matchedProfile.bonus_default,
        tds_rate: (parseFloat(matchedProfile.tds_rate) * 100).toFixed(2),
      }))
    }
  }, [matchedProfile?.id])

  const mutateGenerate = useMutation({
    mutationFn: (payload: typeof genForm & { staff: string }) =>
      apiClient.post(ACCOUNTING.PAYSLIP_GENERATE, {
        ...payload,
        tds_rate: (parseFloat(payload.tds_rate) / 100).toFixed(4),
      }),
    onSuccess: () => {
      toast.success('Payslip generated')
      qc.invalidateQueries({ queryKey: ['payslips'] })
      qc.invalidateQueries({ queryKey: ['tds'] })
      setShowGenerate(false)
      setGenForm({ staff: '', period_start: fyrStart, period_end: today, base_salary: '0', bonus: '0', deductions: '0', tds_rate: '0', employee_pan: '' })
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      toast.error(e?.response?.data?.detail ?? 'Failed to generate payslip'),
  })

  return (
    <div className="space-y-4">
      {editPayslip && <PayslipEditModal ps={editPayslip} onClose={() => setEditPayslip(null)} />}
      {markPaidPayslip && (
        <MarkPaidModal
          payslip={markPaidPayslip}
          bankAccounts={bankAccountsList}
          onClose={() => setMarkPaidPayslip(null)}
          onSubmit={(method, bankId) => mutatePay.mutate({ id: markPaidPayslip.id, payload: { payment_method: method, bank_account: bankId } })}
          isPending={mutatePay.isPending}
        />
      )}
      {payslipReceiptPayment && (
        <TransactionReceiptModal payment={payslipReceiptPayment} onClose={() => setPayslipReceiptPayment(null)} />
      )}
      <div className="flex items-center justify-between border-b border-gray-200">
        <div className="flex gap-2">
          {(['payslips', 'coins', 'salaries'] as const).map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                subTab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'payslips' ? 'Payslips' : t === 'coins' ? 'Coin Transactions' : 'Staff Salaries'}
            </button>
          ))}
        </div>
        {subTab === 'payslips' && (
          <button
            onClick={() => setShowGenerate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition mb-1"
          >
            <Plus size={13} /> Generate Payslip
          </button>
        )}
        {subTab === 'salaries' && can('can_manage_accounting') && (
          <button
            onClick={() => { setSalaryForm({ staff: '', base_salary: '0', tds_rate: '10', bonus_default: '0', effective_from: new Date().toISOString().slice(0, 10), notes: '' }); setShowSalaryForm(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition mb-1"
          >
            <Plus size={13} /> Add Salary Profile
          </button>
        )}
      </div>

      {showGenerate && (
        <Modal title="Generate Payslip" onClose={() => setShowGenerate(false)}>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault()
              if (!genForm.staff) { toast.error('Select a staff member'); return }
              mutateGenerate.mutate(genForm)
            }}
          >
            <Field label="Staff Member *">
              <select
                className={inputCls}
                value={genForm.staff}
                onChange={e => setGenForm(f => ({ ...f, staff: e.target.value }))}
                required
              >
                <option value="">— Select staff —</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.email}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Period Start *">
                <input data-lpignore="true" type="date" className={inputCls} value={genForm.period_start} onChange={e => setGenForm(f => ({ ...f, period_start: e.target.value }))} />
              </Field>
              <Field label="Period End *">
                <input data-lpignore="true" type="date" className={inputCls} value={genForm.period_end} onChange={e => setGenForm(f => ({ ...f, period_end: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Base Salary">
                <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={genForm.base_salary}
                  onChange={e => setGenForm(f => ({ ...f, base_salary: e.target.value }))} />
              </Field>
              <Field label="Bonus">
                <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={genForm.bonus}
                  onChange={e => setGenForm(f => ({ ...f, bonus: e.target.value }))} />
              </Field>
              <Field label="Other Deductions">
                <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={genForm.deductions}
                  onChange={e => setGenForm(f => ({ ...f, deductions: e.target.value }))} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Salary TDS Rate %" hint="e.g. 10 for 10% on Base+Bonus. Leave 0 to skip.">
                <input data-lpignore="true" type="number" min="0" max="50" step="0.01" className={inputCls} value={genForm.tds_rate}
                  onChange={e => setGenForm(f => ({ ...f, tds_rate: e.target.value }))} />
              </Field>
              <Field label="Employee PAN (for TDS)">
                <input data-lpignore="true" type="text" className={inputCls} value={genForm.employee_pan} placeholder="e.g. 123456789"
                  onChange={e => setGenForm(f => ({ ...f, employee_pan: e.target.value }))} />
              </Field>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              The system aggregates all <strong>approved</strong> coin transactions within the period.
              <em> Net Pay = Base + Bonus + (Coins × Rate) − TDS − Other Deductions</em>.
                If TDS Rate {'>'} 0, a TDS entry is auto-created in the TDS tab and TDS amount is added to deductions.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowGenerate(false)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={mutateGenerate.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                {mutateGenerate.isPending ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {subTab === 'payslips' && (psLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['','Staff','Period','Base Salary','Coins','Gross','TDS','Deductions','Net Pay','Cash Out','Status','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payslips?.results?.map(p => {
                const hasBkdwn = (p.deduction_breakdown ?? []).length > 0
                const cashDiffers = p.cash_credit && p.cash_credit !== p.net_pay
                return (
                  <Fragment key={p.id}>
                    <tr
                      className={`hover:bg-gray-50/50 ${hasBkdwn ? 'cursor-pointer' : ''}`}
                      onClick={() => hasBkdwn && setExpandedPs(expandedPs === p.id ? null : p.id)}
                    >
                      <td className="px-3 py-3">
                        {hasBkdwn && <ChevronRight size={14} className={`text-gray-400 transition-transform ${expandedPs === p.id ? 'rotate-90' : ''}`} />}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{p.staff_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(p.period_start)} – {fmt(p.period_end)}</td>
                      <td className="px-4 py-3 text-gray-600">{npr(p.base_salary)}</td>
                      <td className="px-4 py-3 text-gray-600">{p.total_coins} × {p.coin_to_money_rate}</td>
                      <td className="px-4 py-3 text-gray-800">{npr(p.gross_amount)}</td>
                      <td className="px-4 py-3 text-orange-600">{Number(p.tds_amount) > 0 ? `(${npr(p.tds_amount)})` : '—'}</td>
                      <td className="px-4 py-3 text-red-600">{Number(p.deductions) > 0 ? `(${npr(p.deductions)})` : '—'}</td>
                      <td className="px-4 py-3 font-semibold text-indigo-700">{npr(p.net_pay)}</td>
                      <td className="px-4 py-3">
                        {p.cash_credit
                          ? <span className={`font-medium ${cashDiffers ? 'text-amber-600' : 'text-green-700'}`} title={cashDiffers ? `Net pay ${npr(p.net_pay)} vs cash ${npr(p.cash_credit)}` : 'Matches net pay'}>{npr(p.cash_credit)}</span>
                          : <span className="text-gray-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3"><Badge status={p.status} /></td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 flex-wrap items-center">
                          {p.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => setEditPayslip(p)} title="Edit Payslip" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} /></button>
                          )}
                          {p.status === 'draft' && (
                            <button onClick={() => mutateIssue.mutate(p.id)} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                          )}
                          {p.status === 'issued' && (
                            <button onClick={() => setMarkPaidPayslip(p)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Mark Paid</button>
                          )}
                          {p.status === 'draft' && can('can_manage_accounting') && (
                            <button onClick={() => confirm({ title: 'Delete Payslip', message: `Delete payslip for ${p.staff_name}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger' }).then(ok => { if (ok) mutateDeletePayslip.mutate(p.id) })} title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedPs === p.id && (p.deduction_breakdown ?? []).length > 0 && (
                      <tr>
                        <td colSpan={12} className="px-10 py-3 bg-orange-50/50">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Deduction Breakdown</p>
                          <table className="text-xs w-auto">
                            <thead>
                              <tr className="text-gray-400">
                                <th className="text-left pb-1 pr-8">Label</th>
                                <th className="text-left pb-1 pr-8">Account</th>
                                <th className="text-right pb-1">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.deduction_breakdown.map((d, i) => (
                                <tr key={i} className="border-t border-orange-100">
                                  <td className="py-1 pr-8 text-gray-700">{d.label}</td>
                                  <td className="py-1 pr-8 text-gray-400 font-mono">{d.account_code || '—'}</td>
                                  <td className="py-1 text-right text-red-600">({npr(d.amount)})</td>
                                </tr>
                              ))}
                              <tr className="border-t border-orange-200 font-semibold">
                                <td className="py-1 pr-8 text-gray-600">Total Deductions</td>
                                <td></td>
                                <td className="py-1 text-right text-red-700">({npr(p.deductions)})</td>
                              </tr>
                            </tbody>
                          </table>
                          {p.cash_credit && (
                            <p className="mt-2 text-xs text-gray-500">
                              Cash / Bank Credit (Gross − TDS − Deductions): <span className="font-semibold text-green-700">{npr(p.cash_credit)}</span>
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )})}
            </tbody>
          </table>
          {!payslips?.results?.length && <EmptyState message={'No payslips yet. Click "Generate Payslip" to create one from approved coin transactions.'} />}
        </div>
      ))}

      {subTab === 'coins' && (coinsLoading ? <Spinner /> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coin Transactions</span>
            <div className="flex gap-1 flex-wrap justify-end">
              {[['pending', ''] as const, ['approved', ''] as const, ['' , ''] as const].map(([s, src], i) => {
                const label = s === 'pending' && !src ? 'Pending' : s === 'approved' && !src ? 'Approved' : 'All'
                const active = coinStatusFilter === s && coinSourceFilter === src
                return (
                  <button key={i} onClick={() => { setCoinStatusFilter(s); setCoinSourceFilter(src) }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${active ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                    {label}
                  </button>
                )
              })}
              <span className="w-px h-5 bg-gray-200 self-center mx-0.5" />
              {[['pending', 'ticket'] as const, ['approved', 'ticket'] as const].map(([s, src], i) => {
                const label = s === 'pending' ? 'Ticket Pending' : 'Ticket Done'
                const active = coinStatusFilter === s && coinSourceFilter === src
                return (
                  <button key={i} onClick={() => { setCoinStatusFilter(s); setCoinSourceFilter(src) }}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition ${active ? 'bg-amber-100 text-amber-700' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'}`}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Staff','Amount','Source','Note','Status','Approved By','Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {coins?.results?.map(c => (
                <tr
                  key={c.id}
                  className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                  onClick={() => setSelectedCoinId(c.id)}
                >
                  <td className="px-4 py-3 text-gray-700">{c.staff_name}</td>
                  <td className="px-4 py-3 font-semibold text-indigo-700">{c.amount} coins</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.source_type === 'ticket' && c.source_id ? (
                      <a
                        href={`/tickets/${c.source_id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-indigo-600 hover:underline"
                      >
                        Ticket #{c.source_id}
                      </a>
                    ) : (
                      <span className="capitalize">{c.source_type.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">{c.note || '—'}</td>
                  <td className="px-4 py-3"><Badge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.approved_by_name ?? '—'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {c.status === 'pending' && (
                      <div className="flex gap-1">
                        <button onClick={() => mutateApprove.mutate(c.id)} className="px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>
                        <button onClick={() => mutateReject.mutate(c.id)} className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!coins?.results?.length && <EmptyState message={`No ${coinSourceFilter === 'ticket' ? 'ticket ' : ''}${coinStatusFilter || ''} coin transactions.`} />}
        </div>
      ))}

      {selectedCoinId !== null && (
        <CoinDetailDrawer
          coinId={selectedCoinId}
          onClose={() => setSelectedCoinId(null)}
          onApprove={id => { mutateApprove.mutate(id); setSelectedCoinId(null) }}
          onReject={id => { mutateReject.mutate(id); setSelectedCoinId(null) }}
          canManage={can('can_approve_coins')}
        />
      )}

      {subTab === 'salaries' && (
        <>
          {(showSalaryForm || editSalary) && (
            <Modal
              title={editSalary ? `Edit Salary — ${editSalary.staff_name}` : 'Add Salary Profile'}
              onClose={() => { setShowSalaryForm(false); setEditSalary(null) }}
            >
              <form
                className="space-y-4"
                onSubmit={e => {
                  e.preventDefault()
                  if (editSalary) {
                    mutateSalaryUpdate.mutate({ id: editSalary.id, d: salaryForm })
                  } else {
                    mutateSalaryCreate.mutate(salaryForm)
                  }
                }}
              >
                {!editSalary && (
                  <Field label="Staff Member *">
                    <select className={inputCls} value={salaryForm.staff} onChange={e => setSalaryForm(f => ({ ...f, staff: e.target.value }))} required>
                      <option value="">— Select staff —</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.display_name || s.full_name || s.email}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Base Salary (NPR) *">
                    <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={salaryForm.base_salary}
                      onChange={e => setSalaryForm(f => ({ ...f, base_salary: e.target.value }))} required />
                  </Field>
                  <Field label="TDS Rate %" hint="e.g. 10 for 10%">
                    <input data-lpignore="true" type="number" min="0" max="50" step="0.01" className={inputCls} value={salaryForm.tds_rate}
                      onChange={e => setSalaryForm(f => ({ ...f, tds_rate: e.target.value }))} />
                  </Field>
                  <Field label="Default Bonus">
                    <input data-lpignore="true" type="number" min="0" step="0.01" className={inputCls} value={salaryForm.bonus_default}
                      onChange={e => setSalaryForm(f => ({ ...f, bonus_default: e.target.value }))} />
                  </Field>
                </div>
                <Field label="Effective From *">
                  <input data-lpignore="true" type="date" className={inputCls} value={salaryForm.effective_from} onChange={e => setSalaryForm(f => ({ ...f, effective_from: e.target.value }))} />
                </Field>
                <Field label="Notes">
                  <textarea className={inputCls} rows={2} value={salaryForm.notes}
                    onChange={e => setSalaryForm(f => ({ ...f, notes: e.target.value }))} />
                </Field>
                <p className="text-xs text-gray-400">
                  TDS rate is stored as a decimal (10% → 0.10). When generating a payslip, this profile auto-fills base salary, TDS rate, and default bonus.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => { setShowSalaryForm(false); setEditSalary(null) }}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={mutateSalaryCreate.isPending || mutateSalaryUpdate.isPending}
                    className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60">
                    {mutateSalaryCreate.isPending || mutateSalaryUpdate.isPending ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {salaryLoading ? <Spinner /> : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Staff', 'Base Salary', 'TDS Rate', 'Default Bonus', 'Effective From', 'Notes', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {salaryProfiles?.results?.map(sp => (
                    <tr key={sp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-700">{sp.staff_name}</div>
                        <div className="text-xs text-gray-400">{sp.staff_email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{npr(sp.base_salary)}</td>
                      <td className="px-4 py-3 text-gray-600">{(parseFloat(sp.tds_rate) * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-gray-600">{npr(sp.bonus_default)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(sp.effective_from)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-xs truncate">{sp.notes || '—'}</td>
                      <td className="px-4 py-3">
                        {can('can_manage_accounting') && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setSalaryForm({ staff: String(sp.staff), base_salary: sp.base_salary, tds_rate: (parseFloat(sp.tds_rate) * 100).toFixed(2), bonus_default: sp.bonus_default, effective_from: sp.effective_from, notes: sp.notes }); setEditSalary(sp) }}
                              title="Edit" className="p-1 text-gray-400 hover:text-indigo-600 rounded transition-colors"><Pencil size={13} />
                            </button>
                            <button
                              onClick={() => confirm({ title: 'Delete Salary Profile', message: `Delete salary profile for ${sp.staff_name}?`, confirmLabel: 'Delete', variant: 'danger' }).then(ok => { if (ok) mutateSalaryDelete.mutate(sp.id) })}
                              title="Delete" className="p-1 text-gray-400 hover:text-red-600 rounded transition-colors"><Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!salaryProfiles?.results?.length && (
                <EmptyState message="No salary profiles yet. Click 'Add Salary Profile' to configure staff salaries. Profiles are used to auto-fill and auto-generate payslips." />
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
