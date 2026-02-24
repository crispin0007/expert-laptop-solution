from django.contrib import admin
from .models import Category, Product, StockMovement, StockLevel


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant')
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'unit_price', 'is_service', 'is_active', 'tenant')
    list_filter = ('is_service', 'is_active')
    search_fields = ('name', 'sku')


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('product', 'movement_type', 'quantity', 'reference_type', 'created_at')
    list_filter = ('movement_type',)


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = ('product', 'quantity_on_hand', 'last_updated')
    readonly_fields = ('quantity_on_hand', 'last_updated')
