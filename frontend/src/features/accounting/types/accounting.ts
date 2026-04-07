export interface InvoiceItem {
  description?: string
  name?: string
  qty?: number
  quantity?: number
  unit_price: string
  discount?: string
  total?: string
  amount?: string
  line_type?: string
  cost_price_snapshot?: string
  product_id?: number
  service_id?: number
}

export interface Invoice {
  id: number
  invoice_number: string
  customer: number | null
  customer_name: string
  ticket: number | null
  project: number | null
  ticket_number?: string
  project_name?: string
  line_items: InvoiceItem[]
  subtotal: string
  discount: string
  vat_rate: string
  vat_amount: string
  total: string
  amount_paid: string
  amount_due: string
  status: string
  finance_status: string
  finance_notes: string
  finance_reviewed_at: string | null
  date: string
  due_date: string | null
  paid_at: string | null
  notes: string
  created_at: string
}

export interface ServiceItem { id: number; name: string; unit_price: string }
export interface InventoryProduct { id: number; name: string; unit_price: string; sku: string }

export interface Bill {
  id: number
  bill_number: string
  supplier: number | null
  supplier_name: string
  line_items: unknown[]
  subtotal: string
  total: string
  amount_paid: string
  amount_due: string
  status: string
  date: string
  due_date: string | null
  approved_at: string | null
  paid_at: string | null
  notes: string
  reference: string
  created_at: string
}

export interface Payment {
  id: number
  payment_number: string
  date: string
  type: string
  method: string
  amount: string
  invoice: number | null
  invoice_number: string
  bill: number | null
  bill_number: string
  bank_account: number | null
  bank_account_name: string
  account: number | null
  account_name: string
  reference: string
  notes: string
  party?: string
  party_name?: string
  supplier_name?: string
  customer_name?: string
  cheque_status: string
  tds_rate?: string | number
  tds_withheld_amount?: string | number
  net_receipt_amount?: string | number
  tds_reference?: string
  created_by_name: string
  created_at: string
}

export interface CreditNote {
  id: number
  credit_note_number: string
  invoice: number | null
  invoice_number: string
  line_items: unknown[]
  subtotal: string
  total: string
  reason: string
  status: string
  issued_at: string | null
  created_at: string
}

export interface JournalLine {
  id: number
  account: number
  account_name: string
  account_code: string
  debit: string
  credit: string
  description: string
}

export interface JournalEntry {
  id: number
  entry_number: string
  date: string
  description: string
  reference_type: string
  reference_id: number | null
  purpose: string
  is_posted: boolean
  total_debit: string
  total_credit: string
  reversal_date: string | null
  is_reversal: boolean
  reversed_by_id: number | null
  reversal_reason: string
  reversed_by_user_name: string
  reversal_timestamp: string | null
  created_by_name: string
  created_at: string
  lines: JournalLine[]
}

export interface Account {
  id: number
  code: string
  name: string
  type: string
  is_system: boolean
  is_active: boolean
  parent: number | null
  balance: string
  description: string
  opening_balance: string
  group: number | null
  group_name: string | null
  group_slug: string | null
}

export interface AccountGroup {
  id: number
  slug: string
  name: string
  type: string
  report_section: string
  normal_balance: string
  is_system: boolean
  parent?: number | null
  parent_name?: string
}

export interface BankAccount {
  id: number
  name: string
  bank_name: string
  account_number: string
  currency: string
  opening_balance: string
  current_balance: string
  linked_account: number | null
  linked_account_is_system?: boolean
  created_at: string
}

export interface Payslip {
  id: number
  staff: number
  staff_name: string
  period_start: string
  period_end: string
  total_coins: string
  coin_to_money_rate: string
  gross_amount: string
  base_salary: string
  bonus: string
  deductions: string
  tds_amount: string
  deduction_breakdown: Array<{ label: string; amount: string; account_code?: string }>
  net_pay: string
  cash_credit: string
  status: string
  issued_at: string | null
  paid_at: string | null
  created_at: string
  payment_method: string
  bank_account: number | null
  bank_account_name: string
}

export interface StaffSalaryProfile {
  id: number
  staff: number
  staff_name: string
  staff_email: string
  base_salary: string
  tds_rate: string
  bonus_default: string
  effective_from: string
  notes: string
  created_at: string
  updated_at: string
}

export interface CoinTx {
  id: number
  staff: number
  staff_name: string
  amount: string
  source_type: string
  source_id: number | null
  status: string
  note: string
  approved_by_name: string | null
  created_at: string
}

export interface Customer { id: number; name: string }

export interface Expense {
  id: number
  category: string
  category_display: string
  custom_category: string
  description: string
  amount: string
  date: string
  account: number | null
  account_name: string
  payment_account: number | null
  payment_account_name: string
  payment_account_code: string
  receipt_url: string
  notes: string
  status: string
  status_display: string
  submitted_by: number
  submitted_by_name: string
  approved_by: number | null
  approved_by_name: string | null
  approved_at: string | null
  rejected_by: number | null
  rejected_by_name: string | null
  rejected_at: string | null
  rejection_note: string
  is_recurring: boolean
  recur_interval: number | null
  next_recur_date: string | null
  journal_entry: number | null
  created_at: string
  service: number | null
  service_name: string
}

export interface Quotation {
  id: number
  quotation_number: string
  customer: number | null
  customer_name: string
  ticket: number | null
  project: number | null
  line_items: InvoiceItem[]
  subtotal: string
  discount: string
  vat_rate: string
  vat_amount: string
  total: string
  status: string
  valid_until: string | null
  notes: string
  terms: string
  sent_at: string | null
  accepted_at: string | null
  converted_invoice: number | null
  converted_invoice_number: string
  created_at: string
  updated_at: string
}

export interface DebitNote {
  id: number
  debit_note_number: string
  bill: number
  bill_number: string
  line_items: InvoiceItem[]
  subtotal: string
  vat_amount: string
  total: string
  reason: string
  status: string
  issued_at: string | null
  created_at: string
}

export interface TDSEntry {
  id: number
  bill: number | null
  bill_number: string
  supplier_name: string
  supplier_pan: string
  taxable_amount: string
  tds_rate: string
  tds_amount: string
  net_payable: string
  status: string
  period_month: number
  period_year: number
  deposited_at: string | null
  deposit_reference: string
  created_at: string
}

export interface BankReconciliationLine {
  id: number
  date: string
  description: string
  amount: string
  is_matched: boolean
  payment: number | null
}

export interface BankReconciliation {
  id: number
  bank_account: number
  bank_account_name: string
  statement_date: string
  opening_balance: string
  closing_balance: string
  status: string
  notes: string
  reconciled_at: string | null
  difference: string
  lines: BankReconciliationLine[]
  created_at: string
}

export interface RecurringJournal {
  id: number
  name: string
  description: string
  frequency: string
  start_date: string
  end_date: string | null
  next_date: string
  is_active: boolean
  template_lines: Array<{ account_code: string; debit: string; credit: string; description: string }>
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrderItem {
  id: number
  product: number
  product_name: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: string
  line_total: string
  pending_quantity: number
}

export interface PurchaseOrder {
  id: number
  po_number: string
  supplier: number
  supplier_name: string
  status: string
  expected_delivery: string | null
  notes: string
  total_amount: string
  total_ordered: number
  total_received: number
  received_by_name: string | null
  received_at: string | null
  created_by_name: string | null
  created_at: string
  updated_at: string
  items: PurchaseOrderItem[]
}

export interface LedgerRow {
  line_id?: number
  entry_id?: number
  date: string
  entry_number: string
  description: string
  reference_type?: string
  reference_id?: number | null
  purpose?: string
  debit: string
  credit: string
  balance: string
}

export interface LedgerReport {
  account_code: string
  account_name: string
  date_from: string
  date_to: string
  opening_balance: string
  closing_balance: string
  transactions: LedgerRow[]
}

export interface DayBookLine {
  account_code: string
  account_name: string
  description: string
  debit: string
  credit: string
}

export interface DayBookEntry {
  entry_number: string
  description: string
  reference_type: string
  total_debit: string
  total_credit: string
  lines: DayBookLine[]
}

export interface DayBookDay {
  date: string
  entries: DayBookEntry[]
  total_debit: string
  total_credit: string
  entry_count: number
}

export interface DayBookRangeReport {
  date_from: string
  date_to: string
  days: DayBookDay[]
  total_debit: string
  total_credit: string
  entry_count: number
}

import type { ElementType } from 'react'

export interface ApiPage<T> { results: T[]; count: number }

export interface JournalLineDraft { account: string; debit: string; credit: string; description: string }

export interface InlineAddState {
  parentId: number | null
  resolvedParentId: number | null
  type: string
  depth: number
  suggestedCode: string
}

export type ChequeView = 'register' | 'issue' | 'receive'

export type ReportCategory = 'accounting' | 'receivables' | 'payables' | 'sales' | 'purchases' | 'tax' | 'inventory' | 'system'
export type ReportDateMode = 'range' | 'asof' | 'vat' | 'none'
export type ReportType =
  | 'pl' | 'balance-sheet' | 'trial-balance' | 'gl-summary' | 'gl-master' | 'cash-flow'
  | 'aged-receivables' | 'customer-receivable-summary' | 'invoice-age' | 'customer-statement'
  | 'aged-payables' | 'supplier-payable-summary' | 'bill-age' | 'supplier-statement'
  | 'sales-by-customer' | 'sales-by-item' | 'sales-by-customer-monthly' | 'sales-by-item-monthly' | 'sales-master' | 'sales-summary'
  | 'purchase-by-supplier' | 'purchase-by-item' | 'purchase-by-supplier-monthly' | 'purchase-by-item-monthly' | 'purchase-master'
  | 'sales-register' | 'sales-return-register' | 'purchase-register' | 'purchase-return-register' | 'vat' | 'tds-report' | 'annex-13' | 'annex-5'
  | 'inventory-position' | 'inventory-movement' | 'inventory-master' | 'product-profitability'
  | 'activity-log' | 'user-log'

export interface ReportMeta {
  key: ReportType
  label: string
  endpoint: string
  icon: ElementType
  category: ReportCategory
  dateMode: ReportDateMode
  needsCustomer?: boolean
  needsSupplier?: boolean
}

export interface RptAccount {
  id?: number
  code: string
  name: string
  balance: string | number
  group_name?: string
  parent_id?: number | null
  parent_code?: string
  parent_name?: string
  level?: number
}
export interface PLReport {
  date_from: string
  date_to: string
  revenue: RptAccount[]
  total_revenue: string | number
  expenses: RptAccount[]
  total_expenses: string | number
  net_profit: string | number
}
export interface BSReport {
  as_of_date: string
  as_of_date_bs?: string
  fixed_assets: RptAccount[]
  total_fixed_assets: string | number
  investments: RptAccount[]
  total_investments: string | number
  current_assets: RptAccount[]
  total_current_assets: string | number
  total_assets: string | number
  capital: RptAccount[]
  total_capital: string | number
  bank_od: RptAccount[]
  loans: RptAccount[]
  total_loans: string | number
  current_liabilities: RptAccount[]
  total_current_liabilities: string | number
  total_liabilities: string | number
  total_equity_and_liabilities: string | number
  balanced: boolean
}
export interface TBRow {
  id?: number
  code: string
  name: string
  type?: string
  group_name?: string
  parent_id?: number | null
  parent_code?: string
  parent_name?: string
  level?: number
  opening_dr: string | number
  opening_cr: string | number
  period_dr: string | number
  period_cr: string | number
  closing_dr: string | number
  closing_cr: string | number
}
export interface TBReport {
  date_from: string
  date_to: string
  accounts: TBRow[]
  total_opening_dr: string | number
  total_opening_cr: string | number
  total_period_dr: string | number
  total_period_cr: string | number
  total_closing_dr: string | number
  total_closing_cr: string | number
  balanced: boolean
}
export interface AgedItem {
  id: number
  invoice_number?: string
  bill_number?: string
  customer?: string
  supplier?: string
  due_date: string
  amount_due: number
}
export interface AgedBucket { items: AgedItem[]; total: number }
export interface AgedReport {
  as_of_date: string
  current: AgedBucket
  '1_30': AgedBucket
  '31_60': AgedBucket
  '61_90': AgedBucket
  '90_plus': AgedBucket
  grand_total: number
}
export interface VATReport {
  period_start: string
  period_end: string
  vat_collected: string | number
  vat_reclaimable: string | number
  vat_payable: string | number
  invoice_count: number
  bill_count: number
}
export interface CFMethod { method: string; incoming: string | number; outgoing: string | number }
export interface CFReport {
  date_from: string
  date_to: string
  total_incoming: string | number
  total_outgoing: string | number
  net_cash_flow: string | number
  by_method: CFMethod[]
  operating?: {
    net_profit: string | number
    net_profit_label?: string
    depreciation: string | number
    depreciation_label?: string
    working_capital_changes: { label: string; amount: string | number }[]
    working_capital_total?: string | number
    total: string | number
  }
  investing?: {
    items: { label: string; amount: string | number }[]
    total: string | number
  }
  financing?: {
    items: { label: string; amount: string | number }[]
    total: string | number
  }
  net_change?: string | number
  opening_cash?: string | number
  closing_cash?: string | number
  expected_closing?: string | number
  difference?: string | number
  balanced?: boolean
}
export interface GenericTableProps {
  rows: Record<string, unknown>[]
  totalRow?: Record<string, unknown>
  summary?: { label: string; value: unknown }[]
  hideCols?: string[]
}
export interface MonthlyCrossData {
  months: string[]
  rows: Record<string, unknown>[]
  grand_total: unknown
}
export interface StatementTxn {
  date: string
  type: string
  reference: string
  description: string
  debit: number | string
  credit: number | string
  balance: number | string
}
export interface GLSummaryGroup { label: string; rows: { code: string; name: string; balance: number }[]; total: number }
export interface InventorySupplier {
  id: number
  name: string
  contact_person: string
  email: string
  phone: string
  address: string
  city: string
  country: string
  website: string
  payment_terms: string
  notes: string
  is_active: boolean
  pan_number: string
  po_count?: number
}
export interface ExpenseModalProps {
  expense?: Expense | null
  onClose: () => void
}
export interface ExpensePostModalProps {
  expense: Expense
  onClose: () => void
  onPosted: () => void
}
export interface ServiceLedgerRow {
  date: string
  doc_type: string
  doc_number: string
  party: string
  description: string
  revenue: string
  cost: string
}
export interface ServiceLedgerReport {
  service: { id: number; name: string }
  date_from: string
  date_to: string
  rows: ServiceLedgerRow[]
  revenue_total: string
  cost_total: string
  net: string
}
