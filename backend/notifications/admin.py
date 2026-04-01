from django.contrib import admin
from .models import Notification, NotificationPreference, FCMDevice


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('id', 'tenant', 'recipient', 'notification_type', 'title', 'is_read', 'created_at')
    list_filter = ('tenant', 'notification_type', 'is_read')
    search_fields = ('title', 'body', 'recipient__email')
    readonly_fields = ('created_at', 'updated_at', 'read_at')


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ('id', 'tenant', 'user', 'email_enabled', 'push_enabled')
    list_filter = ('tenant', 'email_enabled', 'push_enabled')
    search_fields = ('user__email',)


@admin.register(FCMDevice)
class FCMDeviceAdmin(admin.ModelAdmin):
    list_display = ('id', 'tenant', 'user', 'platform', 'is_active', 'last_used_at')
    list_filter = ('tenant', 'platform', 'is_active')
    search_fields = ('user__email', 'token')
    readonly_fields = ('last_used_at', 'created_at')
