from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from core.mixins import TenantMixin
from .models import Notification, NotificationPreference
from .serializers import NotificationSerializer, NotificationPreferenceSerializer


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
        return Response({'success': True, 'data': serializer.data})


class NotificationUnreadCountView(TenantMixin, APIView):
    """GET /api/v1/notifications/unread-count/ → {count: N}"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(
            tenant=request.tenant,
            recipient=request.user,
            is_read=False,
        ).count()
        return Response({'success': True, 'data': {'count': count}})


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
                return Response({'success': False, 'errors': ['Not found.']}, status=status.HTTP_404_NOT_FOUND)
        else:
            Notification.objects.filter(
                tenant=request.tenant, recipient=request.user, is_read=False
            ).update(is_read=True, read_at=timezone.now())
        return Response({'success': True})


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
        return Response({'success': True, 'data': NotificationPreferenceSerializer(prefs).data})

    def put(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(
            tenant=request.tenant,
            user=request.user,
            defaults={'created_by': request.user},
        )
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'success': True, 'data': serializer.data})



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
                return Response({'success': False, 'errors': ['Not found.']}, status=status.HTTP_404_NOT_FOUND)
        else:
            Notification.objects.filter(
                tenant=request.tenant, recipient=request.user, is_read=False
            ).update(is_read=True, read_at=timezone.now())
        return Response({'success': True})


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
        return Response({'success': True, 'data': NotificationPreferenceSerializer(prefs).data})

    def put(self, request):
        prefs, _ = NotificationPreference.objects.get_or_create(
            tenant=request.tenant,
            user=request.user,
            defaults={'created_by': request.user},
        )
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'success': True, 'data': serializer.data})
