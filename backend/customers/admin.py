from django.contrib import admin
from .models import Customer, CustomerContact


class CustomerContactInline(admin.TabularInline):
    model = CustomerContact
    extra = 0


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('name', 'type', 'email', 'phone', 'tenant')
    search_fields = ('name', 'email', 'phone')
    list_filter = ('type',)
    inlines = [CustomerContactInline]
