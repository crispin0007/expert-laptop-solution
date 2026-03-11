"""
Migration 0008 — Re-create the core_bannedip table at the DB level.

Migration 0006 used SeparateDatabaseAndState with database_operations=[] to
keep the table while removing it from Django's migration state. However, the
table was never present in the DB (the container was rebuilt and migrate ran
after 0006 had already removed it from state, so 0004's CreateModel never
executed a second time against the empty DB).

This migration creates the table at the DB level only (it is already absent
from migration state, so no state_operations are needed).
"""

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_alter_auditlog_event'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS core_bannedip (
                    id          BIGSERIAL PRIMARY KEY,
                    ip          INET        NOT NULL,
                    banned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    expires_at  TIMESTAMPTZ NOT NULL,
                    probe_count INTEGER     NOT NULL DEFAULT 0,
                    reason      VARCHAR(255) NOT NULL DEFAULT '',
                    CONSTRAINT core_bannedip_ip_key UNIQUE (ip)
                );
                CREATE INDEX IF NOT EXISTS core_bannedip_banned_at_idx
                    ON core_bannedip (banned_at);
                CREATE INDEX IF NOT EXISTS core_bannedip_expires_at_idx
                    ON core_bannedip (expires_at);
                CREATE INDEX IF NOT EXISTS bannedip_ip_expires_idx
                    ON core_bannedip (ip, expires_at);
            """,
            reverse_sql="DROP TABLE IF EXISTS core_bannedip;",
            hints={'target_db': 'default'},
        ),
    ]
