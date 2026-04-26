import apiClient from '../../../api/client'
import { ACCOUNTING } from '../../../api/endpoints'
import { toPage } from '../utils/accountingUtils'
import type {
  Account,
  AccountGroup,
  BankAccount,
  BankReconciliation,
  CoinTx,
  CreditNote,
  Expense,
  Invoice,
  JournalEntry,
  Payslip,
  Payment,
  Quotation,
  RecurringJournal,
  StaffSalaryProfile,
  TDSEntry,
  ApiPage,
  Bill,
} from '../types/accounting'

type Payload = unknown

function buildUrl(baseUrl: string, query?: string) {
  if (!query) return baseUrl
  return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query}`
}

function normalizeUrl(baseUrl: string, query?: string) {
  if (!query) return baseUrl
  if (query.startsWith('/')) return query
  return buildUrl(baseUrl, query)
}

function normalizeData<T>(response: any): T {
  return response?.data?.data ?? response?.data
}

function normalizePage<T>(response: any): ApiPage<T> {
  return toPage<T>(response?.data)
}

export const fetchInvoices = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.INVOICES, query)).then(normalizePage<Invoice>)

export const fetchInvoiceDetail = (id: number) =>
  apiClient.get(ACCOUNTING.INVOICE_DETAIL(id)).then(normalizeData<Invoice>)

export const createInvoice = (payload: Payload) =>
  apiClient.post(ACCOUNTING.INVOICES, payload).then(normalizeData<Invoice>)

export const updateInvoice = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.INVOICE_DETAIL(id), payload).then(normalizeData<Invoice>)

export const issueInvoice = (id: number) =>
  apiClient.post(ACCOUNTING.INVOICE_ISSUE(id)).then(normalizeData<Invoice>)

export const markInvoicePaid = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.INVOICE_MARK_PAID(id), payload).then((response: any) => {
    const normalized = normalizeData<any>(response)
    return normalized.invoice ?? normalized
  })

export const voidInvoice = (id: number) =>
  apiClient.post(ACCOUNTING.INVOICE_VOID(id)).then(normalizeData<Invoice>)

export const fetchInvoicePdf = (id: number) =>
  apiClient.get(ACCOUNTING.INVOICE_PDF(id), { responseType: 'blob' })

export const sendInvoice = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.INVOICE_SEND(id), payload).then(normalizeData<any>)

export const collectInvoicePayment = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.INVOICE_COLLECT_PAYMENT(id), payload).then(normalizeData<any>)

export const reviewInvoiceFinance = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.INVOICE_FINANCE_REVIEW(id), payload).then(normalizeData<any>)

export const fetchPendingFinanceInvoices = () =>
  apiClient.get(ACCOUNTING.INVOICES_PENDING_FINANCE).then(normalizePage<Invoice>)

export const fetchBills = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.BILLS, query)).then(normalizePage<Bill>)

export const fetchBillDetail = (id: number) =>
  apiClient.get(ACCOUNTING.BILL_DETAIL(id)).then(normalizeData<Bill>)

export const createBill = (payload: Payload) =>
  apiClient.post(ACCOUNTING.BILLS, payload).then(normalizeData<Bill>)

export const updateBill = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.BILL_DETAIL(id), payload).then(normalizeData<Bill>)

export const approveBill = (id: number) =>
  apiClient.post(ACCOUNTING.BILL_APPROVE(id)).then(normalizeData<Bill>)

export const voidBill = (id: number) =>
  apiClient.post(ACCOUNTING.BILL_VOID(id)).then(normalizeData<Bill>)

export const markBillPaid = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.BILL_MARK_PAID(id), payload).then(normalizeData<Bill>)

export const deleteBill = (id: number) =>
  apiClient.delete(ACCOUNTING.BILL_DETAIL(id)).then(normalizeData<any>)

export const fetchPayments = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.PAYMENTS, query)).then(normalizePage<Payment>)

export const fetchPaymentDetail = (id: number) =>
  apiClient.get(ACCOUNTING.PAYMENT_DETAIL(id)).then(normalizeData<Payment>)

export const createPayment = (payload: Payload) =>
  apiClient.post(ACCOUNTING.PAYMENTS, payload).then(normalizeData<Payment>)

export const deletePayment = (id: number) =>
  apiClient.delete(ACCOUNTING.PAYMENT_DETAIL(id)).then(normalizeData<any>)

export const allocatePayment = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.PAYMENT_ALLOCATE(id), payload).then(normalizeData<any>)

export const updatePaymentChequeStatus = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.PAYMENT_CHEQUE_STATUS(id), payload).then(normalizeData<Payment>)

export const bouncePayment = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.PAYMENT_BOUNCE(id), payload).then(normalizeData<Payment>)

export const fetchCreditNotes = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.CREDIT_NOTES, query)).then(normalizePage<CreditNote>)

export const fetchCreditNoteDetail = (id: number) =>
  apiClient.get(ACCOUNTING.CREDIT_NOTE_DETAIL(id)).then(normalizeData<CreditNote>)

export const createCreditNote = (payload: Payload) =>
  apiClient.post(ACCOUNTING.CREDIT_NOTES, payload).then(normalizeData<CreditNote>)

export const updateCreditNote = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.CREDIT_NOTE_DETAIL(id), payload).then(normalizeData<CreditNote>)

export const issueCreditNote = (id: number) =>
  apiClient.post(ACCOUNTING.CREDIT_NOTE_ISSUE(id)).then(normalizeData<CreditNote>)

export const voidCreditNote = (id: number) =>
  apiClient.post(ACCOUNTING.CREDIT_NOTE_VOID(id)).then(normalizeData<CreditNote>)

export const deleteCreditNote = (id: number) =>
  apiClient.delete(ACCOUNTING.CREDIT_NOTE_DETAIL(id)).then(normalizeData<any>)

export const fetchBankAccounts = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.BANK_ACCOUNTS, query)).then(normalizePage<BankAccount>)

export const fetchBankAccountDetail = (id: number) =>
  apiClient.get(ACCOUNTING.BANK_ACCOUNT_DETAIL(id)).then(normalizeData<BankAccount>)

export const createBankAccount = (payload: Payload) =>
  apiClient.post(ACCOUNTING.BANK_ACCOUNTS, payload).then(normalizeData<BankAccount>)

export const updateBankAccount = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.BANK_ACCOUNT_DETAIL(id), payload).then(normalizeData<BankAccount>)

export const deleteBankAccount = (id: number) =>
  apiClient.delete(ACCOUNTING.BANK_ACCOUNT_DETAIL(id)).then(normalizeData<any>)

export const fetchAccounts = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.ACCOUNTS, query)).then(normalizePage<Account>)

export const fetchAccountGroups = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.ACCOUNT_GROUPS, query)).then(normalizePage<AccountGroup>)

export const createAccount = (payload: Payload) =>
  apiClient.post(ACCOUNTING.ACCOUNTS, payload).then(normalizeData<Account>)

export const updateAccount = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.ACCOUNT_DETAIL(id), payload).then(normalizeData<Account>)

export const deleteAccount = (id: number) =>
  apiClient.delete(ACCOUNTING.ACCOUNT_DETAIL(id)).then(normalizeData<any>)

export const toggleAccountActive = (id: number, is_active: boolean) =>
  apiClient.patch(ACCOUNTING.ACCOUNT_DETAIL(id), { is_active }).then(normalizeData<Account>)

export const fetchJournals = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.JOURNALS, query)).then(normalizePage<JournalEntry>)

export const fetchJournalEntry = (id: number) =>
  apiClient.get(ACCOUNTING.JOURNAL_DETAIL(id)).then(normalizeData<JournalEntry>)

export const createJournalEntry = (payload: Payload) =>
  apiClient.post(ACCOUNTING.JOURNALS, payload).then(normalizeData<JournalEntry>)

export const updateJournalEntry = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.JOURNAL_DETAIL(id), payload).then(normalizeData<JournalEntry>)

export const postJournalEntry = (id: number) =>
  apiClient.post(ACCOUNTING.JOURNAL_POST(id)).then(normalizeData<JournalEntry>)

export const deleteJournalEntry = (id: number) =>
  apiClient.delete(ACCOUNTING.JOURNAL_DETAIL(id)).then(normalizeData<any>)

export const fetchPayslips = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.PAYSLIPS, query)).then(normalizePage<Payslip>)

export const fetchPayslipDetail = (id: number) =>
  apiClient.get(ACCOUNTING.PAYSLIP_DETAIL(id)).then(normalizeData<Payslip>)

export const generatePayslips = (payload: Payload) =>
  apiClient.post(ACCOUNTING.PAYSLIP_GENERATE, payload).then(normalizeData<any>)

export const issuePayslip = (id: number) =>
  apiClient.post(ACCOUNTING.PAYSLIP_ISSUE(id)).then(normalizeData<Payslip>)

export const markPayslipPaid = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.PAYSLIP_MARK_PAID(id), payload).then(normalizeData<Payslip>)

export const deletePayslip = (id: number) =>
  apiClient.delete(ACCOUNTING.PAYSLIP_DETAIL(id)).then(normalizeData<any>)

export const fetchSalaryProfiles = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.SALARY_PROFILES, query)).then(normalizePage<StaffSalaryProfile>)

export const createSalaryProfile = (payload: Payload) =>
  apiClient.post(ACCOUNTING.SALARY_PROFILES, payload).then(normalizeData<StaffSalaryProfile>)

export const updateSalaryProfile = (id: number, payload: Payload) =>
  apiClient.patch(ACCOUNTING.SALARY_PROFILE_DETAIL(id), payload).then(normalizeData<StaffSalaryProfile>)

export const deleteSalaryProfile = (id: number) =>
  apiClient.delete(ACCOUNTING.SALARY_PROFILE_DETAIL(id)).then(normalizeData<any>)

export const fetchCoins = (params?: Record<string, unknown>) =>
  apiClient.get(ACCOUNTING.COINS, { params }).then(normalizePage<CoinTx>)

export const fetchCoinsList = (params?: Record<string, unknown>) =>
  apiClient.get(ACCOUNTING.COINS, { params }).then((response: any) =>
    Array.isArray(response.data) ? response.data : response.data?.data ?? response.data?.results ?? [],
  )

export const fetchCoinDetail = (id: number) =>
  apiClient.get(ACCOUNTING.COIN_DETAIL(id)).then(normalizeData<CoinTx>)

export const approveCoin = (id: number) =>
  apiClient.post(ACCOUNTING.COIN_APPROVE(id)).then(normalizeData<CoinTx>)

export const rejectCoin = (id: number) =>
  apiClient.post(ACCOUNTING.COIN_REJECT(id)).then(normalizeData<CoinTx>)

export const awardCoins = (payload: Payload) =>
  apiClient.post(ACCOUNTING.COINS_AWARD, payload).then(normalizeData<any>)

export const fetchPendingCoins = () =>
  apiClient.get(ACCOUNTING.COINS_PENDING).then(normalizePage<CoinTx>)

export const fetchCoinsSummary = (params?: Record<string, unknown>) =>
  apiClient.get(ACCOUNTING.COINS_SUMMARY, { params }).then(normalizeData<any>)

export const fetchStaffCoinSummary = (params?: Record<string, unknown>) =>
  apiClient.get(ACCOUNTING.COINS_STAFF_SUMMARY, { params }).then(normalizeData<any>)

export const fetchStaffCoinHistory = (staffId: number) =>
  apiClient.get(ACCOUNTING.COINS_STAFF_HISTORY(staffId)).then(normalizeData<any>)

export const fetchQuotations = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.QUOTATIONS, query)).then(normalizePage<Quotation>)

export const sendQuotation = (id: number) =>
  apiClient.post(ACCOUNTING.QUOTATION_SEND(id)).then(normalizeData<Quotation>)

export const acceptQuotation = (id: number) =>
  apiClient.post(ACCOUNTING.QUOTATION_ACCEPT(id)).then(normalizeData<Quotation>)

export const declineQuotation = (id: number) =>
  apiClient.post(ACCOUNTING.QUOTATION_DECLINE(id)).then(normalizeData<Quotation>)

export const convertQuotation = (id: number) =>
  apiClient.post(ACCOUNTING.QUOTATION_CONVERT(id)).then(normalizeData<Quotation>)

export const fetchExpenses = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.EXPENSES, query)).then(normalizePage<Expense>)

export const createExpense = (payload: Payload) =>
  apiClient.post(ACCOUNTING.EXPENSES, payload).then(normalizeData<Expense>)

export const fetchExpenseDetail = (id: number) =>
  apiClient.get(ACCOUNTING.EXPENSE_DETAIL(id)).then(normalizeData<Expense>)

export const approveExpense = (id: number) =>
  apiClient.post(ACCOUNTING.EXPENSE_APPROVE(id)).then(normalizeData<Expense>)

export const rejectExpense = (id: number) =>
  apiClient.post(ACCOUNTING.EXPENSE_REJECT(id)).then(normalizeData<Expense>)

export const postExpense = (id: number) =>
  apiClient.post(ACCOUNTING.EXPENSE_POST(id)).then(normalizeData<Expense>)

export const fetchBankReconciliations = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.BANK_RECONCILIATIONS, query)).then(normalizePage<BankReconciliation>)

export const fetchBankReconciliation = (id: number) =>
  apiClient.get(ACCOUNTING.BANK_RECONCILIATION_DETAIL(id)).then(normalizeData<BankReconciliation>)

export const addBankReconciliationLine = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.BANK_RECONCILIATION_ADD_LINE(id), payload).then(normalizeData<any>)

export const matchBankReconciliationLine = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.BANK_RECONCILIATION_MATCH_LINE(id), payload).then(normalizeData<any>)

export const unmatchBankReconciliationLine = (id: number, payload: Payload) =>
  apiClient.post(ACCOUNTING.BANK_RECONCILIATION_UNMATCH_LINE(id), payload).then(normalizeData<any>)

export const reconcileBankReconciliation = (id: number) =>
  apiClient.post(ACCOUNTING.BANK_RECONCILIATION_RECONCILE(id)).then(normalizeData<any>)

export const fetchRecurringJournals = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.RECURRING_JOURNALS, query)).then(normalizePage<RecurringJournal>)

export const fetchRecurringJournalDetail = (id: number) =>
  apiClient.get(ACCOUNTING.RECURRING_JOURNAL_DETAIL(id)).then(normalizeData<RecurringJournal>)

export const runRecurringJournal = (id: number) =>
  apiClient.post(ACCOUNTING.RECURRING_JOURNAL_RUN(id)).then(normalizeData<any>)

export const fetchTdsEntries = (query?: string) =>
  apiClient.get(normalizeUrl(ACCOUNTING.TDS, query)).then(normalizePage<TDSEntry>)

export const fetchTdsEntryDetail = (id: number) =>
  apiClient.get(ACCOUNTING.TDS_DETAIL(id)).then(normalizeData<TDSEntry>)

export const markTdsDeposited = (id: number) =>
  apiClient.post(ACCOUNTING.TDS_MARK_DEPOSITED(id)).then(normalizeData<TDSEntry>)

export const fetchReport = (endpoint: string, params?: Record<string, unknown>) =>
  apiClient.get(endpoint, { params }).then(normalizeData<any>)

export const accountingService = {
  fetchInvoices,
  fetchInvoiceDetail,
  createInvoice,
  updateInvoice,
  issueInvoice,
  markInvoicePaid,
  voidInvoice,
  fetchInvoicePdf,
  sendInvoice,
  collectInvoicePayment,
  reviewInvoiceFinance,
  fetchPendingFinanceInvoices,
  fetchBills,
  fetchBillDetail,
  createBill,
  updateBill,
  approveBill,
  voidBill,
  markBillPaid,
  deleteBill,
  fetchPayments,
  fetchPaymentDetail,
  createPayment,
  deletePayment,
  allocatePayment,
  updatePaymentChequeStatus,
  bouncePayment,
  fetchCreditNotes,
  fetchCreditNoteDetail,
  createCreditNote,
  updateCreditNote,
  issueCreditNote,
  voidCreditNote,
  deleteCreditNote,
  fetchBankAccounts,
  fetchBankAccountDetail,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  fetchAccounts,
  fetchAccountGroups,
  createAccount,
  updateAccount,
  deleteAccount,
  toggleAccountActive,
  fetchJournals,
  fetchJournalEntry,
  createJournalEntry,
  updateJournalEntry,
  postJournalEntry,
  deleteJournalEntry,
  fetchPayslips,
  fetchPayslipDetail,
  generatePayslips,
  issuePayslip,
  markPayslipPaid,
  deletePayslip,
  fetchSalaryProfiles,
  createSalaryProfile,
  updateSalaryProfile,
  deleteSalaryProfile,
  fetchCoins,
  fetchCoinsList,
  fetchCoinDetail,
  approveCoin,
  rejectCoin,
  awardCoins,
  fetchPendingCoins,
  fetchCoinsSummary,
  fetchStaffCoinHistory,
  fetchQuotations,
  sendQuotation,
  acceptQuotation,
  declineQuotation,
  convertQuotation,
  fetchExpenses,
  fetchExpenseDetail,
  approveExpense,
  rejectExpense,
  postExpense,
  fetchBankReconciliations,
  fetchBankReconciliation,
  addBankReconciliationLine,
  matchBankReconciliationLine,
  unmatchBankReconciliationLine,
  reconcileBankReconciliation,
  fetchRecurringJournals,
  fetchRecurringJournalDetail,
  runRecurringJournal,
  fetchTdsEntries,
  fetchTdsEntryDetail,
  markTdsDeposited,
  fetchReport,
}
