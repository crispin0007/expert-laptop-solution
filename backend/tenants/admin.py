from django.contrib import admin
from .models import Tenant


@admin.register(Tenant)
class TenantAdmin(admin.ModelAdmin):
    list_display = ('slug', 'name', 'is_active', 'vat_rate')
    search_fields = ('slug', 'name')
    list_filter = ('is_active', 'is_deleted')
