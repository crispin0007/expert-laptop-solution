from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    CoinTransactionViewSet, PayslipViewSet, InvoiceViewSet,
    AccountViewSet, BankAccountViewSet, JournalEntryViewSet,
    BillViewSet, PaymentViewSet, CreditNoteViewSet, ReportViewSet,
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

# Reports (no model)
router.register(r'reports', ReportViewSet, basename='report')

# Coins / payroll
router.register(r'coins', CoinTransactionViewSet, basename='coin-transaction')
router.register(r'payslips', PayslipViewSet, basename='payslip')

# Receivables
router.register(r'invoices', InvoiceViewSet, basename='invoice')

urlpatterns = [path('', include(router.urls))]

