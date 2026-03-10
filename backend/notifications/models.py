"""
Notification models.

- Notification: a single in-app notification for a user.
- NotificationPreference: per-user, per-tenant opt-in/opt-out for channels.
"""
from django.db import models
from core.models import TenantModel
from django.conf import settings


class Notification(TenantModel):
    TYPE_TICKET_ASSIGNED = 'ticket_assigned'
    TYPE_TICKET_STATUS = 'ticket_status'
    TYPE_TICKET_COMMENT = 'ticket_comment'
    TYPE_TICKET_TRANSFER = 'ticket_transfer'
    TYPE_SLA_WARNING = 'sla_warning'
    TYPE_SLA_BREACHED = 'sla_breached'
    TYPE_COIN_APPROVED = 'coin_approved'
    TYPE_COIN_REJECTED = 'coin_rejected'
    TYPE_PROJECT_ASSIGNED = 'project_assigned'
    TYPE_TASK_ASSIGNED = 'task_assigned'
    TYPE_TASK_DONE = 'task_done'
    TYPE_LOW_STOCK = 'low_stock'
    TYPE_PO_STATUS = 'po_status'
    TYPE_RETURN_STATUS = 'return_status'
    TYPE_GENERAL = 'general'

    TYPE_CHOICES = [
        (TYPE_TICKET_ASSIGNED, 'Ticket Assigned'),
        (TYPE_TICKET_STATUS, 'Ticket Status Changed'),
        (TYPE_TICKET_COMMENT, 'Ticket Comment'),
        (TYPE_TICKET_TRANSFER, 'Ticket Transferred'),
        (TYPE_SLA_WARNING, 'SLA Warning'),
        (TYPE_SLA_BREACHED, 'SLA Breached'),
        (TYPE_COIN_APPROVED, 'Coin Approved'),
        (TYPE_COIN_REJECTED, 'Coin Rejected'),
        (TYPE_PROJECT_ASSIGNED, 'Project Assigned'),
        (TYPE_TASK_ASSIGNED, 'Task Assigned'),
        (TYPE_TASK_DONE, 'Task Completed'),
        (TYPE_LOW_STOCK, 'Low Stock Alert'),
        (TYPE_PO_STATUS, 'Purchase Order Update'),
        (TYPE_RETURN_STATUS, 'Return Order Update'),
        (TYPE_GENERAL, 'General'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notification_type = models.CharField(max_length=32, choices=TYPE_CHOICES, default=TYPE_GENERAL)
    title = models.CharField(max_length=255)
    body = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    # Generic FK-style reference to the source object
    source_type = models.CharField(max_length=32, blank=True)
    source_id = models.PositiveIntegerField(null=True, blank=True)
    # Extra structured data (e.g. ticket number, project name)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
            models.Index(fields=['tenant', 'recipient']),
        ]

    def __str__(self):
        return f"[{self.notification_type}] → {self.recipient_id}: {self.title}"


class NotificationPreference(TenantModel):
    """Per-user, per-tenant channel preferences."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preferences',
    )
    email_enabled = models.BooleanField(default=True)
    push_enabled = models.BooleanField(default=True)
    # Granular per-type toggles stored as JSON: {"ticket_assigned": {"email": true, "push": false}, ...}
    type_overrides = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ('tenant', 'user')

    def __str__(self):
        return f"NotifPrefs: {self.user_id}@{self.tenant_id}"


class FCMDevice(TenantModel):
    """
    Stores push notification tokens for mobile devices.

    One user may have multiple devices (phone + tablet, etc.).
    Tokens are platform-specific (FCM for Android/Web, APNs for iOS via Expo).
    The Expo push token is stored here and passed to push.py.
    """

    PLATFORM_IOS = 'ios'
    PLATFORM_ANDROID = 'android'
    PLATFORM_WEB = 'web'
    PLATFORM_CHOICES = [
        (PLATFORM_IOS, 'iOS'),
        (PLATFORM_ANDROID, 'Android'),
        (PLATFORM_WEB, 'Web'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='fcm_devices',
    )
    # The Expo push token (ExponentPushToken[...]) or raw FCM/APNs token
    token = models.TextField()
    platform = models.CharField(max_length=16, choices=PLATFORM_CHOICES, default=PLATFORM_ANDROID)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        # A given token can only be registered once per tenant
        unique_together = ('tenant', 'token')
        indexes = [
            models.Index(fields=['tenant', 'user', 'is_active']),
        ]

    def __str__(self):
        return f"FCMDevice({self.platform}) user={self.user_id} token={self.token[:20]}..."
