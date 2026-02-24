from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, TenantMembership


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    pass


@admin.register(TenantMembership)
class TenantMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'tenant', 'role', 'is_active')
    search_fields = ('user__username', 'tenant__slug')
    list_filter = ('role', 'is_active')
