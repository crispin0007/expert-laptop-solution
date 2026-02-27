from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    CoinTransactionViewSet, PayslipViewSet, InvoiceViewSet,
    AccountViewSet, BankAccountViewSet, JournalEntryViewSet,
    BillViewSet, PaymentViewSet, CreditNoteViewSet, ReportViewSet,
    QuotationViewSet, DebitNoteViewSet, TDSEntryViewSet,
    BankReconciliationViewSet, RecurringJournalViewSet,
    StaffSalaryProfileViewSet,
    VATRemittanceView, TDSRemittanceView,
)

router = DefaultRouter()

# Chart of Accounts & Bank Accounts
router.register(r'accounts', AccountViewSet, basename='account')
router.register(r'bank-accounts', BankAccountViewSet, basename='bank-account')

# Double-entry ledger
router.register(r'journals', JournalEntryViewSet, basename='journal-entry')

# Payables
router.register(r'bills', BillViewSet, basename='bill')
router.register(r'payments', PaymentViewSet, basename='payment')
router.register(r'credit-notes', CreditNoteViewSet, basename='credit-note')
router.register(r'debit-notes', DebitNoteViewSet, basename='debit-note')

# Receivables / Pre-sales
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'quotations', QuotationViewSet, basename='quotation')

# Reports (no model)
router.register(r'reports', ReportViewSet, basename='report')

# Tax
router.register(r'tds', TDSEntryViewSet, basename='tds-entry')

# Banking
router.register(r'bank-reconciliations', BankReconciliationViewSet, basename='bank-reconciliation')

# Automation
router.register(r'recurring-journals', RecurringJournalViewSet, basename='recurring-journal')

# Coins / payroll
router.register(r'coins', CoinTransactionViewSet, basename='coin-transaction')
router.register(r'payslips', PayslipViewSet, basename='payslip')
router.register(r'salary-profiles', StaffSalaryProfileViewSet, basename='salary-profile')

urlpatterns = [
    path('', include(router.urls)),
    # Tax remittance endpoints (VAT and TDS payments to IRD)
    path('vat-remittance/',  VATRemittanceView.as_view({'post': 'create'}),  name='vat-remittance'),
    path('tds-remittance/',  TDSRemittanceView.as_view({'post': 'create'}),  name='tds-remittance'),
]

