from django.contrib import admin
from .models import Role


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'tenant', 'is_system_role')
    list_filter = ('is_system_role',)
    search_fields = ('name',)
