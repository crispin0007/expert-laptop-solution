"""
Security Audit Log — core.audit

Provides a lightweight, append-only audit trail for all security-relevant
events in the NEXUS BMS platform.

Usage
-----
::

    from core.audit import AuditEvent, log_event

    log_event(
        event=AuditEvent.LOGIN_SUCCESS,
        request=request,
        tenant=request.tenant,
        actor=request.user,
        extra={'staff_number': membership.staff_number},
    )

Every log_event() call does two things:
  1. Writes one row to ``core_auditlog`` (async-safe, minimal IO).
  2. Emits a structured JSON line via the ``nexus.audit`` logger so your
     log aggregator (Loki, CloudWatch, Datadog, etc.) can consume it
     without querying the DB.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

from django.db import models
from django.utils import timezone

logger = logging.getLogger('nexus.audit')


# ─────────────────────────────────────────────────────────────────────────────
# Event catalogue
# ─────────────────────────────────────────────────────────────────────────────

class AuditEvent(models.TextChoices):
    # Authentication
    LOGIN_SUCCESS          = 'login_success',          'Login Success'
    LOGIN_FAILED           = 'login_failed',            'Login Failed'
    TOKEN_REFRESH          = 'token_refresh',           'Token Refreshed'
    TOKEN_REJECTED         = 'token_rejected',          'Token Rejected'
    TWO_FA_ENABLED         = 'two_fa_enabled',          '2FA Enabled'
    TWO_FA_DISABLED        = 'two_fa_disabled',         '2FA Disabled'
    LOGOUT                 = 'logout',                  'Logout'

    # Tenant lifecycle
    TENANT_CREATED         = 'tenant_created',          'Tenant Created'
    TENANT_SUSPENDED       = 'tenant_suspended',        'Tenant Suspended'
    TENANT_ACTIVATED       = 'tenant_activated',        'Tenant Activated'
    TENANT_DELETED         = 'tenant_deleted',          'Tenant Deleted'
    SLUG_CHANGE_BLOCKED    = 'slug_change_blocked',     'Slug Change Blocked'

    # Plan & modules
    PLAN_CHANGED           = 'plan_changed',            'Plan Changed'
    MODULE_OVERRIDE_SET    = 'module_override_set',     'Module Override Set'
    MODULE_OVERRIDE_DEL    = 'module_override_deleted', 'Module Override Deleted'
    MODULE_TOGGLED         = 'module_toggled',          'Plan Module Toggled'

    # Access control
    CROSS_TENANT_PROBE     = 'cross_tenant_probe',      'Cross-Tenant Access Attempt'
    TENANT_ENUM_PROBE      = 'tenant_enum_probe',       'Tenant Enumeration Probe'
    ADMIN_PROBE            = 'admin_probe',              'Admin Path Probe from Tenant'
    SUPERADMIN_IP_BLOCKED  = 'superadmin_ip_blocked',   'Superadmin Access IP Blocked'
    PERMISSION_DENIED      = 'permission_denied',        'Permission Denied'

    # Rate limiting
    RATE_LIMIT_HIT         = 'rate_limit_hit',           'Rate Limit Exceeded'

    # Staff
    STAFF_DEACTIVATED      = 'staff_deactivated',        'Staff Deactivated'
    STAFF_REACTIVATED      = 'staff_reactivated',        'Staff Reactivated'
    ROLE_CHANGED           = 'role_changed',             'Member Role Changed'


# ─────────────────────────────────────────────────────────────────────────────
# Model
# ─────────────────────────────────────────────────────────────────────────────

class AuditLog(models.Model):
    """
    Append-only security audit log.

    NEVER update or delete rows from this table. Add a DB-level trigger to
    enforce that in production if your threat model requires it.
    """
    # Intentional raw ints (not FKs) so audit rows survive tenant/user deletion.
    tenant_id  = models.IntegerField(null=True, blank=True, db_index=True,
                                     help_text='Tenant PK — null for main-domain events')
    actor_id   = models.IntegerField(null=True, blank=True, db_index=True,
                                     help_text='User PK — null for unauthenticated events')

    event      = models.CharField(max_length=64, choices=AuditEvent.choices, db_index=True)
    ip         = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    timestamp  = models.DateTimeField(default=timezone.now, db_index=True)
    extra      = models.JSONField(default=dict, blank=True,
                                  help_text='Arbitrary event metadata (slugs, role names, etc.)')

    # Tamper-detection hash — HMAC-SHA256(SECRET_KEY, canonical JSON of this row).
    # Computed at insert time by log_event(). Verify with verify_row_hash().
    # A DB-level trigger (migration 0003) also prevents UPDATE/DELETE.
    row_hash   = models.CharField(
        max_length=64,
        blank=True,
        help_text='HMAC-SHA256 integrity seal. Blank on rows created before 0003.',
    )

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['tenant_id', 'event', '-timestamp'],
                         name='audit_tenant_event_idx'),
            models.Index(fields=['actor_id', '-timestamp'],
                         name='audit_actor_idx'),
        ]

    def __str__(self):
        return f'[{self.timestamp:%Y-%m-%d %H:%M:%S}] {self.event} | tenant={self.tenant_id} actor={self.actor_id}'


# ─────────────────────────────────────────────────────────────────────────────
# Service function
# ─────────────────────────────────────────────────────────────────────────────

def log_event(
    event: str,
    *,
    request=None,
    tenant=None,
    actor=None,
    ip: str | None = None,
    user_agent: str = '',
    extra: dict[str, Any] | None = None,
) -> AuditLog:
    """
    Record a security event.

    Parameters
    ----------
    event:
        One of the ``AuditEvent`` choices strings.
    request:
        Django HttpRequest. If supplied, ip and user_agent are auto-extracted
        and tenant / actor fall back to request.tenant / request.user.
    tenant:
        Tenant instance (or None). Overrides request.tenant when supplied.
    actor:
        User instance (or None). Overrides request.user when supplied.
    ip:
        Override IP extracted from request (rarely needed).
    user_agent:
        Override UA extracted from request.
    extra:
        Arbitrary JSON-serialisable dict for event-specific metadata.

    Returns
    -------
    AuditLog
        The created row.
    """
    if request is not None:
        if tenant is None:
            tenant = getattr(request, 'tenant', None)
        if actor is None:
            u = getattr(request, 'user', None)
            actor = u if (u and getattr(u, 'is_authenticated', False)) else None
        if not ip:
            ip = _extract_ip(request)
        if not user_agent:
            user_agent = request.META.get('HTTP_USER_AGENT', '')[:512]

    tenant_id = getattr(tenant, 'pk', None)
    actor_id  = getattr(actor,  'pk', None)
    extra_data = extra or {}
    ts = timezone.now()
    row_hash = _compute_row_hash(
        tenant_id=tenant_id,
        actor_id=actor_id,
        event=event,
        ip=ip,
        user_agent=user_agent,
        timestamp=ts,
        extra=extra_data,
    )

    # 1. Structured log line (always — even if DB write fails)
    logger.info(
        json.dumps({
            'event':     event,
            'tenant_id': tenant_id,
            'actor_id':  actor_id,
            'ip':        ip,
            'extra':     extra_data,
            'row_hash':  row_hash,
        })
    )

    # 2. DB row (best-effort — never let an audit failure break the request)
    try:
        return AuditLog.objects.create(
            event=event,
            tenant_id=tenant_id,
            actor_id=actor_id,
            ip=ip,
            user_agent=user_agent[:512],
            extra=extra_data,
            timestamp=ts,
            row_hash=row_hash,
        )
    except Exception:
        logger.exception('AuditLog DB write failed — event=%s', event)
        return None


def verify_row_hash(log: AuditLog) -> bool:
    """
    Verify the HMAC integrity seal on an AuditLog row.

    Returns True if the row is unmodified, False if tampered or if the row
    predates the hash feature (row_hash is empty).
    """
    if not log.row_hash:
        return False  # pre-dates tamper protection — cannot verify
    expected = _compute_row_hash(
        tenant_id=log.tenant_id,
        actor_id=log.actor_id,
        event=log.event,
        ip=log.ip,
        user_agent=log.user_agent,
        timestamp=log.timestamp,
        extra=log.extra,
    )
    return hmac.compare_digest(log.row_hash, expected)


def _extract_ip(request) -> str | None:
    """Extract real client IP honoring X-Forwarded-For (single trusted proxy)."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or None


def _compute_row_hash(
    *,
    tenant_id,
    actor_id,
    event: str,
    ip,
    user_agent: str,
    timestamp,
    extra: dict,
) -> str:
    """
    Compute an HMAC-SHA256 integrity seal over the canonical fields of an
    AuditLog row. The key is DJANGO_SECRET_KEY so only the application server
    can produce valid hashes — a direct DB connection cannot forge them.

    Canonical payload is deterministic JSON (sort_keys=True).  All values are
    coerced to their string/JSON-native representation so the result is stable
    across Python process restarts.
    """
    from django.conf import settings
    payload = json.dumps(
        {
            'tenant_id': tenant_id,
            'actor_id':  actor_id,
            'event':     event,
            'ip':        ip,
            'user_agent': user_agent,
            'timestamp': timestamp.isoformat() if timestamp else None,
            'extra':     extra,
        },
        sort_keys=True,
        default=str,
    )
    key = settings.SECRET_KEY.encode('utf-8')
    return hmac.new(key, payload.encode('utf-8'), hashlib.sha256).hexdigest()
