import {
  DashboardPage,
  InvoicesPage,
  FinanceReviewPage,
  BillsPage,
  PaymentsPage,
  CreditNotesPage,
  JournalsPage,
  AccountsPage,
  BanksPage,
  PayslipsPage,
  QuotationsPage,
  DebitNotesPage,
  TdsPage,
  BankReconciliationPage,
  RecurringJournalsPage,
  LedgerPage,
  DayBookPage,
  ExpensesPage,
  SalesOrdersPage,
  PurchaseOrdersPage,
  QuickPaymentPage,
  QuickReceiptPage,
  CashTransfersPage,
  AllocateCustomerPaymentsPage,
  AllocateSupplierPaymentsPage,
  SuppliersPage,
  ChequeRegisterPage,
  CustomerPaymentsPage,
  SupplierPaymentsPage,
  ServiceLedgerPage,
} from './pages'

export default function AccountingRoutes({ activeTab }: { activeTab: string }) {
  switch (activeTab) {
    case '': return <DashboardPage />
    case 'invoices': return <InvoicesPage />
    case 'finance-review': return <FinanceReviewPage />
    case 'bills': return <BillsPage />
    case 'payments': return <PaymentsPage />
    case 'credit-notes': return <CreditNotesPage />
    case 'journals': return <JournalsPage />
    case 'accounts': return <AccountsPage />
    case 'banks': return <BanksPage />
    case 'payslips': return <PayslipsPage />
    case 'quotations': return <QuotationsPage />
    case 'debit-notes': return <DebitNotesPage />
    case 'tds': return <TdsPage />
    case 'bank-reconciliation': return <BankReconciliationPage />
    case 'recurring-journals': return <RecurringJournalsPage />
    case 'ledger': return <LedgerPage />
    case 'day-book': return <DayBookPage />
    case 'expenses': return <ExpensesPage />
    case 'service-ledger': return <ServiceLedgerPage />
    case 'sales-orders': return <SalesOrdersPage />
    case 'customer-payments': return <CustomerPaymentsPage />
    case 'allocate-customer-payments': return <AllocateCustomerPaymentsPage />
    case 'suppliers': return <SuppliersPage />
    case 'purchase-orders': return <PurchaseOrdersPage />
    case 'supplier-payments': return <SupplierPaymentsPage />
    case 'allocate-supplier-payments': return <AllocateSupplierPaymentsPage />
    case 'cash-transfers': return <CashTransfersPage />
    case 'quick-payment': return <QuickPaymentPage />
    case 'quick-receipt': return <QuickReceiptPage />
    case 'cheque-register': return <ChequeRegisterPage />
    default: return <DashboardPage />
  }
}
