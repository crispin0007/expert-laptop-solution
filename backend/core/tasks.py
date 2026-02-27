"""
Celery tasks for the core app.

Tasks registered here:
  task_detect_and_ban_probe_ips  — Runs every 5 minutes (beat schedule in settings).
                                    Scans AuditLog for IPs with too many probe events
                                    and temporarily bans them via BannedIP model.
"""
from celery import shared_task

import logging

logger = logging.getLogger('nexus.security')


@shared_task(name='core.tasks.task_detect_and_ban_probe_ips', ignore_result=True)
def task_detect_and_ban_probe_ips():
    """
    Detect IPs with abnormal probe activity and auto-ban them.

    Delegates to core.anomaly.detect_and_ban_probe_ips() which:
      1. Queries AuditLog for CROSS_TENANT_PROBE / TENANT_ENUM_PROBE /
         SUPERADMIN_IP_BLOCKED events in the last ANOMALY_WINDOW_MINUTES.
      2. Bans any IP that hit >= ANOMALY_PROBE_THRESHOLD events.
      3. Purges expired bans from the BannedIP table.

    Scheduled via CELERY_BEAT_SCHEDULE in config/settings/base.py.
    """
    try:
        from core.anomaly import detect_and_ban_probe_ips
        new_bans = detect_and_ban_probe_ips()
        if new_bans:
            logger.warning('task_detect_and_ban_probe_ips: %d new bans created', new_bans)
        return {'new_bans': new_bans}
    except Exception:
        logger.exception('task_detect_and_ban_probe_ips: unhandled exception')
        raise
