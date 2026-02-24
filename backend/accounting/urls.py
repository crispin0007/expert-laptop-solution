from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import CoinTransactionViewSet, PayslipViewSet, InvoiceViewSet

router = DefaultRouter()
router.register(r'coins', CoinTransactionViewSet, basename='coin-transaction')
router.register(r'payslips', PayslipViewSet, basename='payslip')
router.register(r'invoices', InvoiceViewSet, basename='invoice')

urlpatterns = [path('', include(router.urls))]

