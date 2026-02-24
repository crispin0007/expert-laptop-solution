from django.contrib import admin
from .models import Ticket, TicketType, TicketComment, TicketTransfer, TicketProduct, TicketSLA


@admin.register(TicketType)
class TicketTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'default_sla_hours', 'requires_product', 'tenant')
    search_fields = ('name',)


class TicketCommentInline(admin.TabularInline):
    model = TicketComment
    extra = 0
    readonly_fields = ('created_at',)


class TicketProductInline(admin.TabularInline):
    model = TicketProduct
    extra = 0


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ('ticket_number', 'title', 'status', 'priority', 'tenant', 'assigned_to', 'created_at')
    search_fields = ('ticket_number', 'title', 'description')
    list_filter = ('status', 'priority', 'ticket_type')
    inlines = [TicketCommentInline, TicketProductInline]


@admin.register(TicketComment)
class TicketCommentAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'author', 'is_internal', 'created_at')
    list_filter = ('is_internal',)


@admin.register(TicketTransfer)
class TicketTransferAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'from_department', 'to_department', 'transferred_by', 'created_at')


@admin.register(TicketProduct)
class TicketProductAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'product', 'quantity', 'unit_price', 'discount')


@admin.register(TicketSLA)
class TicketSLAAdmin(admin.ModelAdmin):
    list_display = ('ticket', 'sla_hours', 'breach_at', 'breached', 'notified')
    list_filter = ('breached',)

