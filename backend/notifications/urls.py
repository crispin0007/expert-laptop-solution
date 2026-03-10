from django.urls import path
from .views import (
    NotificationListView, NotificationMarkReadView,
    NotificationPreferenceView, NotificationUnreadCountView,
    FCMDeviceView,
)

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification-list'),
    path('unread-count/', NotificationUnreadCountView.as_view(), name='notification-unread-count'),
    path('preferences/', NotificationPreferenceView.as_view(), name='notification-preferences'),
    path('mark-all-read/', NotificationMarkReadView.as_view(), name='notification-mark-all-read'),
    path('<int:pk>/read/', NotificationMarkReadView.as_view(), name='notification-mark-read'),
    # Mobile push token registration / deregistration
    path('devices/', FCMDeviceView.as_view(), name='fcm-device-register'),
    path('devices/<str:token>/', FCMDeviceView.as_view(), name='fcm-device-deregister'),
]
