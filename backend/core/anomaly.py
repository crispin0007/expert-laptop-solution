"""
IP anomaly detection and automatic temporary banning.

Provides:
  BannedIP model            — records IPs that have been auto-banned
  is_banned(ip)             — fast check used in TenantMiddleware
  detect_and_ban_probe_ips  — called by Celery beat every 5 minutes

Detection logic
---------------
Every 5 minutes the Celery task scans core_auditlog for IPs that have
produced >= PROBE_THRESHOLD probe events within the last WINDOW_MINUTES.
Offending IPs are inserted into BannedIP with a BAN_DURATION_HOURS TTL.

Probe events counted:
  - CROSS_TENANT_PROBE  (token used against a different tenant)
  - TENANT_ENUM_PROBE   (subdomain probing with unknown slugs)
  - SUPERADMIN_IP_BLOCKED (access from non-allowlisted IP)

Ban enforcement
---------------
TenantMiddleware checks BannedIP (via a short-lived Redis cache) on every
request. Banned IPs receive an immediate 429 without any DB queries for the
tenant lookup.

Constants (can be overridden via Django settings)
-------------------------------------------------
  ANOMALY_PROBE_THRESHOLD   default 5   — hits within window before ban
  ANOMALY_WINDOW_MINUTES    default 15  — look-back window in minutes
  ANOMALY_BAN_HOURS         default 24  — how long the ban lasts
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.db import models
from django.utils import timezone

logger = logging.getLogger('nexus.security')

# ── Configuration defaults ────────────────────────────────────────────────────

def _setting(name: str, default):
    from django.conf import settings
    return getattr(settings, name, default)


# ── Model ─────────────────────────────────────────────────────────────────────

class BannedIP(models.Model):
    """
    Automatically-banned IP address.

    Rows are created by detect_and_ban_probe_ips() and hard-deleted once
    expired (for compliance / GDPR — IP addresses are personal data).
    TenantMiddleware checks this table (via Redis cache) on every request.
    """
    ip = models.GenericIPAddressField(
        unique=True,
        help_text='Banned IP address. One active ban per IP at a time.',
    )
    banned_at = models.DateTimeField(default=timezone.now, db_index=True)
    expires_at = models.DateTimeField(db_index=True)
    probe_count = models.PositiveIntegerField(
        default=0,
        help_text='Number of probe events that triggered this ban.',
    )
    reason = models.CharField(
        max_length=255,
        blank=True,
        help_text='Human-readable ban reason for admin inspection.',
    )

    class Meta:
        app_label = 'core'
        managed = False  # table was originally created by core migrations; kept here for code organisation
        db_table = 'core_bannedip'
        ordering = ['-banned_at']
        indexes = [
            models.Index(fields=['ip', 'expires_at'], name='bannedip_ip_expires_idx'),
        ]
        verbose_name = 'Banned IP'
        verbose_name_plural = 'Banned IPs'

    def __str__(self):
        return f'{self.ip} banned until {self.expires_at:%Y-%m-%d %H:%M}'

    @property
    def is_active(self) -> bool:
        return timezone.now() < self.expires_at


# ── Cache key helper ──────────────────────────────────────────────────────────

def _ban_cache_key(ip: str) -> str:
    return f'bannedip_{ip}'


# ── Public API ────────────────────────────────────────────────────────────────

def is_banned(ip: str) -> bool:
    """
    Return True if the IP is currently banned.

    Uses a 60-second Redis cache to avoid a DB query on every request.
    False negatives are possible within the cache TTL after a ban is lifted
    (acceptable — the ban check is defense-in-depth, not a hard access control).
    """
    from django.core.cache import cache

    cache_key = _ban_cache_key(ip)
    cached = cache.get(cache_key)
    if cached is not None:
        return bool(cached)

    now = timezone.now()
    banned = BannedIP.objects.filter(ip=ip, expires_at__gt=now).exists()
    # Cache the result for 60 s (short TTL so new bans propagate quickly)
    cache.set(cache_key, 1 if banned else 0, 60)
    return banned


def detect_and_ban_probe_ips() -> int:
    """
    Scan the audit log for IPs with too many probe events and ban them.

    Returns the number of new bans created (0 if none).

    Called by the Celery task task_detect_and_ban_probe_ips every 5 minutes.
    """
    from core.audit import AuditEvent, AuditLog
    from django.core.cache import cache

    threshold       = _setting('ANOMALY_PROBE_THRESHOLD', 5)
    window_minutes  = _setting('ANOMALY_WINDOW_MINUTES', 15)
    ban_hours       = _setting('ANOMALY_BAN_HOURS', 24)

    probe_events = [
        AuditEvent.CROSS_TENANT_PROBE,
        AuditEvent.TENANT_ENUM_PROBE,
        AuditEvent.SUPERADMIN_IP_BLOCKED,
    ]

    since = timezone.now() - timedelta(minutes=window_minutes)

    # Aggregate probe counts by IP within the window
    from django.db.models import Count
    offenders = (
        AuditLog.objects
        .filter(event__in=probe_events, timestamp__gte=since, ip__isnull=False)
        .values('ip')
        .annotate(count=Count('id'))
        .filter(count__gte=threshold)
        .order_by('-count')
    )

    new_bans = 0
    ban_until = timezone.now() + timedelta(hours=ban_hours)

    for row in offenders:
        ip = row['ip']
        count = row['count']

        ban, created = BannedIP.objects.update_or_create(
            ip=ip,
            defaults={
                'banned_at': timezone.now(),
                'expires_at': ban_until,
                'probe_count': count,
                'reason': (
                    f'Auto-ban: {count} probe events in {window_minutes} min '
                    f'(threshold={threshold})'
                ),
            },
        )
        if created:
            new_bans += 1

        # Immediately update the Redis cache so active workers see the ban
        # without waiting for their 60-second cache TTL to expire.
        cache.set(_ban_cache_key(ip), 1, 60)

        logger.warning(
            'ANOMALY_BAN | ip=%s | probe_count=%s | expires=%s | created=%s',
            ip, count, ban_until.isoformat(), created,
        )

    # Purge expired bans (housekeeping — remove stale DB rows)
    expired_deleted, _ = BannedIP.objects.filter(expires_at__lte=timezone.now()).delete()
    if expired_deleted:
        logger.info('ANOMALY_PURGE | expired_bans_deleted=%d', expired_deleted)

    return new_bans
