from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    CategoryViewSet, ProductViewSet, ProductImageViewSet, SerialNumberViewSet,
    StockLevelViewSet, StockMovementViewSet,
    SupplierViewSet, PurchaseOrderViewSet,
    UnitOfMeasureViewSet, ProductVariantViewSet,
    ReturnOrderViewSet, ReportViewSet,
    SupplierProductViewSet, StockCountViewSet,
    ProductBundleViewSet, SupplierPaymentViewSet,
)

router = DefaultRouter()
router.register(r'categories',        CategoryViewSet,        basename='category')
router.register(r'products',          ProductViewSet,         basename='product')
router.register(r'product-images',    ProductImageViewSet,    basename='product-images')
router.register(r'serial-numbers',    SerialNumberViewSet,    basename='serial-number')
router.register(r'stock-levels',      StockLevelViewSet,      basename='stocklevel')
router.register(r'movements',         StockMovementViewSet,   basename='stockmovement')
router.register(r'suppliers',         SupplierViewSet,        basename='supplier')
router.register(r'purchase-orders',   PurchaseOrderViewSet,   basename='purchaseorder')
router.register(r'uom',               UnitOfMeasureViewSet,   basename='uom')
router.register(r'variants',          ProductVariantViewSet,  basename='variant')
router.register(r'return-orders',     ReturnOrderViewSet,     basename='returnorder')
router.register(r'reports',           ReportViewSet,          basename='report')
router.register(r'supplier-products', SupplierProductViewSet, basename='supplierproduct')
router.register(r'stock-counts',      StockCountViewSet,      basename='stockcount')
router.register(r'product-bundles',   ProductBundleViewSet,   basename='productbundle')
router.register(r'supplier-payments', SupplierPaymentViewSet, basename='supplierpayment')

urlpatterns = [path('', include(router.urls))]
