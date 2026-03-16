from django.contrib import admin
from .models import Category, Product, SerialNumber, StockMovement, StockLevel


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant')
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'sku', 'unit_price', 'has_warranty', 'is_service', 'is_active', 'tenant')
    list_filter = ('is_service', 'has_warranty', 'is_active')
    search_fields = ('name', 'sku')


@admin.register(SerialNumber)
class SerialNumberAdmin(admin.ModelAdmin):
    list_display = ('serial_number', 'product', 'status', 'reference_type', 'used_at', 'tenant')
    list_filter = ('status', 'reference_type')
    search_fields = ('serial_number',)
    readonly_fields = ('tenant',)


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ('product', 'movement_type', 'quantity', 'reference_type', 'created_at')
    list_filter = ('movement_type',)


@admin.register(StockLevel)
class StockLevelAdmin(admin.ModelAdmin):
    list_display = ('product', 'quantity_on_hand', 'last_updated')
    readonly_fields = ('quantity_on_hand', 'last_updated')
