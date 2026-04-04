from django.contrib import admin
from .models import Ticket, TicketType, TicketComment, TicketTransfer, TicketProduct, TicketSLA


class TenantScopedAdminMixin:
    """Restrict Django admin querysets to a single tenant when superadmin has
    an active tenant context.  Falls back to all objects for platform-level
    superadmins who need cross-tenant visibility (e.g. support debugging via
    Django shell).  This prevents accidental cross-tenant data leakage in the UI.
    """

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        tenant = getattr(request, 'tenant', None)
        if tenant:
            return qs.filter(tenant=tenant)
        return qs


@admin.register(TicketType)
class TicketTypeAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
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
class TicketAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('ticket_number', 'title', 'status', 'priority', 'tenant', 'assigned_to', 'created_at')
    search_fields = ('ticket_number', 'title', 'description')
    list_filter = ('status', 'priority', 'ticket_type')
    inlines = [TicketCommentInline, TicketProductInline]


@admin.register(TicketComment)
class TicketCommentAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('ticket', 'author', 'is_internal', 'created_at')
    list_filter = ('is_internal',)


@admin.register(TicketTransfer)
class TicketTransferAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('ticket', 'from_department', 'to_department', 'transferred_by', 'created_at')


@admin.register(TicketProduct)
class TicketProductAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('ticket', 'product', 'quantity', 'unit_price', 'discount')


@admin.register(TicketSLA)
class TicketSLAAdmin(TenantScopedAdminMixin, admin.ModelAdmin):
    list_display = ('ticket', 'sla_hours', 'breach_at', 'breached', 'notified')
    list_filter = ('breached',)

