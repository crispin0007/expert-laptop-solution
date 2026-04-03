from django.contrib import admin
from .models import AccountGroup, CoinTransaction, Payslip, Invoice, Expense


@admin.register(AccountGroup)
class AccountGroupAdmin(admin.ModelAdmin):
    list_display  = ('name', 'slug', 'type', 'report_section', 'affects_gross_profit', 'order', 'is_system')
    list_filter   = ('type', 'report_section', 'is_system')
    search_fields = ('name', 'slug')
    ordering      = ('order', 'name')


@admin.register(CoinTransaction)
class CoinTransactionAdmin(admin.ModelAdmin):
    list_display = ('staff', 'amount', 'source_type', 'source_id', 'status', 'approved_by', 'created_at')
    list_filter = ('status', 'source_type')
    search_fields = ('staff__username',)


@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = ('staff', 'period_start', 'period_end', 'total_coins', 'gross_amount', 'status')
    list_filter = ('status',)


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'customer', 'total', 'status', 'due_date', 'created_at')
    list_filter = ('status',)
    search_fields = ('invoice_number',)


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ('description', 'category', 'amount', 'date', 'status', 'submitted_by', 'approved_by')
    list_filter = ('status', 'category')
    search_fields = ('description',)
