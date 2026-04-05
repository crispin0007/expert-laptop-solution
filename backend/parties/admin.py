from django.contrib import admin

from .models import Party


@admin.register(Party)
class PartyAdmin(admin.ModelAdmin):
    list_display = ('name', 'party_type', 'account', 'email', 'phone', 'is_active', 'tenant')
    list_filter = ('party_type', 'is_active', 'tenant')
    search_fields = ('name', 'email', 'phone', 'pan_number', 'account__code', 'account__name')
