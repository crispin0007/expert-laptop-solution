from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import CategoryViewSet, ProductViewSet, ProductImageViewSet, StockLevelViewSet, StockMovementViewSet

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'products', ProductViewSet, basename='product')
router.register(r'product-images', ProductImageViewSet, basename='product-images')
router.register(r'stock-levels', StockLevelViewSet, basename='stocklevel')
router.register(r'movements', StockMovementViewSet, basename='stockmovement')

urlpatterns = [path('', include(router.urls))]
