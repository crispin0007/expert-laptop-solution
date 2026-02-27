"""
Migration 0004 — BannedIP model for anomaly detection auto-banning.

The BannedIP table stores temporarily-banned IP addresses.  It is populated
by the Celery beat task `core.tasks.task_detect_and_ban_probe_ips` which runs
every 5 minutes and scans the audit log for IPs exceeding the probe threshold.

TenantMiddleware checks this table (via a short-lived Redis cache) on every
incoming request, returning 429 immediately for banned IPs without performing
any tenant DB lookup.
"""

import django.db.models.deletion
from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0003_auditlog_integrity'),
    ]

    operations = [
        migrations.CreateModel(
            name='BannedIP',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('ip', models.GenericIPAddressField(
                    unique=True,
                    help_text='Banned IP address. One active ban per IP at a time.',
                )),
                ('banned_at', models.DateTimeField(default=django.utils.timezone.now, db_index=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('probe_count', models.PositiveIntegerField(
                    default=0,
                    help_text='Number of probe events that triggered this ban.',
                )),
                ('reason', models.CharField(
                    max_length=255,
                    blank=True,
                    help_text='Human-readable ban reason for admin inspection.',
                )),
            ],
            options={
                'verbose_name': 'Banned IP',
                'verbose_name_plural': 'Banned IPs',
                'ordering': ['-banned_at'],
            },
        ),
        migrations.AddIndex(
            model_name='bannedip',
            index=models.Index(fields=['ip', 'expires_at'], name='bannedip_ip_expires_idx'),
        ),
    ]
