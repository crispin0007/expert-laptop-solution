from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from core.mixins import TenantMixin
from core.response import ApiResponse
from .models import Notification, NotificationPreference, FCMDevice
from .serializers import NotificationSerializer, NotificationPreferenceSerializer, FCMDeviceSerializer


class NotificationListView(TenantMixin, APIView):
    """
    GET /api/v1/notifications/
    Returns unread (or all) notifications for the authenticated user.
    Query params: ?unread=true
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
        )
        if request.query_params.get('unread') == 'true':
            qs = qs.filter(is_read=False)
        serializer = NotificationSerializer(qs[:50], many=True)
        return ApiResponse.success(data=serializer.data)


class NotificationUnreadCountView(TenantMixin, APIView):
    """GET /api/v1/notifications/unread-count/ → {count: N}"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
            is_read=False,
        ).count()
        return ApiResponse.success(data={'count': count})


class NotificationMarkReadView(TenantMixin, APIView):
    """
    POST /api/v1/notifications/{id}/read/
    Marks a single notification as read.
    POST /api/v1/notifications/mark-all-read/
    Marks all unread notifications as read.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk=None):
        if pk:
            try:
                notif = Notification.objects.get(pk=pk, tenant=request.tenant, recipient=request.user)
                notif.is_read = True
                notif.read_at = timezone.now()
                notif.save(update_fields=['is_read', 'read_at'])
            except Notification.DoesNotExist:
                return ApiResponse.not_found('Notification')
        else:
            Notification.objects.filter(
                tenant=request.tenant, recipient=request.user, is_read=False
            ).update(is_read=True, read_at=timezone.now())
        return ApiResponse.success()


class NotificationPreferenceView(TenantMixin, APIView):
    """
    GET/PUT /api/v1/notifications/preferences/
    Retrieve or update notification preferences for the current user.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(
            tenant=request.tenant,
            user=request.user,
            defaults={'created_by': request.user},
        )
        return ApiResponse.success(data=NotificationPreferenceSerializer(prefs).data)

    def put(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(
            tenant=request.tenant,
            user=request.user,
            defaults={'created_by': request.user},
        )
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return ApiResponse.success(data=serializer.data)


class FCMDeviceView(TenantMixin, APIView):
    """
    POST   /api/v1/notifications/devices/           — Register a push token
    DELETE /api/v1/notifications/devices/{token}/   — Deregister a push token

    Used by the mobile app on login (register) and logout (deregister).
    Tokens are scoped to the authenticated user + tenant so they are never
    delivered across tenant boundaries.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        """Register (or re-activate) a device push token."""
        token = (request.data.get('token') or '').strip()
        platform = (request.data.get('platform') or FCMDevice.PLATFORM_ANDROID).strip()

        if not token:
            return ApiResponse.error('token is required.', status=status.HTTP_400_BAD_REQUEST)

        if platform not in (FCMDevice.PLATFORM_IOS, FCMDevice.PLATFORM_ANDROID, FCMDevice.PLATFORM_WEB):
            return ApiResponse.error('Invalid platform. Must be ios, android, or web.', status=status.HTTP_400_BAD_REQUEST)

        device, created = FCMDevice.objects.update_or_create(
            tenant=request.tenant,
            token=token,
            defaults={
                'user': request.user,
                'platform': platform,
                'is_active': True,
                'last_used_at': timezone.now(),
                'created_by': request.user,
            },
        )
        serializer = FCMDeviceSerializer(device)
        return ApiResponse.created(data=serializer.data) if created else ApiResponse.success(data=serializer.data)

    def delete(self, request, token=None):
        """Deregister (soft-disable) a device push token on logout."""
        if not token:
            return ApiResponse.error('Token is required in the URL.', status=status.HTTP_400_BAD_REQUEST)

        updated = FCMDevice.objects.filter(
            tenant=request.tenant,
            user=request.user,
            token=token,
        ).update(is_active=False)

        if updated == 0:
            return ApiResponse.not_found('Device')

        return ApiResponse.success()
