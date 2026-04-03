from django.contrib import admin

from .models import LeaveBalance, LeaveRequest, LeaveType, StaffProfile


@admin.register(LeaveType)
class LeaveTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'days_allowed', 'is_paid', 'carry_forward', 'is_active', 'tenant']
    list_filter = ['is_active', 'is_paid', 'carry_forward', 'gender_restriction']
    search_fields = ['name', 'code']


@admin.register(LeaveBalance)
class LeaveBalanceAdmin(admin.ModelAdmin):
    list_display = ['staff', 'leave_type', 'year', 'allocated', 'carried_forward', 'used', 'tenant']
    list_filter = ['year', 'leave_type']
    search_fields = ['staff__email']
    raw_id_fields = ['staff', 'leave_type']


@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ['staff', 'leave_type', 'start_date', 'end_date', 'days', 'status', 'tenant']
    list_filter = ['status', 'leave_type']
    search_fields = ['staff__email']
    raw_id_fields = ['staff', 'leave_type', 'approved_by']


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ['membership', 'designation', 'gender', 'tenant']
    search_fields = ['membership__user__email', 'designation']
    raw_id_fields = ['membership']
