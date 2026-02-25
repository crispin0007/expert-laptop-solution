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
