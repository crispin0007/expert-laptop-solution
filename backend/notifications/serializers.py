from rest_framework import serializers
from .models import Notification, NotificationPreference, FCMDevice


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            'id', 'notification_type', 'title', 'body',
            'is_read', 'read_at', 'source_type', 'source_id',
            'metadata', 'created_at',
        )
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ('id', 'email_enabled', 'push_enabled', 'type_overrides')


class FCMDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = FCMDevice
        fields = ('id', 'token', 'platform', 'is_active', 'last_used_at', 'created_at')
        read_only_fields = ('id', 'is_active', 'last_used_at', 'created_at')
