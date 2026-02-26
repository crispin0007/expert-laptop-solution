from django.contrib import admin
from .models import Customer, CustomerContact


class CustomerContactInline(admin.TabularInline):
    model = CustomerContact
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display  = ('customer_number', 'name', 'type', 'phone', 'email', 'district', 'province', 'tenant')
    search_fields = ('name', 'phone', 'email', 'customer_number', 'district', 'municipality')
    list_filter   = ('type', 'province')
    inlines       = [CustomerContactInline]
    fieldsets = (
        (None, {'fields': ('tenant', 'customer_number', 'type', 'name', 'email', 'phone')}),
        ('Nepal Address', {
            'fields': ('province', 'district', 'municipality', 'ward_no', 'street'),
        }),
        ('Business Details', {'fields': ('vat_number', 'pan_number', 'notes', 'is_active')}),
    )
    readonly_fields = ('customer_number',)
